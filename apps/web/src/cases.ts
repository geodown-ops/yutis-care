/* Pure helpers over GET /api/cases and GET /api/records/follow-ups for the nurse home and the case list. */
import type { Schemas } from '@yutis/api-client';
import { CASE_STATUSES, diffDays, parseDate, toIsoDate, type CaseStatus, type EventType, type IsoDate } from '@yutis/domain';

export type EmployeeCase = Schemas['EmployeeCaseDto'];
export type FollowUp = Schemas['FollowUpDto'];

const STATUS_ORDER: Record<CaseStatus, number> = { 未開單: 0, 起單: 1, 處理中: 2, 結案: 3 };

/** Count of employees per case status, in the domain's status order. */
export function countByStatus(cases: readonly EmployeeCase[]): Record<CaseStatus, number> {
  const out = Object.fromEntries(CASE_STATUSES.map(s => [s, 0])) as Record<CaseStatus, number>;
  for (const c of cases) out[c.status] += 1;
  return out;
}

/** Employees with every selected event type (the prototype's intersection filter). */
export function filterByEvents(cases: readonly EmployeeCase[], selected: readonly EventType[]): EmployeeCase[] {
  return cases.filter(c => selected.every(t => c.events.some(e => e.type === t)));
}

/** The newest event's date. */
export const latestEventOn = (c: EmployeeCase): IsoDate | null =>
  c.events.reduce<IsoDate | null>((d, e) => (!d || e.occurredOn > d ? e.occurredOn : d), null);

/** Open work first (未開單 → 處理中), newest event first within a status. */
export function byUrgency(a: EmployeeCase, b: EmployeeCase): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (latestEventOn(b) ?? '').localeCompare(latestEventOn(a) ?? '');
}

/** Distinct event types of an employee, in EVENT_TYPES order. */
export function eventTypes(c: EmployeeCase): EventType[] {
  const order: EventType[] = ['hc', 'sp', 'wl', 'er', 'mat', 'age'];
  return order.filter(t => c.events.some(e => e.type === t));
}

export const EVENT_SERIES = [
  { name: '健檢', types: ['hc', 'sp'] },
  { name: '計畫問卷與通報', types: ['wl', 'er', 'mat'] },
  { name: '年齡關注', types: ['age'] },
] as const satisfies readonly { name: string; types: readonly EventType[] }[];

/** New events per month for the 12 months up to `today`, one row per month, one column per series. */
export function monthlyEvents(cases: readonly EmployeeCase[], today: IsoDate): Record<string, string | number>[] {
  const t = parseDate(today);
  const months = Array.from({ length: 12 }, (_, i) => new Date(t.getFullYear(), t.getMonth() - 11 + i, 1));
  const rows = months.map(m => ({ key: toIsoDate(m).slice(0, 7), month: `${m.getMonth() + 1}月`, ...Object.fromEntries(EVENT_SERIES.map(s => [s.name, 0])) })) as ({ key: string; month: string } & Record<string, number | string>)[];
  for (const e of cases.flatMap(c => c.events)) {
    const row = rows.find(r => r.key === e.occurredOn.slice(0, 7));
    const series = EVENT_SERIES.find(s => (s.types as readonly string[]).includes(e.type));
    if (row && series) row[series.name] = (row[series.name] as number) + 1;
  }
  return rows.map(({ key: _key, ...r }) => r);
}

/** Follow-ups due in the next `days` days (including overdue ones), soonest first. */
export function dueFollowUps(items: readonly FollowUp[], today: IsoDate, days = 7): (FollowUp & { daysLeft: number })[] {
  return items
    .map(f => ({ ...f, daysLeft: diffDays(f.followUpOn, today) }))
    .filter(f => f.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export const todayIso = (): IsoDate => toIsoDate(new Date());
