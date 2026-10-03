/*
 * 勞工健康服務執行紀錄表（附表八）: occupational health staff and 職安衛人員 record each on-site service; the people
 * in the tenant's configured sign-off roles (簽核角色: physician, nurse, HR, department head…) sign it through a
 * one-time email link (/api/sign/:token). The record is complete when every signer has signed. Every step of the
 * sign-off chain is audited.
 */
import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { notifications, serviceRecords, signatures, sites, tenantSettings, users } from '@yutis/db';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { ENVIRONMENT_ROLES } from '../auth/permissions.js';
import type { ApiConfig } from '../config.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { API_CONFIG } from '../core/database.js';
import { openApiSchema, parse } from '../core/validation.js';
import { hashToken, SIGN_LINK_DAYS } from '../programs/advice.controller.js';
import { assertSitesInScope, mySiteIds } from '../programs/common.js';

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
const Signer = z.object({ role: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(100), email: z.email().toLowerCase() }).strict();
const ServiceRecord = z.object({ serviceOn: z.iso.date(), siteId: z.uuid(), content: ServiceContent, signers: z.array(Signer).min(1).max(10) }).strict();

class SignatureDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '人力資源管理人員' }) role!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) sentAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) signedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) comment!: string | null;
}
class ServiceRecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'date' }) serviceOn!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty() siteName!: string;
  @ApiProperty({ enum: ['草稿', '簽核中', '已完成'] }) status!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) content!: unknown;
  @ApiProperty({ type: [SignatureDto] }) signatures!: SignatureDto[];
}
class SignLinkDto {
  @ApiProperty({ format: 'uuid' }) signatureId!: string;
  @ApiProperty() role!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '一次性簽核連結（只回傳這一次，不儲存）' }) url!: string;
}

@ApiTags('service-records')
@Controller('service-records')
export class ServiceRecordsController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

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
    const [row] = await ctx.tx.insert(serviceRecords).values({ tenantId: ctx.tenant.id, serviceOn: input.serviceOn, siteId: input.siteId, content: input.content, createdBy: staff(ctx).userId }).returning();
    await this.replaceSigners(ctx, row!.id, input.signers);
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
    await ctx.tx.update(serviceRecords).set({ serviceOn: input.serviceOn, siteId: input.siteId, content: input.content, updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(serviceRecords.id, id));
    await this.replaceSigners(ctx, id, input.signers);
    await recordAudit(ctx, { action: 'update', subjectTable: 'service_records', subjectId: id, dataCategory: 'work' });
    return (await this.load(ctx, [id]))[0]!;
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ServiceAccess()
  @ApiOperation({
    summary: '送出簽核',
    description: `每位簽核人員各一個一次性連結（${SIGN_LINK_DAYS} 天內有效），並排入通知信；連結只回傳這一次。`,
  })
  @ApiOkResponse({ type: [SignLinkDto] })
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<SignLinkDto[]> {
    const current = await this.inScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Already submitted' });
    await ctx.tx.update(serviceRecords).set({ status: '簽核中', updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(serviceRecords.id, id));
    const pending = await ctx.tx.select().from(signatures).where(and(eq(signatures.subjectTable, 'service_records'), eq(signatures.subjectId, id), isNull(signatures.signedAt)));
    const links = await Promise.all(pending.map(s => this.issue(ctx, s)));
    await recordAudit(ctx, { action: 'update', subjectTable: 'service_records', subjectId: id, dataCategory: 'work', reason: `submitted for sign-off to ${pending.map(s => s.signerRole).join('、')}` });
    return links;
  }

  @Post(':id/signatures/:signatureId/resend')
  @HttpCode(200)
  @ServiceAccess()
  @ApiOperation({ summary: '重寄簽核連結', description: '舊連結隨即失效。' })
  @ApiOkResponse({ type: SignLinkDto })
  async resend(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('signatureId', ParseUUIDPipe) signatureId: string): Promise<SignLinkDto> {
    const current = await this.inScope(ctx, id);
    if (current.status !== '簽核中') throw new ConflictException({ code: 'not_in_sign_off', message: 'The record is not waiting for sign-off' });
    const [sig] = await ctx.tx.select().from(signatures).where(and(eq(signatures.id, signatureId), eq(signatures.subjectId, id)));
    if (!sig) throw new NotFoundException({ code: 'not_found', message: 'No such signer' });
    if (sig.signedAt) throw new ConflictException({ code: 'already_signed', message: 'Already signed' });
    return this.issue(ctx, sig);
  }

  private async issue(ctx: RequestContext, sig: typeof signatures.$inferSelect): Promise<SignLinkDto> {
    const token = randomBytes(32).toString('base64url');
    await ctx.tx.update(signatures).set({
      tokenHash: hashToken(token), tokenExpiresAt: new Date(Date.now() + SIGN_LINK_DAYS * 86_400_000), firstSentAt: sig.firstSentAt ?? new Date(), lastSentAt: new Date(), updatedAt: new Date(),
    }).where(eq(signatures.id, sig.id));
    await ctx.tx.insert(notifications).values({ tenantId: ctx.tenant.id, recipientEmail: sig.signerEmail, template: 'signature', params: { signatureId: sig.id }, createdBy: staff(ctx).userId });
    await recordAudit(ctx, { action: 'update', subjectTable: 'signatures', subjectId: sig.id, reason: `sign link sent to ${sig.signerRole} ${sig.signerName}` });
    const scheme = this.config.cookieSecure ? 'https' : 'http';
    return { signatureId: sig.id, role: sig.signerRole, name: sig.signerName, url: `${scheme}://${ctx.tenant.slug}.${this.config.tenantBaseDomain}/sign/${token}` };
  }

  private async validate(ctx: RequestContext, input: z.infer<typeof ServiceRecord>) {
    await assertSitesInScope(ctx, input.siteId);
    const [executor] = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.content.executorUserId), eq(users.active, true)));
    if (!executor) throw new BadRequestException({ code: 'unknown_staff', message: 'The executor must be active staff' });
    const [setting] = await ctx.tx.select().from(tenantSettings).where(eq(tenantSettings.key, 'sign_off_roles'));
    const roles = (setting?.value ?? []) as string[];
    const bad = input.signers.filter(s => !roles.includes(s.role));
    if (bad.length) throw new BadRequestException({ code: 'unknown_sign_off_role', message: `Not a configured sign-off role: ${bad.map(s => s.role).join(', ')}` });
  }

  private async replaceSigners(ctx: RequestContext, id: string, signers: z.infer<typeof Signer>[]) {
    await ctx.tx.delete(signatures).where(and(eq(signatures.subjectTable, 'service_records'), eq(signatures.subjectId, id)));
    await ctx.tx.insert(signatures).values(signers.map(s => ({
      tenantId: ctx.tenant.id, subjectTable: 'service_records', subjectId: id, signerRole: s.role, signerName: s.name, signerEmail: s.email, createdBy: staff(ctx).userId,
    })));
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
    const sigs = await ctx.tx.select().from(signatures).where(and(eq(signatures.subjectTable, 'service_records'), inArray(signatures.subjectId, ids))).orderBy(asc(signatures.createdAt));
    return ids.map(id => rows.find(x => x.r.id === id)!).map(({ r, siteName }) => ({
      id: r.id, serviceOn: r.serviceOn, siteId: r.siteId, siteName, status: r.status, content: r.content,
      signatures: sigs.filter(s => s.subjectId === r.id).map(s => ({
        id: s.id, role: s.signerRole, name: s.signerName, email: s.signerEmail, sentAt: s.lastSentAt, signedAt: s.signedAt, comment: s.comment,
      })),
    }));
  }
}
