import { describe, expect, it } from 'vitest';
import {
  RULES_V1, ageAt, caseStatus, cbiScores, cvdScore, evaluateWorkload, findRule, gradeReport, isAgeConcern, isAvailableTenantSubdomain,
  isEmployeeLang, isValidTenantSlug, levelOf, loadEval, nmqHazardLabel, nmqSuspectedHazard, pregnancyWeeks, suggestMaternalLevel, violenceRisk,
} from '../src/index.js';
import { examRetainUntil } from '../src/retention.js';

const rule = (code: string, sex: '男' | '女' = '男') => findRule(RULES_V1, code, sex)!;

describe('health-check grading', () => {
  it('uses [min, max) bands', () => {
    expect(levelOf(rule('B0111'), 139)).toBe(1);
    expect(levelOf(rule('B0111'), 140)).toBe(2);
    expect(levelOf(rule('B0111'), 180)).toBe(4);
  });
  it('picks the sex-specific rule', () => {
    expect(levelOf(rule('B0107', '男'), 85)).toBe(1);
    expect(levelOf(rule('B0107', '女'), 85)).toBe(2);
  });
  it('grades text values and leaves blanks ungraded', () => {
    expect(levelOf(rule('B0501'), '++')).toBe(4);
    expect(levelOf(rule('B0501'), '')).toBeNull();
    expect(levelOf(rule('B0111'), null)).toBeNull();
  });
  it('sums and maxes a report, counting ungraded items as 0', () => {
    const g = gradeReport({ SBP: 165, DBP: 80, GLU: 130 }, '男');
    expect(g.max).toBe(3);
    expect(g.total).toBe(3 + 1 + 3);
  });
});

describe('NMQ', () => {
  it('flags any part scoring 3 or more', () => {
    expect(nmqSuspectedHazard({ neck: 2, lowerBack: 3 })).toBe(true);
    expect(nmqHazardLabel({ neck: 2, lowerBack: 3 })).toBe('疑似有危害（3）');
    expect(nmqHazardLabel({ neck: 2 })).toBe('無明顯危害');
    expect(nmqHazardLabel(null)).toBe('');
  });
});

describe('overwork', () => {
  const cvd = cvdScore({ sex: '男', birth: '1970-05-01', report: { date: '2026-05-01', values: { LDL: 165, HDL: 38, SBP: 150, DBP: 88, GLU: 110 }, smoker: true } });
  it('scores the simplified Framingham table', () => {
    // age 56 → index 5 (4) · LDL 165 → 1 · HDL 38 → 1 · BP 150 → 2 · no DM · smoker 2
    expect(cvd.total).toBe(4 + 1 + 1 + 2 + 0 + 2);
    expect(cvd.risk).toBe(27);
    expect(cvd.band).toBe(2);
  });
  it('takes the worst workload dimension', () => {
    const load = loadEval({ pf: 40, wf: 40, m1: 110, avg6: 30, patterns: [] })!;
    expect(load.level).toBe(2);
    expect(load.ot).toBe(2);
    expect(loadEval({ pf: null, wf: null, m1: 10, avg6: 10, patterns: [] })).toBeNull();
  });
  it('applies the risk matrix', () => {
    const load = loadEval({ pf: 55, wf: 40, m1: 20, avg6: 20, patterns: [] })!;
    const r = evaluateWorkload(cvd, load);
    expect(r.complete && r.riskLevel).toBe(2);
    expect(r.complete && r.advice).toBe('需面談');
    expect(r.complete && r.shortM).toBe('限制工作時間 09:00–18:00');
    expect(evaluateWorkload(null, load).complete).toBe(false);
  });
  it('maps every CVD band × workload level through the matrix', () => {
    const advice = [0, 1, 2].map(band => [0, 1, 2].map(level =>
      evaluateWorkload({ items: [], total: 0, risk: 0, band: band as 0 | 1 | 2 }, { items: [], level: level as 0 | 1 | 2, ot: 0 })));
    expect(advice.map(row => row.map(r => r.complete && r.advice))).toEqual([
      ['不需面談', '不需面談', '建議面談'],
      ['不需面談', '建議面談', '需面談'],
      ['建議面談', '需面談', '需面談'],
    ]);
  });
  it('reverse-scores the last CBI work item', () => {
    expect(cbiScores({ p: [0, 0, 0, 0, 0, 0], w: [4, 4, 4, 4, 4, 4, 4] })).toEqual({ pf: 100, wf: 14.3 });
  });
});

describe('maternal, violence, cases, age', () => {
  it('suggests the maternal management level', () => {
    expect(suggestMaternalLevel({ a: { v: '無' }, b: { v: '可能有影響' } })).toBe('第二級管理');
    expect(suggestMaternalLevel({ a: { v: '有' } })).toBe('第三級管理');
    expect(suggestMaternalLevel({})).toBe('第一級管理');
  });
  it('counts gestational weeks from the due date', () => {
    expect(pregnancyWeeks('妊娠', '2026-12-31', '2026-10-01')).toBe(27);
    expect(pregnancyWeeks('產後', '2026-12-31', '2026-10-01')).toBeNull();
  });
  it('rates violence risk', () => {
    expect(violenceRisk('可能', '嚴重')).toBe('高度風險');
    expect(violenceRisk('不太可能', '中')).toBe('中度風險');
    expect(violenceRisk('極不可能', '輕')).toBe('低度風險');
    expect(violenceRisk('', '輕')).toBeNull();
  });
  it('reopens a closed case when a new event arrives', () => {
    expect(caseStatus('結案', ['結案', '未開單'])).toBe('未開單');
    expect(caseStatus('處理中', ['未開單'])).toBe('處理中');
    expect(caseStatus(null, [])).toBe('未開單');
  });
  it('flags minors and seniors', () => {
    expect(ageAt('2000-10-03', '2026-10-02')).toBe(25);
    expect(isAgeConcern(17)).toBe(true);
    expect(isAgeConcern(55)).toBe(true);
    expect(isAgeConcern(54)).toBe(false);
  });
});

describe('retention', () => {
  it('keeps general health checks 7 years and special ones 10', () => {
    expect(examRetainUntil('2026-03-15', false)).toBe('2033-03-15');
    expect(examRetainUntil('2026-03-15', true)).toBe('2036-03-15');
  });
});

describe('tenant subdomains and portal languages', () => {
  it('keeps the demo site out of the subdomains the platform hands out, while it stays a valid tenant slug', () => {
    expect(isValidTenantSlug('demo')).toBe(true);
    expect(isAvailableTenantSubdomain('demo')).toBe(false);
    expect(['acme', 'acme-2'].map(isAvailableTenantSubdomain)).toEqual([true, true]);
    expect(['admin', 'api', 'www', 'a.b', '-x', 'Acme'].map(isAvailableTenantSubdomain)).toEqual([false, false, false, false, false, false]);
  });
  it('knows the portal languages', () => {
    expect(['zh', 'en', 'ja', 'vi', 'th'].every(isEmployeeLang)).toBe(true);
    expect(isEmployeeLang('fr')).toBe(false);
  });
});
