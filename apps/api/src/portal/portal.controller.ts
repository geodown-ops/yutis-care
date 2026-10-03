/*
 * Employee portal (員工端, /api/portal/*). Signed-in employees only, and every route returns or changes only the
 * signed-in employee's own data: ids in the URL that belong to someone else are simply not found.
 */
import { Body, ConflictException, Controller, Get, Header, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  consents, departments, employeeAcknowledgements, employees, ergoDispatches, ergoSurveys, healthExamResults, healthExams, sites, workloadAssessments,
} from '@yutis/db';
import { EXAM_ITEMS } from '@yutis/domain';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { EmployeeOnly } from '../auth/access.js';
import { recordAudit } from '../core/audit.js';
import { Ctx, signedIn, type EmployeePrincipal, type RequestContext } from '../core/context.js';
import { TENANT_CRYPTO, type TenantCrypto } from '../core/crypto.js';
import { openApiSchema, parse } from '../core/validation.js';
import { AcknowledgementDto, acknowledgementDocument } from '../programs/acknowledgements.js';
import { NmqAnswers, submitNmq } from '../programs/ergo.controller.js';
import { CbiAnswers, Overload, submitFatigue, submitOverload } from '../programs/workload.controller.js';

const me = (ctx: RequestContext) => signedIn(ctx) as EmployeePrincipal;
const notFound = () => new NotFoundException({ code: 'not_found', message: 'Not found' });

class ProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty() lang!: string;
  @ApiProperty() site!: string;
  @ApiProperty() department!: string;
}
class TaskDto {
  @ApiProperty({ enum: ['nmq', 'cbi', 'overload', 'acknowledgement'], description: 'NMQ 問卷、過勞量表、工時調查、紀錄確認' }) kind!: string;
  @ApiProperty({ format: 'uuid', description: '問卷、評估或確認的 id' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dueOn!: string | null;
}
class ConsentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['notice', 'consent'], description: '告知聲明（已閱讀）或同意（非法定用途）' }) kind!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() documentVersion!: string;
  @ApiProperty({ type: String, format: 'date-time' }) givenAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) withdrawnAt!: Date | null;
}
class MyHealthDto {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '我的健檢結果與分級' }) exams!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '我的 NMQ 結果' }) surveys!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '我的過勞評估結果' }) workload!: unknown[];
}

const Confirm = z.object({ comment: z.string().trim().max(1000).optional() }).strict();
const GiveConsent = z.object({ kind: z.enum(['notice', 'consent']), purpose: z.string().trim().min(1).max(200), documentVersion: z.string().trim().min(1).max(50) }).strict();

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(@Inject(TENANT_CRYPTO) private readonly crypto: TenantCrypto) {}

  @Get('profile') @EmployeeOnly() @ApiOperation({ summary: '我的基本資料' }) @ApiOkResponse({ type: ProfileDto })
  async profile(@Ctx() ctx: RequestContext): Promise<ProfileDto> {
    const [row] = await ctx.tx.select({ id: employees.id, empNo: employees.empNo, name: employees.name, lang: employees.lang, site: sites.name, department: departments.name })
      .from(employees).innerJoin(sites, eq(sites.id, employees.siteId)).innerJoin(departments, eq(departments.id, employees.departmentId)).where(eq(employees.id, me(ctx).employeeId));
    return row!;
  }

  @Get('tasks') @EmployeeOnly() @ApiOperation({ summary: '我的待辦：待填問卷與待確認紀錄' }) @ApiOkResponse({ type: [TaskDto] })
  async tasks(@Ctx() ctx: RequestContext): Promise<TaskDto[]> {
    const id = me(ctx).employeeId;
    const nmq = await ctx.tx.select({ id: ergoSurveys.id, name: ergoDispatches.name, dueOn: ergoDispatches.dueOn }).from(ergoSurveys)
      .innerJoin(ergoDispatches, eq(ergoDispatches.id, ergoSurveys.dispatchId)).where(and(eq(ergoSurveys.employeeId, id), eq(ergoSurveys.status, '未填寫')));
    const wl = await ctx.tx.select().from(workloadAssessments).where(eq(workloadAssessments.employeeId, id)).orderBy(desc(workloadAssessments.sentOn));
    const acks = await ctx.tx.select().from(employeeAcknowledgements).where(and(eq(employeeAcknowledgements.employeeId, id), isNull(employeeAcknowledgements.confirmedAt)));
    return [
      ...nmq.map(s => ({ kind: 'nmq', id: s.id, title: `肌肉骨骼症狀調查：${s.name}`, dueOn: s.dueOn })),
      ...wl.filter(a => !a.fatigueAt).map(a => ({ kind: 'cbi', id: a.id, title: '過勞量表', dueOn: null })),
      ...wl.filter(a => !a.overloadAt).map(a => ({ kind: 'overload', id: a.id, title: '工時與工作型態調查', dueOn: null })),
      ...await Promise.all(acks.map(async a => ({ kind: 'acknowledgement', id: a.id, title: (await acknowledgementDocument(ctx.tx, a)).title, dueOn: null }))),
    ];
  }

  @Put('ergo/:id') @EmployeeOnly() @ApiOperation({ summary: '填寫 NMQ 問卷' }) @ApiBody({ schema: openApiSchema(NmqAnswers) })
  @ApiOkResponse({ schema: { type: 'object', properties: { suspectedHazard: { type: 'boolean' } } } })
  async nmq(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const row = await submitNmq(ctx, id, parse(NmqAnswers, body), me(ctx));
    return { submitted: true, maxScore: row.maxScore, suspectedHazard: row.suspectedHazard };
  }

  @Put('workload/:id/cbi') @EmployeeOnly() @ApiOperation({ summary: '填寫過勞量表（CBI）' }) @ApiBody({ schema: openApiSchema(CbiAnswers) })
  @ApiOkResponse({ schema: { type: 'object', properties: { submitted: { type: 'boolean' } } } })
  async cbi(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(CbiAnswers, body);
    await this.ownAssessment(ctx, id, 'fatigueAt');
    await submitFatigue(ctx, this.crypto, id, { cbi: input }, me(ctx));
    return { submitted: true };
  }

  @Put('workload/:id/overload') @EmployeeOnly() @ApiOperation({ summary: '填寫工時與工作型態' }) @ApiBody({ schema: openApiSchema(Overload) })
  @ApiOkResponse({ schema: { type: 'object', properties: { submitted: { type: 'boolean' } } } })
  async overload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
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
  @ApiOperation({ summary: '匯出我的健康資料', description: '個資法第 3 條的製給複本權利；記入稽核。' }) @ApiProduces('application/json') @ApiOkResponse({ type: MyHealthDto })
  async export(@Ctx() ctx: RequestContext): Promise<MyHealthDto & { exportedAt: string }> {
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
        riskLevel: a.riskLevel, advice: (a.evaluation as { advice?: string } | null)?.advice ?? null,
      })),
    };
  }
}
