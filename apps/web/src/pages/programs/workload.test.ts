import { cbiScores, cvdScore, evaluateWorkload, loadEval } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import {
  batchLog, burnoutLabel, canSchedule, cbiResult, emptyCbi, filterAssessments, hasMeasures, interviewBody, interviewDraft, interviewProblems, interviewRows,
  missingSteps, noRiskReason, openAssessmentEmployees, readEvaluation, workloadCounts, workloadView, type Assessment, type Interview,
} from './workload';

const iv = (p: Partial<Interview>): Interview => ({ status: '已面談', interviewedOn: '2026-09-20', doctorUserId: null, workAdvice: null, notes: null, nextOn: null, ...p });
const a = (p: Partial<Assessment>): Assessment => ({
  id: 'x', employeeId: 'e', empNo: 'E1', name: '王小明', sentOn: '2026-09-06', personalBurnout: null, workBurnout: null, overtime1m: null, overtime6mAvg: null,
  workPatterns: [], evaluation: null, riskLevel: null, interview: null, ...p,
});

describe('who sees what', () => {
  const CLINICAL = { features: ['programs'] as const, dataCategories: ['identity', 'work', 'health', 'medical'] as const };
  const WORK = { features: ['programs'] as const, dataCategories: ['identity', 'work'] as const };
  const as = (role: '職護' | '職醫' | '職安衛人員' | '人資' | '部門主管', x: typeof CLINICAL | typeof WORK) => ({ role, features: [...x.features], dataCategories: [...x.dataCategories] });

  it('follows the controllers: clinical staff run it, HR reads advice, managers read their notices', () => {
    expect(workloadView(as('職護', CLINICAL))).toBe('clinical');
    expect(workloadView(as('職醫', CLINICAL))).toBe('clinical');
    expect(workloadView(as('人資', WORK))).toBe('advice');
    expect(workloadView(as('部門主管', WORK))).toBe('notices');
    expect(workloadView(as('職安衛人員', WORK))).toBe('none');
  });
});

describe('evaluation snapshot', () => {
  const report = { date: '2026-09-02', values: { LDL: 165, HDL: 36, SBP: 168, DBP: 112, GLU: 108 }, smoker: true };
  const cvd = cvdScore({ sex: '男', birth: '1974-05-01', report });
  const load = loadEval({ pf: 66.7, wf: 71.4, m1: 62, avg6: 58, patterns: ['a', 'b', 'c', 'd'] });

  it('reads a complete evaluation from @yutis/domain', () => {
    const ev = readEvaluation({ evaluation: JSON.parse(JSON.stringify(evaluateWorkload(cvd, load))) })!;
    expect(ev.complete).toBe(true);
    expect(ev.riskLevel).toBe(2);
    expect(ev.advice).toBe('需面談');
    expect(ev.cvd?.band).toBe(cvd.band);
    expect(ev.load?.level).toBe(2);
  });

  it('keeps the parts it has when the health check is missing', () => {
    const ev = readEvaluation({ evaluation: JSON.parse(JSON.stringify(evaluateWorkload(null, load))) })!;
    expect(ev.complete).toBe(false);
    expect(ev.cvd).toBeNull();
    expect(ev.load?.level).toBe(2);
  });

  it('ignores missing or unreadable snapshots', () => {
    expect(readEvaluation({ evaluation: null })).toBeNull();
    expect(readEvaluation({ evaluation: { complete: true, cvd: { risk: 'x' }, load: { level: 7 } } })).toEqual(expect.objectContaining({ complete: false, cvd: null, load: null }));
  });
});

