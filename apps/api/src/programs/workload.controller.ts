/*
 * 異常工作負荷促發疾病預防 (overwork): employees answer the CBI burnout questionnaire and their overtime in the portal
 * (or a nurse enters them); the 10-year cardiovascular risk from the latest health check and the workload level go
 * through @yutis/domain's matrix to decide whether a physician interview is needed. The interview's clinical notes
 * are encrypted; its work-arrangement advice is what HR and managers may see.
 */
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { departments, employeeAcknowledgements, employees, interviews, sites, users, workloadAssessments } from '@yutis/db';
import {
  CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, cbiScores, cvdScore, evaluateWorkload, loadEval, RISK_LABEL, WORK_PATTERNS, WORKLOAD_RULE_VERSION,
  type WorkloadResult,
} from '@yutis/domain';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { tenantOrigin, type ApiConfig } from '../config.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type Principal, type RequestContext } from '../core/context.js';
import { decryptOptional, encryptOptional, TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { API_CONFIG } from '../core/database.js';
import { RemindResultDto } from '../core/dto.js';
import { interviewScheduledEmail, surveyReminderEmail } from '../core/emails.js';
import { Notifier } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { AcknowledgementStatusDto } from './acknowledgements.js';
import { clearDraft, employeeInScope, latestExamFor, mySiteIds, raiseEvent, todayTw } from './common.js';
import { Clinical } from './ergo.controller.js';
import { noticesBySubject, NoticeStatusDto } from './notices.js';
import { WorkAdvice, workAdviceOf, type WorkAdviceInput } from './work-advice.js';

export const RISK_MISSING = ['cbi', 'overload', 'exam'] as const;
export const RISK_MISSING_DESCRIPTION =
  '還不能判定風險的原因：cbi 過勞量表未填、overload 工時與工作型態未填、exam 評估時沒有健檢可算十年心血管風險。已判定時為空陣列。';

/** Why an assessment has no risk level yet. */
export function riskMissing(a: typeof workloadAssessments.$inferSelect): (typeof RISK_MISSING)[number][] {
  if (a.riskLevel !== null) return [];
  const evaluation = a.evaluation as WorkloadResult | null;
  return [
    ...(a.fatigueAt ? [] : ['cbi' as const]),
    ...(a.overloadAt ? [] : ['overload' as const]),
    ...(evaluation && !evaluation.cvd ? ['exam' as const] : []),
  ];
}

const answer = z.number().int().min(0).max(4);
export const CbiAnswers = z.object({ p: z.array(answer).length(CBI_PERSONAL_ITEMS), w: z.array(answer).length(CBI_WORK_ITEMS) }).strict();
export const Overload = z.object({
  overtime1m: z.number().min(0).max(744), overtime6mAvg: z.number().min(0).max(744), workPatterns: z.array(z.enum(WORK_PATTERNS)).max(WORK_PATTERNS.length),
}).strict();
const Fatigue = z.union([
  z.object({ cbi: CbiAnswers }).strict(),
  z.object({ personalBurnout: z.number().min(0).max(100), workBurnout: z.number().min(0).max(100) }).strict(),
]);
/** 面談指導結果: clinical, so stored encrypted and only returned by the single-assessment read. */
const Guidance = z.object({
  fatigue: z.enum(['無', '輕度', '中度', '重度']).nullable().default(null),
  mentalConcern: z.enum(['有', '無']).nullable().default(null),
  diagnosis: z.enum(['無異常', '需觀察或進一步追蹤檢查', '需進行醫療']).nullable().default(null),
  guidance: z.enum(['不需指導', '需健康指導', '需醫療指導']).nullable().default(null),
  needMeasure: z.boolean().nullable().default(null),
  seeDoctor: z.string().trim().max(100).default(''),
  special: z.string().max(2000).default(''),
}).strict();
type GuidanceInput = z.infer<typeof Guidance>;
/** Fields left out keep their saved value (null clears one), so saving the form without re-sending the notes keeps them. */
const Interview = z.object({
  status: z.enum(['待安排', '已安排', '已面談', '拒絕面談']),
  interviewedOn: z.iso.date().nullable(),
  doctorUserId: z.uuid().nullable(),
  workAdvice: WorkAdvice.nullable(),
  guidance: Guidance.nullable(),
  notes: z.string().max(10000).nullable(),
  /** 是否安排下次面談 */
  nextInterview: z.boolean().nullable(),
  nextOn: z.iso.date().nullable(),
}).partial().strict();
const Remind = z.object({ assessmentIds: z.array(z.uuid()).min(1).max(5000) }).strict();
const CreateAssessments = z.object({ employeeIds: z.array(z.uuid()).min(1).max(5000), sentOn: z.iso.date().optional() }).strict();

class InterviewAdviceDto {
  @ApiProperty({ example: '工作限制', description: '工作區分，例如：一般工作、工作限制、需休假' }) fitness!: string;
  @ApiProperty({ type: [String], description: '工作限制' }) restrictions!: string[];
  @ApiProperty({ description: '建議（備註）' }) suggestion!: string;
  @ApiProperty({ example: '限制加班', description: '調整或縮短工作時間；空字串表示沒有' }) adjustHours!: string;
  @ApiProperty({ example: '調整為常日班', description: '變更工作；空字串表示沒有' }) changeWork!: string;
  @ApiProperty({ example: '3 個月', description: '措施期間' }) period!: string;
}
class InterviewGuidanceDto {
  @ApiProperty({ type: String, nullable: true, enum: ['無', '輕度', '中度', '重度'], description: '疲勞累積狀況' }) fatigue!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['有', '無'], description: '應顧慮身心狀況' }) mentalConcern!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['無異常', '需觀察或進一步追蹤檢查', '需進行醫療'], description: '診斷區分' }) diagnosis!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['不需指導', '需健康指導', '需醫療指導'], description: '指導區分' }) guidance!: string | null;
  @ApiProperty({ type: Boolean, nullable: true, description: '是否需採取措施' }) needMeasure!: boolean | null;
  @ApiProperty({ example: '心臟內科', description: '建議就醫' }) seeDoctor!: string;
  @ApiProperty({ description: '特殊記載事項' }) special!: string;
}
class InterviewDto {
  @ApiProperty({ format: 'uuid', description: '通知主管時的 subjectId（subjectTable 為 interviews）' }) id!: string;
  @ApiProperty({ enum: ['待安排', '已安排', '已面談', '拒絕面談'] }) status!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) interviewedOn!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) doctorUserId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '面談醫師姓名' }) doctorName!: string | null;
  @ApiProperty({ type: InterviewAdviceDto, nullable: true, description: '工作區分與採取措施建議（人資、主管可見）' }) workAdvice!: WorkAdviceInput | null;
  @ApiProperty({ type: InterviewGuidanceDto, nullable: true, description: '面談指導結果（醫療資料，加密儲存）；列表不帶，只有單筆查詢 GET /assessments/{id} 才有' })
  guidance!: GuidanceInput | null;
  @ApiProperty({ type: String, nullable: true, description: '面談紀錄（醫療資料，加密儲存）；列表不帶，只有單筆查詢 GET /assessments/{id} 才有' }) notes!: string | null;
  @ApiProperty({ type: Boolean, nullable: true, description: '是否安排下次面談；未填為 null' }) nextInterview!: boolean | null;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '下次面談預定日期' }) nextOn!: string | null;
  @ApiProperty({
    type: AcknowledgementStatusDto, nullable: true,
    description: '員工確認狀態：面談狀態改為已面談時建立，之後用 POST /api/programs/acknowledgements/{id}/link 寄確認信給員工',
  })
  acknowledgement!: AcknowledgementStatusDto | null;
  @ApiProperty({ type: [NoticeStatusDto], description: '已寄給部門主管的通知與讀取狀態' }) notices!: NoticeStatusDto[];
}
class CbiAnswersDto {
  @ApiProperty({ type: [Number], description: '個人相關過勞各題（0–4）' }) p!: number[];
  @ApiProperty({ type: [Number], description: '工作相關過勞各題（0–4）' }) w!: number[];
}
class AssessmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ example: '桃園廠' }) site!: string;
  @ApiProperty({ format: 'uuid' }) departmentId!: string;
  @ApiProperty({ example: '製造一課' }) department!: string;
  @ApiProperty({ type: String, format: 'date' }) sentOn!: string;
  @ApiProperty({ type: CbiAnswersDto, nullable: true, description: 'CBI 各題作答；直接輸入分數時為 null' }) cbiAnswers!: CbiAnswersDto | null;
  @ApiProperty({ type: Number, nullable: true, description: '個人相關過勞分數' }) personalBurnout!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: '工作相關過勞分數' }) workBurnout!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '過勞量表填寫時間' }) fatigueAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, enum: ['self', 'nurse'], description: '員工自填或職護代填' }) fatigueBy!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '工時與工作型態填寫時間' }) overloadAt!: Date | null;
  @ApiProperty({ description: '已寄出的催填通知次數' }) reminders!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastRemindedAt!: Date | null;
  @ApiProperty({ type: Number, nullable: true }) overtime1m!: number | null;
  @ApiProperty({ type: Number, nullable: true }) overtime6mAvg!: number | null;
  @ApiProperty({ type: [String] }) workPatterns!: string[];
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true, description: '十年心血管風險、負荷等級與矩陣結果（評估當下的快照）' }) evaluation!: unknown;
  @ApiProperty({ type: Number, nullable: true, description: '0 低度、1 中度、2 高度風險；資料不全時為 null' }) riskLevel!: number | null;
  @ApiProperty({ enum: RISK_MISSING, isArray: true, description: RISK_MISSING_DESCRIPTION }) missing!: (typeof RISK_MISSING)[number][];
  @ApiProperty({ type: InterviewDto, nullable: true }) interview!: InterviewDto | null;
}

