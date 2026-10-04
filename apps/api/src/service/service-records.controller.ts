/*
 * 勞工健康服務執行紀錄表（附表八）: occupational health staff and 職安衛人員 record each on-site service; the people
 * in the tenant's configured sign-off roles (簽核角色: physician, nurse, HR, department head…) sign it through a
 * one-time email link (/api/sign/:token). The record is complete when every signer has signed. Every step of the
 * sign-off chain is audited.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { serviceRecords, signatures, sites, users } from '@yutis/db';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { ENVIRONMENT_ROLES } from '../auth/permissions.js';
import type { ApiConfig } from '../config.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { API_CONFIG } from '../core/database.js';
import { Notifier } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { SIGN_LINK_DAYS } from '../programs/advice.controller.js';
import { assertSitesInScope, departmentInSite, mySiteIds } from '../programs/common.js';
import {
  assertSignOffRoles, deleteSigners, issueSignLink, replaceSigners, SignatureDto, signaturesOf, Signer, SignLinkDto, signOffRoles,
} from './sign-off.js';

const ServiceAccess = () => StaffOnly({ feature: 'service-records', roles: ENVIRONMENT_ROLES });

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const count = z.number().int().min(0).max(100000);
export const ServiceContent = z.object({
  from: time, to: time, executorUserId: z.uuid(),
  unit: z.string().trim().max(100).default(''), departmentName: z.string().trim().max(100).default(''),
  /** 行政人員、現場操作人員（男／女）、一般作業人數 */
  headcount: z.object({ adminM: count, adminF: count, opM: count, opF: count, general: count }).strict(),
  /** 特別危害健康作業類別與人數 */
  special: z.array(z.object({ category: z.string().trim().min(1).max(50), count }).strict()).max(20).default([]),
  /** 二、作業場所與勞動條件概況 */
  workplace: z.string().max(10000).default(''),
  /** 三、臨場健康服務執行情形 */
  services: z.string().max(10000).default(''),
  /** 四、發現問題及建議採行措施 */
  findings: z.string().max(10000).default(''),
  /** 五、對前次建議改善事項之追蹤辦理情形 */
  followUp: z.string().max(10000).default(''),
}).strict().refine(c => c.to > c.from, { message: 'to must be later than from', path: ['to'] });
const ServiceRecord = z.object({
  serviceOn: z.iso.date(), siteId: z.uuid(), departmentId: z.uuid().nullable().default(null), content: ServiceContent, signers: z.array(Signer).min(1).max(10),
}).strict();

class ServiceRecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'date' }) serviceOn!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty() siteName!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: '服務的部門（表單上的部門名稱另存在 content.departmentName）' }) departmentId!: string | null;
  @ApiProperty({ enum: ['草稿', '簽核中', '已完成'] }) status!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) content!: unknown;
  @ApiProperty({ type: String, nullable: true, description: '執行人員（content.executorUserId）的姓名；帳號已刪除時為 null' }) executorName!: string | null;
  @ApiProperty({ type: [SignatureDto] }) signatures!: SignatureDto[];
}
@ApiTags('service-records')
@Controller('service-records')
export class ServiceRecordsController {
  constructor(@Inject(API_CONFIG) readonly config: ApiConfig, readonly notifier: Notifier) {}

  @Get('sign-off-roles')
  @ServiceAccess()
  @ApiOperation({ summary: '可選的簽核角色', description: '租戶設定的簽核角色（租戶管理員在 /api/admin/sign-off-roles 修改）；簽核人員的角色必須是其中之一。' })
  @ApiOkResponse({ type: [String] })
  roles(@Ctx() ctx: RequestContext): Promise<string[]> {
    return signOffRoles(ctx);
  }

  @Get()
  @ServiceAccess()
  @ApiOperation({ summary: '負責廠區的附表八紀錄' })
  @ApiOkResponse({ type: [ServiceRecordDto] })
  async list(@Ctx() ctx: RequestContext): Promise<ServiceRecordDto[]> {
    const ids = await mySiteIds(ctx);
    if (!ids.length) return [];
    const rows = await ctx.tx.select({ id: serviceRecords.id }).from(serviceRecords).where(inArray(serviceRecords.siteId, ids)).orderBy(desc(serviceRecords.serviceOn));
    return this.load(ctx, rows.map(r => r.id));
  }

  @Post()
  @ServiceAccess()
  @ApiOperation({ summary: '新增附表八紀錄（草稿）', description: '簽核人員的角色必須是租戶設定的簽核角色之一。' })
  @ApiBody({ schema: openApiSchema(ServiceRecord) })
  @ApiCreatedResponse({ type: ServiceRecordDto })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<ServiceRecordDto> {
    const input = parse(ServiceRecord, body);
    await this.validate(ctx, input);
    const [row] = await ctx.tx.insert(serviceRecords).values({ tenantId: ctx.tenant.id, serviceOn: input.serviceOn, siteId: input.siteId, departmentId: input.departmentId, content: input.content, createdBy: staff(ctx).userId }).returning();
    await replaceSigners(ctx, 'service_records', row!.id, input.signers);
    await recordAudit(ctx, { action: 'create', subjectTable: 'service_records', subjectId: row!.id, dataCategory: 'work' });
    return (await this.load(ctx, [row!.id]))[0]!;
  }

