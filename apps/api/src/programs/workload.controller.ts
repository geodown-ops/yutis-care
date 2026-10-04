/*
 * 異常工作負荷促發疾病預防 (overwork): employees answer the CBI burnout questionnaire and their overtime in the portal
 * (or a nurse enters them); the 10-year cardiovascular risk from the latest health check and the workload level go
 * through @yutis/domain's matrix to decide whether a physician interview is needed. The interview's clinical notes
 * are encrypted; its work-arrangement advice is what HR and managers may see.
 */
import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { employees, interviews, users, workloadAssessments } from '@yutis/db';
import {
  CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, cbiScores, cvdScore, evaluateWorkload, loadEval, RISK_LABEL, WORK_PATTERNS, WORKLOAD_RULE_VERSION,
  type WorkloadResult,
} from '@yutis/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type Principal, type RequestContext } from '../core/context.js';
import { decryptOptional, encryptOptional, TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { openApiSchema, parse } from '../core/validation.js';
import { clearDraft, employeeInScope, latestExamFor, mySiteIds, raiseEvent, todayTw } from './common.js';
import { Clinical } from './ergo.controller.js';
import { noticesBySubject, NoticeStatusDto } from './notices.js';

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
const WorkAdvice = z.object({
  /** e.g. 可正常工作、需調整工作、需暫停工作 */
  fitness: z.string().trim().max(50),
  restrictions: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  suggestion: z.string().trim().max(1000).default(''),
}).strict();
export type WorkAdviceInput = z.infer<typeof WorkAdvice>;
const Interview = z.object({
  status: z.enum(['待安排', '已安排', '已面談', '拒絕面談']),
  interviewedOn: z.iso.date().nullable().default(null),
  doctorUserId: z.uuid().nullable().default(null),
  workAdvice: WorkAdvice.nullable().default(null),
  notes: z.string().max(10000).nullable().default(null),
  nextOn: z.iso.date().nullable().default(null),
}).strict();
const CreateAssessments = z.object({ employeeIds: z.array(z.uuid()).min(1).max(5000), sentOn: z.iso.date().optional() }).strict();

class InterviewDto {
  @ApiProperty({ format: 'uuid', description: '通知主管時的 subjectId（subjectTable 為 interviews）' }) id!: string;
  @ApiProperty({ enum: ['待安排', '已安排', '已面談', '拒絕面談'] }) status!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) interviewedOn!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) doctorUserId!: string | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true, description: '工作安排建議（人資、主管可見）' }) workAdvice!: WorkAdviceInput | null;
  @ApiProperty({ type: String, nullable: true, description: '面談紀錄（醫療資料，加密儲存）' }) notes!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) nextOn!: string | null;
  @ApiProperty({ type: [NoticeStatusDto], description: '已寄給部門主管的通知與讀取狀態' }) notices!: NoticeStatusDto[];
}
class AssessmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: 'date' }) sentOn!: string;
  @ApiProperty({ type: Number, nullable: true, description: '個人相關過勞分數' }) personalBurnout!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: '工作相關過勞分數' }) workBurnout!: number | null;
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
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

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
    return result.map(a => ({ ...a, interview: a.interview && { ...a.interview, notes: null } }));
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
  @ApiOperation({ summary: '醫師面談與健康指導', description: '面談紀錄加密；工作安排建議可通知人資與主管。' })
  @ApiBody({ schema: openApiSchema(Interview) })
  @ApiOkResponse({ type: AssessmentDto })
  async interview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AssessmentDto> {
    const { notes, ...input } = parse(Interview, body);
    const employeeId = await this.inScope(ctx, id);
    if (input.doctorUserId) {
      const [doctor] = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.doctorUserId), eq(users.active, true)));
      if (!doctor) throw new BadRequestException({ code: 'unknown_staff', message: 'No such active staff member' });
    }
    const values = { ...input, notesEnc: await encryptOptional(this.crypto, ctx.tenant.id, notes), updatedAt: new Date(), updatedBy: staff(ctx).userId };
    const [existing] = await ctx.tx.select({ id: interviews.id }).from(interviews).where(eq(interviews.assessmentId, id));
    if (existing) await ctx.tx.update(interviews).set(values).where(eq(interviews.id, existing.id));
    else await ctx.tx.insert(interviews).values({ ...values, tenantId: ctx.tenant.id, assessmentId: id, createdBy: staff(ctx).userId });
    await recordAudit(ctx, { action: existing ? 'update' : 'create', subjectTable: 'interviews', subjectId: id, employeeId, dataCategory: 'medical' });
    const [result] = await this.list(ctx, [id]);
    return result!;
  }

  private async inScope(ctx: RequestContext, id: string): Promise<string> {
    const [a] = await ctx.tx.select({ employeeId: workloadAssessments.employeeId }).from(workloadAssessments).where(eq(workloadAssessments.id, id));
    if (!a) throw new NotFoundException({ code: 'not_found', message: 'No such assessment' });
    await employeeInScope(ctx, a.employeeId);
    return a.employeeId;
  }

  private async list(ctx: RequestContext, ids?: string[]): Promise<AssessmentDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select({ a: workloadAssessments, empNo: employees.empNo, name: employees.name }).from(workloadAssessments)
      .innerJoin(employees, eq(employees.id, workloadAssessments.employeeId))
      .where(and(inArray(employees.siteId, sites), ids ? inArray(workloadAssessments.id, ids) : undefined)).orderBy(asc(employees.empNo));
    const ivs = rows.length ? await ctx.tx.select().from(interviews).where(inArray(interviews.assessmentId, rows.map(r => r.a.id))) : [];
    const notices = await noticesBySubject(ctx, 'interviews', ivs.map(i => i.id));
    return Promise.all(rows.map(async ({ a, empNo, name }) => {
      const iv = ivs.find(i => i.assessmentId === a.id);
      return {
        id: a.id, employeeId: a.employeeId, empNo, name, sentOn: a.sentOn, personalBurnout: num(a.personalBurnout), workBurnout: num(a.workBurnout),
        overtime1m: num(a.overtime1m), overtime6mAvg: num(a.overtime6mAvg), workPatterns: a.workPatterns, evaluation: a.evaluation, riskLevel: a.riskLevel,
        missing: riskMissing(a),
        interview: iv ? {
          id: iv.id, status: iv.status, interviewedOn: iv.interviewedOn, doctorUserId: iv.doctorUserId, workAdvice: iv.workAdvice as WorkAdviceInput | null,
          notes: await decryptOptional(this.crypto, ctx.tenant.id, iv.notesEnc), nextOn: iv.nextOn, notices: notices.get(iv.id) ?? [],
        } : null,
      };
    }));
  }
}
