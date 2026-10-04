import { describe, expect, it } from 'vitest';
import { byUrgency, countByStatus, dueFollowUps, eventTypes, filterByEvents, monthlyEvents, type EmployeeCase, type FollowUp } from './cases';

const ev = (type: EmployeeCase['events'][number]['type'], occurredOn: string, status: EmployeeCase['status'] = '未開單') =>
  ({ id: `${type}-${occurredOn}`, type, occurredOn, description: '', status });
const person = (name: string, status: EmployeeCase['status'], events: EmployeeCase['events']): EmployeeCase =>
  ({ employeeId: name, empNo: name, name, department: '製造一課', status, case: null as unknown as EmployeeCase['case'], events });

const CASES = [
  person('A', '處理中', [ev('hc', '2026-09-02'), ev('wl', '2026-09-09')]),
  person('B', '未開單', [ev('er', '2026-08-31')]),
  person('C', '結案', [ev('hc', '2025-09-15')]),
  person('D', '未開單', [ev('hc', '2026-09-20'), ev('age', '2026-01-01')]),
];

describe('case helpers', () => {
  it('counts people per status in domain order', () => {
    expect(countByStatus(CASES)).toEqual({ 未開單: 2, 起單: 0, 處理中: 1, 結案: 1 });
  });

  it('filters by event types as an intersection', () => {
    expect(filterByEvents(CASES, []).map(c => c.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(filterByEvents(CASES, ['hc', 'wl']).map(c => c.name)).toEqual(['A']);
    expect(filterByEvents(CASES, ['mat'])).toEqual([]);
  });

  it('puts unopened work first, newest event first within a status', () => {
    expect([...CASES].sort(byUrgency).map(c => c.name)).toEqual(['D', 'B', 'A', 'C']);
  });

  it('lists each event type once in a fixed order', () => {
    expect(eventTypes(CASES[3]!)).toEqual(['hc', 'age']);
  });

  it('counts new events per month for the last 12 months', () => {
    const rows = monthlyEvents(CASES, '2026-10-04');
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ month: '11月' });
    expect(rows.find(r => r.month === '9月')).toEqual({ month: '9月', 健檢: 2, 計畫問卷與通報: 1, 年齡關注: 0 });
    expect(rows.find(r => r.month === '8月')).toMatchObject({ 計畫問卷與通報: 1 });
    // 2025-09 is outside the window.
    expect(rows.reduce((n, r) => n + (r['健檢'] as number), 0)).toBe(2);
  });

  it('keeps follow-ups due within a week, overdue first', () => {
    const f = (followUpOn: string): FollowUp => ({ recordId: followUpOn, employeeId: 'x', empNo: 'x', employeeName: 'x', category: '電話關懷', followUpOn });
    expect(dueFollowUps([f('2026-10-20'), f('2026-10-07'), f('2026-10-02')], '2026-10-04').map(x => [x.followUpOn, x.daysLeft]))
      .toEqual([['2026-10-02', -2], ['2026-10-07', 3]]);
  });
});
