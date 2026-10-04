/* Shared by the four programmes (四大計畫): site scope, abnormal events and the latest health check. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { caseEvents, departments, employees, healthExamResults, healthExams, portalDrafts } from '@yutis/db';
import { ageAt, EXAM_ITEMS, isAgeConcern, type EventType, type ExamValues } from '@yutis/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { assertSiteAccess, siteAccess } from '../auth/site-access.js';
import { staff, type RequestContext } from '../core/context.js';
import { decryptOptional, type TenantCrypto } from '../core/crypto.js';

/** Today's date in Taiwan (UTC+8, no daylight saving). */
export const todayTw = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

/** The employee, after checking the signed-in staff member may see employees of their site. */
export async function employeeInScope(ctx: RequestContext, employeeId: string) {
  const [employee] = await ctx.tx.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee) throw new NotFoundException({ code: 'employee_not_found', message: 'No such employee' });
  await assertSiteAccess(ctx.tx, staff(ctx), employee.siteId);
  return employee;
}

export async function mySiteIds(ctx: RequestContext): Promise<string[]> {
  const access = await siteAccess(ctx.tx, staff(ctx).userId);
  return [...access.assigned, ...access.breakGlass].map(s => s.id);
}

export async function assertSitesInScope(ctx: RequestContext, siteId: string) {
  await assertSiteAccess(ctx.tx, staff(ctx), siteId);
}

/** The department's name, after checking it belongs to the site; null when no department is given. */
export async function departmentInSite(ctx: RequestContext, siteId: string, departmentId: string | null | undefined): Promise<string | null> {
  if (!departmentId) return null;
  const [dept] = await ctx.tx.select({ name: departments.name }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.siteId, siteId)));
  if (!dept) throw new BadRequestException({ code: 'unknown_department', message: 'The department is not in that site' });
  return dept.name;
}

/** A submitted questionnaire no longer needs the employee's draft, whoever submitted it. */
export async function clearDraft(ctx: RequestContext, taskKind: typeof portalDrafts.$inferSelect.taskKind, taskId: string) {
  await ctx.tx.delete(portalDrafts).where(and(eq(portalDrafts.taskKind, taskKind), eq(portalDrafts.taskId, taskId)));
}

/** Record an abnormal event for case management; the same source raises it only once. */
export async function raiseEvent(ctx: RequestContext, e: { employeeId: string; type: EventType; sourceTable: string; sourceId: string; occurredOn: string; description: string }) {
  await ctx.tx.insert(caseEvents).values({ ...e, tenantId: ctx.tenant.id }).onConflictDoNothing();
}

/**
 * Age-attention events (未滿 18 歲、中高齡) for current employees, as in the prototype: one per employee, dated
 * from their hire date. Idempotent; run after employee imports and on demand.
 */
export async function raiseAgeEvents(ctx: RequestContext, employeeIds?: string[]): Promise<number> {
  const rows = await ctx.tx.select({ id: employees.id, birthDate: employees.birthDate, hireDate: employees.hireDate, createdAt: employees.createdAt })
    .from(employees).where(employeeIds ? and(eq(employees.status, '在職'), inArray(employees.id, employeeIds)) : eq(employees.status, '在職'));
  const today = todayTw();
  let raised = 0;
  for (const e of rows) {
    const age = ageAt(e.birthDate, today);
    if (!isAgeConcern(age)) continue;
    const inserted = await ctx.tx.insert(caseEvents).values({
      tenantId: ctx.tenant.id, employeeId: e.id, type: 'age', sourceTable: 'employees', sourceId: e.id,
      occurredOn: e.hireDate ?? e.createdAt.toISOString().slice(0, 10),
      description: age < 18 ? `未滿 18 歲員工（${age} 歲）` : `中高齡員工（${age} 歲）`,
    }).onConflictDoNothing().returning({ id: caseEvents.id });
    raised += inserted.length;
  }
  return raised;
}

/** The employee's latest health check, as @yutis/domain's cvdScore wants it (values by item key, history, smoker). */
export async function latestExamFor(ctx: RequestContext, crypto: TenantCrypto, employeeId: string) {
  const [exam] = await ctx.tx.select().from(healthExams).where(eq(healthExams.employeeId, employeeId)).orderBy(desc(healthExams.examDate)).limit(1);
  if (!exam) return null;
  const results = await ctx.tx.select().from(healthExamResults).where(eq(healthExamResults.examId, exam.id));
  const values: ExamValues = {};
  for (const r of results) {
    const key = EXAM_ITEMS.find(i => i.code === r.itemCode)?.key;
    if (key) values[key] = r.valueText ?? (r.valueNum === null ? null : Number(r.valueNum));
  }
  return {
    id: exam.id, date: exam.examDate, values,
    history: (await decryptOptional(crypto, ctx.tenant.id, exam.historyEnc)) ?? undefined,
    smoker: exam.smoker ?? false,
  };
}
