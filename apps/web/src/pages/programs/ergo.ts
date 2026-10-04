/* Pure helpers for the ergonomics programme (人因性危害預防) over GET /api/programs/ergo/... */
import type { Schemas, StaffMe, TenantPaths } from '@yutis/api-client';
import { NMQ_HAZARD_THRESHOLD, NMQ_KEYS, NMQ_PARTS, NMQ_PART_NAMES, parseDate, toIsoDate, type IsoDate } from '@yutis/domain';
import { canAccess, type Access } from '../../nav';

export type Dispatch = Schemas['DispatchDto'];
export type Survey = Schemas['SurveyDto'];
export type NmqBody = TenantPaths['/api/programs/ergo/surveys/{id}']['put']['requestBody']['content']['application/json'];

/** Every ergonomics endpoint is @Clinical(): 職護 and 職醫 with health data (apps/api/src/programs/ergo.controller.ts). */
export const ERGO_ACCESS: Access = { feature: 'programs', data: 'health', roles: ['職護', '職醫'] };
export const canRunErgo = (me: Pick<StaffMe, 'role' | 'features' | 'dataCategories'>) => canAccess(me, ERGO_ACCESS);

/** Pain scale of the questionnaire (0–5), as the employee portal shows it. */
export const NMQ_SCALE = ['不痛', '微痛', '中等疼痛', '劇烈疼痛', '非常劇烈疼痛', '極度劇烈疼痛'] as const;
/** The two yes/no questions; keys match the employee portal's answers. */
export const NMQ_YES_NO = [
  { key: 'any', label: '過去 1 年內，身體是否有長達 2 星期以上的疲勞、酸痛、發麻、刺痛等不舒服，或關節活動受到限制？' },
  { key: 'injury', label: '過去 1 年內，是否曾因工作受傷或請病假？' },
] as const;
export type YesNoKey = (typeof NMQ_YES_NO)[number]['key'];

/** Body parts as rows of the form: one or two score keys (left, right) per part. */
export const NMQ_ROWS = NMQ_PARTS.map(p => ({
  label: NMQ_PART_NAMES[p.k],
  keys: NMQ_KEYS.filter(k => k.part === p.k).map(k => ({ key: k.key, side: k.side ? (k.side === 'L' ? '左' : '右') : null })),
}));

export interface NmqDraft { yesNo: Partial<Record<YesNoKey, boolean>>; scores: Record<string, number> }
export const emptyNmq = (): NmqDraft => ({ yesNo: {}, scores: {} });

/** Questions still unanswered: both yes/no questions and every body part. */
export function nmqUnanswered(d: NmqDraft): number {
  return NMQ_YES_NO.filter(q => d.yesNo[q.key] == null).length + NMQ_KEYS.filter(k => d.scores[k.key] == null).length;
}

/** Highest score so far, or null before any part is scored. */
export function draftMax(d: NmqDraft): number | null {
  const v = Object.values(d.scores);
  return v.length ? Math.max(...v) : null;
}

/** The PUT body once every question is answered. */
export function nmqBody(d: NmqDraft): NmqBody | null {
  if (nmqUnanswered(d) > 0) return null;
  return { scores: Object.fromEntries(NMQ_KEYS.map(k => [k.key, d.scores[k.key]!])) as NmqBody['scores'], yesNo: { ...d.yesNo } };
}

export const isSuspected = (max: number | null | undefined) => max != null && max >= NMQ_HAZARD_THRESHOLD;
/** Same wording as @yutis/domain nmqHazardLabel, from the stored maximum. */
export const hazardLabel = (max: number | null | undefined) => (max == null ? '—' : isSuspected(max) ? `疑似有危害（${max}）` : '無明顯危害');

export type SurveyFilter = 'all' | 'pending' | 'filled' | 'hazard';
export const SURVEY_FILTERS: { value: SurveyFilter; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'pending', label: '未填寫' }, { value: 'filled', label: '已填寫' }, { value: 'hazard', label: '疑似有危害' },
];

/** Surveys by status and by a name or employee-number fragment; unfilled first, then highest score. */
export function filterSurveys(list: readonly Survey[], filter: SurveyFilter, q = ''): Survey[] {
  const needle = q.trim().toLowerCase();
  return list
    .filter(s => filter === 'all' || (filter === 'pending' ? s.status === '未填寫' : filter === 'filled' ? s.status === '已填寫' : !!s.suspectedHazard))
    .filter(s => !needle || s.name.toLowerCase().includes(needle) || s.empNo.toLowerCase().includes(needle))
    .sort((a, b) => (a.status === b.status ? (b.maxScore ?? -1) - (a.maxScore ?? -1) || a.empNo.localeCompare(b.empNo) : a.status === '未填寫' ? -1 : 1));
}

export interface DispatchTotals { batches: number; total: number; pending: number; filled: number; suspected: number; dueSoon: number; overdue: number }

/** Totals over every batch; `dueSoon` and `overdue` count batches that still have unfilled surveys. */
export function dispatchTotals(list: readonly Dispatch[], today: IsoDate, soonDays = 3): DispatchTotals {
  const soon = addDays(today, soonDays);
  const open = list.filter(d => d.total > d.filled && d.dueOn);
  return {
    batches: list.length,
    total: list.reduce((n, d) => n + d.total, 0),
    pending: list.reduce((n, d) => n + d.total - d.filled, 0),
    filled: list.reduce((n, d) => n + d.filled, 0),
    suspected: list.reduce((n, d) => n + d.suspected, 0),
    dueSoon: open.filter(d => d.dueOn! >= today && d.dueOn! <= soon).length,
    overdue: open.filter(d => d.dueOn! < today).length,
  };
}

export const defaultDispatchName = (today: IsoDate) => `肌肉骨骼症狀調查 ${today.slice(0, 7).replace('-', '/')}`;

export function addDays(d: IsoDate, n: number): IsoDate {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toIsoDate(x);
}
