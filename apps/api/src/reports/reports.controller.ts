/*
 * Statistical reports (統計分析報表) and their export to Excel/PDF. Clinical staff see full numbers for their sites;
 * 職安衛人員 and 人資 see de-identified numbers (cells under MIN_CELL_SIZE hidden). Files are built by the worker and
 * downloaded through a short-lived single-use link; requesting and downloading are both audited.
 */
import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Body, Controller, GoneException, Get, Inject, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, type OnApplicationShutdown } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { exportFiles } from '@yutis/db';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { Public, StaffOnly } from '../auth/access.js';
import { CLINICAL_ROLES } from '../auth/permissions.js';
import type { ApiConfig } from '../config.js';
import { recordAudit } from '../core/audit.js';
import { afterCommit, Ctx, staff, type RequestContext } from '../core/context.js';
import { TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { API_CONFIG } from '../core/database.js';
import { openApiSchema, parse } from '../core/validation.js';
import { mySiteIds } from '../programs/common.js';
import { EXPORT_QUEUE, senderBoss, type ExportJob } from '../worker/jobs.js';
import { computeReport, isReport, loadReportData, MIN_CELL_SIZE, REPORT_TYPES, type Report } from './reports.js';

const ReportAccess = () => StaffOnly({ feature: 'reports', roles: ['職護', '職醫', '職安衛人員', '人資'] });
/** Download links stay valid this long and work once. */
const LINK_MINUTES = 5;
const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' } as const;

/** Sends jobs to the worker; connects to pg-boss on first use. */
@Injectable()
export class JobQueue implements OnApplicationShutdown {
  private boss?: Promise<PgBoss>;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async send(queue: string, data: object): Promise<void> {
    this.boss ??= senderBoss(this.config.databaseUrl).start();
    await (await this.boss).send(queue, data);
  }

  async onApplicationShutdown() {
    if (this.boss) await (await this.boss).stop({ graceful: false });
  }
}

const Filters = z.object({ legalEntityId: z.uuid().optional(), siteId: z.uuid().optional(), departmentId: z.uuid().optional() }).strict();
const RequestExport = z.object({ report: z.string(), type: z.string(), filters: Filters.default({}), format: z.enum(['xlsx', 'pdf']) }).strict();

class ReportTypeDto {
  @ApiProperty({ enum: Object.keys(REPORT_TYPES) }) kind!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
}
class ReportDto {
  @ApiProperty() kind!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { oneOf: [{ type: 'string' }, { type: 'number' }], nullable: true } } } }) summary!: Report['summary'];
  @ApiProperty({ type: [String] }) columns!: string[];
  @ApiProperty({ type: 'array', items: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }], nullable: true } }, description: 'null：人數少於最小格數而不顯示' }) rows!: Report['rows'];
  @ApiProperty({ description: `是否有格子因少於 ${MIN_CELL_SIZE} 人而不顯示（去識別）` }) suppressed!: boolean;
}
class ExportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['queued', 'running', 'done', 'failed'] }) status!: string;
  @ApiProperty({ enum: ['xlsx', 'pdf'] }) format!: string;
  @ApiProperty({ type: String, nullable: true }) fileName!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) requestedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: Date | null;
}

