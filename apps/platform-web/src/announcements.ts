/* System announcements: where each one is in its life, and the form ↔ API conversion. */
import type { Announcement, AnnouncementKind } from './api';
import { fromLocalInput, toLocalInput } from './format';
import { textProblem, withoutEmpty, type Problems } from './forms';
import type { Label } from './labels';

export type AnnouncementPhase = 'scheduled' | 'live' | 'expired';

export const ANNOUNCEMENT_PHASE: Record<AnnouncementPhase, Label> = {
  scheduled: { label: '排程中', tone: 'info' },
  live: { label: '公告中', tone: 'ok' },
  expired: { label: '已下架', tone: 'neutral' },
};

export function announcementPhase(a: Pick<Announcement, 'publishAt' | 'expiresAt'>, now = new Date()): AnnouncementPhase {
  if (a.expiresAt && Date.parse(a.expiresAt) <= now.getTime()) return 'expired';
  return Date.parse(a.publishAt) > now.getTime() ? 'scheduled' : 'live';
}

/** The announcement form; times are `datetime-local` values in Taiwan time. */
export interface AnnouncementForm {
  /** '' means every tenant. */
  tenantId: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  publishAt: string;
  /** '' means it stays up. */
  expiresAt: string;
}

export const emptyAnnouncementForm = (now = new Date()): AnnouncementForm => ({
  tenantId: '', kind: 'notice', title: '', body: '', publishAt: toLocalInput(now.toISOString()), expiresAt: '',
});

export const announcementToForm = (a: Announcement): AnnouncementForm => ({
  tenantId: a.tenantId ?? '', kind: a.kind, title: a.title, body: a.body,
  publishAt: toLocalInput(a.publishAt), expiresAt: a.expiresAt ? toLocalInput(a.expiresAt) : '',
});

/** Body for POST and PATCH /platform-api/announcements (PATCH takes the same fields). */
export const announcementBody = (f: AnnouncementForm) => ({
  tenantId: f.tenantId || null,
  kind: f.kind,
  title: f.title.trim(),
  body: f.body.trim(),
  publishAt: fromLocalInput(f.publishAt),
  expiresAt: f.expiresAt ? fromLocalInput(f.expiresAt) : null,
});

/** Field problems in plain Chinese, matching the API's limits (title 200, body 5000). */
export const announcementProblems = (f: AnnouncementForm): Problems<AnnouncementForm> => withoutEmpty({
  title: textProblem(f.title, '標題', 200),
  body: textProblem(f.body, '內容', 5000),
  publishAt: f.publishAt ? undefined : '請選擇發布時間',
  expiresAt: f.expiresAt && f.publishAt && f.expiresAt <= f.publishAt ? '下架時間要晚於發布時間' : undefined,
});
