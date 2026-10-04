import { describe, expect, it } from 'vitest';
import {
  caseAckState, caseDraftProblem, composeArrangement, composeDetail, countByLevel, emptyHazards, hazardFindings, hazardsBody, interviewsNewestFirst,
  keyDate, latestInterview, stageOf, suggestedLevel, typeLabel, type MaternalCase, type MaternalInterview,
} from './maternal';

const iv = (id: string, interviewedOn: string, acknowledgement: MaternalInterview['acknowledgement'] = null): MaternalInterview =>
  ({ id, interviewedOn, fitAdvice: null, limits: [], agreedArrangement: null, acknowledgement, notices: [] });
const kase = (p: Partial<MaternalCase> = {}): MaternalCase =>
  ({ id: 'c', employeeId: 'e', empNo: 'E1', name: 'x', departmentId: 'd', type: '妊娠', notifiedOn: '2026-09-01', dueDate: null, birthDate: null, weeks: null, level: null, detail: null, interviews: [], ...p });

describe('maternal environment assessment', () => {
  it('suggests the level the API will store', () => {
    const h = emptyHazards();
    expect(suggestedLevel(h)).toBe('第一級管理');
    h['化學性危害'] = { v: '可能有影響', note: '' };
    expect(suggestedLevel(h)).toBe('第二級管理');
    h['物理性危害'] = { v: '有', note: '' };
    expect(suggestedLevel(h)).toBe('第三級管理');
  });

  it('sends every hazard and drops empty notes', () => {
    const h = emptyHazards();
    h['人因性危害'] = { v: '有', note: '  久站 ' };
    const body = hazardsBody(h);
    expect(Object.keys(body)).toHaveLength(6);
    expect(body['人因性危害']).toEqual({ v: '有', note: '久站' });
    expect(body['其他']).toEqual({ v: '無' });
  });

  it('reads findings from stored hazards of any shape', () => {
    expect(hazardFindings({ 物理性危害: { v: '有', note: '噪音' }, 其他: { v: '無' }, 化學性危害: { v: '可能有影響' } }))
      .toEqual([{ name: '物理性危害', v: '有', note: '噪音' }, { name: '化學性危害', v: '可能有影響', note: '' }]);
    expect(hazardFindings(null)).toEqual([]);
    expect(hazardFindings({ 壞資料: 3 })).toEqual([]);
  });

  it('counts areas per level', () => {
    expect(countByLevel([{ level: '第三級管理' }, { level: '第三級管理' }, { level: '第一級管理' }]))
      .toEqual({ 第一級管理: 1, 第二級管理: 0, 第三級管理: 2 });
  });
});

describe('maternal cases', () => {
  it('lists the newest interview first and takes the latest from the end of the API list', () => {
    const c = kase({ interviews: [iv('a', '2026-09-01'), iv('b', '2026-09-20')] });
    expect(interviewsNewestFirst(c).map(i => i.id)).toEqual(['b', 'a']);
    expect(latestInterview(c)?.id).toBe('b');
    expect(c.interviews.map(i => i.id)).toEqual(['a', 'b']);
    expect(latestInterview(kase())).toBeUndefined();
  });

  it('reads the latest interview\'s confirmation for the list', () => {
    expect(caseAckState(kase())).toBe('no-interview');
    expect(caseAckState(kase({ interviews: [iv('a', '2026-09-01')] }))).toBe('unsent');
    const sent = { id: 'k', sentAt: '2026-09-02T00:00:00Z', confirmedAt: null, comment: null };
    expect(caseAckState(kase({ interviews: [iv('a', '2026-09-01', sent)] }))).toBe('sent');
    expect(caseAckState(kase({ interviews: [iv('a', '2026-09-01', { ...sent, confirmedAt: '2026-09-03T00:00:00Z' }), iv('b', '2026-09-20', sent)] }))).toBe('sent');
  });

  it('labels the year after birth and notices a pregnancy past its due date', () => {
    expect(typeLabel('產後')).toBe('產後一年內');
    expect(typeLabel('妊娠')).toBe('妊娠');
    expect(stageOf({ type: '妊娠', dueDate: '2026-10-04' }, '2026-10-04')).toBe('妊娠中');
    expect(stageOf({ type: '妊娠', dueDate: '2026-10-03' }, '2026-10-04')).toBe('已過預產期');
    expect(stageOf({ type: '妊娠', dueDate: null }, '2026-10-04')).toBe('妊娠中');
    expect(stageOf({ type: '產後', dueDate: null }, '2026-10-04')).toBe('產後一年內');
  });

  it('shows the due date of a pregnancy and the birth date after birth', () => {
    expect(keyDate(kase({ dueDate: '2027-01-10', birthDate: '2026-08-01' }))).toEqual({ label: '預產期', date: '2027-01-10' });
    expect(keyDate(kase({ type: '產後', dueDate: '2026-08-05', birthDate: '2026-08-01' }))).toEqual({ label: '分娩日期', date: '2026-08-01' });
    expect(keyDate(kase({ type: '產後' }))).toEqual({ label: '分娩日期', date: null });
  });

  it('composes the detail and the agreed arrangement', () => {
    expect(composeDetail([], ' ')).toBeNull();
    expect(composeDetail(['水腫', '下背痛'], '午後改善')).toBe('自述症狀：水腫、下背痛\n午後改善');
    expect(composeArrangement(['調整職務'], '')).toBe('調整職務');
    expect(composeArrangement(['調整職務', '其他'], '產檢日彈性請假')).toBe('調整職務、其他；產檢日彈性請假');
    expect(composeArrangement([], '')).toBe('');
  });

  it('checks a new notification before sending', () => {
    const ok = { employeeId: 'e1', type: '妊娠' as const, notifiedOn: '2026-10-01', dueDate: '2027-03-01', birthDate: '' };
    expect(caseDraftProblem(ok, '2026-10-04')).toBeNull();
    expect(caseDraftProblem({ ...ok, employeeId: null }, '2026-10-04')).toBe('請選擇員工。');
    expect(caseDraftProblem({ ...ok, dueDate: '' }, '2026-10-04')).toBe('妊娠通報請填寫預產期。');
    expect(caseDraftProblem({ ...ok, type: '產後' }, '2026-10-04')).toBe('產後通報請填寫分娩日期。');
    expect(caseDraftProblem({ ...ok, type: '產後', birthDate: '2026-10-05' }, '2026-10-04')).toBe('分娩日期不能晚於今天。');
    expect(caseDraftProblem({ ...ok, notifiedOn: '2026-10-05' }, '2026-10-04')).toBe('通報日期不能晚於今天。');
  });
});
