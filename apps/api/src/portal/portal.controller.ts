/*
 * Employee portal (員工端, /api/portal/*). Signed-in employees only, and every route returns or changes only the
 * signed-in employee's own data: ids in the URL that belong to someone else are simply not found.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  consents, departments, employeeAcknowledgements, employees, ergoDispatches, ergoSurveys, healthExamResults, healthExams, portalDrafts, sites,
  workloadAssessments,
} from '@yutis/db';
import { EMPLOYEE_LANGS, EXAM_ITEMS } from '@yutis/domain';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { EmployeeOnly } from '../auth/access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, signedIn, type EmployeePrincipal, type RequestContext } from '../core/context.js';
import { TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { openApiSchema, parse } from '../core/validation.js';
import { AcknowledgementDto, acknowledgementDocument } from '../programs/acknowledgements.js';
import { NmqAnswers, submitNmq } from '../programs/ergo.controller.js';
import {
  CbiAnswers, Overload, RISK_MISSING, RISK_MISSING_DESCRIPTION, riskMissing, submitFatigue, submitOverload,
} from '../programs/workload.controller.js';
import { acknowledgementTitle, nmqTitle, taskTitle } from './titles.js';

const me = (ctx: RequestContext) => signedIn(ctx) as EmployeePrincipal;
const notFound = () => new NotFoundException({ code: 'not_found', message: 'Not found' });

class ProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: EMPLOYEE_LANGS, description: '員工端語言' }) lang!: string;
  @ApiProperty() site!: string;
  @ApiProperty() department!: string;
}

const TASK_KINDS = ['nmq', 'cbi', 'overload', 'acknowledgement'] as const;
type TaskKind = (typeof TASK_KINDS)[number];
/** Questionnaires an employee can save a draft of. */
const DRAFT_KINDS = ['nmq', 'cbi', 'overload'] as const;

class TaskDto {
  @ApiProperty({ enum: TASK_KINDS, description: 'NMQ 問卷、過勞量表、工時調查、紀錄確認' }) kind!: TaskKind;
  @ApiProperty({ format: 'uuid', description: '問卷、評估或確認的 id' }) id!: string;
  @ApiProperty({ description: '依員工端語言；問卷發放名稱照原文' }) title!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dueOn!: string | null;
}
class DraftDto {
  @ApiProperty({ type: 'object', additionalProperties: true, description: '尚未送出的作答，格式由前端決定' }) answers!: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time' }) savedAt!: Date;
}
class TaskDetailDto extends TaskDto {
  @ApiProperty({ description: '已填寫或已確認' }) done!: boolean;
  @ApiProperty({ type: DraftDto, nullable: true, description: '尚未送出的草稿；紀錄確認沒有草稿' }) draft!: DraftDto | null;
}
class SubmittedDto {
  @ApiProperty({ enum: [true] }) submitted!: true;
}
class NmqSubmittedDto extends SubmittedDto {
  @ApiProperty({ description: '各部位最高分（0–5）' }) maxScore!: number;
  @ApiProperty({ description: '疑似有肌肉骨骼危害' }) suspectedHazard!: boolean;
}
class ConsentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['notice', 'consent'], description: '告知聲明（已閱讀）或同意（非法定用途）' }) kind!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() documentVersion!: string;
  @ApiProperty({ type: String, format: 'date-time' }) givenAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) withdrawnAt!: Date | null;
}
class MyExamItemDto {
  @ApiProperty({ example: 'B0111' }) code!: string;
  @ApiProperty({ example: '血壓－收縮壓' }) name!: string;
  @ApiProperty({ example: 'mmHg' }) unit!: string;
  @ApiProperty({ type: String, nullable: true, description: '檢查值（數值以字串表示）' }) value!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: '分級 0–4；無分級標準時為 null' }) grade!: number | null;
}
class MyExamDto {
  @ApiProperty({ type: String, format: 'date' }) examDate!: string;
  @ApiProperty({ type: String, nullable: true }) clinic!: string | null;
  @ApiProperty({ example: '一般健檢' }) kind!: string;
  @ApiProperty({ description: '各項分級總和' }) gradeTotal!: number;
  @ApiProperty({ description: '最高分級' }) gradeMax!: number;
  @ApiProperty({ type: [MyExamItemDto] }) items!: MyExamItemDto[];
}
class MySurveyDto {
  @ApiProperty({ description: '問卷發放名稱' }) dispatch!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) filledAt!: Date | null;
  @ApiProperty({ type: Number, nullable: true, description: '各部位最高分（0–5）' }) maxScore!: number | null;
  @ApiProperty({ type: Boolean, nullable: true, description: '疑似有肌肉骨骼危害' }) suspectedHazard!: boolean | null;
}
class MyWorkloadDto {
  @ApiProperty({ type: String, format: 'date' }) sentOn!: string;
  @ApiProperty({ type: Number, nullable: true, description: '個人相關過勞分數' }) personalBurnout!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: '工作相關過勞分數' }) workBurnout!: number | null;
  @ApiProperty({ type: Number, nullable: true, enum: [0, 1, 2], description: '0 低度、1 中度、2 高度風險；還不能判定時為 null，原因見 missing' }) riskLevel!: number | null;
  @ApiProperty({ enum: RISK_MISSING, isArray: true, description: RISK_MISSING_DESCRIPTION }) missing!: (typeof RISK_MISSING)[number][];
  @ApiProperty({ type: String, nullable: true, description: '建議（例如：建議安排醫師面談）' }) advice!: string | null;
}
class MyHealthDto {
  @ApiProperty({ type: [MyExamDto], description: '我的健檢結果與分級，新的在前' }) exams!: MyExamDto[];
  @ApiProperty({ type: [MySurveyDto], description: '我的 NMQ 結果' }) surveys!: MySurveyDto[];
  @ApiProperty({ type: [MyWorkloadDto], description: '我的過勞評估結果，新的在前' }) workload!: MyWorkloadDto[];
}
class MyHealthExportDto extends MyHealthDto {
  @ApiProperty({ type: String, format: 'date-time' }) exportedAt!: string;
}

