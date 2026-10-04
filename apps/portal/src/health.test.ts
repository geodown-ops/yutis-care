import { describe, expect, it } from 'vitest';
import { ackFields } from './acknowledgement';
import { burnoutLevel, examViews, surveyViews, workloadViews } from './health';

describe('my health', () => {
  it('reads exams and their graded items, skipping what it cannot read', () => {
    const [exam, ...rest] = examViews([
      {
        examDate: '2026-09-02', clinic: '仁安健康管理診所', kind: '年度健檢', gradeTotal: 29, gradeMax: 4,
        items: [
          { code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', value: '168', grade: 3 },
          { code: 'B0501', name: '尿蛋白', unit: '', value: '±', grade: 7 },
          { name: 'no code' },
        ],
      },
      { clinic: 'no date' },
    ]);
    expect(rest).toEqual([]);
    expect(exam).toMatchObject({ examDate: '2026-09-02', gradeMax: 4 });
    expect(exam!.items).toEqual([
      { code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', value: '168', grade: 3 },
      { code: 'B0501', name: '尿蛋白', unit: '', value: '±', grade: null },
    ]);
  });

  it('reads NMQ and overwork results', () => {
    expect(surveyViews([{ dispatch: 'B1', filledAt: '2026-08-31T04:00:00.000Z', maxScore: 5, suspectedHazard: true }]))
      .toEqual([{ dispatch: 'B1', filledAt: '2026-08-31T04:00:00.000Z', maxScore: 5, suspectedHazard: true }]);
    expect(workloadViews([{ sentOn: '2026-09-06', personalBurnout: 66.7, workBurnout: null, riskLevel: 2, advice: '需面談' }]))
      .toEqual([{ sentOn: '2026-09-06', personalBurnout: 66.7, workBurnout: null, riskLevel: 2 }]);
  });

  it('labels burnout scores with the domain cut-offs', () => {
    expect(burnoutLevel('personal', 49.9)).toBe(0);
    expect(burnoutLevel('personal', 50)).toBe(1);
    expect(burnoutLevel('personal', 70)).toBe(1);
    expect(burnoutLevel('personal', 70.1)).toBe(2);
    expect(burnoutLevel('work', 45)).toBe(1);
    expect(burnoutLevel('work', 60.1)).toBe(2);
  });
});

describe('acknowledgements', () => {
  it('shows the interview fields in form order, then anything else', () => {
    const fields = ackFields({ extra: 'x', limits: ['不加班', ' '], agreedArrangement: '', fitAdvice: '可工作', interviewedOn: '2026-09-30', nested: { a: 1 } });
    expect(fields.map(f => f.key)).toEqual(['interviewedOn', 'fitAdvice', 'limits', 'agreedArrangement', 'extra']);
    expect(fields[0]).toEqual({ key: 'interviewedOn', value: '2026-09-30', date: true });
    expect(fields[2]!.value).toEqual(['不加班']);
    expect(fields[3]!.value).toBeNull();
  });
});
