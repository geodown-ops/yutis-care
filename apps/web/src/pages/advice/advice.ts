/* Pure helpers for work-arrangement advice and the 部門主管 notices (apps/api/src/programs/advice.controller.ts). */
import type { Schemas } from '@yutis/api-client';

export type Notice = Schemas['NoticeDto'];
export type WorkAdvice = Schemas['WorkAdviceDto'];

/** POST /api/programs/notices accepts at most this many characters of advice. */
export const NOTICE_MAX = 1000;

/** The text a manager would receive for one piece of advice: the advice and its restrictions, nothing clinical. */
export function noticeText(a: Pick<WorkAdvice, 'advice' | 'restrictions'>): string {
  const text = [a.advice.trim(), a.restrictions.length ? `工作限制：${a.restrictions.join('、')}` : ''].filter(Boolean).join('\n');
  return text.slice(0, NOTICE_MAX);
}

/**
 * GET /api/programs/notices marks everything read as it answers, returning the state from before the read: a notice
 * without readAt in that answer is one the manager is seeing for the first time.
 */
export const isNew = (n: Pick<Notice, 'readAt'>) => n.readAt == null;

/** Newest first; the API already sorts this way, kept here so the page does not depend on it. */
export const byNewest = (a: Pick<Notice, 'sentAt'>, b: Pick<Notice, 'sentAt'>) => b.sentAt.localeCompare(a.sentAt);

/** Latest advice first, undated last. */
export const adviceByDate = (a: Pick<WorkAdvice, 'on'>, b: Pick<WorkAdvice, 'on'>) => (b.on ?? '').localeCompare(a.on ?? '');

/*
 * Local shapes for API PR #15 (not in the generated client yet): GET /api/programs/managers and the interviews that
 * GET /api/programs/maternal/cases will carry. Replace with Schemas[...] once the client is regenerated.
 */
/** An active 部門主管; departmentIds are the departments in my sites they manage (may be empty). */
export interface ManagerOption { id: string; name: string; departmentIds: string[] }
/** The interview a notice is about: its id is the notice's subjectId; the rest prefills the advice. */
export interface NoticeInterview {
  id: string; interviewedOn?: string | null; fitAdvice?: string | null; limits?: readonly string[]; agreedArrangement?: string | null;
}

/** The employee's own department manager when exactly one manages it, otherwise nobody preselected. */
export function defaultManager(managers: readonly ManagerOption[], departmentId: string | null | undefined): string | null {
  const mine = departmentId ? managers.filter(m => m.departmentIds.includes(departmentId)) : [];
  return mine.length === 1 ? mine[0]!.id : null;
}

/** Managers of the employee's department first, then everyone else by name. */
export function managerOptions(managers: readonly ManagerOption[], departmentId: string | null | undefined) {
  const own = (m: ManagerOption) => (departmentId && m.departmentIds.includes(departmentId) ? 0 : 1);
  return [...managers].sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name, 'zh-Hant'))
    .map(m => ({ value: m.id, label: own(m) === 0 ? `${m.name}（本部門主管）` : m.name }));
}

/** Prefilled notice text from an interview: the fitness advice, the agreed arrangement and the restrictions. */
export function interviewNoticeText(iv: NoticeInterview): string {
  return noticeText({ advice: [iv.fitAdvice?.trim(), iv.agreedArrangement?.trim()].filter(Boolean).join('；'), restrictions: [...(iv.limits ?? [])] });
}
