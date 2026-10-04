/*
 * 人因性危害預防 (ergonomics): NMQ questionnaires sent in batches, answered by employees in the portal or entered by a
 * nurse, scored with @yutis/domain nmq. A body part scoring ≥ 3 marks a suspected hazard and raises an event.
 */
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { departments, employees, ergoDispatches, ergoSurveys, sites as siteTable, tenantSettings } from '@yutis/db';
import { NMQ_KEYS, nmqMax, nmqSuspectedHazard } from '@yutis/domain';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { CLINICAL_ROLES } from '../auth/permissions.js';
import { tenantOrigin, type ApiConfig } from '../config.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type Principal, type RequestContext } from '../core/context.js';
import { API_CONFIG } from '../core/database.js';
import { RemindResultDto } from '../core/dto.js';
import { surveyReminderEmail } from '../core/emails.js';
import { Notifier } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { clearDraft, employeeInScope, mySiteIds, raiseEvent, todayTw } from './common.js';

export const Clinical = () => StaffOnly({ data: 'health', feature: 'programs', roles: CLINICAL_ROLES });

/** NMQ answers: every body part 0–5, plus the form's yes/no questions. */
export const NmqAnswers = z.object({
  scores: z.object(Object.fromEntries(NMQ_KEYS.map(k => [k.key, z.number().int().min(0).max(5)])) as Record<string, z.ZodNumber>).strict(),
  yesNo: z.record(z.string().max(40), z.boolean()).default({}),
}).strict();
export type NmqAnswersInput = z.infer<typeof NmqAnswers>;

class NmqAnswersDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer', minimum: 0, maximum: 5 }, description: '各部位分數（0–5），鍵為部位代碼' })
  scores!: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' }, description: '是非題' }) yesNo!: Record<string, boolean>;
}
class ErgoTrackingDto {
  @ApiProperty({ type: [String], description: '改善措施' }) measures!: string[];
  @ApiProperty({ description: '說明' }) note!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '下次追蹤日期' }) nextOn!: string | null;
  @ApiProperty({ enum: ['列管中', '已改善', '解除列管'] }) status!: '列管中' | '已改善' | '解除列管';
}
class SurveyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: '桃園廠' }) site!: string;
  @ApiProperty({ example: '製造一課' }) department!: string;
  @ApiProperty({ enum: ['未填寫', '已填寫'] }) status!: string;
  @ApiProperty({ type: Number, nullable: true, description: '各部位最高分（0–5）' }) maxScore!: number | null;
  @ApiProperty({ type: Boolean, nullable: true, description: '疑似有危害（任一部位 ≥ 3）' }) suspectedHazard!: boolean | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) filledAt!: Date | null;
  @ApiProperty({ type: String, enum: ['self', 'nurse'], nullable: true }) filledBy!: string | null;
  @ApiProperty({ type: NmqAnswersDto, nullable: true, description: '填答內容；未填寫時為 null' }) answers!: NmqAnswersDto | null;
  @ApiProperty({ description: '已寄出的催填通知次數' }) reminders!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastRemindedAt!: Date | null;
  @ApiProperty({ type: ErgoTrackingDto, nullable: true, description: '管控追蹤（疑似有危害時）' }) tracking!: ErgoTrackingDto | null;
}

class DispatchDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: 'date' }) sentOn!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dueOn!: string | null;
  @ApiProperty() total!: number;
  @ApiProperty() filled!: number;
  @ApiProperty() suspected!: number;
}

const Tracking = z.object({
  measures: z.array(z.string().trim().min(1).max(100)).max(20).default([]), note: z.string().max(2000).default(''),
  nextOn: z.iso.date().nullable().default(null), status: z.enum(['列管中', '已改善', '解除列管']),
}).strict().refine(t => t.measures.length > 0 || t.note.trim() !== '', { message: 'Give at least one measure or a note', path: ['measures'] });
const Remind = z.object({ surveyIds: z.array(z.uuid()).min(1).max(5000).optional() }).strict();

const CreateDispatch = z.object({
  name: z.string().trim().min(1).max(100), sentOn: z.iso.date().optional(), dueOn: z.iso.date().nullable().default(null),
  employeeIds: z.array(z.uuid()).min(1).max(5000),
}).strict();

