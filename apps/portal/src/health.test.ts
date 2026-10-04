import { describe, expect, it } from 'vitest';
import { ACK_FIELDS, ackFields } from './acknowledgement';
import { asGrade, burnoutLevel, examView, missingOnTasks, missingReasons } from './health';

describe('my health', () => {
  it('shows exam grades 1–4 as badges and nothing for other numbers', () => {
    const exam = examView({
      examDate: '2026-09-02', clinic: '仁安健康管理診所', kind: '年度健檢', gradeTotal: 29, gradeMax: 4,
      items: [
        { code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', value: '168', grade: 3 },
        { code: 'B0501', name: '尿蛋白', unit: '', value: '±', grade: 7 },
        { code: 'B0104', name: 'BMI', unit: 'kg/m²', value: '22.1', grade: 0 },
        { code: 'B0201', name: '空腹血糖', unit: 'mg/dL', value: null, grade: null },
      ],
    });
    expect(exam).toMatchObject({ examDate: '2026-09-02', kind: '年度健檢', gradeMax: 4 });
    expect(exam.items.map(i => i.grade)).toEqual([3, null, null, null]);
    expect(exam.items[0]).toEqual({ code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', value: '168', grade: 3 });
    expect([1, 2, 3, 4, 0, 5, 2.5, null].map(asGrade)).toEqual([1, 2, 3, 4, null, null, null, null]);
  });

  it('says why an overwork result has no risk level, in reading order', () => {
    expect(missingReasons({ missing: [] })).toEqual([]);
    expect(missingReasons({ missing: ['exam', 'overload', 'cbi', 'cbi'] })).toEqual(['cbi', 'overload', 'exam']);
    // The person can fill in their own questionnaires; a missing health check is for staff.
    expect(missingOnTasks({ missing: ['overload'] })).toBe(true);
    expect(missingOnTasks({ missing: ['exam'] })).toBe(false);
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
  it('shows every interview field in form order, blank text and empty lists as nothing written', () => {
    const fields = ackFields({ interviewedOn: '2026-09-30', fitAdvice: '可工作', limits: ['不加班', ' '], agreedArrangement: ' ' });
    expect(fields.map(f => f.key)).toEqual(['interviewedOn', 'fitAdvice', 'limits', 'agreedArrangement']);
    expect(fields.map(f => f.key)).toEqual(ACK_FIELDS);
    expect(fields[0]).toEqual({ key: 'interviewedOn', value: '2026-09-30', date: true });
    expect(fields[1]).toEqual({ key: 'fitAdvice', value: '可工作', date: false });
    expect(fields[2]!.value).toEqual(['不加班']);
    expect(fields[3]!.value).toBeNull();
    expect(ackFields({ interviewedOn: '2026-09-30', fitAdvice: null, limits: [], agreedArrangement: null }).map(f => f.value))
      .toEqual(['2026-09-30', null, null, null]);
  });
});
