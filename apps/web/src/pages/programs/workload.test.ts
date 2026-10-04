import { cbiScores, cvdScore, evaluateWorkload, loadEval } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import { csvText } from './lists';
import {
  adviceSummary, ASSESS_COLUMNS, batchLog, burnoutLabel, canSchedule, cbiDraftFrom, cbiResult, emptyCbi, filterAssessments, hasMeasures, interviewBody, interviewDraft,
  interviewProblems, interviewRows, missingSteps, noRiskReason, openAssessmentEmployees, readEvaluation, remindable, workloadCounts, workloadView,
  type Assessment, type Interview, type InterviewAdvice,
} from './workload';

const advice = (p: Partial<InterviewAdvice>): InterviewAdvice => ({ fitness: '一般工作', restrictions: [], suggestion: '', adjustHours: '', changeWork: '', period: '', ...p });
const iv = (p: Partial<Interview>): Interview => ({
  id: 'iv', status: '已面談', interviewedOn: '2026-09-20', doctorUserId: null, doctorName: null, workAdvice: null, guidance: null, notes: null, nextOn: null,
  acknowledgement: null, notices: [], ...p,
});
/** Questionnaires count as missing until their answers are in, as the API reports them. */
const a = (p: Partial<Assessment>): Assessment => {
  const row: Assessment = {
    id: 'x', employeeId: 'e', empNo: 'E1', name: '王小明', site: '桃園廠', department: '製造一課', sentOn: '2026-09-06', cbiAnswers: null, personalBurnout: null,
    workBurnout: null, fatigueAt: null, fatigueBy: null, overloadAt: null, reminders: 0, lastRemindedAt: null, overtime1m: null, overtime6mAvg: null,
    workPatterns: [], evaluation: null, riskLevel: null, missing: [], interview: null, ...p,
  };
  return { ...row, missing: p.missing ?? [...(row.personalBurnout == null ? ['cbi' as const] : []), ...(row.overtime1m == null ? ['overload' as const] : [])] };
};

