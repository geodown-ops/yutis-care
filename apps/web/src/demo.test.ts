import { describe, expect, it } from 'vitest';
import { CASES, EMPLOYEES, countByStatus, employeeById, filterCasesByEvents, gradeOf } from './demo';

describe('demo data', () => {
  it('every case points at a demo employee', () => {
    for (const c of CASES) expect(employeeById(c.employeeId), c.id).toBeDefined();
  });

  it('counts cases per status in domain order', () => {
    expect(countByStatus(CASES)).toEqual({ 未開單: 1, 起單: 2, 處理中: 3, 結案: 1 });
  });

  it('filters by event types as an intersection', () => {
    expect(filterCasesByEvents(CASES, [])).toHaveLength(CASES.length);
    expect(filterCasesByEvents(CASES, ['hc', 'wl']).map(c => c.employeeId)).toEqual(['E10234', 'E10077', 'E10301', 'E10620']);
    expect(filterCasesByEvents(CASES, ['mat', 'er'])).toEqual([]);
  });

  it('grades the UX spec example (林志明: blood pressure grade 4)', () => {
    const g = gradeOf(EMPLOYEES[0]!);
    expect(g.max).toBe(4);
    expect(g.items.find(i => i.key === 'SBP')?.lv).toBe(4);
    expect(g.items.find(i => i.key === 'LDL')?.lv).toBe(3);
  });
});