  @Put(':id')
  @ServiceAccess()
  @ApiOperation({ summary: '修改草稿' })
  @ApiBody({ schema: openApiSchema(ServiceRecord) })
  @ApiOkResponse({ type: ServiceRecordDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ServiceRecordDto> {
    const input = parse(ServiceRecord, body);
    const current = await this.inScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Only drafts can be edited' });
    await this.validate(ctx, input);
    await ctx.tx.update(serviceRecords).set({
      serviceOn: input.serviceOn, siteId: input.siteId, departmentId: input.departmentId, content: input.content, updatedAt: new Date(), updatedBy: staff(ctx).userId,
    }).where(eq(serviceRecords.id, id));
    await replaceSigners(ctx, 'service_records', id, input.signers);
    await recordAudit(ctx, { action: 'update', subjectTable: 'service_records', subjectId: id, dataCategory: 'work' });
    return (await this.load(ctx, [id]))[0]!;
  }

  @Delete(':id')
  @HttpCode(204)
  @ServiceAccess()
  @ApiOperation({ summary: '刪除草稿', description: '送出簽核後就不能刪除。' })
  @ApiNoContentResponse()
  async remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const current = await this.inScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Only drafts can be deleted' });
    await deleteSigners(ctx, 'service_records', id);
    await ctx.tx.delete(serviceRecords).where(eq(serviceRecords.id, id));
    await recordAudit(ctx, { action: 'delete', subjectTable: 'service_records', subjectId: id, dataCategory: 'work', reason: `draft of ${current.serviceOn}` });
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ServiceAccess()
  @ApiOperation({
    summary: '送出簽核',
    description: `每位簽核人員各一個一次性連結（${SIGN_LINK_DAYS} 天內有效），寄到簽核人員的 Email；連結也只在這裡回傳這一次。`,
  })
  @ApiOkResponse({ type: [SignLinkDto] })
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<SignLinkDto[]> {
    const current = await this.inScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Already submitted' });
    await ctx.tx.update(serviceRecords).set({ status: '簽核中', updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(serviceRecords.id, id));
    const pending = await ctx.tx.select().from(signatures).where(and(eq(signatures.subjectTable, 'service_records'), eq(signatures.subjectId, id), isNull(signatures.signedAt))).orderBy(asc(signatures.createdAt));
    const links = await Promise.all(pending.map(s => issueSignLink(ctx, this, s, { siteId: current.siteId, on: current.serviceOn })));
    await recordAudit(ctx, { action: 'update', subjectTable: 'service_records', subjectId: id, dataCategory: 'work', reason: `submitted for sign-off to ${pending.map(s => s.signerRole).join('、')}` });
    return links;
  }

  @Post(':id/signatures/:signatureId/resend')
  @HttpCode(200)
  @ServiceAccess()
  @ApiOperation({ summary: '重寄簽核連結', description: '寄新的連結給這位簽核人員，舊連結隨即失效。' })
  @ApiOkResponse({ type: SignLinkDto })
  async resend(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('signatureId', ParseUUIDPipe) signatureId: string): Promise<SignLinkDto> {
    const current = await this.inScope(ctx, id);
    if (current.status !== '簽核中') throw new ConflictException({ code: 'not_in_sign_off', message: 'The record is not waiting for sign-off' });
    const [sig] = await ctx.tx.select().from(signatures).where(and(eq(signatures.id, signatureId), eq(signatures.subjectId, id)));
    if (!sig) throw new NotFoundException({ code: 'not_found', message: 'No such signer' });
    if (sig.signedAt) throw new ConflictException({ code: 'already_signed', message: 'Already signed' });
    return issueSignLink(ctx, this, sig, { siteId: current.siteId, on: current.serviceOn });
  }

  private async validate(ctx: RequestContext, input: z.infer<typeof ServiceRecord>) {
    await assertSitesInScope(ctx, input.siteId);
    await departmentInSite(ctx, input.siteId, input.departmentId);
    const [executor] = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.content.executorUserId), eq(users.active, true)));
    if (!executor) throw new BadRequestException({ code: 'unknown_staff', message: 'The executor must be active staff' });
    await assertSignOffRoles(ctx, input.signers);
  }

  private async inScope(ctx: RequestContext, id: string) {
    const [row] = await ctx.tx.select().from(serviceRecords).where(eq(serviceRecords.id, id));
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'No such service record' });
    await assertSitesInScope(ctx, row.siteId);
    return row;
  }

  private async load(ctx: RequestContext, ids: string[]): Promise<ServiceRecordDto[]> {
    if (!ids.length) return [];
    const rows = await ctx.tx.select({ r: serviceRecords, siteName: sites.name }).from(serviceRecords).innerJoin(sites, eq(sites.id, serviceRecords.siteId)).where(inArray(serviceRecords.id, ids));
    const sigs = await signaturesOf(ctx, 'service_records', ids);
    const executorIds = [...new Set(rows.map(x => (x.r.content as { executorUserId?: string }).executorUserId).filter((v): v is string => Boolean(v)))];
    const executors = executorIds.length ? await ctx.tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, executorIds)) : [];
    return ids.map(id => rows.find(x => x.r.id === id)!).map(({ r, siteName }) => ({
      id: r.id, serviceOn: r.serviceOn, siteId: r.siteId, siteName, departmentId: r.departmentId, status: r.status, content: r.content,
      executorName: executors.find(u => u.id === (r.content as { executorUserId?: string }).executorUserId)?.name ?? null,
      signatures: sigs.get(r.id) ?? [],
    }));
  }
}