const Confirm = z.object({ comment: z.string().trim().max(1000).optional() }).strict();
const GiveConsent = z.object({ kind: z.enum(['notice', 'consent']), purpose: z.string().trim().min(1).max(200), documentVersion: z.string().trim().min(1).max(50) }).strict();
const UpdateProfile = z.object({ lang: z.enum(EMPLOYEE_LANGS) }).strict();
const Draft = z.object({ answers: z.record(z.string(), z.unknown()) }).strict();
/** Enough for any questionnaire's answers; a draft is not a place to store anything else. */
const DRAFT_MAX_BYTES = 20_000;
const taskKind = (kind: string) => parse(z.enum(TASK_KINDS), kind);
const draftKind = (kind: string) => parse(z.enum(DRAFT_KINDS), kind);

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Get('profile') @EmployeeOnly() @ApiOperation({ summary: '我的基本資料' }) @ApiOkResponse({ type: ProfileDto })
  profile(@Ctx() ctx: RequestContext): Promise<ProfileDto> {
    return this.loadProfile(ctx);
  }

  @Put('profile') @EmployeeOnly() @ApiOperation({ summary: '設定員工端語言', description: '之後的任務標題與確認紀錄都用這個語言。' })
  @ApiBody({ schema: openApiSchema(UpdateProfile) }) @ApiOkResponse({ type: ProfileDto })
  async updateProfile(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<ProfileDto> {
    const { lang } = parse(UpdateProfile, body);
    const id = me(ctx).employeeId;
    await ctx.tx.update(employees).set({ lang, updatedAt: new Date() }).where(eq(employees.id, id));
    await recordAudit(ctx, { action: 'update', subjectTable: 'employees', subjectId: id, employeeId: id, dataCategory: 'identity', reason: `portal language ${lang}` });
    return this.loadProfile(ctx);
  }

  @Get('tasks') @EmployeeOnly() @ApiOperation({ summary: '我的待辦：待填問卷與待確認紀錄' }) @ApiOkResponse({ type: [TaskDto] })
  async tasks(@Ctx() ctx: RequestContext): Promise<TaskDto[]> {
    const { employeeId: id, lang } = me(ctx);
    const nmq = await ctx.tx.select({ id: ergoSurveys.id, name: ergoDispatches.name, dueOn: ergoDispatches.dueOn }).from(ergoSurveys)
      .innerJoin(ergoDispatches, eq(ergoDispatches.id, ergoSurveys.dispatchId)).where(and(eq(ergoSurveys.employeeId, id), eq(ergoSurveys.status, '未填寫')));
    const wl = await ctx.tx.select().from(workloadAssessments).where(eq(workloadAssessments.employeeId, id)).orderBy(desc(workloadAssessments.sentOn));
    const acks = await ctx.tx.select().from(employeeAcknowledgements).where(and(eq(employeeAcknowledgements.employeeId, id), isNull(employeeAcknowledgements.confirmedAt)));
    return [
      ...nmq.map(s => ({ kind: 'nmq' as const, id: s.id, title: nmqTitle(s.name, lang), dueOn: s.dueOn })),
      ...wl.filter(a => !a.fatigueAt).map(a => ({ kind: 'cbi' as const, id: a.id, title: taskTitle('cbi', lang), dueOn: null })),
      ...wl.filter(a => !a.overloadAt).map(a => ({ kind: 'overload' as const, id: a.id, title: taskTitle('overload', lang), dueOn: null })),
      ...acks.map(a => ({ kind: 'acknowledgement' as const, id: a.id, title: acknowledgementTitle(a.subjectTable, lang), dueOn: null })),
    ];
  }

  @Get('tasks/:kind/:id') @EmployeeOnly()
  @ApiOperation({ summary: '一項任務', description: '從通知連結打開任務時用：是否已完成，以及尚未送出的草稿。不是自己的任務回 404。' })
  @ApiParam({ name: 'kind', enum: TASK_KINDS }) @ApiOkResponse({ type: TaskDetailDto })
  async task(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string): Promise<TaskDetailDto> {
    const task = await this.ownTask(ctx, taskKind(kind), id);
    if (task.kind === 'acknowledgement') return { ...task, draft: null };
    const [draft] = await ctx.tx.select({ answers: portalDrafts.answers, savedAt: portalDrafts.updatedAt }).from(portalDrafts)
      .where(and(eq(portalDrafts.employeeId, me(ctx).employeeId), eq(portalDrafts.taskKind, task.kind), eq(portalDrafts.taskId, id)));
    return { ...task, draft: draft && !task.done ? { answers: draft.answers as Record<string, unknown>, savedAt: draft.savedAt } : null };
  }

  @Put('tasks/:kind/:id/draft') @EmployeeOnly()
  @ApiOperation({
    summary: '儲存問卷草稿',
    description: '作答到一半先存起來，登入逾時或換裝置後可接著填。送出問卷（本人或職護代填）後草稿就刪除。草稿只有本人看得到，不記入稽核。',
  })
  @ApiParam({ name: 'kind', enum: DRAFT_KINDS }) @ApiBody({ schema: openApiSchema(Draft) }) @ApiOkResponse({ type: DraftDto })
  @ApiConflictResponse({ description: '問卷已送出（already_submitted）' })
  async saveDraft(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<DraftDto> {
    const k = draftKind(kind);
    const { answers } = parse(Draft, body);
    if (Buffer.byteLength(JSON.stringify(answers)) > DRAFT_MAX_BYTES) {
      throw new BadRequestException({ code: 'draft_too_large', message: `A draft may be at most ${DRAFT_MAX_BYTES} bytes` });
    }
    const task = await this.ownTask(ctx, k, id);
    if (task.done) throw new ConflictException({ code: 'already_submitted', message: 'Already submitted' });
    const [row] = await ctx.tx.insert(portalDrafts).values({ tenantId: ctx.tenant.id, employeeId: me(ctx).employeeId, taskKind: k, taskId: id, answers })
      .onConflictDoUpdate({ target: [portalDrafts.tenantId, portalDrafts.employeeId, portalDrafts.taskKind, portalDrafts.taskId], set: { answers, updatedAt: new Date() } })
      .returning({ savedAt: portalDrafts.updatedAt });
    return { answers, savedAt: row!.savedAt };
  }

  @Delete('tasks/:kind/:id/draft') @HttpCode(204) @EmployeeOnly() @ApiOperation({ summary: '捨棄問卷草稿' })
  @ApiParam({ name: 'kind', enum: DRAFT_KINDS }) @ApiNoContentResponse()
  async discardDraft(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const k = draftKind(kind);
    await this.ownTask(ctx, k, id);
    await ctx.tx.delete(portalDrafts).where(and(eq(portalDrafts.employeeId, me(ctx).employeeId), eq(portalDrafts.taskKind, k), eq(portalDrafts.taskId, id)));
  }

  @Put('ergo/:id') @EmployeeOnly() @ApiOperation({ summary: '填寫 NMQ 問卷' }) @ApiBody({ schema: openApiSchema(NmqAnswers) })
  @ApiOkResponse({ type: NmqSubmittedDto })
  async nmq(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<NmqSubmittedDto> {
    const row = await submitNmq(ctx, id, parse(NmqAnswers, body), me(ctx));
    return { submitted: true, maxScore: row.maxScore!, suspectedHazard: row.suspectedHazard! };
  }

  @Put('workload/:id/cbi') @EmployeeOnly() @ApiOperation({ summary: '填寫過勞量表（CBI）' }) @ApiBody({ schema: openApiSchema(CbiAnswers) })
  @ApiOkResponse({ type: SubmittedDto })
  async cbi(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<SubmittedDto> {
    const input = parse(CbiAnswers, body);
    await this.ownAssessment(ctx, id, 'fatigueAt');
    await submitFatigue(ctx, this.crypto, id, { cbi: input }, me(ctx));
    return { submitted: true };
  }

  @Put('workload/:id/overload') @EmployeeOnly() @ApiOperation({ summary: '填寫工時與工作型態' }) @ApiBody({ schema: openApiSchema(Overload) })
  @ApiOkResponse({ type: SubmittedDto })
  async overload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<SubmittedDto> {
    const input = parse(Overload, body);
    await this.ownAssessment(ctx, id, 'overloadAt');
    await submitOverload(ctx, this.crypto, id, input, me(ctx));
    return { submitted: true };
  }

  @Get('acknowledgements/:id') @EmployeeOnly() @ApiOperation({ summary: '要我確認的紀錄' }) @ApiOkResponse({ type: AcknowledgementDto })
  async acknowledgement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<AcknowledgementDto> {
    return acknowledgementDocument(ctx.tx, await this.ownAck(ctx, id));
  }

  @Post('acknowledgements/:id/confirm') @HttpCode(200) @EmployeeOnly() @ApiOperation({ summary: '確認紀錄' })
  @ApiBody({ schema: openApiSchema(Confirm) }) @ApiOkResponse({ type: AcknowledgementDto })
  async confirm(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AcknowledgementDto> {
    const { comment } = parse(Confirm, body ?? {});
    const ack = await this.ownAck(ctx, id);
    if (ack.confirmedAt) throw new ConflictException({ code: 'already_confirmed', message: 'Already confirmed' });
    const [row] = await ctx.tx.update(employeeAcknowledgements).set({ confirmedAt: new Date(), comment: comment ?? null, tokenHash: null, tokenExpiresAt: null, updatedAt: new Date() })
      .where(eq(employeeAcknowledgements.id, id)).returning();
    await recordAudit(ctx, { action: 'update', subjectTable: 'employee_acknowledgements', subjectId: id, employeeId: ack.employeeId, reason: 'confirmed in portal' });
    return acknowledgementDocument(ctx.tx, row!);
  }

  @Get('health') @EmployeeOnly() @ApiOperation({ summary: '我的健康資料', description: '個資法第 3 條的查詢、閱覽權利。' }) @ApiOkResponse({ type: MyHealthDto })
  async health(@Ctx() ctx: RequestContext): Promise<MyHealthDto> {
    const data = await this.myHealth(ctx);
    await recordAudit(ctx, { action: 'read', subjectTable: 'health_exams', employeeId: me(ctx).employeeId, dataCategory: 'health', reason: 'own data in portal' });
    return data;
  }

  @Get('health/export') @EmployeeOnly() @Header('Content-Disposition', 'attachment; filename="my-health-data.json"')
  @ApiOperation({ summary: '匯出我的健康資料', description: '個資法第 3 條的製給複本權利；記入稽核。' }) @ApiProduces('application/json') @ApiOkResponse({ type: MyHealthExportDto })
  async export(@Ctx() ctx: RequestContext): Promise<MyHealthExportDto> {
    const data = await this.myHealth(ctx);
    await recordAudit(ctx, { action: 'export', subjectTable: 'health_exams', employeeId: me(ctx).employeeId, dataCategory: 'health', reason: 'own data export' });
    return { exportedAt: new Date().toISOString(), ...data };
  }

  @Get('consents') @EmployeeOnly() @ApiOperation({ summary: '我的告知聲明閱讀與同意紀錄' }) @ApiOkResponse({ type: [ConsentDto] })
  consents(@Ctx() ctx: RequestContext): Promise<ConsentDto[]> {
    return ctx.tx.select({ id: consents.id, kind: consents.kind, purpose: consents.purpose, documentVersion: consents.documentVersion, givenAt: consents.givenAt, withdrawnAt: consents.withdrawnAt })
      .from(consents).where(eq(consents.employeeId, me(ctx).employeeId)).orderBy(desc(consents.givenAt));
  }

  @Post('consents') @EmployeeOnly() @ApiOperation({ summary: '記錄已閱讀告知聲明或同意非法定用途' }) @ApiBody({ schema: openApiSchema(GiveConsent) }) @ApiOkResponse({ type: ConsentDto })
  async give(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<ConsentDto> {
    const input = parse(GiveConsent, body);
    const [row] = await ctx.tx.insert(consents).values({ ...input, employeeId: me(ctx).employeeId, givenAt: new Date(), tenantId: ctx.tenant.id }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'consents', subjectId: row!.id, employeeId: row!.employeeId, reason: `${input.kind} ${input.purpose} ${input.documentVersion}` });
    return { id: row!.id, kind: row!.kind, purpose: row!.purpose, documentVersion: row!.documentVersion, givenAt: row!.givenAt, withdrawnAt: null };
  }

  @Post('consents/:id/withdraw') @HttpCode(200) @EmployeeOnly() @ApiOperation({ summary: '撤回同意' }) @ApiOkResponse({ type: ConsentDto })
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<ConsentDto> {
    const [row] = await ctx.tx.update(consents).set({ withdrawnAt: new Date(), updatedAt: new Date() })
      .where(and(eq(consents.id, id), eq(consents.employeeId, me(ctx).employeeId), eq(consents.kind, 'consent'), isNull(consents.withdrawnAt))).returning();
    if (!row) throw notFound();
    await recordAudit(ctx, { action: 'update', subjectTable: 'consents', subjectId: id, employeeId: row.employeeId, reason: 'withdrawn' });
    return { id: row.id, kind: row.kind, purpose: row.purpose, documentVersion: row.documentVersion, givenAt: row.givenAt, withdrawnAt: row.withdrawnAt };
  }

  private async loadProfile(ctx: RequestContext): Promise<ProfileDto> {
    const [row] = await ctx.tx.select({ id: employees.id, empNo: employees.empNo, name: employees.name, lang: employees.lang, site: sites.name, department: departments.name })
      .from(employees).innerJoin(sites, eq(sites.id, employees.siteId)).innerJoin(departments, eq(departments.id, employees.departmentId)).where(eq(employees.id, me(ctx).employeeId));
    return row!;
  }

  /** The signed-in employee's task, in their language, and whether it is done; someone else's is not found. */
  private async ownTask(ctx: RequestContext, kind: TaskKind, id: string): Promise<TaskDto & { done: boolean }> {
    const { employeeId, lang } = me(ctx);
    if (kind === 'nmq') {
      const [s] = await ctx.tx.select({ name: ergoDispatches.name, dueOn: ergoDispatches.dueOn, status: ergoSurveys.status }).from(ergoSurveys)
        .innerJoin(ergoDispatches, eq(ergoDispatches.id, ergoSurveys.dispatchId)).where(and(eq(ergoSurveys.id, id), eq(ergoSurveys.employeeId, employeeId)));
      if (!s) throw notFound();
      return { kind, id, title: nmqTitle(s.name, lang), dueOn: s.dueOn, done: s.status === '已填寫' };
    }
    if (kind === 'acknowledgement') {
      const ack = await this.ownAck(ctx, id);
      return { kind, id, title: acknowledgementTitle(ack.subjectTable, lang), dueOn: null, done: !!ack.confirmedAt };
    }
    const [a] = await ctx.tx.select().from(workloadAssessments).where(and(eq(workloadAssessments.id, id), eq(workloadAssessments.employeeId, employeeId)));
    if (!a) throw notFound();
    return { kind, id, title: taskTitle(kind, lang), dueOn: null, done: !!(kind === 'cbi' ? a.fatigueAt : a.overloadAt) };
  }

  private async ownAssessment(ctx: RequestContext, id: string, field: 'fatigueAt' | 'overloadAt') {
    const [a] = await ctx.tx.select().from(workloadAssessments).where(and(eq(workloadAssessments.id, id), eq(workloadAssessments.employeeId, me(ctx).employeeId)));
    if (!a) throw notFound();
    if (a[field]) throw new ConflictException({ code: 'already_submitted', message: 'Already submitted' });
  }

  private async ownAck(ctx: RequestContext, id: string) {
    const [ack] = await ctx.tx.select().from(employeeAcknowledgements).where(and(eq(employeeAcknowledgements.id, id), eq(employeeAcknowledgements.employeeId, me(ctx).employeeId)));
    if (!ack) throw notFound();
    return ack;
  }

  private async myHealth(ctx: RequestContext): Promise<MyHealthDto> {
    const id = me(ctx).employeeId;
    const exams = await ctx.tx.select().from(healthExams).where(eq(healthExams.employeeId, id)).orderBy(desc(healthExams.examDate));
    const results = exams.length ? await ctx.tx.select().from(healthExamResults).where(inArray(healthExamResults.examId, exams.map(e => e.id))) : [];
    const surveys = await ctx.tx.select({ dispatch: ergoDispatches.name, filledAt: ergoSurveys.filledAt, maxScore: ergoSurveys.maxScore, suspectedHazard: ergoSurveys.suspectedHazard })
      .from(ergoSurveys).innerJoin(ergoDispatches, eq(ergoDispatches.id, ergoSurveys.dispatchId)).where(and(eq(ergoSurveys.employeeId, id), eq(ergoSurveys.status, '已填寫')));
    const workload = await ctx.tx.select().from(workloadAssessments).where(eq(workloadAssessments.employeeId, id)).orderBy(desc(workloadAssessments.sentOn));
    return {
      exams: exams.map(e => ({
        examDate: e.examDate, clinic: e.clinic, kind: e.kind, gradeTotal: e.gradeTotal, gradeMax: e.gradeMax,
        items: EXAM_ITEMS.flatMap(item => {
          const r = results.find(x => x.examId === e.id && x.itemCode === item.code);
          return r ? [{ code: item.code, name: item.name, unit: item.unit, value: r.valueText ?? r.valueNum, grade: r.grade }] : [];
        }),
      })),
      surveys,
      workload: workload.map(a => ({
        sentOn: a.sentOn, personalBurnout: a.personalBurnout === null ? null : Number(a.personalBurnout), workBurnout: a.workBurnout === null ? null : Number(a.workBurnout),
        riskLevel: a.riskLevel, missing: riskMissing(a), advice: (a.evaluation as { advice?: string } | null)?.advice ?? null,
      })),
    };
  }
}
