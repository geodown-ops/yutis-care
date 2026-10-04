import { describe, expect, it } from 'vitest';
import { actorText, auditParams, dateRangeProblem, formatAt, pageCount, sameFilters, subjectText, validateAuditSearch } from './audit';

const ID = '9c10b8ed-5f74-4e6e-bdcb-ba1d9a2d5b6d';

describe('audit search in the URL', () => {
  it('keeps well-formed filters', () => {
    expect(validateAuditSearch({ employee: ID, actor: ID, action: 'export', category: 'health', from: '2026-09-01', to: '2026-09-30', page: '3' }))
      .toEqual({ employee: ID, actor: ID, action: 'export', category: 'health', from: '2026-09-01', to: '2026-09-30', page: 3 });
  });

  it('drops anything the API would refuse', () => {
    expect(validateAuditSearch({ employee: 'E001', actor: 'x', action: 'peek', category: 'secret', from: '2026-13-45', to: 'yesterday', page: '0' })).toEqual({});
    expect(validateAuditSearch({ page: '1.5' })).toEqual({});
  });

  it('drops an end date before the start date', () => {
    expect(validateAuditSearch({ from: '2026-10-02', to: '2026-10-01' })).toEqual({ from: '2026-10-02' });
  });
});

describe('audit query', () => {
  it('maps the URL filters to the API names and pages by 50', () => {
    expect(auditParams({ employee: ID, action: 'read', page: 3 })).toEqual({
      employeeId: ID, actorUserId: undefined, action: 'read', dataCategory: undefined, from: undefined, to: undefined, limit: 50, offset: 100,
    });
    expect(auditParams({})).toMatchObject({ limit: 50, offset: 0 });
  });

  it('compares filters without the page', () => {
    expect(sameFilters({ action: 'read', page: 2 }, { action: 'read' })).toBe(true);
    expect(sameFilters({ action: 'read' }, { action: 'read', from: '2026-10-01' })).toBe(false);
  });

  it('counts pages, at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
  });

  it('checks the date range', () => {
    expect(dateRangeProblem('2026-10-02', '2026-10-01')).toBe('開始日期不能晚於結束日期');
    expect(dateRangeProblem('2026-10-01', '2026-10-01')).toBeNull();
    expect(dateRangeProblem('', '2026-10-01')).toBeNull();
  });
});

describe('audit entries in words', () => {
  it('names the actor', () => {
    expect(actorText({ kind: 'staff', id: ID, name: '李人資', role: '人資' })).toEqual({ name: '李人資', note: '人資' });
    expect(actorText({ kind: 'employee', id: ID, name: '王小明', role: null })).toEqual({ name: '王小明', note: '員工本人' });
    expect(actorText({ kind: 'system', id: null, name: null, role: null }).name).toBe('系統');
  });

  it('names the record kind, keeping unknown tables as they are', () => {
    expect(subjectText('assist_records')).toBe('協助紀錄');
    expect(subjectText('new_table')).toBe('new_table');
    expect(subjectText(null)).toBeNull();
  });

  it('formats the time in local time', () => {
    const d = new Date(2026, 9, 4, 9, 5, 7);
    expect(formatAt(d.toISOString())).toBe('2026/10/04 09:05:07');
  });
});