describe('who sees what', () => {
  const CLINICAL = { features: ['programs'] as const, dataCategories: ['identity', 'work', 'health', 'medical'] as const };
  const WORK = { features: ['programs'] as const, dataCategories: ['identity', 'work'] as const };
  const as = (role: '職護' | '職醫' | '職安衛人員' | '人資' | '部門主管', x: typeof CLINICAL | typeof WORK) => ({ role, features: [...x.features], dataCategories: [...x.dataCategories] });

  it('follows the controllers: clinical staff run it, HR reads advice, managers read notices elsewhere', () => {
    expect(workloadView(as('職護', CLINICAL))).toBe('clinical');
    expect(workloadView(as('職醫', CLINICAL))).toBe('clinical');
    expect(workloadView(as('人資', WORK))).toBe('advice');
    expect(workloadView(as('部門主管', WORK))).toBe('none');
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
    a({ id: 'high', empNo: 'E2', name: '林志豪', personalBurnout: 70, overtime1m: 62, riskLevel: 2, interview: iv({ workAdvice: advice({ fitness: '工作限制', restrictions: ['縮短工時'] }) }) }),
    a({ id: 'mid', empNo: 'E3', name: '蔡明宏', personalBurnout: 55, overtime1m: 50, riskLevel: 1, site: '新竹廠', department: '品保課' }),
    a({ id: 'new', empNo: 'E4', name: '林小美', employeeId: 'e4', sentOn: '2026-10-04' }),
  ];

  it('names the questionnaires still open, from what the API says is missing', () => {
    expect(missingSteps(list[3]!)).toEqual(['過勞量表', '過負荷評估']);
    expect(missingSteps(a({ personalBurnout: 40 }))).toEqual(['過負荷評估']);
    expect(missingSteps(list[0]!)).toEqual([]);
    expect(missingSteps(a({ missing: ['exam'] }))).toEqual([]);
  });

  it('only reminds people with a questionnaire open', () => {
    expect(list.filter(remindable).map(x => x.id)).toEqual(['new']);
    expect(remindable(a({ missing: ['exam'] }))).toBe(false);
  });

  it('says why there is no risk level', () => {
    expect(noRiskReason(list[3]!)).toBe('問卷未完成');
    expect(noRiskReason(a({ missing: ['exam'] }))).toBe('缺健檢資料');
    expect(noRiskReason(a({ personalBurnout: 40, overtime1m: 10 }))).toBe('無法判定');
  });

  it('sorts newest batch first, then highest risk, and filters', () => {
    expect(filterAssessments(list, {}).map(x => x.id)).toEqual(['new', 'high', 'mid', 'low']);
    expect(filterAssessments(list, { risk: 'incomplete' }).map(x => x.id)).toEqual(['new']);
    expect(filterAssessments(list, { risk: '1' }).map(x => x.id)).toEqual(['mid']);
    expect(filterAssessments(list, { batch: '2026-09-06', q: '林' }).map(x => x.id)).toEqual(['high']);
    expect(filterAssessments(list, { org: { site: '新竹廠', department: null } }).map(x => x.id)).toEqual(['mid']);
    expect(filterAssessments(list, { org: { site: '桃園廠', department: '製造一課' } }).map(x => x.id)).toEqual(['new', 'high', 'low']);
  });

  it('lists interviews: open ones first, and only those at elevated risk or with a record', () => {
    expect(interviewRows(list, 'all').map(x => x.id)).toEqual(['mid', 'high']);
    expect(interviewRows(list, 'open').map(x => x.id)).toEqual(['mid']);
    expect(interviewRows(list, 'done').map(x => x.id)).toEqual(['high']);
    expect(interviewRows(list, 'all', '', { site: '桃園廠', department: null }).map(x => x.id)).toEqual(['high']);
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

  it('counts advice with restrictions, changed hours or work, or leave as measures', () => {
    expect(hasMeasures(null)).toBe(false);
    expect(hasMeasures(iv({ workAdvice: advice({ suggestion: '多休息' }) }))).toBe(false);
    expect(hasMeasures(iv({ workAdvice: advice({ fitness: '需休假' }) }))).toBe(true);
    expect(hasMeasures(iv({ workAdvice: advice({ restrictions: ['限制加班'] }) }))).toBe(true);
    expect(hasMeasures(iv({ workAdvice: advice({ adjustHours: '縮短工時' }) }))).toBe(true);
    expect(hasMeasures(iv({ workAdvice: advice({ changeWork: '調整為常日班' }) }))).toBe(true);
  });

  it('sums up the work arrangement for the list', () => {
    expect(adviceSummary(null)).toBeNull();
    expect(adviceSummary(advice({ fitness: '工作限制', adjustHours: '限制加班', changeWork: '調整為常日班', restrictions: ['避免夜間駕駛'], period: '3 個月' })))
      .toEqual({ fitness: '工作限制', measures: '限制加班、調整為常日班、避免夜間駕駛、期間 3 個月' });
  });

  it('exports the prototype columns from the rows on screen', () => {
    const [head, row] = csvText(ASSESS_COLUMNS, [list[1]!]).split('\r\n');
    expect(head).toBe('評估日期,工號,姓名,廠區,部門,個人相關過勞,工作相關過勞,過勞量表填寫,近1月加班,近2-6月平均加班,十年心血管風險%,工作負荷等級,風險等級,面談建議,面談狀態,催填次數');
    expect(row).toBe('2026-09-06,E2,林志豪,桃園廠,製造一課,70,,,62,,,,高度風險,,已面談,0');
    expect(csvText(ASSESS_COLUMNS, [list[3]!]).split('\r\n')[1]).toContain(',問卷未完成,');
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

  it('starts a refill from the saved answers, or blank when only scores were entered', () => {
    expect(cbiDraftFrom(null)).toEqual(emptyCbi());
    const d = cbiDraftFrom({ p: [0, 1, 2, 3, 4, 0], w: [1, 1, 1, 1, 1, 1, 1] });
    expect(cbiResult(d)).toEqual(cbiScores({ p: [0, 1, 2, 3, 4, 0], w: [1, 1, 1, 1, 1, 1, 1] }));
    expect(cbiDraftFrom({ p: [2], w: [] }).p).toEqual([2, null, null, null, null, null]);
  });

  it('words burnout with the load thresholds', () => {
    expect(burnoutLabel('personal', 70)).toBe('中度');
    expect(burnoutLabel('personal', 70.1)).toBe('嚴重');
    expect(burnoutLabel('work', 45)).toBe('中度');
    expect(burnoutLabel('work', 44.9)).toBe('輕微');
  });
});

describe('interview form', () => {
  const defaults = { today: '2026-10-04', doctorUserId: null };
  const guidance = { fatigue: '中度', mentalConcern: '無', diagnosis: '需觀察或進一步追蹤檢查', guidance: '需健康指導', needMeasure: true, seeDoctor: '心臟內科', special: '' } as const;

  it('starts from the full saved interview, guidance and notes included', () => {
    const d = interviewDraft(iv({
      status: '已安排', interviewedOn: '2026-10-10', doctorUserId: 'doc', guidance,
      workAdvice: advice({ fitness: '工作限制', adjustHours: '限制加班', period: '3 個月' }), notes: '睡眠不足', nextOn: '2026-11-10',
    }), defaults);
    expect(d).toEqual(expect.objectContaining({
      status: '已安排', interviewedOn: '2026-10-10', doctorUserId: 'doc', fatigue: '中度', diagnosis: '需觀察或進一步追蹤檢查', needMeasure: true, seeDoctor: '心臟內科',
      fitness: '工作限制', adjustHours: '限制加班', period: '3 個月', notes: '睡眠不足', nextOn: '2026-11-10',
    }));
    expect(interviewDraft(null, { today: '2026-10-04', doctorUserId: 'me' })).toEqual(expect.objectContaining({ status: '已面談', interviewedOn: '2026-10-04', doctorUserId: 'me', fatigue: null, notes: '' }));
  });

  it('asks for the date and, once held, fatigue, diagnosis and work fitness', () => {
    const d = interviewDraft(null, defaults);
    expect(interviewProblems(d)).toEqual(['請選擇疲勞累積狀況', '請選擇診斷區分', '請選擇工作區分']);
    const held = { ...d, fatigue: '無' as const, diagnosis: '無異常' as const, fitness: '一般工作' };
    expect(interviewProblems(held)).toEqual([]);
    expect(interviewProblems({ ...held, interviewedOn: '' })).toEqual(['請填面談日期']);
    expect(interviewProblems({ ...d, status: '已安排', interviewedOn: '' })).toEqual(['請填預定面談日期']);
    expect(interviewProblems({ ...held, nextOn: '2026-10-01' })).toEqual(['下次面談日期不能早於面談日期']);
    expect(interviewProblems({ ...d, status: '拒絕面談', interviewedOn: '' })).toEqual([]);
  });

  it('sends every field, with an empty section or text as null', () => {
    const d = interviewDraft(null, defaults);
    expect(interviewBody({ ...d, status: '拒絕面談', interviewedOn: '' })).toEqual({
      status: '拒絕面談', interviewedOn: null, doctorUserId: null, workAdvice: null, guidance: null, notes: null, nextOn: null,
    });
    expect(interviewBody({
      ...d, ...guidance, seeDoctor: ' 心臟內科 ', fitness: '工作限制', restrictions: [' 避免夜間駕駛 ', ''], adjustHours: '限制加班', period: ' 3 個月 ',
      suggestion: ' 一個月後回診 ', notes: ' 疲勞中度 ', nextOn: '2026-11-01',
    })).toEqual({
      status: '已面談', interviewedOn: '2026-10-04', doctorUserId: null,
      workAdvice: { fitness: '工作限制', restrictions: ['避免夜間駕駛'], suggestion: '一個月後回診', adjustHours: '限制加班', changeWork: '', period: '3 個月' },
      guidance: { ...guidance, seeDoctor: '心臟內科' }, notes: '疲勞中度', nextOn: '2026-11-01',
    });
  });
});