/** Score and store one NMQ answer sheet; used by staff entry and by the employee portal. */
export async function submitNmq(ctx: RequestContext, surveyId: string, input: NmqAnswersInput, by: Principal): Promise<typeof ergoSurveys.$inferSelect> {
  const [survey] = await ctx.tx.select().from(ergoSurveys).where(eq(ergoSurveys.id, surveyId));
  if (!survey || (by.kind === 'employee' && survey.employeeId !== by.employeeId)) throw new NotFoundException({ code: 'not_found', message: 'No such survey' });
  if (by.kind === 'employee' && survey.status === '已填寫') throw new ConflictException({ code: 'already_submitted', message: 'This survey has already been submitted' });
  const maxScore = nmqMax(input.scores)!;
  const suspected = nmqSuspectedHazard(input.scores);
  const [row] = await ctx.tx.update(ergoSurveys).set({
    answers: input, maxScore, suspectedHazard: suspected, status: '已填寫', filledAt: new Date(), filledBy: by.kind === 'employee' ? 'self' : 'nurse',
    updatedAt: new Date(), updatedBy: by.kind === 'staff' ? by.userId : null,
  }).where(eq(ergoSurveys.id, surveyId)).returning();
  await clearDraft(ctx, 'nmq', surveyId);
  if (suspected) {
    await raiseEvent(ctx, {
      employeeId: survey.employeeId, type: 'er', sourceTable: 'ergo_surveys', sourceId: surveyId, occurredOn: todayTw(),
      description: `人因性危害：肌肉骨骼症狀疑似有危害（${maxScore}）`,
    });
  }
  await recordAudit(ctx, { action: 'update', subjectTable: 'ergo_surveys', subjectId: surveyId, employeeId: survey.employeeId, dataCategory: 'health', reason: 'NMQ submitted' }, by);
  return row!;
}

export async function formVersion(ctx: RequestContext, form: string, fallback: string): Promise<string> {
  const [setting] = await ctx.tx.select().from(tenantSettings).where(eq(tenantSettings.key, 'survey_versions'));
  const versions = (setting?.value ?? {}) as Record<string, string>;
  return versions[form] ?? fallback;
}