const toExport = (e: typeof exportFiles.$inferSelect): ExportDto => ({ id: e.id, status: e.status, format: e.format, fileName: e.fileName, requestedAt: e.createdAt, expiresAt: e.expiresAt });
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto,
  ) {}

  @Get('reports')
  @ReportAccess()
  @ApiOperation({ summary: '報表類型（健檢 7、異常工作負荷 6、人因 3）' })
  @ApiOkResponse({ type: [ReportTypeDto] })
  types(): ReportTypeDto[] {
    return Object.entries(REPORT_TYPES).flatMap(([kind, list]) => list.map(([type, title]) => ({ kind, type, title })));
  }

  @Get('reports/:kind/:type')
  @ReportAccess()
  @ApiOperation({
    summary: '統計報表',
    description: `負責廠區內的員工，可再依法人、廠區、部門篩選。職安衛人員與人資只看去識別統計：少於 ${MIN_CELL_SIZE} 人的格子（及可由它推算的格子）不顯示。`,
  })
  @ApiQuery({ name: 'legalEntityId', required: false, type: String, format: 'uuid' }) @ApiQuery({ name: 'siteId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'departmentId', required: false, type: String, format: 'uuid' })
  @ApiOkResponse({ type: ReportDto })
  async report(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('type') type: string, @Query() query: unknown): Promise<Report> {
    if (!isReport(kind, type)) throw new NotFoundException({ code: 'unknown_report', message: 'No such report' });
    const filters = parse(Filters, query);
    const data = await loadReportData(ctx.tx, await mySiteIds(ctx), filters);
    const report = computeReport(kind, type, data, !(CLINICAL_ROLES as readonly string[]).includes(staff(ctx).role));
    await recordAudit(ctx, { action: 'read', subjectTable: 'reports', dataCategory: report.suppressed || !(CLINICAL_ROLES as readonly string[]).includes(staff(ctx).role) ? 'work' : 'health', reason: `${kind}/${type}` });
    return report;
  }

  @Post('exports')
  @ReportAccess()
  @ApiOperation({ summary: '匯出報表（Excel 或 PDF）', description: '由背景工作產生，完成後以短效連結下載；檔案有匯出人與時間浮水印，內容與畫面上看到的相同（含去識別）。' })
  @ApiBody({ schema: openApiSchema(RequestExport) })
  @ApiCreatedResponse({ type: ExportDto })
  async requestExport(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<ExportDto> {
    const input = parse(RequestExport, body);
    if (!isReport(input.report, input.type)) throw new BadRequestException({ code: 'unknown_report', message: 'No such report' });
    const [row] = await ctx.tx.insert(exportFiles).values({
      tenantId: ctx.tenant.id, requestedBy: staff(ctx).userId, format: input.format, createdBy: staff(ctx).userId,
      params: { kind: 'report', report: input.report, type: input.type, filters: input.filters },
    }).returning();
    await recordAudit(ctx, { action: 'export', subjectTable: 'exports', subjectId: row!.id, reason: `requested ${input.report}/${input.type} ${input.format}` });
    // Queued only once the export row is committed, so the worker always finds it.
    afterCommit(ctx, () => this.jobs.send(EXPORT_QUEUE, { tenantId: ctx.tenant.id, exportId: row!.id } satisfies ExportJob));
    return toExport(row!);
  }

  @Get('exports')
  @ReportAccess()
  @ApiOperation({ summary: '我的匯出' })
  @ApiOkResponse({ type: [ExportDto] })
  async myExports(@Ctx() ctx: RequestContext): Promise<ExportDto[]> {
    const rows = await ctx.tx.select().from(exportFiles).where(eq(exportFiles.requestedBy, staff(ctx).userId)).orderBy(desc(exportFiles.createdAt)).limit(50);
    return rows.map(toExport);
  }

  @Post('exports/:id/link')
  @ReportAccess()
  @ApiOperation({ summary: '取得下載連結', description: `${LINK_MINUTES} 分鐘內有效、只能下載一次；只有匯出的人可以取得。` })
  @ApiCreatedResponse({ schema: { type: 'object', properties: { url: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' } } } })
  async link(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [row] = await ctx.tx.select().from(exportFiles).where(and(eq(exportFiles.id, id), eq(exportFiles.requestedBy, staff(ctx).userId)));
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'No such export' });
    if (row.status !== 'done' || !row.expiresAt || row.expiresAt < new Date()) throw new GoneException({ code: 'export_unavailable', message: `Export is ${row.status === 'done' ? 'expired' : row.status}` });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_MINUTES * 60_000);
    await ctx.tx.update(exportFiles).set({ downloadTokenHash: hash(token), downloadTokenExpiresAt: expiresAt }).where(eq(exportFiles.id, id));
    return { url: `/api/exports/download/${token}`, expiresAt };
  }

  @Get('exports/download/:token')
  @Public()
  @ApiOperation({ summary: '下載匯出檔（短效、一次性連結）' })
  @ApiProduces(MIME.xlsx, MIME.pdf)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(@Ctx() ctx: RequestContext, @Param('token') token: string, @Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    const [row] = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await ctx.tx.select().from(exportFiles).where(eq(exportFiles.downloadTokenHash, hash(token))) : [];
    if (!row || !row.downloadTokenExpiresAt || row.downloadTokenExpiresAt < new Date() || !row.contentEnc || (row.expiresAt && row.expiresAt < new Date())) {
      throw new GoneException({ code: 'link_expired', message: 'This download link has expired or was already used' });
    }
    await ctx.tx.update(exportFiles).set({ downloadTokenHash: null, downloadTokenExpiresAt: null }).where(eq(exportFiles.id, row.id));
    await recordAudit(ctx, { action: 'export', subjectTable: 'exports', subjectId: row.id, reason: `downloaded ${row.fileName}` },
      { kind: 'staff', userId: row.requestedBy, sessionId: '', name: '', email: '', role: '職護' });
    const file = Buffer.from(await this.crypto.decrypt(ctx.tenant.id, row.contentEnc), 'base64');
    reply.header('Content-Type', MIME[row.format]).header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName ?? `export.${row.format}`)}`);
    return file;
  }
}
