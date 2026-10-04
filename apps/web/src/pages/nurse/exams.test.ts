import { describe, expect, it } from 'vitest';
import { asGrade, canCommit, fileProblem, mappingColumns, sortIssues, type ImportReport } from './exams';

describe('exam import helpers', () => {
  it('lists the headers a clinic file needs, identity and date first', () => {
    const { columns, items } = mappingColumns({ columns: { examDate: '檢查日', nationalId: '身分證', empNo: '員工編號' }, items: { B0112: '舒張壓', B0111: '收縮壓', X: 'ignored' } });
    expect(columns).toEqual([
      { label: '工號', header: '員工編號', required: true },
      { label: '身分證字號', header: '身分證', required: false },
      { label: '檢查日期', header: '檢查日', required: true },
    ]);
    expect(items.map(i => i.header)).toEqual(['收縮壓', '舒張壓']);
    expect(mappingColumns({ columns: { nationalId: 'ID', examDate: 'D' }, items: {} }).columns[0]).toEqual({ label: '身分證字號', header: 'ID', required: true });
    expect(mappingColumns({})).toEqual({ columns: [], items: [] });
  });

  it('accepts only non-empty .xlsx files up to 10 MB', () => {
    expect(fileProblem({ name: '2026健檢.XLSX', size: 2048 })).toBeNull();
    expect(fileProblem({ name: 'exam.csv', size: 10 })).toMatch(/xlsx/);
    expect(fileProblem({ name: 'exam.xlsx', size: 0 })).toMatch(/空/);
    expect(fileProblem({ name: 'exam.xlsx', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });

  it('orders problems as in the sheet', () => {
    expect(sortIssues([{ row: 7, column: 'B', message: '' }, { row: 3, message: '' }, { row: 7, column: 'A', message: '' }]).map(i => `${i.row}${i.column ?? ''}`))
      .toEqual(['3', '7A', '7B']);
  });

  it('commits only a clean preview with exams in it', () => {
    const r: ImportReport = { committed: false, rows: 2, exams: 2, issues: [], ruleSetVersion: 1, grade3Plus: 1, newEvents: 1, preview: [] };
    expect(canCommit(r)).toBe(true);
    expect(canCommit({ ...r, issues: [{ row: 2, message: 'x' }] })).toBe(false);
    expect(canCommit({ ...r, exams: 0 })).toBe(false);
    expect(canCommit({ ...r, committed: true })).toBe(false);
  });

  it('shows only grades 1–4 as badges', () => {
    expect([0, 1, 4, 5, null].map(asGrade)).toEqual([null, 1, 4, null, null]);
  });
});
