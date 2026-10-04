/* Pure helpers for editing a case (個案服務單): the form and the PATCH /api/cases/{id} body of what changed. */
import type { CaseStatus } from '@yutis/domain';
import type { CaseMove, EmployeeCase } from '../../cases';

type Case = NonNullable<EmployeeCase['case']>;
export type Reply = 'none' | 'yes' | 'no';

export interface CaseForm {
  status: CaseStatus;
  leadUserId: string;
  noticeOn: string;
  plannedOn: string;
  repliedOn: string;
  reply: Reply;
  note: string;
}

export interface CaseChange {
  status?: CaseMove;
  leadUserId?: string;
  noticeOn?: string | null;
  plannedOn?: string | null;
  repliedOn?: string | null;
  agreed?: boolean | null;
  note?: string;
}

const replyOf = (agreed: boolean | null): Reply => (agreed == null ? 'none' : agreed ? 'yes' : 'no');
const agreedOf = (r: Reply) => (r === 'none' ? null : r === 'yes');

export const caseForm = (c: Case): CaseForm => ({
  status: c.status, leadUserId: c.leadUserId ?? '', noticeOn: c.noticeOn ?? '', plannedOn: c.plannedOn ?? '', repliedOn: c.repliedOn ?? '',
  reply: replyOf(c.agreed), note: '',
});

/** Only the fields that changed; the note goes with a status change (it is kept in the status history). */
export function caseChange(c: Case, f: CaseForm): CaseChange {
  const out: CaseChange = {};
  const moved = f.status !== c.status && (f.status === '處理中' || f.status === '結案');
  if (moved) out.status = f.status as CaseMove;
  if (f.leadUserId && f.leadUserId !== c.leadUserId) out.leadUserId = f.leadUserId;
  for (const k of ['noticeOn', 'plannedOn', 'repliedOn'] as const) if ((f[k] || null) !== c[k]) out[k] = f[k] || null;
  if (agreedOf(f.reply) !== c.agreed) out.agreed = agreedOf(f.reply);
  if (moved && f.note.trim()) out.note = f.note.trim();
  return out;
}
