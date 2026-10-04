import { describe, expect, it } from 'vitest';
import {
  caseDraftProblem, composeArrangement, composeDetail, countByLevel, emptyHazards, hazardFindings, hazardsBody, interviewsByCase,
  suggestedLevel, typeLabel, type MaternalCase, type WorkAdvice,
} from './maternal';

const kase = (id: string, employeeId: string, notifiedOn: string): MaternalCase =>
  ({ id, employeeId, name: 'x', type: '妊娠', notifiedOn, dueDate: null, weeks: null, level: null, detail: null });
const advice = (employeeId: string, on: string | null, programme: WorkAdvice['programme'] = '母性健康保護'): WorkAdvice =>
  ({ employeeId, empNo: 'E1', name: 'x', programme, on, advice: '', restrictions: [] });

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
  it('attributes interviews to the case they followed', () => {
    const cases = [kase('a', 'e1', '2025-01-10'), kase('b', 'e1', '2025-11-01'), kase('c', 'e2', '2025-03-01')];
    const rows = [advice('e1', '2025-02-01'), advice('e1', '2025-11-05'), advice('e1', '2025-01-01'), advice('e2', '2025-03-02'),
      advice('e2', '2025-04-01', '異常工作負荷'), advice('e2', null)];
    const by = interviewsByCase(cases, rows);
    expect(by.get('a')!.map(a => a.on)).toEqual(['2025-02-01']);
    expect(by.get('b')!.map(a => a.on)).toEqual(['2025-11-05']);
    expect(by.get('c')!.map(a => a.on)).toEqual(['2025-03-02']);
  });

  it('lists the newest interview first', () => {
    const by = interviewsByCase([kase('a', 'e1', '2025-01-01')], [advice('e1', '2025-02-01'), advice('e1', '2025-03-01')]);
    expect(by.get('a')!.map(a => a.on)).toEqual(['2025-03-01', '2025-02-01']);
  });

  it('labels postpartum cases the same whichever way they were stored', () => {
    expect(typeLabel('產後')).toBe('產後一年內');
    expect(typeLabel('產後一年內')).toBe('產後一年內');
    expect(typeLabel('妊娠')).toBe('妊娠');
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