/** Store CBI answers or directly entered scores, then re-evaluate. Shared with the employee portal. */
export async function submitFatigue(ctx: RequestContext, crypto: TenantCrypto, assessmentId: string, input: z.infer<typeof Fatigue>, by: Principal) {
  const scores = 'cbi' in input ? { ...cbiScores(input.cbi), answers: input.cbi } : { pf: input.personalBurnout, wf: input.workBurnout, answers: null };
  await ctx.tx.update(workloadAssessments).set({
    cbiAnswers: scores.answers, personalBurnout: String(scores.pf), workBurnout: String(scores.wf), fatigueAt: new Date(),
    fatigueBy: by.kind === 'employee' ? 'self' : 'nurse', updatedAt: new Date(),
  }).where(eq(workloadAssessments.id, assessmentId));
  await clearDraft(ctx, 'cbi', assessmentId);
  return evaluate(ctx, crypto, assessmentId, by);
}

export async function submitOverload(ctx: RequestContext, crypto: TenantCrypto, assessmentId: string, input: z.infer<typeof Overload>, by: Principal) {
  await ctx.tx.update(workloadAssessments).set({
    overtime1m: String(input.overtime1m), overtime6mAvg: String(input.overtime6mAvg), workPatterns: input.workPatterns, overloadAt: new Date(), updatedAt: new Date(),
  }).where(eq(workloadAssessments.id, assessmentId));
  await clearDraft(ctx, 'overload', assessmentId);
  return evaluate(ctx, crypto, assessmentId, by);
}

