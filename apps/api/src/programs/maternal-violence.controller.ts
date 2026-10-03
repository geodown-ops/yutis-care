/*
 * 母性健康保護 (maternal protection) and 執行職務遭受不法侵害預防 (workplace violence).
 * Environment assessments and checklists describe workplaces, not people: 職安衛人員 work on them with clinical staff.
 * Maternal cases, interviews and violence incidents are about people: clinical staff only, details encrypted. An
 * accused manager can never see an incident (managers have no access to incidents at all).
 */
import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  employeeAcknowledgements, employees, maternalCases, maternalEnvAssessments, maternalInterviews, violenceChecklists, violenceIncidents, violenceRiskAssessments,
} from '@yutis/db';
import { MAT_LEVELS, pregnancyWeeks, suggestMaternalLevel, VIO_LIKELIHOOD, VIO_SEVERITY, violenceRisk } from '@yutis/domain';
import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { ENVIRONMENT_ROLES } from '../auth/permissions.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { decryptOptional, encryptOptional, TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { openApiSchema, parse } from '../core/validation.js';
import { assertSitesInScope, employeeInScope, mySiteIds, raiseEvent, todayTw } from './common.js';
import { Clinical } from './ergo.controller.js';

const Environment = () => StaffOnly({ feature: 'programs', roles: ENVIRONMENT_ROLES });

const EnvAssessment = z.object({
  siteId: z.uuid(), departmentId: z.uuid().nullable().default(null), area: z.string().trim().min(1).max(100), shiftType: z.string().trim().max(50).nullable().default(null),
  assessedOn: z.iso.date(),
  hazards: z.record(z.string().trim().min(1).max(50), z.object({ v: z.enum(['有', '可能有影響', '無']), note: z.string().max(500).optional() }).strict())
    .refine(h => Object.keys(h).length > 0, { message: 'Assess at least one hazard' }),
}).strict();
const MaternalCase = z.object({
  employeeId: z.uuid(), type: z.enum(['妊娠', '產後']), notifiedOn: z.iso.date(), dueDate: z.iso.date().nullable().default(null),
  birthDate: z.iso.date().nullable().default(null), envAssessmentId: z.uuid().nullable().default(null), detail: z.string().max(10000).nullable().default(null),
}).strict();
const MaternalInterview = z.object({
  interviewedOn: z.iso.date(), fitAdvice: z.string().trim().max(1000), limits: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  agreedArrangement: z.string().trim().max(1000).default(''), notes: z.string().max(10000).nullable().default(null),
}).strict();
const RiskAssessment = z.object({
  siteId: z.uuid(), departmentId: z.uuid().nullable().default(null), assessedOn: z.iso.date(),
  items: z.array(z.object({
    question: z.string().trim().min(1).max(300), likelihood: z.enum(VIO_LIKELIHOOD), severity: z.enum(VIO_SEVERITY), controls: z.string().max(1000).default(''),
  }).strict()).min(1).max(100),
}).strict();
const Checklist = z.object({
  kind: z.enum(['作業場所', '人力']), siteId: z.uuid(), checkedOn: z.iso.date(),
  items: z.array(z.object({ item: z.string().trim().min(1).max(300), ok: z.boolean(), note: z.string().max(500).default('') }).strict()).min(1).max(200),
}).strict();
const Incident = z.object({
  occurredOn: z.iso.date(), siteId: z.uuid(), type: z.string().trim().min(1).max(50), victimEmployeeId: z.uuid().nullable().default(null),
  detail: z.string().max(10000).nullable().default(null), followUps: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
}).strict();

class EnvAssessmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty() area!: string;
  @ApiProperty({ type: String, format: 'date' }) assessedOn!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) hazards!: unknown;
  @ApiProperty({ enum: MAT_LEVELS, description: '依危害評估建議的管理分級' }) level!: string;
}
class MaternalCaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['妊娠', '產後'] }) type!: string;
  @ApiProperty({ type: String, format: 'date' }) notifiedOn!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dueDate!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: '今日妊娠週數' }) weeks!: number | null;
  @ApiProperty({ type: String, enum: MAT_LEVELS, nullable: true }) level!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '自述症狀、風險因子（醫療資料，加密儲存）' }) detail!: string | null;
}
class RiskAssessmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ type: String, format: 'date' }) assessedOn!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '每題的可能性、嚴重度、風險等級與控制措施' }) items!: unknown[];
}
class CreatedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

