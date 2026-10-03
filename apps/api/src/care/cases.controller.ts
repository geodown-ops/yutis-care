/*
 * Case management (個案管理): abnormal events (健檢 3–4 級, 特殊健檢, later the four programmes) gather into one case per
 * employee. A nurse opens the case (起單), works it (處理中) and closes it (結案); a new event after closing shows the
 * employee as 未開單 again (@yutis/domain caseStatus). Every status change is kept in event_status_history.
 */
import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { caseEvents, cases, departments, employees, eventStatusHistory, users } from '@yutis/db';
import { CASE_STATUSES, canMoveCase, caseStatus, EVENT_TYPES, type CaseStatus } from '@yutis/domain';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { assertSiteAccess, siteAccess } from '../auth/site-access.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { openApiSchema, parse } from '../core/validation.js';
import { raiseAgeEvents } from '../programs/common.js';

const CaseAccess = () => StaffOnly({ data: 'health', feature: 'cases' });

class CaseEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: Object.keys(EVENT_TYPES), description: 'hc 健檢、sp 特殊健檢、wl 異常負荷、er 人因、mat 母性、age 年齡' }) type!: string;
  @ApiProperty({ type: String, format: 'date' }) occurredOn!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: CASE_STATUSES }) status!: CaseStatus;
}

class CaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CASE_STATUSES }) status!: CaseStatus;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: '主責人員' }) leadUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) leadName!: string | null;
  @ApiProperty({ type: String, format: 'date' }) openedOn!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '通知日' }) noticeOn!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '預計處理日' }) plannedOn!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: '回覆日' }) repliedOn!: string | null;
  @ApiProperty({ type: Boolean, nullable: true, description: '員工是否同意' }) agreed!: boolean | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) closedOn!: string | null;
}

class EmployeeCaseDto {
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty() department!: string;
  @ApiProperty({ enum: CASE_STATUSES, description: '顯示狀態：結案後有新事件會回到未開單' }) status!: CaseStatus;
  @ApiProperty({ type: CaseDto, nullable: true, description: '目前（最新）的個案' }) case!: CaseDto | null;
  @ApiProperty({ type: [CaseEventDto] }) events!: CaseEventDto[];
}

class StatusChangeDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ enum: CASE_STATUSES, nullable: true }) fromStatus!: CaseStatus | null;
  @ApiProperty({ enum: CASE_STATUSES }) toStatus!: CaseStatus;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) at!: Date;
}

class EmployeeCaseDetailDto extends EmployeeCaseDto {
  @ApiProperty({ type: [StatusChangeDto] }) history!: StatusChangeDto[];
}

const ListQuery = z.object({ status: z.enum(CASE_STATUSES).optional() });
const UpdateCase = z.object({
  status: z.enum(['處理中', '結案']),
  leadUserId: z.uuid(),
  noticeOn: z.iso.date().nullable(),
  plannedOn: z.iso.date().nullable(),
  repliedOn: z.iso.date().nullable(),
  agreed: z.boolean().nullable(),
  note: z.string().trim().max(500),
}).partial().strict();

