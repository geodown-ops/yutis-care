import { describe, expect, it } from 'vitest';
import type { EmployeeCase } from '../../cases';
import { caseContext, caseFollowOn, consultTypesFor, followOnLabel, newRecordForm, recordBody, recordProblems, recordToForm, toOccurredAt, withPhrase, type CareRecord } from './records';

const ev = (type: EmployeeCase['events'][number]['type'], status: EmployeeCase['status']) => ({ id: type, type, occurredOn: '2026-09-01', description: '', status });
const kase = (status: EmployeeCase['status'] | null, events: EmployeeCase['events']): Pick<EmployeeCase, 'case' | 'events'> => ({
  case: status ? { id: 'c1', status, leadUserId: 'u1', leadName: '王護理師', openedOn: '2026-09-01', noticeOn: null, plannedOn: null, repliedOn: null, agreed: null, closedOn: null } : null,
  events,
});

describe('assistance record form', () => {
  it('preselects the consultation types of events that are not closed', () => {
    expect(consultTypesFor([ev('wl', '處理中'), ev('hc', '未開單'), ev('er', '結案')]))
      .toEqual(['健康檢查／體格檢查報告異常', '異常工作負荷促發疾病預防計畫']);
  });

  it('starts a new record now, written by me, to follow up in two weeks', () => {
    const f = newRecordForm({ now: new Date(2026, 9, 4, 9, 5), meId: 'me', events: [ev('age', '起單')] });
    expect(f).toMatchObject({ date: '2026-10-04', time: '09:05', result: '追蹤', followUpOn: '2026-10-18', followUpUserId: 'me', helpers: [{ userId: 'me', minutes: 20 }] });
    expect(f.consultTypes).toEqual(['未滿 18 歲及中高齡員工']);
  });

  it('round-trips a record through local date and time', () => {
    const at = toOccurredAt('2026-10-04', '14:30');
    expect(new Date(at).getHours()).toBe(14);
    const r: CareRecord = {
      id: 'r', employeeId: 'e', category: '電話關懷', occurredAt: at, consultTypes: [], lifestyleAdvice: ['減重'], content: null,
      helpers: [{ userId: 'u2', minutes: 10 }], result: '結案', followUpOn: null, followUpUserId: null, followUpDone: false, draft: true,
    };
    expect(recordToForm(r, 'me')).toMatchObject({ date: '2026-10-04', time: '14:30', explain: '', followUpOn: '', followUpUserId: 'me', lifestyleAdvice: ['減重'] });
  });

  it('checks a final record fully and a draft lightly', () => {
    const f = { ...newRecordForm({ now: new Date(2026, 9, 4, 9, 0), meId: 'me' }), followUpOn: '' as const };
    expect(recordProblems(f, true)).toEqual([]);
    expect(recordProblems(f, false)).toEqual(['請至少勾選一項諮詢類型', '選擇「追蹤」時，請填寫下次追蹤日期']);
    expect(recordProblems({ ...f, consultTypes: ['人因性危害預防計畫'], followUpOn: '2026-10-01' }, false)).toEqual(['下次追蹤日期不能早於發生日期']);
    expect(recordProblems({ ...f, consultTypes: ['人因性危害預防計畫'], result: '結案' }, false)).toEqual([]);
    expect(recordProblems({ ...f, helpers: [{ userId: 'me', minutes: -1 }] }, true)).toEqual(['費時請填 0–1440 分鐘']);
  });

  it('drops the follow-up from a closed record', () => {
    const f = newRecordForm({ now: new Date(2026, 9, 4, 9, 0), meId: 'me' });
    expect(recordBody(f, false)).toMatchObject({ result: '追蹤', followUpOn: '2026-10-18', followUpUserId: 'me', draft: false });
    expect(recordBody({ ...f, result: '結案' }, true)).toMatchObject({ result: '結案', followUpOn: null, followUpUserId: null, draft: true });
  });

  it('appends phrases on their own line', () => {
    expect(withPhrase('', '多喝水')).toBe('多喝水');
    expect(withPhrase('已說明\n\n', '多喝水')).toBe('已說明\n多喝水');
  });
});

describe('case steps after a saved record', () => {
  it('opens new events and starts work on a follow-up record', () => {
    const s = caseFollowOn(kase(null, [ev('hc', '未開單')]), '追蹤');
    expect(s).toEqual({ open: true, merge: false, to: '處理中' });
    expect(followOnLabel(s!)).toBe('同時開單（主責為我），個案改為處理中');
  });

  it('closes a running case on a closing record', () => {
    expect(caseFollowOn(kase('處理中', [ev('hc', '處理中')]), '結案')).toEqual({ open: false, merge: false, to: '結案' });
    expect(caseFollowOn(kase('起單', [ev('hc', '起單')]), '結案')).toEqual({ open: false, merge: false, to: '結案' });
  });

  it('adds new events to a running case', () => {
    const s = caseFollowOn(kase('處理中', [ev('hc', '處理中'), ev('er', '未開單')]), '追蹤');
    expect(s).toEqual({ open: true, merge: true, to: null });
    expect(followOnLabel(s!)).toBe('同時把新的異常事件併入個案');
  });

  it('describes the case above the form', () => {
    expect(caseContext(kase('處理中', [ev('hc', '處理中')]))).toBe('個案狀態：處理中 · 2026/09/01 開單');
    expect(caseContext(kase('起單', [ev('hc', '起單'), ev('er', '未開單')]))).toBe('個案狀態：起單 · 2026/09/01 開單 · 有新的異常事件尚未併入');
    expect(caseContext(kase(null, [ev('hc', '未開單')]))).toBe('有異常事件尚未開單');
    expect(caseContext({ ...kase('結案', [ev('hc', '結案')]), case: { ...kase('結案', []).case!, closedOn: '2026-10-04' } })).toBe('個案已結案（2026/10/04）');
    expect(caseContext(kase(null, []))).toBe('此員工目前沒有異常事件');
  });

  it('does nothing without events or once the case is closed', () => {
    expect(caseFollowOn(kase(null, []), '追蹤')).toBeNull();
    expect(caseFollowOn(kase('結案', [ev('hc', '結案')]), '結案')).toBeNull();
    expect(caseFollowOn(kase('處理中', [ev('hc', '處理中')]), '追蹤')).toBeNull();
  });
});