const num = (v: string | null) => (v === null ? null : Number(v));
const ackStatus = (a?: typeof employeeAcknowledgements.$inferSelect): AcknowledgementStatusDto | null =>
  (a ? { id: a.id, sentAt: a.sentAt, confirmedAt: a.confirmedAt, comment: a.comment } : null);
const parseGuidance = (json: string | null): GuidanceInput | null => (json ? Guidance.parse(JSON.parse(json)) : null);

/** Recompute the matrix from the latest health check and the current answers; an elevated result raises an event. */
async function evaluate(ctx: RequestContext, crypto: TenantCrypto, assessmentId: string, by: Principal) {
  const [a] = await ctx.tx.select().from(workloadAssessments).where(eq(workloadAssessments.id, assessmentId));
  const [e] = await ctx.tx.select().from(employees).where(eq(employees.id, a!.employeeId));
  const exam = await latestExamFor(ctx, crypto, e!.id);
  const cvd = exam ? cvdScore({ sex: e!.sex, birth: e!.birthDate, report: exam }) : null;
  const load = loadEval({ pf: num(a!.personalBurnout), wf: num(a!.workBurnout), m1: num(a!.overtime1m), avg6: num(a!.overtime6mAvg), patterns: a!.workPatterns });
  const result = evaluateWorkload(cvd, load);
  const riskLevel = result.complete ? result.riskLevel : null;
  const [row] = await ctx.tx.update(workloadAssessments).set({ evaluation: result, riskLevel, examId: exam?.id ?? null, ruleVersion: WORKLOAD_RULE_VERSION })
    .where(eq(workloadAssessments.id, assessmentId)).returning();
  if (result.complete && result.riskLevel >= 1) {
    await raiseEvent(ctx, {
      employeeId: e!.id, type: 'wl', sourceTable: 'workload_assessments', sourceId: assessmentId, occurredOn: todayTw(),
      description: `異常工作負荷促發疾病：${RISK_LABEL[result.riskLevel]}，${result.advice}`,
    });
  }
  await recordAudit(ctx, { action: 'update', subjectTable: 'workload_assessments', subjectId: assessmentId, employeeId: e!.id, dataCategory: 'health' }, by);
  return row!;
}