describe('lists', () => {
  const list = [
    a({ id: 'low', empNo: 'E1', name: '吳俊傑', personalBurnout: 30, overtime1m: 10, riskLevel: 0 }),
    a({ id: 'high', empNo: 'E2', name: '林志豪', personalBurnout: 70, overtime1m: 62, riskLevel: 2, interview: iv({ workAdvice: { fitness: '工作限制', restrictions: ['縮短工時'], suggestion: '' } }) }),
    a({ id: 'mid', empNo: 'E3', name: '蔡明宏', personalBurnout: 55, overtime1m: 50, riskLevel: 1 }),
    a({ id: 'new', empNo: 'E4', name: '林小美', employeeId: 'e4', sentOn: '2026-10-04' }),
  ];

  it('names the questionnaires still open', () => {
    expect(missingSteps(list[3]!)).toEqual(['過勞量表', '過負荷評估']);
    expect(missingSteps(a({ personalBurnout: 40 }))).toEqual(['過負荷評估']);
    expect(missingSteps(list[0]!)).toEqual([]);
  });

  it('says why there is no risk level', () => {
    expect(noRiskReason(list[3]!)).toBe('問卷未完成');
    expect(noRiskReason(a({ personalBurnout: 40, overtime1m: 10 }))).toBe('無法判定');
  });

  it('sorts newest batch first, then highest risk, and filters', () => {
    expect(filterAssessments(list, {}).map(x => x.id)).toEqual(['new', 'high', 'mid', 'low']);
    expect(filterAssessments(list, { risk: 'incomplete' }).map(x => x.id)).toEqual(['new']);
    expect(filterAssessments(list, { risk: '1' }).map(x => x.id)).toEqual(['mid']);
    expect(filterAssessments(list, { batch: '2026-09-06', q: '林' }).map(x => x.id)).toEqual(['high']);
  });

  it('lists interviews: open ones first, and only those at elevated risk or with a record', () => {
    expect(interviewRows(list, 'all').map(x => x.id)).toEqual(['mid', 'high']);
    expect(interviewRows(list, 'open').map(x => x.id)).toEqual(['mid']);
    expect(interviewRows(list, 'done').map(x => x.id)).toEqual(['high']);
  });

  it('only schedules people without an interview record', () => {
    expect(list.filter(canSchedule).map(x => x.id)).toEqual(['mid']);
  });

  it('counts the overview tiles', () => {
    expect(workloadCounts(list)).toEqual({ total: 4, incomplete: 1, high: 1, mid: 1, low: 1, toInterview: 1 });
  });

  it('blocks a second assessment while one is still open', () => {
    expect([...openAssessmentEmployees(list)]).toEqual(['e4']);
  });

  it('summarises each sending date for the execution log', () => {
    expect(batchLog(list)).toEqual([
      { sentOn: '2026-10-04', sent: 1, done: 0, high: 0, mid: 0, low: 0, interviewed: 0, measures: 0 },
      { sentOn: '2026-09-06', sent: 3, done: 3, high: 1, mid: 1, low: 1, interviewed: 1, measures: 1 },
    ]);
  });

  it('counts advice with restrictions or leave as measures', () => {
    expect(hasMeasures(null)).toBe(false);
    expect(hasMeasures(iv({ workAdvice: { fitness: '一般工作', restrictions: [], suggestion: '' } }))).toBe(false);
    expect(hasMeasures(iv({ workAdvice: { fitness: '需休假', restrictions: [], suggestion: '' } }))).toBe(true);
    expect(hasMeasures(iv({ workAdvice: { fitness: '一般工作', restrictions: ['限制加班'], suggestion: '' } }))).toBe(true);
  });
});

describe('CBI', () => {
  it('scores only a complete sheet, the same way as @yutis/domain', () => {
    const d = emptyCbi();
    expect(cbiResult(d)).toBeNull();
    d.p = d.p.map(() => 1);
    d.w = d.w.map(() => 2);
    expect(cbiResult(d)).toEqual(cbiScores({ p: d.p as number[], w: d.w as number[] }));
  });

  it('words burnout with the load thresholds', () => {
    expect(burnoutLabel('personal', 70)).toBe('中度');
    expect(burnoutLabel('personal', 70.1)).toBe('嚴重');
    expect(burnoutLabel('work', 45)).toBe('中度');
    expect(burnoutLabel('work', 44.9)).toBe('輕微');
  });
});

describe('interview form', () => {
  it('starts from the saved interview but never from its notes', () => {
    const d = interviewDraft(iv({ status: '已安排', interviewedOn: '2026-10-10', workAdvice: { fitness: '工作限制', restrictions: ['縮短工時'], suggestion: '3 個月' }, notes: 'secret' }), { today: '2026-10-04', doctorUserId: null });
    expect(d).toEqual(expect.objectContaining({ status: '已安排', interviewedOn: '2026-10-10', fitness: '工作限制', restrictions: ['縮短工時'], suggestion: '3 個月', notes: '' }));
    expect(interviewDraft(null, { today: '2026-10-04', doctorUserId: 'me' })).toEqual(expect.objectContaining({ status: '已面談', interviewedOn: '2026-10-04', doctorUserId: 'me' }));
  });

  it('asks for the date and, once held, the work fitness', () => {
    const d = interviewDraft(null, { today: '2026-10-04', doctorUserId: null });
    expect(interviewProblems(d)).toEqual(['請選擇工作區分']);
    expect(interviewProblems({ ...d, status: '已安排', interviewedOn: '' })).toEqual(['請填預定面談日期']);
    expect(interviewProblems({ ...d, fitness: '一般工作', nextOn: '2026-10-01' })).toEqual(['下次面談日期不能早於面談日期']);
    expect(interviewProblems({ ...d, status: '拒絕面談', interviewedOn: '' })).toEqual([]);
  });

  it('sends every field, with empty advice and text as null', () => {
    const d = interviewDraft(null, { today: '2026-10-04', doctorUserId: null });
    expect(interviewBody({ ...d, status: '拒絕面談', interviewedOn: '' })).toEqual({ status: '拒絕面談', interviewedOn: null, doctorUserId: null, workAdvice: null, notes: null, nextOn: null });
    expect(interviewBody({ ...d, fitness: '工作限制', restrictions: [' 縮短工時 ', ''], suggestion: ' 期間 3 個月 ', notes: ' 疲勞中度 ', nextOn: '2026-11-01' })).toEqual({
      status: '已面談', interviewedOn: '2026-10-04', doctorUserId: null,
      workAdvice: { fitness: '工作限制', restrictions: ['縮短工時'], suggestion: '期間 3 個月' }, notes: '疲勞中度', nextOn: '2026-11-01',
    });
  });
});
