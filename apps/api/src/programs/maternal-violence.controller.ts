/*
 * 母性健康保護 (maternal protection) and 執行職務遭受不法侵害預防 (workplace violence).
 * Environment assessments and checklists describe workplaces, not people: 職安衛人員 work on them with clinical staff.
 * Maternal cases, interviews and violence incidents are about people: clinical staff only, details encrypted. An
 * accused manager can never see an incident (managers have no access to incidents at all).
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  departments, employeeAcknowledgements, employees, maternalCases, maternalEnvAssessments, maternalInterviews, signatures, sites, violenceChecklists, violenceIncidents,
  users, violenceReviews, violenceRiskAssessments,
} from '@yutis/db';
import { MAT_LEVELS, pregnancyWeeks, suggestMaternalLevel, VIO_LIKELIHOOD, VIO_SEVERITY, violenceRisk } from '@yutis/domain';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { ENVIRONMENT_ROLES } from '../auth/permissions.js';
import type { ApiConfig } from '../config.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { decryptOptional, encryptOptional, TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { API_CONFIG } from '../core/database.js';
import { CreatedDto } from '../core/dto.js';
import { Notifier } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import {
  assertSignOffRoles, deleteSigners, issueSignLink, replaceSigners, SignatureDto, signaturesOf, Signer, SignLinkDto,
} from '../service/sign-off.js';
import { SIGN_LINK_DAYS } from './advice.controller.js';
import { assertSitesInScope, departmentInSite, employeeInScope, mySiteIds, raiseEvent, todayTw } from './common.js';
import { Clinical } from './ergo.controller.js';
import { AcknowledgementStatusDto } from './acknowledgements.js';
import { noticesBySubject, NoticeStatusDto } from './notices.js';

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
  kind: z.enum(['作業場所', '人力']), siteId: z.uuid(), departmentId: z.uuid().nullable().default(null), checkedOn: z.iso.date(),
  items: z.array(z.object({ item: z.string().trim().min(1).max(300), ok: z.boolean(), note: z.string().max(500).default('') }).strict()).min(1).max(200),
}).strict();
const PERSON_KINDS = violenceIncidents.perpetratorKind.enumValues;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Incident = z.object({
  occurredOn: z.iso.date(), occurredTime: time.nullable().default(null), siteId: z.uuid(), departmentId: z.uuid().nullable().default(null),
  place: z.string().trim().max(100).nullable().default(null), type: z.string().trim().min(1).max(50),
  victimEmployeeId: z.uuid().nullable().default(null), victimKind: z.enum(PERSON_KINDS).nullable().default(null), perpetratorKind: z.enum(PERSON_KINDS).nullable().default(null),
  detail: z.string().max(10000).nullable().default(null), followUps: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
}).strict();
const INCIDENT_STATUSES = violenceIncidents.status.enumValues;
const ReviewItem = z.object({
  item: z.string().trim().min(1).max(100), points: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  result: z.string().max(2000).default(''), fix: z.string().max(2000).default(''),
}).strict();
const Review = z.object({
  siteId: z.uuid(), departmentId: z.uuid().nullable().default(null), reviewedOn: z.iso.date(), items: z.array(ReviewItem).min(1).max(30),
  signers: z.array(Signer).max(10).default([]),
}).strict();
const UpdateIncident = z.object({
  occurredOn: z.iso.date(), occurredTime: time.nullable(), siteId: z.uuid(), departmentId: z.uuid().nullable(), place: z.string().trim().max(100).nullable(),
  type: z.string().trim().min(1).max(50), victimEmployeeId: z.uuid().nullable(), victimKind: z.enum(PERSON_KINDS).nullable(), perpetratorKind: z.enum(PERSON_KINDS).nullable(),
  detail: z.string().max(10000).nullable(), followUps: z.array(z.string().trim().min(1).max(200)).max(20), status: z.enum(INCIDENT_STATUSES),
}).partial().strict();

class EnvAssessmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) departmentId!: string | null;
  @ApiProperty() area!: string;
  @ApiProperty({ type: String, nullable: true, example: '輪班' }) shiftType!: string | null;
  @ApiProperty({ type: String, format: 'date' }) assessedOn!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) hazards!: unknown;
  @ApiProperty({ enum: MAT_LEVELS, description: '依危害評估建議的管理分級' }) level!: string;
}
class MaternalInterviewDto {
  @ApiProperty({ format: 'uuid', description: '通知主管時的 subjectId（subjectTable 為 maternal_interviews）' }) id!: string;
  @ApiProperty({ type: String, format: 'date' }) interviewedOn!: string;
  @ApiProperty({ type: String, nullable: true, description: '適性評估（工作安排建議）' }) fitAdvice!: string | null;
  @ApiProperty({ type: [String], description: '工作限制' }) limits!: string[];
  @ApiProperty({ type: String, nullable: true, description: '雙方同意的工作調整' }) agreedArrangement!: string | null;
  @ApiProperty({ type: AcknowledgementStatusDto, nullable: true, description: '員工確認狀態' }) acknowledgement!: AcknowledgementStatusDto | null;
  @ApiProperty({ type: [NoticeStatusDto], description: '已寄給部門主管的通知與讀取狀態' }) notices!: NoticeStatusDto[];
}
class MaternalCaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid', description: '員工目前所屬廠區' }) siteId!: string;
  @ApiProperty({ format: 'uuid', description: '員工目前所屬部門' }) departmentId!: string;
  @ApiProperty() departmentName!: string;
  @ApiProperty({ enum: ['妊娠', '產後'], description: '產後指分娩後未滿一年' }) type!: string;
  @ApiProperty({ type: String, format: 'date' }) notifiedOn!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '預產期' }) dueDate!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '分娩日（產後）' }) birthDate!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: '今日妊娠週數' }) weeks!: number | null;
  @ApiProperty({ type: String, enum: MAT_LEVELS, nullable: true }) level!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '自述症狀、風險因子（醫療資料，加密儲存）' }) detail!: string | null;
  @ApiProperty({ type: [MaternalInterviewDto], description: '面談紀錄（舊的在前，不含面談內文）' }) interviews!: MaternalInterviewDto[];
}
class ChecklistItemDto {
  @ApiProperty() item!: string;
  @ApiProperty() ok!: boolean;
  @ApiProperty() note!: string;
}
class ChecklistDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['作業場所', '人力'] }) kind!: '作業場所' | '人力';
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) departmentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty({ type: String, format: 'date' }) checkedOn!: string;
  @ApiProperty({ type: [ChecklistItemDto] }) items!: ChecklistItemDto[];
}
class IncidentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'date' }) occurredOn!: string;
  @ApiProperty({ type: String, nullable: true, example: '14:35', description: '發生時間（HH:MM）' }) occurredTime!: string | null;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) departmentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '客服中心 1F 服務櫃台', description: '發生地點' }) place!: string | null;
  @ApiProperty({ example: '語言暴力' }) type!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: '受害者是本公司員工時' }) victimEmployeeId!: string | null;
  @ApiProperty({ type: String, enum: PERSON_KINDS, nullable: true, description: '受害者人員類別' }) victimKind!: (typeof PERSON_KINDS)[number] | null;
  @ApiProperty({ type: String, enum: PERSON_KINDS, nullable: true, description: '加害者人員類別' }) perpetratorKind!: (typeof PERSON_KINDS)[number] | null;
  @ApiProperty({ type: [String], description: '後續協助' }) followUps!: string[];
  @ApiProperty({ enum: INCIDENT_STATUSES }) status!: (typeof INCIDENT_STATUSES)[number];
  @ApiProperty({ type: String, nullable: true, description: '雙方姓名或特徵、關係、事件經過與處理（加密儲存）' }) detail!: string | null;
  @ApiProperty({ type: String, format: 'date-time', description: '受理時間（通報建立時）' }) receivedAt!: Date;
  @ApiProperty({ type: String, nullable: true, description: '受理人（建立通報的人員）' }) receiverName!: string | null;
}
class ViolenceReviewItemDto {
  @ApiProperty({ example: '辨識及評估危害' }) item!: string;
  @ApiProperty({ type: [String], description: '已檢點的重點' }) points!: string[];
  @ApiProperty() result!: string;
  @ApiProperty({ description: '修正相關控制措施／改善情形採行措施' }) fix!: string;
}
class ViolenceReviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty() siteName!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) departmentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty({ type: String, format: 'date' }) reviewedOn!: string;
  @ApiProperty({ enum: violenceReviews.status.enumValues }) status!: (typeof violenceReviews.status.enumValues)[number];
  @ApiProperty({ type: [ViolenceReviewItemDto] }) items!: ViolenceReviewItemDto[];
  @ApiProperty({ type: [SignatureDto] }) signatures!: SignatureDto[];
}
class RiskAssessmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) departmentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty({ type: String, format: 'date' }) assessedOn!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '每題的可能性、嚴重度、風險等級與控制措施' }) items!: unknown[];
}
class InterviewCreatedDto extends CreatedDto {
  @ApiProperty({ format: 'uuid', description: '員工確認紀錄；用來產生確認連結' }) acknowledgementId!: string;
}

@ApiTags('programs')
@Controller('programs')
export class MaternalViolenceController {
  constructor(
    @Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto,
    @Inject(API_CONFIG) readonly config: ApiConfig,
    readonly notifier: Notifier,
  ) {}

  @Post('maternal/env-assessments') @Environment()
  @ApiOperation({ summary: '母性健康危害評估（作業環境）', description: '依危害有無自動建議管理分級。職安衛人員與職護、職醫。' })
  @ApiBody({ schema: openApiSchema(EnvAssessment) }) @ApiCreatedResponse({ type: EnvAssessmentDto })
  async createEnv(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<EnvAssessmentDto> {
    const input = parse(EnvAssessment, body);
    await assertSitesInScope(ctx, input.siteId);
    await departmentInSite(ctx, input.siteId, input.departmentId);
    const [row] = await ctx.tx.insert(maternalEnvAssessments).values({ ...input, level: suggestMaternalLevel(input.hazards), tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'maternal_env_assessments', subjectId: row!.id, dataCategory: 'work' });
    return toEnv(row!);
  }

  @Get('maternal/env-assessments') @Environment() @ApiOperation({ summary: '負責廠區的母性健康危害評估' }) @ApiOkResponse({ type: [EnvAssessmentDto] })
  async envs(@Ctx() ctx: RequestContext): Promise<EnvAssessmentDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select().from(maternalEnvAssessments).where(inArray(maternalEnvAssessments.siteId, sites)).orderBy(desc(maternalEnvAssessments.assessedOn));
    return rows.map(toEnv);
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
    const [dept] = await ctx.tx.select({ name: departments.name }).from(departments).where(eq(departments.id, employee.departmentId));
    return (await this.toCases(ctx, [{ c: row!, empNo: employee.empNo, name: employee.name, siteId: employee.siteId, departmentId: employee.departmentId, departmentName: dept!.name }]))[0]!;
  }

  @Get('maternal/cases') @Clinical() @ApiOperation({ summary: '負責廠區的母性健康保護個案', description: '每位列出的員工都記入稽核。' }) @ApiOkResponse({ type: [MaternalCaseDto] })
  async maternal(@Ctx() ctx: RequestContext): Promise<MaternalCaseDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select({
      c: maternalCases, empNo: employees.empNo, name: employees.name, siteId: employees.siteId, departmentId: employees.departmentId, departmentName: departments.name,
    }).from(maternalCases).innerJoin(employees, eq(employees.id, maternalCases.employeeId)).innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(inArray(employees.siteId, sites)).orderBy(desc(maternalCases.notifiedOn));
    if (rows.length) await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'maternal_cases', subjectId: r.c.id, employeeId: r.c.employeeId, dataCategory: 'medical' })));
    return this.toCases(ctx, rows);
  }

  @Post('maternal/cases/:id/interviews') @Clinical()
  @ApiOperation({ summary: '母性健康保護面談', description: '面談紀錄加密；適性評估與工作調整送交員工在員工端確認。' })
  @ApiBody({ schema: openApiSchema(MaternalInterview) }) @ApiCreatedResponse({ type: InterviewCreatedDto })
  async interview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<InterviewCreatedDto> {
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
    const departmentName = await departmentInSite(ctx, input.siteId, input.departmentId);
    const items = input.items.map(i => ({ ...i, risk: violenceRisk(i.likelihood, i.severity) }));
    const [row] = await ctx.tx.insert(violenceRiskAssessments).values({ ...input, items, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_risk_assessments', subjectId: row!.id, dataCategory: 'work' });
    return { id: row!.id, siteId: row!.siteId, departmentId: row!.departmentId, departmentName, assessedOn: row!.assessedOn, items };
  }

  @Get('violence/risk-assessments') @Environment() @ApiOperation({ summary: '負責廠區的不法侵害風險評估' }) @ApiOkResponse({ type: [RiskAssessmentDto] })
  async risks(@Ctx() ctx: RequestContext): Promise<RiskAssessmentDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select({ r: violenceRiskAssessments, departmentName: departments.name }).from(violenceRiskAssessments)
      .leftJoin(departments, eq(departments.id, violenceRiskAssessments.departmentId))
      .where(inArray(violenceRiskAssessments.siteId, sites)).orderBy(desc(violenceRiskAssessments.assessedOn));
    return rows.map(({ r, departmentName }) => ({ id: r.id, siteId: r.siteId, departmentId: r.departmentId, departmentName, assessedOn: r.assessedOn, items: r.items as unknown[] }));
  }

  @Post('violence/checklists') @Environment()
  @ApiOperation({ summary: '作業場所與人力檢點表' })
  @ApiBody({ schema: openApiSchema(Checklist) }) @ApiCreatedResponse({ type: CreatedDto })
  async createChecklist(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const input = parse(Checklist, body);
    await assertSitesInScope(ctx, input.siteId);
    await departmentInSite(ctx, input.siteId, input.departmentId);
    const [row] = await ctx.tx.insert(violenceChecklists).values({ ...input, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning({ id: violenceChecklists.id });
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_checklists', subjectId: row!.id, dataCategory: 'work' });
    return row!;
  }

  @Get('violence/checklists') @Environment() @ApiOperation({ summary: '負責廠區的檢點表' })
  @ApiOkResponse({ type: [ChecklistDto] })
  async checklists(@Ctx() ctx: RequestContext): Promise<ChecklistDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select({
      id: violenceChecklists.id, kind: violenceChecklists.kind, siteId: violenceChecklists.siteId, departmentId: violenceChecklists.departmentId, departmentName: departments.name,
      checkedOn: violenceChecklists.checkedOn, items: violenceChecklists.items,
    }).from(violenceChecklists).leftJoin(departments, eq(departments.id, violenceChecklists.departmentId))
      .where(inArray(violenceChecklists.siteId, sites)).orderBy(desc(violenceChecklists.checkedOn));
    return rows.map(r => ({ ...r, items: r.items as ChecklistItemDto[] }));
  }

  @Post('violence/incidents') @Clinical()
  @ApiOperation({ summary: '不法侵害事件通報', description: '事件細節加密；只有職護、職醫看得到，主管一律不可見。' })
  @ApiBody({ schema: openApiSchema(Incident) }) @ApiCreatedResponse({ type: CreatedDto })
  async createIncident(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<CreatedDto> {
    const { detail, ...input } = parse(Incident, body);
    await assertSitesInScope(ctx, input.siteId);
    await departmentInSite(ctx, input.siteId, input.departmentId);
    if (input.victimEmployeeId) await employeeInScope(ctx, input.victimEmployeeId);
    const [row] = await ctx.tx.insert(violenceIncidents).values({
      ...input, detailEnc: await encryptOptional(this.crypto, ctx.tenant.id, detail), tenantId: ctx.tenant.id, createdBy: staff(ctx).userId,
    }).returning({ id: violenceIncidents.id });
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_incidents', subjectId: row!.id, employeeId: input.victimEmployeeId ?? undefined, dataCategory: 'medical' });
    return row!;
  }

  @Get('violence/incidents') @Clinical() @ApiOperation({ summary: '負責廠區的不法侵害事件' })
  @ApiOkResponse({ type: [IncidentDto] })
  async incidents(@Ctx() ctx: RequestContext): Promise<IncidentDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await this.loadIncidents(ctx, inArray(violenceIncidents.siteId, sites));
    if (rows.length) await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'violence_incidents', subjectId: r.id, employeeId: r.victimEmployeeId ?? undefined, dataCategory: 'medical' })));
    return rows;
  }

  @Patch('violence/incidents/:id') @Clinical()
  @ApiOperation({ summary: '修改不法侵害事件', description: '只送要改的欄位，例如 { status: \'結案\' }；detail 送 null 會清除。改廠區時，原部門不在新廠區就要一起改 departmentId（或送 null）。' })
  @ApiBody({ schema: openApiSchema(UpdateIncident) }) @ApiOkResponse({ type: IncidentDto })
  async updateIncident(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<IncidentDto> {
    const { detail, ...input } = parse(UpdateIncident, body);
    const [current] = await ctx.tx.select().from(violenceIncidents).where(eq(violenceIncidents.id, id));
    if (!current) throw new NotFoundException({ code: 'not_found', message: 'No such incident' });
    await assertSitesInScope(ctx, current.siteId);
    if (input.siteId) await assertSitesInScope(ctx, input.siteId);
    await departmentInSite(ctx, input.siteId ?? current.siteId, input.departmentId !== undefined ? input.departmentId : current.departmentId);
    if (input.victimEmployeeId) await employeeInScope(ctx, input.victimEmployeeId);
    const [row] = await ctx.tx.update(violenceIncidents).set({
      ...input, ...(detail !== undefined ? { detailEnc: await encryptOptional(this.crypto, ctx.tenant.id, detail) } : {}),
      updatedAt: new Date(), updatedBy: staff(ctx).userId,
    }).where(eq(violenceIncidents.id, id)).returning();
    const changed = [...Object.keys(input), ...(detail !== undefined ? ['detail'] : [])];
    await recordAudit(ctx, {
      action: 'update', subjectTable: 'violence_incidents', subjectId: id, employeeId: row!.victimEmployeeId ?? undefined, dataCategory: 'medical',
      reason: changed.length ? `changed ${changed.join(', ')}` : undefined,
    });
    return (await this.loadIncidents(ctx, eq(violenceIncidents.id, id)))[0]!;
  }

  @Get('violence/reviews') @Environment() @ApiOperation({ summary: '負責廠區的預防措施查核及評估' }) @ApiOkResponse({ type: [ViolenceReviewDto] })
  async reviews(@Ctx() ctx: RequestContext): Promise<ViolenceReviewDto[]> {
    const mine = await mySiteIds(ctx);
    if (!mine.length) return [];
    const rows = await ctx.tx.select({ id: violenceReviews.id }).from(violenceReviews).where(inArray(violenceReviews.siteId, mine)).orderBy(desc(violenceReviews.reviewedOn));
    return this.loadReviews(ctx, rows.map(r => r.id));
  }

  @Post('violence/reviews') @Environment()
  @ApiOperation({ summary: '新增預防措施查核及評估（草稿）', description: '簽核人員的角色必須是租戶設定的簽核角色之一；送出簽核前可修改。' })
  @ApiBody({ schema: openApiSchema(Review) }) @ApiCreatedResponse({ type: ViolenceReviewDto })
  async createReview(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<ViolenceReviewDto> {
    const { signers, ...input } = parse(Review, body);
    await this.validateReview(ctx, input, signers);
    const [row] = await ctx.tx.insert(violenceReviews).values({ ...input, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning({ id: violenceReviews.id });
    await replaceSigners(ctx, 'violence_reviews', row!.id, signers);
    await recordAudit(ctx, { action: 'create', subjectTable: 'violence_reviews', subjectId: row!.id, dataCategory: 'work' });
    return (await this.loadReviews(ctx, [row!.id]))[0]!;
  }

  @Put('violence/reviews/:id') @Environment() @ApiOperation({ summary: '修改預防措施查核及評估草稿' })
  @ApiBody({ schema: openApiSchema(Review) }) @ApiOkResponse({ type: ViolenceReviewDto })
  async updateReview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ViolenceReviewDto> {
    const { signers, ...input } = parse(Review, body);
    const current = await this.reviewInScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Only drafts can be edited' });
    await this.validateReview(ctx, input, signers);
    await ctx.tx.update(violenceReviews).set({ ...input, updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(violenceReviews.id, id));
    await replaceSigners(ctx, 'violence_reviews', id, signers);
    await recordAudit(ctx, { action: 'update', subjectTable: 'violence_reviews', subjectId: id, dataCategory: 'work' });
    return (await this.loadReviews(ctx, [id]))[0]!;
  }

  @Delete('violence/reviews/:id') @HttpCode(204) @Environment() @ApiOperation({ summary: '刪除預防措施查核及評估草稿', description: '送出簽核後就不能刪除。' })
  @ApiNoContentResponse()
  async deleteReview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const current = await this.reviewInScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Only drafts can be deleted' });
    await deleteSigners(ctx, 'violence_reviews', id);
    await ctx.tx.delete(violenceReviews).where(eq(violenceReviews.id, id));
    await recordAudit(ctx, { action: 'delete', subjectTable: 'violence_reviews', subjectId: id, dataCategory: 'work', reason: `draft of ${current.reviewedOn}` });
  }

  @Post('violence/reviews/:id/submit') @HttpCode(200) @Environment()
  @ApiOperation({
    summary: '預防措施查核及評估送出簽核',
    description: `每位簽核人員各一個一次性連結（${SIGN_LINK_DAYS} 天內有效），寄到簽核人員的 Email；連結也只在這裡回傳這一次。`,
  })
  @ApiOkResponse({ type: [SignLinkDto] })
  async submitReview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<SignLinkDto[]> {
    const current = await this.reviewInScope(ctx, id);
    if (current.status !== '草稿') throw new ConflictException({ code: 'not_draft', message: 'Already submitted' });
    const pending = await ctx.tx.select().from(signatures)
      .where(and(eq(signatures.subjectTable, 'violence_reviews'), eq(signatures.subjectId, id), isNull(signatures.signedAt))).orderBy(asc(signatures.createdAt));
    if (!pending.length) throw new BadRequestException({ code: 'no_signers', message: 'Add at least one signer before submitting' });
    await ctx.tx.update(violenceReviews).set({ status: '簽核中', updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(violenceReviews.id, id));
    const links = await Promise.all(pending.map(sig => issueSignLink(ctx, this, sig, { siteId: current.siteId, on: current.reviewedOn })));
    await recordAudit(ctx, { action: 'update', subjectTable: 'violence_reviews', subjectId: id, dataCategory: 'work', reason: `submitted for sign-off to ${pending.map(p => p.signerRole).join('、')}` });
    return links;
  }

  @Post('violence/reviews/:id/signatures/:signatureId/resend') @HttpCode(200) @Environment()
  @ApiOperation({ summary: '重寄預防措施查核及評估的簽核連結', description: '寄新的連結給這位簽核人員，舊連結隨即失效。' })
  @ApiOkResponse({ type: SignLinkDto })
  async resendReview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('signatureId', ParseUUIDPipe) signatureId: string): Promise<SignLinkDto> {
    const current = await this.reviewInScope(ctx, id);
    if (current.status !== '簽核中') throw new ConflictException({ code: 'not_in_sign_off', message: 'The review is not waiting for sign-off' });
    const [sig] = await ctx.tx.select().from(signatures).where(and(eq(signatures.id, signatureId), eq(signatures.subjectTable, 'violence_reviews'), eq(signatures.subjectId, id)));
    if (!sig) throw new NotFoundException({ code: 'not_found', message: 'No such signer' });
    if (sig.signedAt) throw new ConflictException({ code: 'already_signed', message: 'Already signed' });
    return issueSignLink(ctx, this, sig, { siteId: current.siteId, on: current.reviewedOn });
  }

  private async validateReview(ctx: RequestContext, input: { siteId: string; departmentId: string | null }, signers: z.infer<typeof Signer>[]) {
    await assertSitesInScope(ctx, input.siteId);
    await departmentInSite(ctx, input.siteId, input.departmentId);
    await assertSignOffRoles(ctx, signers);
  }

  private async reviewInScope(ctx: RequestContext, id: string) {
    const [row] = await ctx.tx.select().from(violenceReviews).where(eq(violenceReviews.id, id));
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'No such review' });
    await assertSitesInScope(ctx, row.siteId);
    return row;
  }

  private async loadReviews(ctx: RequestContext, ids: string[]): Promise<ViolenceReviewDto[]> {
    if (!ids.length) return [];
    const rows = await ctx.tx.select({ r: violenceReviews, siteName: sites.name, departmentName: departments.name }).from(violenceReviews)
      .innerJoin(sites, eq(sites.id, violenceReviews.siteId)).leftJoin(departments, eq(departments.id, violenceReviews.departmentId))
      .where(inArray(violenceReviews.id, ids));
    const sigs = await signaturesOf(ctx, 'violence_reviews', ids);
    return ids.map(id => rows.find(x => x.r.id === id)!).map(({ r, siteName, departmentName }) => ({
      id: r.id, siteId: r.siteId, siteName, departmentId: r.departmentId, departmentName, reviewedOn: r.reviewedOn, status: r.status,
      items: r.items as ViolenceReviewItemDto[], signatures: sigs.get(r.id) ?? [],
    }));
  }

  /** Newest first, with the department name and who received the report. */
  private async loadIncidents(ctx: RequestContext, where: SQL): Promise<IncidentDto[]> {
    const rows = await ctx.tx.select({ r: violenceIncidents, departmentName: departments.name, receiverName: users.name }).from(violenceIncidents)
      .leftJoin(departments, eq(departments.id, violenceIncidents.departmentId)).leftJoin(users, eq(users.id, violenceIncidents.createdBy))
      .where(where).orderBy(desc(violenceIncidents.occurredOn), sql`${violenceIncidents.occurredTime} desc nulls last`);
    return Promise.all(rows.map(async ({ r, departmentName, receiverName }) => ({
      id: r.id, occurredOn: r.occurredOn, occurredTime: r.occurredTime, siteId: r.siteId, departmentId: r.departmentId, departmentName, place: r.place, type: r.type,
      victimEmployeeId: r.victimEmployeeId, victimKind: r.victimKind, perpetratorKind: r.perpetratorKind, followUps: r.followUps, status: r.status,
      detail: await decryptOptional(this.crypto, ctx.tenant.id, r.detailEnc), receivedAt: r.createdAt, receiverName,
    })));
  }

  private async toCases(
    ctx: RequestContext, rows: { c: typeof maternalCases.$inferSelect; empNo: string; name: string; siteId: string; departmentId: string; departmentName: string }[],
  ): Promise<MaternalCaseDto[]> {
    const ivs = rows.length
      ? await ctx.tx.select().from(maternalInterviews).where(inArray(maternalInterviews.caseId, rows.map(r => r.c.id))).orderBy(asc(maternalInterviews.interviewedOn), asc(maternalInterviews.createdAt))
      : [];
    const ivIds = ivs.map(i => i.id);
    const acks = ivIds.length
      ? await ctx.tx.select().from(employeeAcknowledgements).where(and(eq(employeeAcknowledgements.subjectTable, 'maternal_interviews'), inArray(employeeAcknowledgements.subjectId, ivIds)))
      : [];
    const notices = await noticesBySubject(ctx, 'maternal_interviews', ivIds);
    return Promise.all(rows.map(async ({ c, empNo, name, siteId, departmentId, departmentName }) => ({
      id: c.id, employeeId: c.employeeId, empNo, name, siteId, departmentId, departmentName, type: c.type, notifiedOn: c.notifiedOn, dueDate: c.dueDate, birthDate: c.birthDate,
      weeks: pregnancyWeeks(c.type, c.dueDate, todayTw()), level: c.level, detail: await decryptOptional(this.crypto, ctx.tenant.id, c.detailEnc),
      interviews: ivs.filter(i => i.caseId === c.id).map(i => {
        const ack = acks.find(a => a.subjectId === i.id);
        return {
          id: i.id, interviewedOn: i.interviewedOn, fitAdvice: i.fitAdvice, limits: i.limits, agreedArrangement: i.agreedArrangement,
          acknowledgement: ack ? { id: ack.id, sentAt: ack.sentAt, confirmedAt: ack.confirmedAt, comment: ack.comment } : null,
          notices: notices.get(i.id) ?? [],
        };
      }),
    })));
  }
}

function toEnv(r: typeof maternalEnvAssessments.$inferSelect): EnvAssessmentDto {
  return { id: r.id, siteId: r.siteId, departmentId: r.departmentId, area: r.area, shiftType: r.shiftType, assessedOn: r.assessedOn, hazards: r.hazards, level: r.level };
}