@ApiTags('cases')
@Controller()
export class CasesController {
  @Get('cases')
  @CaseAccess()
  @ApiOperation({ summary: '個案列表：負責廠區內有異常事件的員工', description: '每位列出的員工都記入稽核。' })
  @ApiQuery({ name: 'status', required: false, enum: CASE_STATUSES })
  @ApiOkResponse({ type: [EmployeeCaseDto] })
  async list(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<EmployeeCaseDto[]> {
    const { status } = parse(ListQuery, query);
    const access = await siteAccess(ctx.tx, staff(ctx).userId);
    const siteIds = [...access.assigned, ...access.breakGlass].map(s => s.id);
    if (!siteIds.length) return [];
    const events = await ctx.tx.select({ event: caseEvents }).from(caseEvents).innerJoin(employees, eq(employees.id, caseEvents.employeeId))
      .where(inArray(employees.siteId, siteIds));
    const employeeIds = [...new Set(events.map(e => e.event.employeeId))];
    const result = (await this.describe(ctx, employeeIds)).filter(c => !status || c.status === status);
    if (result.length) {
      await recordAudit(ctx, result.map((c): AuditEntry => ({ action: 'read', subjectTable: 'cases', employeeId: c.employeeId, dataCategory: 'health', reason: 'case list' })));
    }
    return result;
  }

  @Post('cases/age-events')
  @HttpCode(200)
  @CaseAccess()
  @ApiOperation({ summary: '更新年齡關注事件', description: '未滿 18 歲或已達中高齡（55 歲）的在職員工各產生一個事件；已有的不重複產生。員工匯入後也會自動執行。' })
  @ApiOkResponse({ schema: { type: 'object', properties: { raised: { type: 'number' } } } })
  async ageEvents(@Ctx() ctx: RequestContext): Promise<{ raised: number }> {
    const raised = await raiseAgeEvents(ctx);
    if (raised) await recordAudit(ctx, { action: 'create', subjectTable: 'case_events', reason: `${raised} age event(s)` });
    return { raised };
  }

  @Get('employees/:employeeId/case')
  @CaseAccess()
  @ApiOperation({ summary: '員工的個案服務單：事件、個案與狀態歷程' })
  @ApiOkResponse({ type: EmployeeCaseDetailDto })
  async detail(@Ctx() ctx: RequestContext, @Param('employeeId', ParseUUIDPipe) employeeId: string): Promise<EmployeeCaseDetailDto> {
    await this.assertEmployee(ctx, employeeId);
    const [summary] = await this.describe(ctx, [employeeId]);
    const eventIds = summary!.events.map(e => e.id);
    const history = eventIds.length
      ? await ctx.tx.select({ eventId: eventStatusHistory.eventId, fromStatus: eventStatusHistory.fromStatus, toStatus: eventStatusHistory.toStatus, note: eventStatusHistory.note, at: eventStatusHistory.createdAt })
        .from(eventStatusHistory).where(inArray(eventStatusHistory.eventId, eventIds)).orderBy(asc(eventStatusHistory.createdAt))
      : [];
    await recordAudit(ctx, { action: 'read', subjectTable: 'cases', employeeId, dataCategory: 'health', reason: 'case detail' });
    return { ...summary!, history };
  }

  @Post('employees/:employeeId/case/open')
  @HttpCode(200)
  @CaseAccess()
  @ApiOperation({
    summary: '開單',
    description: '沒有個案或個案已結案時，開一張新的個案（起單，主責為自己）；個案進行中時，把新進的未開單事件併入。',
  })
  @ApiOkResponse({ type: EmployeeCaseDetailDto })
  async open(@Ctx() ctx: RequestContext, @Param('employeeId', ParseUUIDPipe) employeeId: string): Promise<EmployeeCaseDetailDto> {
    await this.assertEmployee(ctx, employeeId);
    const me = staff(ctx);
    const pending = await ctx.tx.select().from(caseEvents).where(and(eq(caseEvents.employeeId, employeeId), eq(caseEvents.status, '未開單')));
    if (!pending.length) throw new ConflictException({ code: 'no_new_events', message: 'No new events to open a case for' });
    let [current] = await ctx.tx.select().from(cases).where(eq(cases.employeeId, employeeId)).orderBy(desc(cases.openedOn), desc(cases.createdAt)).limit(1);
    if (!current || current.status === '結案') {
      [current] = await ctx.tx.insert(cases).values({ tenantId: ctx.tenant.id, employeeId, status: '起單', leadUserId: me.userId, openedOn: today(), createdBy: me.userId }).returning();
      await recordAudit(ctx, { action: 'create', subjectTable: 'cases', subjectId: current!.id, employeeId, dataCategory: 'health' });
    }
    await this.moveEvents(ctx, pending, current!.status, current!.id, null);
    await recordAudit(ctx, { action: 'update', subjectTable: 'case_events', employeeId, dataCategory: 'health', reason: `${pending.length} event(s) → ${current!.status}` });
    return this.detail(ctx, employeeId);
  }

  @Patch('cases/:id')
  @CaseAccess()
  @ApiOperation({ summary: '更新個案：狀態（處理中、結案）、主責、各日期', description: '狀態只能依 起單 → 處理中 → 結案 前進；個案內的事件跟著變更並留下歷程。' })
  @ApiBody({ schema: openApiSchema(UpdateCase) })
  @ApiOkResponse({ type: EmployeeCaseDetailDto })
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<EmployeeCaseDetailDto> {
    const { status, note, ...fields } = parse(UpdateCase, body);
    const [current] = await ctx.tx.select().from(cases).where(eq(cases.id, id));
    if (!current) throw new NotFoundException({ code: 'not_found', message: 'No such case' });
    await this.assertEmployee(ctx, current.employeeId);
    if (status && status !== current.status && !canMoveCase(current.status, status)) {
      throw new ConflictException({ code: 'invalid_transition', message: `A case cannot go from ${current.status} to ${status}` });
    }
    if (fields.leadUserId) {
      const [lead] = await ctx.tx.select({ id: users.id }).from(users).where(and(eq(users.id, fields.leadUserId), eq(users.active, true)));
      if (!lead) throw new ConflictException({ code: 'unknown_staff', message: 'The lead must be active staff' });
    }
    await ctx.tx.update(cases).set({ ...fields, ...(status ? { status } : {}), ...(status === '結案' ? { closedOn: today() } : {}), updatedAt: new Date(), updatedBy: staff(ctx).userId })
      .where(eq(cases.id, id));
    if (status && status !== current.status) {
      const linked = await ctx.tx.select().from(caseEvents).where(and(eq(caseEvents.caseId, id), ne(caseEvents.status, '未開單')));
      await this.moveEvents(ctx, linked, status, id, note ?? null);
    }
    await recordAudit(ctx, { action: 'update', subjectTable: 'cases', subjectId: id, employeeId: current.employeeId, dataCategory: 'health', reason: status ? `→ ${status}` : undefined });
    return this.detail(ctx, current.employeeId);
  }

  private async moveEvents(ctx: RequestContext, events: (typeof caseEvents.$inferSelect)[], to: CaseStatus, caseId: string, note: string | null) {
    if (!events.length) return;
    await ctx.tx.update(caseEvents).set({ status: to, caseId, updatedAt: new Date(), updatedBy: staff(ctx).userId }).where(inArray(caseEvents.id, events.map(e => e.id)));
    await ctx.tx.insert(eventStatusHistory).values(events.map(e => ({
      tenantId: ctx.tenant.id, eventId: e.id, fromStatus: e.status, toStatus: to, note, createdBy: staff(ctx).userId,
    })));
  }

  private async assertEmployee(ctx: RequestContext, employeeId: string) {
    const [employee] = await ctx.tx.select({ siteId: employees.siteId }).from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new NotFoundException({ code: 'employee_not_found', message: 'No such employee' });
    await assertSiteAccess(ctx.tx, staff(ctx), employee.siteId);
  }

  private async describe(ctx: RequestContext, employeeIds: string[]): Promise<EmployeeCaseDto[]> {
    if (!employeeIds.length) return [];
    const people = await ctx.tx.select({ id: employees.id, empNo: employees.empNo, name: employees.name, department: departments.name })
      .from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(inArray(employees.id, employeeIds)).orderBy(asc(employees.empNo));
    const events = await ctx.tx.select().from(caseEvents).where(inArray(caseEvents.employeeId, employeeIds)).orderBy(asc(caseEvents.occurredOn));
    const allCases = await ctx.tx.select({ c: cases, leadName: users.name }).from(cases).leftJoin(users, eq(users.id, cases.leadUserId))
      .where(inArray(cases.employeeId, employeeIds)).orderBy(desc(cases.openedOn), desc(cases.createdAt));
    const typeOrder = Object.keys(EVENT_TYPES);
    return people.map(p => {
      const latest = allCases.find(x => x.c.employeeId === p.id);
      const evs = events.filter(e => e.employeeId === p.id).sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
      return {
        employeeId: p.id, empNo: p.empNo, name: p.name, department: p.department,
        status: caseStatus(latest?.c.status, evs.map(e => e.status)),
        case: latest ? {
          id: latest.c.id, status: latest.c.status, leadUserId: latest.c.leadUserId, leadName: latest.leadName, openedOn: latest.c.openedOn,
          noticeOn: latest.c.noticeOn, plannedOn: latest.c.plannedOn, repliedOn: latest.c.repliedOn, agreed: latest.c.agreed, closedOn: latest.c.closedOn,
        } : null,
        events: evs.map(e => ({ id: e.id, type: e.type, occurredOn: e.occurredOn, description: e.description, status: e.status })),
      };
    });
  }
}

/** Today's date in Taiwan (UTC+8, no daylight saving). */
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