@ApiTags('programs')
@Controller('programs/workload')
export class WorkloadController {
  constructor(
    @Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly notifier: Notifier,
  ) {}

  @Post('assessments/remind')
  @HttpCode(200)
  @Clinical()
  @ApiOperation({
    summary: '未填寫通知（催填）',
    description: '寄提醒信給指定評估中過勞量表或工時調查還沒填完的員工（只限負責廠區）；信中只說有問卷待填，不含健康內容。沒有 Email 的員工列在 noEmail。',
  })
  @ApiBody({ schema: openApiSchema(Remind) })
  @ApiOkResponse({ type: RemindResultDto })
  async remind(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<RemindResultDto> {
    const { assessmentIds } = parse(Remind, body);
    const sites = await mySiteIds(ctx);
    if (!sites.length) return { emailed: 0, noEmail: [] };
    const pending = await ctx.tx.select({ id: workloadAssessments.id, employeeId: employees.id, name: employees.name, email: employees.email, lang: employees.lang })
      .from(workloadAssessments).innerJoin(employees, eq(employees.id, workloadAssessments.employeeId))
      .where(and(inArray(workloadAssessments.id, assessmentIds), inArray(employees.siteId, sites), or(isNull(workloadAssessments.fatigueAt), isNull(workloadAssessments.overloadAt))));
    const reachable = pending.filter(p => p.email);
    for (const p of reachable) {
      await this.notifier.email(ctx, surveyReminderEmail({
        to: p.email!, employeeId: p.employeeId, subjectTable: 'workload_assessments', subjectId: p.id, name: p.name, lang: p.lang, tenantName: ctx.tenant.name,
        url: `${tenantOrigin(this.config, ctx.tenant.slug)}/me/`,
      }));
    }
    if (reachable.length) {
      await ctx.tx.update(workloadAssessments).set({ reminders: sql`${workloadAssessments.reminders} + 1`, lastRemindedAt: new Date(), updatedAt: new Date() })
        .where(inArray(workloadAssessments.id, reachable.map(p => p.id)));
      await recordAudit(ctx, reachable.map((p): AuditEntry => ({ action: 'update', subjectTable: 'workload_assessments', subjectId: p.id, employeeId: p.employeeId, reason: 'fill-in reminder sent' })));
    }
    return { emailed: reachable.length, noEmail: pending.filter(p => !p.email).map(p => p.employeeId) };
  }

  @Post('assessments')
  @Clinical()
  @ApiOperation({ summary: '發送過勞量表與工時調查', description: '員工在員工端填寫 CBI 與加班時數；也可由職護代填。' })
  @ApiBody({ schema: openApiSchema(CreateAssessments) })
  @ApiCreatedResponse({ type: [AssessmentDto] })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<AssessmentDto[]> {
    const input = parse(CreateAssessments, body);
    const sites = new Set(await mySiteIds(ctx));
    const people = await ctx.tx.select({ id: employees.id, siteId: employees.siteId }).from(employees).where(inArray(employees.id, input.employeeIds));
    if (people.length !== new Set(input.employeeIds).size || people.some(p => !sites.has(p.siteId))) {
      throw new BadRequestException({ code: 'outside_sites', message: 'Every employee must exist and be in your sites' });
    }
    const rows = await ctx.tx.insert(workloadAssessments)
      .values(people.map(p => ({ tenantId: ctx.tenant.id, employeeId: p.id, sentOn: input.sentOn ?? todayTw(), createdBy: staff(ctx).userId }))).returning({ id: workloadAssessments.id });
    await recordAudit(ctx, rows.map((r, i): AuditEntry => ({ action: 'create', subjectTable: 'workload_assessments', subjectId: r.id, employeeId: people[i]!.id, dataCategory: 'health' })));
    return this.list(ctx, rows.map(r => r.id));
  }

  @Get('assessments')
  @Clinical()
  @ApiOperation({ summary: '負責廠區的過勞評估', description: '每位列出的員工都記入稽核；面談紀錄另以單筆查詢。' })
  @ApiOkResponse({ type: [AssessmentDto] })
  async all(@Ctx() ctx: RequestContext): Promise<AssessmentDto[]> {
    const result = await this.list(ctx);
    if (result.length) await recordAudit(ctx, result.map((a): AuditEntry => ({ action: 'read', subjectTable: 'workload_assessments', subjectId: a.id, employeeId: a.employeeId, dataCategory: 'health' })));
    return result;
  }

  @Get('assessments/:id')
  @Clinical()
  @ApiOperation({ summary: '一筆過勞評估，含面談指導結果與面談紀錄', description: '這兩項是醫療資料，讀取記入稽核。' })
  @ApiOkResponse({ type: AssessmentDto })
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<AssessmentDto> {
    const employeeId = await this.inScope(ctx, id);
    const [result] = await this.list(ctx, [id], { notes: true });
    const medical = Boolean(result!.interview?.notes || result!.interview?.guidance);
    await recordAudit(ctx, { action: 'read', subjectTable: 'workload_assessments', subjectId: id, employeeId, dataCategory: medical ? 'medical' : 'health' });
    return result!;
  }

  @Put('assessments/:id/fatigue')
  @Clinical()
  @ApiOperation({ summary: '過勞量表：CBI 作答或直接輸入分數（匯入結果）' })
  @ApiBody({ schema: openApiSchema(Fatigue) })
  @ApiOkResponse({ type: AssessmentDto })
  async fatigue(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AssessmentDto> {
    const input = parse(Fatigue, body);
    await this.inScope(ctx, id);
    await submitFatigue(ctx, this.crypto, id, input, staff(ctx));
    return (await this.list(ctx, [id]))[0]!;
  }

  @Put('assessments/:id/overload')
  @Clinical()
  @ApiOperation({ summary: '工時與工作型態' })
  @ApiBody({ schema: openApiSchema(Overload) })
  @ApiOkResponse({ type: AssessmentDto })
  async overload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AssessmentDto> {
    const input = parse(Overload, body);
    await this.inScope(ctx, id);
    await submitOverload(ctx, this.crypto, id, input, staff(ctx));
    return (await this.list(ctx, [id]))[0]!;
  }

  @Put('assessments/:id/interview')
  @Clinical()
  @ApiOperation({
    summary: '醫師面談與健康指導',
    description: '面談指導結果與面談紀錄加密；工作安排建議（工作區分、採取措施建議）可通知人資與主管。沒傳的欄位保留原值，傳 null 才清除。回應含面談指導結果與面談紀錄。'
      + '狀態為已安排且有日期（interviewedOn）時，寄信通知員工面談日期（改期會再寄一次；信中不提是哪個計畫）。',
  })
  @ApiBody({ schema: openApiSchema(Interview) })
  @ApiOkResponse({ type: AssessmentDto })
  async interview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AssessmentDto> {
    const { notes, guidance, ...input } = parse(Interview, body);
    const employeeId = await this.inScope(ctx, id);
    if (input.doctorUserId) {
      const [doctor] = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.doctorUserId), eq(users.active, true)));
      if (!doctor) throw new BadRequestException({ code: 'unknown_staff', message: 'No such active staff member' });
    }
    const values = {
      ...input, ...(notes !== undefined ? { notesEnc: await encryptOptional(this.crypto, ctx.tenant.id, notes) } : {}),
      ...(guidance !== undefined ? { guidanceEnc: await encryptOptional(this.crypto, ctx.tenant.id, guidance && JSON.stringify(guidance)) } : {}),
      updatedAt: new Date(), updatedBy: staff(ctx).userId,
    };
    const [existing] = await ctx.tx.select({ id: interviews.id, status: interviews.status, interviewedOn: interviews.interviewedOn }).from(interviews)
      .where(eq(interviews.assessmentId, id));
    const [saved] = existing
      ? await ctx.tx.update(interviews).set(values).where(eq(interviews.id, existing.id)).returning()
      : await ctx.tx.insert(interviews).values({ ...values, tenantId: ctx.tenant.id, assessmentId: id, createdBy: staff(ctx).userId }).returning();
    if (saved!.status === '已面談' && !saved!.interviewedOn) {
      throw new BadRequestException({ code: 'interview_date_required', message: 'Give the interview date (interviewedOn) for a completed interview' });
    }
    await recordAudit(ctx, { action: existing ? 'update' : 'create', subjectTable: 'interviews', subjectId: id, employeeId, dataCategory: 'medical' });
    const scheduled = saved!.status === '已安排' && saved!.interviewedOn;
    if (scheduled && (existing?.status !== '已安排' || existing.interviewedOn !== saved!.interviewedOn)) {
      const [employee] = await ctx.tx.select({ name: employees.name, email: employees.email, lang: employees.lang }).from(employees).where(eq(employees.id, employeeId));
      if (employee?.email) {
        await this.notifier.email(ctx, interviewScheduledEmail({
          to: employee.email, employeeId, interviewId: saved!.id, name: employee.name, lang: employee.lang, tenantName: ctx.tenant.name,
          on: saved!.interviewedOn!, url: `${tenantOrigin(this.config, ctx.tenant.slug)}/me/`,
        }));
      }
    }
    if (saved!.status === '已面談') {
      // The employee confirms the outcome (工作區分、採取措施建議) in the portal or through an emailed link.
      const [ack] = await ctx.tx.select({ id: employeeAcknowledgements.id }).from(employeeAcknowledgements)
        .where(and(eq(employeeAcknowledgements.subjectTable, 'interviews'), eq(employeeAcknowledgements.subjectId, saved!.id)));
      if (!ack) await ctx.tx.insert(employeeAcknowledgements).values({ tenantId: ctx.tenant.id, employeeId, subjectTable: 'interviews', subjectId: saved!.id, createdBy: staff(ctx).userId });
    }
    const [result] = await this.list(ctx, [id], { notes: true });
    return result!;
  }

  private async inScope(ctx: RequestContext, id: string): Promise<string> {
    const [a] = await ctx.tx.select({ employeeId: workloadAssessments.employeeId }).from(workloadAssessments).where(eq(workloadAssessments.id, id));
    if (!a) throw new NotFoundException({ code: 'not_found', message: 'No such assessment' });
    await employeeInScope(ctx, a.employeeId);
    return a.employeeId;
  }

  /** Assessments in the caller's sites; the encrypted interview guidance and notes only when asked for (single-assessment reads). */
  private async list(ctx: RequestContext, ids?: string[], opts: { notes?: boolean } = {}): Promise<AssessmentDto[]> {
    const mine = await mySiteIds(ctx);
    if (!mine.length) return [];
    const rows = await ctx.tx.select({
      a: workloadAssessments, empNo: employees.empNo, name: employees.name,
      siteId: employees.siteId, site: sites.name, departmentId: employees.departmentId, department: departments.name,
    })
      .from(workloadAssessments)
      .innerJoin(employees, eq(employees.id, workloadAssessments.employeeId))
      .innerJoin(sites, eq(sites.id, employees.siteId))
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(inArray(employees.siteId, mine), ids ? inArray(workloadAssessments.id, ids) : undefined)).orderBy(asc(employees.empNo));
    const ivs = rows.length
      ? await ctx.tx.select({ iv: interviews, doctorName: users.name }).from(interviews).leftJoin(users, eq(users.id, interviews.doctorUserId))
        .where(inArray(interviews.assessmentId, rows.map(r => r.a.id)))
      : [];
    const notices = await noticesBySubject(ctx, 'interviews', ivs.map(i => i.iv.id));
    const acks = ivs.length
      ? await ctx.tx.select().from(employeeAcknowledgements)
        .where(and(eq(employeeAcknowledgements.subjectTable, 'interviews'), inArray(employeeAcknowledgements.subjectId, ivs.map(i => i.iv.id))))
      : [];
    return Promise.all(rows.map(async ({ a, empNo, name, siteId, site, departmentId, department }) => {
      const found = ivs.find(i => i.iv.assessmentId === a.id);
      const iv = found?.iv;
      return {
        id: a.id, employeeId: a.employeeId, empNo, name, siteId, site, departmentId, department, sentOn: a.sentOn,
        cbiAnswers: a.cbiAnswers as CbiAnswersDto | null, personalBurnout: num(a.personalBurnout), workBurnout: num(a.workBurnout),
        fatigueAt: a.fatigueAt, fatigueBy: a.fatigueBy, overloadAt: a.overloadAt, reminders: a.reminders, lastRemindedAt: a.lastRemindedAt,
        overtime1m: num(a.overtime1m), overtime6mAvg: num(a.overtime6mAvg), workPatterns: a.workPatterns, evaluation: a.evaluation, riskLevel: a.riskLevel,
        missing: riskMissing(a),
        interview: iv ? {
          id: iv.id, status: iv.status, interviewedOn: iv.interviewedOn, doctorUserId: iv.doctorUserId, doctorName: found.doctorName,
          workAdvice: workAdviceOf(iv.workAdvice),
          guidance: opts.notes ? parseGuidance(await decryptOptional(this.crypto, ctx.tenant.id, iv.guidanceEnc)) : null,
          notes: opts.notes ? await decryptOptional(this.crypto, ctx.tenant.id, iv.notesEnc) : null, nextInterview: iv.nextInterview, nextOn: iv.nextOn,
          acknowledgement: ackStatus(acks.find(k => k.subjectId === iv.id)), notices: notices.get(iv.id) ?? [],
        } : null,
      };
    }));
  }
}
