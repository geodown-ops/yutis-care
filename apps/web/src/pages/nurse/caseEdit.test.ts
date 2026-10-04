import { describe, expect, it } from 'vitest';
import { caseChange, caseForm } from './caseEdit';

const C = { id: 'c', status: '起單' as const, leadUserId: 'u1', leadName: '王護理師', openedOn: '2026-09-01', noticeOn: '2026-09-02', plannedOn: null, repliedOn: null, agreed: null, closedOn: null };

describe('case edit', () => {
  it('sends nothing when nothing changed', () => {
    expect(caseChange(C, caseForm(C))).toEqual({});
  });

  it('sends changed dates, lead and reply, clearing emptied dates', () => {
    const f = { ...caseForm(C), leadUserId: 'u2', noticeOn: '', plannedOn: '2026-10-10', reply: 'no' as const };
    expect(caseChange(C, f)).toEqual({ leadUserId: 'u2', noticeOn: null, plannedOn: '2026-10-10', agreed: false });
  });

  it('keeps the note only with a status change', () => {
    expect(caseChange(C, { ...caseForm(C), note: '已電話聯絡' })).toEqual({});
    expect(caseChange(C, { ...caseForm(C), status: '結案', note: ' 已改善 ' })).toEqual({ status: '結案', note: '已改善' });
  });
});
