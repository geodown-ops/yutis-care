import { NMQ_KEYS } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import {
  canRunErgo, dispatchTotals, draftMax, emptyNmq, filterSurveys, hazardLabel, hazardParts, nmqBody, nmqDraftFrom, nmqUnanswered, NMQ_ROWS, splitMeasures, surveyColumns,
  trackingBody, trackingDraft, trackingProblem, type Dispatch, type Survey,
} from './ergo';
import { csvText } from './lists';

const survey = (p: Partial<Survey>): Survey => ({
  id: 's', employeeId: 'e', empNo: 'E1', name: '王小明', siteId: 'ty', site: '桃園廠', departmentId: 'ty-m1', department: '製造一課', status: '未填寫', maxScore: null, suspectedHazard: null,
  filledAt: null, filledBy: null, answers: null, reminders: 0, lastRemindedAt: null, tracking: null, ...p,
});
const allScores = (n: number) => Object.fromEntries(NMQ_KEYS.map(k => [k.key, n]));
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

  it('starts a refill from the earlier answers, keeping only real questions', () => {
    expect(nmqDraftFrom(null)).toEqual(emptyNmq());
    const d = nmqDraftFrom({ scores: { ...allScores(0), neck: 4, bogus: 3, kneeL: 7 }, yesNo: { any: true, injury: false, extra: true } });
    expect(d.yesNo).toEqual({ any: true, injury: false });
    expect(d.scores.neck).toBe(4);
    expect(d.scores.bogus).toBeUndefined();
    expect(d.scores.kneeL).toBeUndefined();
    expect(nmqUnanswered(d)).toBe(1);
    expect(nmqUnanswered(nmqDraftFrom({ scores: allScores(1), yesNo: { any: true, injury: true } }))).toBe(0);
  });

  it('names the parts that make a suspected hazard', () => {
    expect(hazardParts(null)).toBe('');
    expect(hazardParts({ scores: { ...allScores(1), neck: 4, shoulderR: 3 }, yesNo: {} })).toBe('頸 4 分、肩（右） 3 分');
  });
});

describe('管控追蹤', () => {
  it('starts a new record as tracked with a follow-up in two weeks, or from the saved one', () => {
    expect(trackingDraft(null, '2026-10-04')).toEqual({ measures: [], note: '', nextOn: '2026-10-18', status: '列管中' });
    expect(trackingDraft({ measures: ['工作輪調'], note: 'x', nextOn: null, status: '已改善' }, '2026-10-04')).toEqual({ measures: ['工作輪調'], note: 'x', nextOn: '', status: '已改善' });
  });

  it('needs a measure or a note, and sends them trimmed and without repeats', () => {
    const d = trackingDraft(null, '2026-10-04');
    expect(trackingProblem(d)).toBe('請勾選改善措施或填寫說明');
    expect(trackingProblem({ ...d, measures: [' '] })).toBe('請勾選改善措施或填寫說明');
    expect(trackingProblem({ ...d, note: '已調整工作檯' })).toBeNull();
    expect(trackingBody({ ...d, measures: ['工作輪調', ' 工作輪調 ', '自訂措施', ''], note: ' 觀察兩週 ', nextOn: '' }))
      .toEqual({ measures: ['工作輪調', '自訂措施'], note: '觀察兩週', nextOn: null, status: '列管中' });
  });

  it('splits the measures into the listed choices and the ones typed in', () => {
    const listed = ['調整工作檯高度', '工作輪調'];
    expect(splitMeasures(['工作輪調', '自訂措施', '調整工作檯高度'], listed)).toEqual({ listed: ['工作輪調', '調整工作檯高度'], others: ['自訂措施'] });
    // Before the options load nothing is listed, so every saved measure stays editable as typed text.
    expect(splitMeasures(['工作輪調'], [])).toEqual({ listed: [], others: ['工作輪調'] });
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

  it('filters by site and department id', () => {
    const more = [
      ...list,
      survey({ id: 'd', empNo: 'E4', siteId: 'hc', site: '新竹廠', departmentId: 'hc-qa', department: '品保課' }),
      // Same department name in another site: only the id tells them apart.
      survey({ id: 'e', empNo: 'E5', siteId: 'hc', site: '新竹廠', departmentId: 'hc-m1', department: '製造一課' }),
    ];
    expect(filterSurveys(more, 'all', '', { siteId: 'hc', departmentId: null }).map(s => s.id)).toEqual(['d', 'e']);
    expect(filterSurveys(more, 'pending', '', { siteId: 'ty', departmentId: 'ty-m1' }).map(s => s.id)).toEqual(['c']);
    expect(filterSurveys(more, 'all', '', { siteId: null, departmentId: 'hc-m1' }).map(s => s.id)).toEqual(['e']);
  });

  it('exports the prototype columns with every body part', () => {
    const filled = survey({
      status: '已填寫', maxScore: 4, suspectedHazard: true, filledAt: '2026-09-10T02:00:00Z', filledBy: 'nurse', reminders: 1,
      answers: { scores: { ...allScores(0), neck: 4 }, yesNo: { any: true, injury: true } }, tracking: { measures: [], note: 'x', nextOn: null, status: '列管中' },
    });
    const [head, row] = csvText(surveyColumns({ name: '2026 秋季', sentOn: '2026-09-01' }), [filled]).split('\r\n');
    expect(head!.startsWith('調查批次,調查日期,工號,姓名,廠區,部門,狀態,填寫日期,填寫方式,催填次數,危害等級,管控追蹤,傷病紀錄,頸,肩（左）,肩（右）')).toBe(true);
    expect(head!.split(',')).toHaveLength(13 + NMQ_KEYS.length);
    expect(row!.startsWith('2026 秋季,2026-09-01,E1,王小明,桃園廠,製造一課,已填寫,2026-09-10,職護代填,1,疑似有危害（4）,列管中,有,4,0,0')).toBe(true);
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
