import { NMQ_KEYS } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import { canRunErgo, dispatchTotals, draftMax, emptyNmq, filterSurveys, hazardLabel, nmqBody, nmqUnanswered, NMQ_ROWS, type Dispatch, type Survey } from './ergo';

const survey = (p: Partial<Survey>): Survey => ({
  id: 's', employeeId: 'e', empNo: 'E1', name: '王小明', status: '未填寫', maxScore: null, suspectedHazard: null, filledAt: null, filledBy: null, ...p,
});
const dispatch = (p: Partial<Dispatch>): Dispatch => ({ id: 'd', name: 'B', sentOn: '2026-09-01', dueOn: null, total: 0, filled: 0, suspected: 0, ...p });

describe('ergonomics access', () => {
  it('is for 職護 and 職醫 only, as every ergo endpoint is @Clinical()', () => {
    const clinical = { features: ['programs'], dataCategories: ['identity', 'work', 'health', 'medical'] } as const;
    const work = { features: ['programs', 'reports'], dataCategories: ['identity', 'work'] } as const;
    expect(canRunErgo({ role: '職護', ...clinical, features: [...clinical.features], dataCategories: [...clinical.dataCategories] })).toBe(true);
    expect(canRunErgo({ role: '職醫', ...clinical, features: [...clinical.features], dataCategories: [...clinical.dataCategories] })).toBe(true);
    for (const role of ['職安衛人員', '人資', '部門主管'] as const) {
      expect(canRunErgo({ role, features: [...work.features], dataCategories: [...work.dataCategories] }), role).toBe(false);
    }
  });
});

describe('NMQ form', () => {
  it('lists every scored body part exactly once', () => {
    expect(NMQ_ROWS.flatMap(r => r.keys.map(k => k.key)).sort()).toEqual(NMQ_KEYS.map(k => k.key).sort());
    expect(NMQ_ROWS.find(r => r.label === '肩')?.keys.map(k => k.side)).toEqual(['左', '右']);
  });

  it('builds the PUT body only once every question is answered', () => {
    const d = emptyNmq();
    expect(nmqUnanswered(d)).toBe(NMQ_KEYS.length + 2);
    expect(draftMax(d)).toBeNull();
    for (const k of NMQ_KEYS) d.scores[k.key] = 1;
    d.scores.lowerBackR = 9; // not a real key: ignored in the body
    d.scores.lowerBack = 4;
    expect(nmqBody(d)).toBeNull();
    d.yesNo = { any: true, injury: false };
    const body = nmqBody(d)!;
    expect(Object.keys(body.scores).sort()).toEqual(NMQ_KEYS.map(k => k.key).sort());
    expect(body.scores.lowerBack).toBe(4);
    expect(body.yesNo).toEqual({ any: true, injury: false });
  });

  it('labels the hazard like @yutis/domain', () => {
    expect(hazardLabel(null)).toBe('—');
    expect(hazardLabel(2)).toBe('無明顯危害');
    expect(hazardLabel(3)).toBe('疑似有危害（3）');
  });
});

describe('survey list', () => {
  const list = [
    survey({ id: 'a', empNo: 'E3', name: '林志豪', status: '已填寫', maxScore: 5, suspectedHazard: true }),
    survey({ id: 'b', empNo: 'E1', name: '吳俊傑', status: '已填寫', maxScore: 1, suspectedHazard: false }),
    survey({ id: 'c', empNo: 'E2', name: '謝承恩' }),
  ];

  it('puts unfilled surveys first, then the highest score', () => {
    expect(filterSurveys(list, 'all').map(s => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('filters by status, hazard and name or employee number', () => {
    expect(filterSurveys(list, 'pending').map(s => s.id)).toEqual(['c']);
    expect(filterSurveys(list, 'filled').map(s => s.id)).toEqual(['a', 'b']);
    expect(filterSurveys(list, 'hazard').map(s => s.id)).toEqual(['a']);
    expect(filterSurveys(list, 'all', '志豪').map(s => s.id)).toEqual(['a']);
    expect(filterSurveys(list, 'all', 'e1').map(s => s.id)).toEqual(['b']);
  });
});

describe('dispatch totals', () => {
  it('sums the batches and counts open batches near or past their deadline', () => {
    const t = dispatchTotals([
      dispatch({ total: 10, filled: 4, suspected: 2, dueOn: '2026-10-05' }),
      dispatch({ total: 5, filled: 5, suspected: 1, dueOn: '2026-10-05' }),
      dispatch({ total: 3, filled: 1, dueOn: '2026-10-01' }),
      dispatch({ total: 2, filled: 0, dueOn: null }),
    ], '2026-10-04');
    expect(t).toEqual({ batches: 4, total: 20, pending: 10, filled: 10, suspected: 3, dueSoon: 1, overdue: 1 });
  });
});
