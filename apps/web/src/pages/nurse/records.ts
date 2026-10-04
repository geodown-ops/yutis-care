/* Pure helpers for the assistance-record form (協助紀錄, prototype newRecord) and the case steps a saved record implies. */
import type { Schemas, TenantPaths } from '@yutis/api-client';
import { canMoveCase, CONSULT_TYPES, LIFESTYLE_ADVICE, RECORD_RESULTS, toIsoDate, type EventType, type IsoDate } from '@yutis/domain';
import { addDays, hasNewEvents, runningCase, type CaseMove, type EmployeeCase } from '../../cases';

export type CareRecord = Schemas['RecordDto'];
export type ConsultType = (typeof CONSULT_TYPES)[number];
export type Advice = (typeof LIFESTYLE_ADVICE)[number];
export type RecordResult = (typeof RECORD_RESULTS)[number];
type CreateBody = TenantPaths['/api/records']['post']['requestBody']['content']['application/json'];
/** Every field of a record as the form sends it; POST adds employeeId, PATCH takes it as is. */
export type RecordBody = Required<Omit<CreateBody, 'employeeId' | 'followUpDone'>>;

export interface RecordForm {
  category: string;
  date: IsoDate;
  /** HH:mm, local (Taiwan) time. */
  time: string;
  consultTypes: ConsultType[];
  lifestyleAdvice: Advice[];
  explain: string;
  handling: string;
  note: string;
  helpers: { userId: string; minutes: number }[];
  result: RecordResult;
  followUpOn: IsoDate | '';
  followUpUserId: string;
}

/** Which consultation type each kind of abnormal event is about (prototype defaultTypes). */
const CONSULT_FOR: Record<EventType, ConsultType> = {
  hc: CONSULT_TYPES[0], sp: CONSULT_TYPES[1], er: CONSULT_TYPES[2], wl: CONSULT_TYPES[4], mat: CONSULT_TYPES[5], age: CONSULT_TYPES[6],
};

/** The consultation types of the employee's events that are not closed, preselected on a new record. */
export function consultTypesFor(events: readonly Pick<EmployeeCase['events'][number], 'type' | 'status'>[]): ConsultType[] {
  return CONSULT_TYPES.filter(t => events.some(e => e.status !== '結案' && CONSULT_FOR[e.type as EventType] === t));
}

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** A new record: now, written by me (20 minutes), to follow up in two weeks, as in the prototype. */
export function newRecordForm(o: { now: Date; meId: string; events?: Parameters<typeof consultTypesFor>[0]; category?: string }): RecordForm {
  const date = toIsoDate(o.now);
  return {
    category: o.category ?? '健康面談諮詢紀錄', date, time: hm(o.now),
    consultTypes: consultTypesFor(o.events ?? []), lifestyleAdvice: [], explain: '', handling: '', note: '',
    helpers: [{ userId: o.meId, minutes: 20 }], result: '追蹤', followUpOn: addDays(date, 14), followUpUserId: o.meId,
  };
}

/** An existing record in the form's shape; occurredAt is shown in local time. */
export function recordToForm(r: CareRecord, meId: string): RecordForm {
  const at = new Date(r.occurredAt);
  const c = r.content ?? { explain: '', handling: '', note: '' };
  return {
    category: r.category, date: toIsoDate(at), time: hm(at),
    consultTypes: r.consultTypes as ConsultType[], lifestyleAdvice: r.lifestyleAdvice as Advice[],
    explain: c.explain, handling: c.handling, note: c.note,
    helpers: r.helpers.map(h => ({ ...h })), result: r.result as RecordResult,
    followUpOn: r.followUpOn ?? '', followUpUserId: r.followUpUserId ?? meId,
  };
}

/** Local date and time → ISO timestamp with offset, as POST /api/records wants. */
export function toOccurredAt(date: IsoDate, time: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, min] = (time || '00:00').split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min).toISOString();
}

/** Why the form cannot be saved yet. A draft only needs a category and a date, like the API. */
export function recordProblems(f: RecordForm, draft: boolean): string[] {
  const out: string[] = [];
  if (!f.category.trim()) out.push('請選擇協助類別');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) out.push('請填寫發生日期');
  if (f.helpers.some(h => !Number.isInteger(h.minutes) || h.minutes < 0 || h.minutes > 1440)) out.push('費時請填 0–1440 分鐘');
  if (draft) return out;
  if (!/^\d{2}:\d{2}$/.test(f.time)) out.push('請填寫發生時間');
  if (f.consultTypes.length === 0) out.push('請至少勾選一項諮詢類型');
  if (f.result === '追蹤') {
    if (!f.followUpOn) out.push('選擇「追蹤」時，請填寫下次追蹤日期');
    else if (f.followUpOn < f.date) out.push('下次追蹤日期不能早於發生日期');
  }
  return out;
}

/** The request body for POST (with employeeId) and PATCH /api/records. A closed record has no follow-up. */
export function recordBody(f: RecordForm, draft: boolean): RecordBody {
  const follow = f.result === '追蹤';
  return {
    category: f.category.trim(), occurredAt: toOccurredAt(f.date, f.time),
    consultTypes: f.consultTypes, lifestyleAdvice: f.lifestyleAdvice,
    content: { explain: f.explain, handling: f.handling, note: f.note },
    helpers: f.helpers.filter(h => h.userId),
    result: f.result,
    followUpOn: follow && f.followUpOn ? f.followUpOn : null,
    followUpUserId: follow ? f.followUpUserId || null : null,
    draft,
  };
}

/** Appends a phrase to a text field on its own line. */
export const withPhrase = (text: string, phrase: string) => (text.trim() ? `${text.replace(/\s+$/, '')}\n${phrase}` : phrase);

export interface CaseFollowOn { open: boolean; merge: boolean; to: CaseMove | null }

/**
 * What a saved (not draft) record does to the case, as in the prototype: new events are opened (or added to the
 * running case), a record to follow up moves 起單 to 處理中, and a record with result 結案 closes the case.
 */
export function caseFollowOn(k: Pick<EmployeeCase, 'case' | 'events'>, result: RecordResult): CaseFollowOn | null {
  const open = hasNewEvents(k);
  const running = runningCase(k)?.status ?? null;
  const after = open ? running ?? '起單' : running;
  if (!after) return null;
  const want: CaseMove = result === '結案' ? '結案' : '處理中';
  const to = want !== after && canMoveCase(after, want) ? want : null;
  return open || to ? { open, merge: open && !!running, to } : null;
}

const slash = (d: string) => d.replaceAll('-', '/');

/** One line about the employee's case, shown above the record form. */
export function caseContext(k: Pick<EmployeeCase, 'case' | 'events'>): string {
  const running = runningCase(k);
  const fresh = hasNewEvents(k);
  if (running) return `個案狀態：${running.status} · ${slash(running.openedOn)} 開單${fresh ? ' · 有新的異常事件尚未併入' : ''}`;
  if (fresh) return '有異常事件尚未開單';
  if (k.case) return `個案已結案${k.case.closedOn ? `（${slash(k.case.closedOn)}）` : ''}`;
  return '此員工目前沒有異常事件';
}

export function followOnLabel(s: CaseFollowOn): string {
  const parts = [
    s.open ? (s.merge ? '把新的異常事件併入個案' : '開單（主責為我）') : null,
    s.to === '結案' ? '將個案結案' : s.to === '處理中' ? '個案改為處理中' : null,
  ].filter(Boolean);
  return `同時${parts.join('，')}`;
}