@ApiTags('programs')
@Controller('programs/ergo')
export class ErgoController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig, private readonly notifier: Notifier) {}

  @Post('dispatches')
  @Clinical()
  @ApiOperation({ summary: '發送 NMQ 問卷', description: '員工在員工端看到待填問卷；也可由職護代填。' })
  @ApiBody({ schema: openApiSchema(CreateDispatch) })
  @ApiCreatedResponse({ type: DispatchDto })
  async dispatch(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<DispatchDto> {
    const input = parse(CreateDispatch, body);
    const sites = new Set(await mySiteIds(ctx));
    const people = await ctx.tx.select({ id: employees.id, siteId: employees.siteId, lang: employees.lang }).from(employees).where(inArray(employees.id, input.employeeIds));
    if (people.length !== new Set(input.employeeIds).size || people.some(p => !sites.has(p.siteId))) {
      throw new BadRequestException({ code: 'outside_sites', message: 'Every employee must exist and be in your sites' });
    }
    const me = staff(ctx).userId;
    const [d] = await ctx.tx.insert(ergoDispatches).values({ tenantId: ctx.tenant.id, name: input.name, sentOn: input.sentOn ?? todayTw(), dueOn: input.dueOn, createdBy: me }).returning();
    const version = await formVersion(ctx, 'nmq', 'nmq-v1');
    await ctx.tx.insert(ergoSurveys).values(people.map(p => ({ tenantId: ctx.tenant.id, dispatchId: d!.id, employeeId: p.id, lang: p.lang, formVersion: version, createdBy: me })));
    await recordAudit(ctx, { action: 'create', subjectTable: 'ergo_dispatches', subjectId: d!.id, reason: `${people.length} NMQ surveys` });
    return { id: d!.id, name: d!.name, sentOn: d!.sentOn, dueOn: d!.dueOn, total: people.length, filled: 0, suspected: 0 };
  }

  @Get('dispatches')
  @Clinical()
  @ApiOperation({ summary: 'NMQ 發送批次（只有計數）' })
  @ApiOkResponse({ type: [DispatchDto] })
  async dispatches(@Ctx() ctx: RequestContext): Promise<DispatchDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await ctx.tx.select({
      id: ergoDispatches.id, name: ergoDispatches.name, sentOn: ergoDispatches.sentOn, dueOn: ergoDispatches.dueOn,
      total: sql<number>`count(${ergoSurveys.id})::int`,
      filled: sql<number>`count(*) filter (where ${ergoSurveys.status} = '已填寫')::int`,
      suspected: sql<number>`count(*) filter (where ${ergoSurveys.suspectedHazard})::int`,
    }).from(ergoDispatches).innerJoin(ergoSurveys, eq(ergoSurveys.dispatchId, ergoDispatches.id)).innerJoin(employees, eq(employees.id, ergoSurveys.employeeId))
      .where(inArray(employees.siteId, sites)).groupBy(ergoDispatches.id).orderBy(desc(ergoDispatches.sentOn));
    return rows;
  }

  @Get('dispatches/:id/surveys')
  @Clinical()
  @ApiOperation({ summary: '批次內負責廠區員工的填答狀況與結果', description: '每位列出的員工都記入稽核。' })
  @ApiOkResponse({ type: [SurveyDto] })
  async surveys(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<SurveyDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const rows = await this.load(ctx, and(eq(ergoSurveys.dispatchId, id), inArray(employees.siteId, sites))!);
    if (rows.length) await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'ergo_surveys', subjectId: r.id, employeeId: r.employeeId, dataCategory: 'health' })));
    return rows;
  }

  @Post('dispatches/:id/remind')
  @HttpCode(200)
  @Clinical()
  @ApiOperation({
    summary: '未填寫通知（催填）',
    description: '寄提醒信給批次內負責廠區、尚未填寫的員工（可用 surveyIds 指定）；信中只說有問卷待填，不含問卷名稱與健康內容。沒有 Email 的員工列在 noEmail。',
  })
  @ApiBody({ schema: openApiSchema(Remind) })
  @ApiOkResponse({ type: RemindResultDto })
  async remind(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<RemindResultDto> {
    const { surveyIds } = parse(Remind, body ?? {});
    const sites = await mySiteIds(ctx);
    if (!sites.length) return { emailed: 0, noEmail: [] };
    const pending = await ctx.tx.select({ id: ergoSurveys.id, employeeId: employees.id, name: employees.name, email: employees.email, lang: employees.lang })
      .from(ergoSurveys).innerJoin(employees, eq(employees.id, ergoSurveys.employeeId))
      .where(and(eq(ergoSurveys.dispatchId, id), eq(ergoSurveys.status, '未填寫'), inArray(employees.siteId, sites), surveyIds ? inArray(ergoSurveys.id, surveyIds) : undefined));
    const reachable = pending.filter(p => p.email);
    for (const p of reachable) {
      await this.notifier.email(ctx, surveyReminderEmail({
        to: p.email!, employeeId: p.employeeId, subjectTable: 'ergo_surveys', subjectId: p.id, name: p.name, lang: p.lang, tenantName: ctx.tenant.name,
        url: `${tenantOrigin(this.config, ctx.tenant.slug)}/me/`,
      }));
    }
    if (reachable.length) {
      await ctx.tx.update(ergoSurveys).set({ reminders: sql`${ergoSurveys.reminders} + 1`, lastRemindedAt: new Date(), updatedAt: new Date() })
        .where(inArray(ergoSurveys.id, reachable.map(p => p.id)));
      await recordAudit(ctx, reachable.map((p): AuditEntry => ({ action: 'update', subjectTable: 'ergo_surveys', subjectId: p.id, employeeId: p.employeeId, reason: 'fill-in reminder sent' })));
    }
    return { emailed: reachable.length, noEmail: pending.filter(p => !p.email).map(p => p.employeeId) };
  }

  @Put('surveys/:id/tracking')
  @Clinical()
  @ApiOperation({ summary: '管控追蹤（列管）', description: '只有疑似有危害（任一部位 ≥ 3）的問卷可以列管；整份取代。' })
  @ApiBody({ schema: openApiSchema(Tracking) })
  @ApiOkResponse({ type: SurveyDto })
  async track(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<SurveyDto> {
    const input = parse(Tracking, body);
    const [survey] = await ctx.tx.select().from(ergoSurveys).where(eq(ergoSurveys.id, id));
    if (!survey) throw new NotFoundException({ code: 'not_found', message: 'No such survey' });
    await employeeInScope(ctx, survey.employeeId);
    if (!survey.suspectedHazard) throw new ConflictException({ code: 'not_suspected', message: 'Only surveys with a suspected hazard can be tracked' });
    await ctx.tx.update(ergoSurveys).set({ tracking: input, updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(eq(ergoSurveys.id, id));
    await recordAudit(ctx, { action: 'update', subjectTable: 'ergo_surveys', subjectId: id, employeeId: survey.employeeId, dataCategory: 'health', reason: `tracking ${input.status}` });
    return (await this.load(ctx, eq(ergoSurveys.id, id)))[0]!;
  }

  @Put('surveys/:id')
  @Clinical()
  @ApiOperation({ summary: '職護代填 NMQ（依員工口述）' })
  @ApiBody({ schema: openApiSchema(NmqAnswers) })
  @ApiOkResponse({ type: SurveyDto })
  async fill(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<SurveyDto> {
    const input = parse(NmqAnswers, body);
    const [survey] = await ctx.tx.select().from(ergoSurveys).where(eq(ergoSurveys.id, id));
    if (!survey) throw new NotFoundException({ code: 'not_found', message: 'No such survey' });
    await employeeInScope(ctx, survey.employeeId);
    await submitNmq(ctx, id, input, staff(ctx));
    return (await this.load(ctx, eq(ergoSurveys.id, id)))[0]!;
  }

  private async load(ctx: RequestContext, where: SQL): Promise<SurveyDto[]> {
    const rows = await ctx.tx.select({
      id: ergoSurveys.id, employeeId: employees.id, empNo: employees.empNo, name: employees.name, site: siteTable.name, department: departments.name, status: ergoSurveys.status,
      maxScore: ergoSurveys.maxScore, suspectedHazard: ergoSurveys.suspectedHazard, filledAt: ergoSurveys.filledAt, filledBy: ergoSurveys.filledBy, answers: ergoSurveys.answers,
      reminders: ergoSurveys.reminders, lastRemindedAt: ergoSurveys.lastRemindedAt, tracking: ergoSurveys.tracking,
    }).from(ergoSurveys).innerJoin(employees, eq(employees.id, ergoSurveys.employeeId))
      .innerJoin(siteTable, eq(siteTable.id, employees.siteId)).innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(where).orderBy(asc(employees.empNo));
    return rows.map(r => ({ ...r, answers: r.answers as NmqAnswersDto | null, tracking: r.tracking as ErgoTrackingDto | null }));
  }
}
