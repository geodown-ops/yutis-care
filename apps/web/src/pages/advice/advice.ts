/* Pure helpers for work-arrangement advice and the 部門主管 notices (apps/api/src/programs/advice.controller.ts). */
import type { Schemas } from '@yutis/api-client';

export type Notice = Schemas['NoticeDto'];
export type WorkAdvice = Schemas['WorkAdviceDto'];
/** An active 部門主管; departmentIds are the departments in my sites they manage (may be empty). */
export type Manager = Schemas['ManagerDto'];
/** A notice already sent about an interview, with whether the manager has opened it. */
export type NoticeStatus = Schemas['NoticeStatusDto'];
/** Whether the employee has confirmed an interview's outcome. */
export type AckStatus = Schemas['AcknowledgementStatusDto'];
/** What a notice is about: a workload interview ('interviews') or a maternal interview ('maternal_interviews'). */
export type NoticeSubject = 'interviews' | 'maternal_interviews';

/** POST /api/programs/notices accepts at most this many characters of advice. */
export const NOTICE_MAX = 1000;

/** The text a manager would receive for one piece of advice: the advice and its restrictions, nothing clinical. */
export function noticeText(a: Pick<WorkAdvice, 'advice' | 'restrictions'>): string {
  const text = [a.advice.trim(), a.restrictions.length ? `工作限制：${a.restrictions.join('、')}` : ''].filter(Boolean).join('\n');
  return text.slice(0, NOTICE_MAX);
}

/** Prefill from a maternal interview, worded as GET /api/programs/work-advice words it for HR. */
export function maternalNoticeText(iv: Pick<Schemas['MaternalInterviewDto'], 'fitAdvice' | 'agreedArrangement' | 'limits'>): string {
  return noticeText({ advice: [iv.fitAdvice?.trim(), iv.agreedArrangement?.trim()].filter(Boolean).join('；'), restrictions: iv.limits });
}

/** Prefill from a workload interview's 工作區分 and 採取措施建議, worded as GET /api/programs/work-advice words it. */
export function workloadNoticeText(w: Schemas['InterviewAdviceDto'] | null): string {
  if (!w) return '';
  return noticeText({
    advice: [w.fitness, w.suggestion.trim(), w.period && `措施期間：${w.period}`].filter(Boolean).join('；'),
    restrictions: [...new Set([...w.restrictions, w.adjustHours, w.changeWork].filter(Boolean))],
  });
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

/** The employee's own department manager when exactly one manages it, otherwise nobody preselected. */
export function defaultManager(managers: readonly Manager[], departmentId: string | null | undefined): string | null {
  const mine = departmentId ? managers.filter(m => m.departmentIds.includes(departmentId)) : [];
  return mine.length === 1 ? mine[0]!.id : null;
}

/** Managers of the employee's department first, then everyone else by name. */
export function managerOptions(managers: readonly Manager[], departmentId: string | null | undefined) {
  const own = (m: Manager) => (departmentId && m.departmentIds.includes(departmentId) ? 0 : 1);
  return [...managers].sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name, 'zh-Hant'))
    .map(m => ({ value: m.id, label: own(m) === 0 ? `${m.name}（本部門主管）` : m.name }));
}

/** The row to show for a notice just sent (POST answers with the notice, the manager comes from the form). */
export const sentNoticeStatus = (n: Pick<Notice, 'id' | 'sentAt'>, manager: Pick<Manager, 'id' | 'name'>): NoticeStatus =>
  ({ id: n.id, managerUserId: manager.id, managerName: manager.name, sentAt: n.sentAt, readAt: null });

export type AckState = 'confirmed' | 'sent' | 'unsent';
/** 已確認, 已寄出待確認, or no link sent yet. */
export const ackState = (a: Pick<AckStatus, 'sentAt' | 'confirmedAt'>): AckState => (a.confirmedAt ? 'confirmed' : a.sentAt ? 'sent' : 'unsent');
/** The employee can confirm in the portal without a link, so 'unsent' is still waiting for them. */
export const ACK_LABEL: Record<AckState, string> = { confirmed: '已確認', sent: '已發連結，待確認', unsent: '待確認' };
export const ACK_TONE: Record<AckState, 'ok' | 'warn' | 'info'> = { confirmed: 'ok', sent: 'warn', unsent: 'info' };