@ApiTags('programs')
@Controller('programs')
export class MaternalViolenceController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Post('maternal/env-assessments') @Environment()
  @ApiOperation({ summary: '母性健康危害評估（作業環境）', description: '依危害有無自動建議管理分級。職安衛人員與職護、職醫。' })
  @ApiBody({ schema: openApiSchema(EnvAssessment) }) @ApiCreatedResponse({ type: EnvAssessmentDto })
  async createEnv(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<EnvAssessmentDto> {
    const input = parse(EnvAssessment, body);
    await assertSitesInScope(ctx, input.siteId);
    const [row] = await ctx.tx.insert(maternalEnvAssessments).values({ ...input, level: suggestMaternalLevel(input.hazards), tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'maternal_env_assessments', subjectId: row!.id, dataCategory: 'work' });
    return { id: row!.id, siteId: row!.siteId, area: row!.area, assessedOn: row!.assessedOn, hazards: row!.hazards, level: row!.level };
  }

  @Get('maternal/env-assessments') @Environment() @ApiOperation({ summary: '負責廠區的母性健康危害評估' }) @ApiOkResponse({ type: [EnvAssessmentDto] })
  async envs(@Ctx() ctx: RequestContext): Promise<EnvAssessmentDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    return ctx.tx.select({ id: maternalEnvAssessments.id, siteId: maternalEnvAssessments.siteId, area: maternalEnvAssessments.area, assessedOn: maternalEnvAssessments.assessedOn, hazards: maternalEnvAssessments.hazards, level: maternalEnvAssessments.level })
      .from(maternalEnvAssessments).where(inArray(maternalEnvAssessments.siteId, sites)).orderBy(desc(maternalEnvAssessments.assessedOn));
  }

  @Post('maternal/cases') @Clinical()
  @ApiOperation({ summary: '母性健康保護通報（妊娠、產後）', description: '產生母性事件，進入個案管理。' })
  @ApiBody({ schema: openApiSchema(MaternalCase) }) @ApiCreatedResponse({ type: MaternalCaseDto })
  async createMaternal(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<MaternalCaseDto> {
    const { detail, ...input } = parse(MaternalCase, body);
    const employee = await employeeInScope(ctx, input.employeeId);
    let level: (typeof MAT_LEVELS)[number] | null = null;
    if (input.envAssessmentId) {
      const [env] = await ctx.tx.select().from(maternalEnvAssessments).where(eq(maternalEnvAssessments.id, input.envAssessmentId));
      if (!env) throw new BadRequestException({ code: 'unknown_assessment', message: 'No such environment assessment' });
      level = env.level;
    }
    const [row] = await ctx.tx.insert(maternalCases).values({
      ...input, level, detailEnc: await encryptOptional(this.crypto, ctx.tenant.id, detail), tenantId: ctx.tenant.id, createdBy: staff(ctx).userId,
    }).returning();
    await raiseEvent(ctx, { employeeId: employee.id, type: 'mat', sourceTable: 'maternal_cases', sourceId: row!.id, occurredOn: input.notifiedOn, description: `工作場所母性健康保護：${input.type}通報` });
    await recordAudit(ctx, { action: 'create', subjectTable: 'maternal_cases', subjectId: row!.id, employeeId: employee.id, dataCategory: 'medical' });
    return this.toCase(ctx, row!, employee.name);
  }

  @Get('maternal/cases') @Clinical() @ApiOperation({ summary: '負責廠區的母性健康保護個案', description: '每位列出的員工都記入稽核。' }) @ApiOkResponse({ type: [MaternalCaseDto] })
  async maternal(@Ctx() ctx: RequestContext): Promise<MaternalCaseDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select({ c: maternalCases, name: employees.name }).from(maternalCases).innerJoin(employees, eq(employees.id, maternalCases.employeeId))
      .where(inArray(employees.siteId, sites)).orderBy(desc(maternalCases.notifiedOn));
    if (rows.length) await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'maternal_cases', subjectId: r.c.id, employeeId: r.c.employeeId, dataCategory: 'medical' })));
    return Promise.all(rows.map(r => this.toCase(ctx, r.c, r.name)));
  }

  @Post('maternal/cases/:id/interviews') @Clinical()
  @ApiOperation({ summary: '母性健康保護面談', description: '面談紀錄加密；適性評估與工作調整送交員工在員工端確認。' })
  @ApiBody({ schema: openApiSchema(MaternalInterview) }) @ApiCreatedResponse({ type: CreatedDto })
  async interview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<CreatedDto & { acknowledgementId: string }> {
    const { notes, ...input } = parse(MaternalInterview, body);
    const [c] = await ctx.tx.select().from(maternalCases).where(eq(maternalCases.id, id));
    if (!c) throw new NotFoundException({ code: 'not_found', message: 'No such maternal case' });
    await employeeInScope(ctx, c.employeeId);
    const me = staff(ctx).userId;
    const [row] = await ctx.tx.insert(maternalInterviews).values({
      ...input, caseId: id, staffUserId: me, notesEnc: await encryptOptional(this.crypto, ctx.tenant.id, notes), tenantId: ctx.tenant.id, createdBy: me,
    }).returning({ id: maternalInterviews.id });
    const [ack] = await ctx.tx.insert(employeeAcknowledgements).values({
      tenantId: ctx.tenant.id, employeeId: c.employeeId, subjectTable: 'maternal_interviews', subjectId: row!.id, createdBy: me,
    }).returning({ id: employeeAcknowledgements.id });
    await recordAudit(ctx, { action: 'create', subjectTable: 'maternal_interviews', subjectId: row!.id, employeeId: c.employeeId, dataCategory: 'medical' });
    return { id: row!.id, acknowledgementId: ack!.id };
  }

  @Post('violence/risk-assessments') @Environment()
  @ApiOperation({ summary: '不法侵害危害辨識及風險評估', description: '可能性 × 嚴重度自動算出風險等級。' })
  @ApiBody({ schema: openApiSchema(RiskAssessment) }) @ApiCreatedResponse({ type: RiskAssessmentDto })
  async createRisk(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<RiskAssessmentDto> {
    const input = parse(RiskAssessment, body);
    await assertSitesInScope(ctx, input.siteId);
    const items = input.items.map(i => ({ ...i, risk: violenceRisk(i.likelihood, i.severity) }));
    const [row] = await ctx.tx.insert(violenceRiskAssessments).values({ ...input, items, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_risk_assessments', subjectId: row!.id, dataCategory: 'work' });
    return { id: row!.id, siteId: row!.siteId, assessedOn: row!.assessedOn, items };
  }

  @Get('violence/risk-assessments') @Environment() @ApiOperation({ summary: '負責廠區的不法侵害風險評估' }) @ApiOkResponse({ type: [RiskAssessmentDto] })
  async risks(@Ctx() ctx: RequestContext): Promise<RiskAssessmentDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select().from(violenceRiskAssessments).where(inArray(violenceRiskAssessments.siteId, sites)).orderBy(desc(violenceRiskAssessments.assessedOn));
    return rows.map(r => ({ id: r.id, siteId: r.siteId, assessedOn: r.assessedOn, items: r.items as unknown[] }));
  }

  @Post('violence/checklists') @Environment()
  @ApiOperation({ summary: '作業場所與人力檢點表' })
  @ApiBody({ schema: openApiSchema(Checklist) }) @ApiCreatedResponse({ type: CreatedDto })
  async createChecklist(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(Checklist, body);
    await assertSitesInScope(ctx, input.siteId);
    const [row] = await ctx.tx.insert(violenceChecklists).values({ ...input, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning({ id: violenceChecklists.id });
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_checklists', subjectId: row!.id, dataCategory: 'work' });
    return row!;
  }

  @Get('violence/checklists') @Environment() @ApiOperation({ summary: '負責廠區的檢點表' })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  async checklists(@Ctx() ctx: RequestContext) {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    return ctx.tx.select({ id: violenceChecklists.id, kind: violenceChecklists.kind, siteId: violenceChecklists.siteId, checkedOn: violenceChecklists.checkedOn, items: violenceChecklists.items })
      .from(violenceChecklists).where(inArray(violenceChecklists.siteId, sites)).orderBy(desc(violenceChecklists.checkedOn));
  }

  @Post('violence/incidents') @Clinical()
  @ApiOperation({ summary: '不法侵害事件通報', description: '事件細節加密；只有職護、職醫看得到，主管一律不可見。' })
  @ApiBody({ schema: openApiSchema(Incident) }) @ApiCreatedResponse({ type: CreatedDto })
  async createIncident(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const { detail, ...input } = parse(Incident, body);
    await assertSitesInScope(ctx, input.siteId);
    if (input.victimEmployeeId) await employeeInScope(ctx, input.victimEmployeeId);
    const [row] = await ctx.tx.insert(violenceIncidents).values({
      ...input, detailEnc: await encryptOptional(this.crypto, ctx.tenant.id, detail), tenantId: ctx.tenant.id, createdBy: staff(ctx).userId,
    }).returning({ id: violenceIncidents.id });
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_incidents', subjectId: row!.id, employeeId: input.victimEmployeeId ?? undefined, dataCategory: 'medical' });
    return row!;
  }

  @Get('violence/incidents') @Clinical() @ApiOperation({ summary: '負責廠區的不法侵害事件' })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  async incidents(@Ctx() ctx: RequestContext) {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select().from(violenceIncidents).where(inArray(violenceIncidents.siteId, sites)).orderBy(desc(violenceIncidents.occurredOn));
    if (rows.length) await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'violence_incidents', subjectId: r.id, employeeId: r.victimEmployeeId ?? undefined, dataCategory: 'medical' })));
    return Promise.all(rows.map(async r => ({
      id: r.id, occurredOn: r.occurredOn, siteId: r.siteId, type: r.type, victimEmployeeId: r.victimEmployeeId, followUps: r.followUps, status: r.status,
      detail: await decryptOptional(this.crypto, ctx.tenant.id, r.detailEnc),
    })));
  }

  private async toCase(ctx: RequestContext, c: typeof maternalCases.$inferSelect, name: string): Promise<MaternalCaseDto> {
    return {
      id: c.id, employeeId: c.employeeId, name, type: c.type, notifiedOn: c.notifiedOn, dueDate: c.dueDate,
      weeks: pregnancyWeeks(c.type, c.dueDate, todayTw()), level: c.level, detail: await decryptOptional(this.crypto, ctx.tenant.id, c.detailEnc),
    };
  }
}
