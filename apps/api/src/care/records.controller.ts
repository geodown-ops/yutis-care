/*
 * Assistance records (協助紀錄) and the phrase library (片語庫) they are written with. A record's explanation,
 * handling and notes are medical text: stored encrypted, shown only to occupational health staff of the employee's
 * site, and every read is audited.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { assistRecords, employees, phrases, users } from '@yutis/db';
import { CONSULT_TYPES, LIFESTYLE_ADVICE, RECORD_RESULTS } from '@yutis/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { assertSiteAccess, siteAccess } from '../auth/site-access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { decryptOptional, TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { openApiSchema, parse } from '../core/validation.js';

const RecordAccess = () => StaffOnly({ data: 'medical', feature: 'employees' });

class PhraseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '不法侵害－措施' }) category!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: String, enum: ['改善', '建議'], nullable: true, description: '措施類片語：改善＝應增加或改善，建議＝建議可採行' }) kind!: '改善' | '建議' | null;
}

class RecordContentDto {
  @ApiProperty({ description: '說明' }) explain!: string;
  @ApiProperty({ description: '處理狀況' }) handling!: string;
  @ApiProperty({ description: '備註' }) note!: string;
}

class HelperDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ description: '投入分鐘數（附表八統計用）' }) minutes!: number;
}

class RecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({ example: '健康面談諮詢紀錄' }) category!: string;
  @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: Date;
  @ApiProperty({ type: [String], enum: CONSULT_TYPES }) consultTypes!: string[];
  @ApiProperty({ type: [String], enum: LIFESTYLE_ADVICE }) lifestyleAdvice!: string[];
  @ApiProperty({ type: RecordContentDto, nullable: true }) content!: RecordContentDto | null;
  @ApiProperty({ type: [HelperDto] }) helpers!: HelperDto[];
  @ApiProperty({ enum: RECORD_RESULTS }) result!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) followUpOn!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) followUpUserId!: string | null;
  @ApiProperty() followUpDone!: boolean;
  @ApiProperty({ description: '暫存' }) draft!: boolean;
}

class FollowUpDto {
  @ApiProperty({ format: 'uuid' }) recordId!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() employeeName!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: String, format: 'date' }) followUpOn!: string;
}

const Content = z.object({
  explain: z.string().max(5000).default(''), handling: z.string().max(5000).default(''), note: z.string().max(5000).default(''),
}).strict();
const RecordFields = {
  category: z.string().trim().min(1).max(50),
  occurredAt: z.iso.datetime({ offset: true }).transform(s => new Date(s)),
  consultTypes: z.array(z.enum(CONSULT_TYPES)).max(CONSULT_TYPES.length),
  lifestyleAdvice: z.array(z.enum(LIFESTYLE_ADVICE)).max(LIFESTYLE_ADVICE.length),
  content: Content,
  helpers: z.array(z.object({ userId: z.uuid(), minutes: z.number().int().min(0).max(1440) }).strict()).max(20),
  result: z.enum(RECORD_RESULTS),
  followUpOn: z.iso.date().nullable(),
  followUpUserId: z.uuid().nullable(),
  followUpDone: z.boolean(),
  draft: z.boolean(),
};
const CreateRecord = z.object({
  employeeId: z.uuid(), ...RecordFields,
  consultTypes: RecordFields.consultTypes.default([]), lifestyleAdvice: RecordFields.lifestyleAdvice.default([]), helpers: RecordFields.helpers.default([]),
  followUpOn: RecordFields.followUpOn.default(null), followUpUserId: RecordFields.followUpUserId.default(null),
  followUpDone: RecordFields.followUpDone.default(false), draft: RecordFields.draft.default(false),
}).strict();
const UpdateRecord = z.object(RecordFields).partial().strict();

const PhraseInput = z.object({ category: z.string().trim().min(1).max(50), text: z.string().trim().min(1).max(500), kind: z.enum(['改善', '建議']).nullable().default(null) }).strict();

@ApiTags('records')
@Controller()
export class RecordsController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Get('phrases')
  @RecordAccess()
  @ApiOperation({ summary: '片語庫', description: '撰寫協助紀錄、措施時插入的常用片語。' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiOkResponse({ type: [PhraseDto] })
  listPhrases(@Ctx() ctx: RequestContext, @Query('category') category?: string): Promise<PhraseDto[]> {
    return ctx.tx.select({ id: phrases.id, category: phrases.category, text: phrases.text, kind: phrases.kind }).from(phrases)
      .where(category ? eq(phrases.category, category) : undefined).orderBy(asc(phrases.category), asc(phrases.createdAt));
  }

  @Get('employees/:employeeId/records')
  @RecordAccess()
  @ApiOperation({ summary: '員工的協助紀錄（新的在前）', description: '內容解密後回傳；每次讀取記入稽核。' })
  @ApiOkResponse({ type: [RecordDto] })
  async list(@Ctx() ctx: RequestContext, @Param('employeeId', ParseUUIDPipe) employeeId: string): Promise<RecordDto[]> {
    await this.assertEmployee(ctx, employeeId);
    const rows = await ctx.tx.select().from(assistRecords).where(eq(assistRecords.employeeId, employeeId)).orderBy(desc(assistRecords.occurredAt));
    await recordAudit(ctx, { action: 'read', subjectTable: 'assist_records', employeeId, dataCategory: 'medical', reason: 'assistance records' });
    return Promise.all(rows.map(r => this.toDto(ctx, r)));
  }

  @Get('records/follow-ups')
  @RecordAccess()
  @ApiOperation({ summary: '我的待追蹤', description: '指派給我、尚未完成的追蹤（不含紀錄內容）。' })
  @ApiOkResponse({ type: [FollowUpDto] })
  async followUps(@Ctx() ctx: RequestContext): Promise<FollowUpDto[]> {
    const me = staff(ctx);
    const access = await siteAccess(ctx.tx, me.userId);
    const siteIds = [...access.assigned, ...access.breakGlass].map(s => s.id);
    if (!siteIds.length) return [];
    const rows = await ctx.tx.select({
      recordId: assistRecords.id, employeeId: employees.id, empNo: employees.empNo, employeeName: employees.name,
      category: assistRecords.category, followUpOn: assistRecords.followUpOn,
    }).from(assistRecords).innerJoin(employees, eq(employees.id, assistRecords.employeeId))
      .where(and(eq(assistRecords.followUpUserId, me.userId), eq(assistRecords.result, '追蹤'), eq(assistRecords.followUpDone, false),
        eq(assistRecords.draft, false), inArray(employees.siteId, siteIds)))
      .orderBy(asc(assistRecords.followUpOn));
    return rows.filter(r => r.followUpOn).map(r => ({ ...r, followUpOn: r.followUpOn! }));
  }

  @Post('records')
  @RecordAccess()
  @ApiOperation({ summary: '新增協助紀錄' })
  @ApiBody({ schema: openApiSchema(CreateRecord) })
  @ApiCreatedResponse({ type: RecordDto })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<RecordDto> {
    const { content, ...input } = parse(CreateRecord, body);
    await this.assertEmployee(ctx, input.employeeId);
    await this.assertStaff(ctx, [...input.helpers.map(h => h.userId), ...(input.followUpUserId ? [input.followUpUserId] : [])]);
    if (input.result === '追蹤' && !input.draft && !input.followUpOn) throw new BadRequestException({ code: 'follow_up_date', message: 'A record to follow up needs followUpOn' });
    const [row] = await ctx.tx.insert(assistRecords).values({
      ...input, tenantId: ctx.tenant.id, contentEnc: await this.crypto.encrypt(ctx.tenant.id, JSON.stringify(content)), createdBy: staff(ctx).userId,
    }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'assist_records', subjectId: row!.id, employeeId: input.employeeId, dataCategory: 'medical' });
    return this.toDto(ctx, row!);
  }

  @Patch('records/:id')
  @RecordAccess()
  @ApiOperation({ summary: '修改協助紀錄（含完成追蹤）' })
  @ApiBody({ schema: openApiSchema(UpdateRecord) })
  @ApiOkResponse({ type: RecordDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<RecordDto> {
    const { content, ...input } = parse(UpdateRecord, body);
    const [current] = await ctx.tx.select().from(assistRecords).where(eq(assistRecords.id, id));
    if (!current) throw new NotFoundException({ code: 'not_found', message: 'No such record' });
    await this.assertEmployee(ctx, current.employeeId);
    await this.assertStaff(ctx, [...(input.helpers ?? []).map(h => h.userId), ...(input.followUpUserId ? [input.followUpUserId] : [])]);
    const [row] = await ctx.tx.update(assistRecords).set({
      ...input, ...(content ? { contentEnc: await this.crypto.encrypt(ctx.tenant.id, JSON.stringify(content)) } : {}),
      updatedAt: new Date(), updatedBy: staff(ctx).userId,
    }).where(eq(assistRecords.id, id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'assist_records', subjectId: id, employeeId: current.employeeId, dataCategory: 'medical' });
    return this.toDto(ctx, row!);
  }

  @Get('admin/phrases')
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiTags('admin')
  @ApiOperation({ summary: '片語庫（租戶管理）', description: '和 GET /api/phrases 相同的清單，給租戶管理員維護片語用。' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiOkResponse({ type: [PhraseDto] })
  adminPhrases(@Ctx() ctx: RequestContext, @Query('category') category?: string): Promise<PhraseDto[]> {
    return this.listPhrases(ctx, category);
  }

  @Post('admin/phrases')
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiTags('admin')
  @ApiOperation({ summary: '新增片語' })
  @ApiBody({ schema: openApiSchema(PhraseInput) })
  @ApiCreatedResponse({ type: PhraseDto })
  async createPhrase(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<PhraseDto> {
    const input = parse(PhraseInput, body);
    const [row] = await ctx.tx.insert(phrases).values({ ...input, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId })
      .returning({ id: phrases.id, category: phrases.category, text: phrases.text, kind: phrases.kind });
    await recordAudit(ctx, { action: 'create', subjectTable: 'phrases', subjectId: row!.id });
    return row!;
  }

  @Delete('admin/phrases/:id')
  @HttpCode(204)
  @StaffOnly({ feature: 'tenant-admin' })
  @ApiTags('admin')
  @ApiOperation({ summary: '刪除片語' })
  @ApiNoContentResponse()
  async deletePhrase(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const [row] = await ctx.tx.delete(phrases).where(eq(phrases.id, id)).returning({ id: phrases.id });
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'No such phrase' });
    await recordAudit(ctx, { action: 'delete', subjectTable: 'phrases', subjectId: id });
  }

  private async assertEmployee(ctx: RequestContext, employeeId: string) {
    const [employee] = await ctx.tx.select({ siteId: employees.siteId }).from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new NotFoundException({ code: 'employee_not_found', message: 'No such employee' });
    await assertSiteAccess(ctx.tx, staff(ctx), employee.siteId);
  }

  private async assertStaff(ctx: RequestContext, userIds: string[]) {
    if (!userIds.length) return;
    const found = await ctx.tx.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), eq(users.active, true)));
    if (found.length !== new Set(userIds).size) throw new ConflictException({ code: 'unknown_staff', message: 'Helpers and follow-up owner must be active staff' });
  }

  private async toDto(ctx: RequestContext, r: typeof assistRecords.$inferSelect): Promise<RecordDto> {
    const text = await decryptOptional(this.crypto, ctx.tenant.id, r.contentEnc);
    return {
      id: r.id, employeeId: r.employeeId, category: r.category, occurredAt: r.occurredAt, consultTypes: r.consultTypes, lifestyleAdvice: r.lifestyleAdvice,
      content: text ? JSON.parse(text) as RecordContentDto : null, helpers: r.helpers as HelperDto[], result: r.result,
      followUpOn: r.followUpOn, followUpUserId: r.followUpUserId, followUpDone: r.followUpDone, draft: r.draft,
    };
  }
}
