import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import { changes, fileProblem, fileSize, issueWhere, MAX_IMPORT_BYTES, rowsWithIssues, sortIssues } from './imports';
import { adminProblem, refusedImportReport } from './problems';

describe('import helpers', () => {
  it('accepts .xlsx files only, not empty and within the API limit', () => {
    expect(fileProblem({ name: '員工.XLSX', size: 2048 })).toBeNull();
    expect(fileProblem({ name: 'staff.xls', size: 2048 })).toMatch(/\.xlsx/);
    expect(fileProblem({ name: 'staff.csv', size: 2048 })).toMatch(/\.xlsx/);
    expect(fileProblem({ name: 'a.xlsx', size: 0 })).toBe('這個檔案是空的。');
    expect(fileProblem({ name: 'a.xlsx', size: MAX_IMPORT_BYTES + 1 })).toBe('檔案太大，上限 10 MB。');
  });

  it('says where a problem is', () => {
    expect(issueWhere({ sheet: '廠區', row: 7, column: '法人代碼', message: '' })).toBe('廠區 · 第 7 列 · 法人代碼');
    expect(issueWhere({ row: 3, message: '' })).toBe('第 3 列');
  });

  it('orders problems by sheet, row and column, and counts rows', () => {
    const issues = [
      { sheet: '部門', row: 2, column: '名稱', message: '' },
      { sheet: '廠區', row: 3, column: '代碼', message: '' },
      { sheet: '廠區', row: 2, column: '名稱', message: '' },
      { sheet: '廠區', row: 2, column: '代碼', message: '' },
    ];
    expect(sortIssues(issues).map(issueWhere)).toEqual(['廠區 · 第 2 列 · 代碼', '廠區 · 第 2 列 · 名稱', '廠區 · 第 3 列 · 代碼', '部門 · 第 2 列 · 名稱']);
    expect(rowsWithIssues(issues)).toBe(3);
  });

  it('sizes and change counts', () => {
    expect(fileSize(300)).toBe('1 KB');
    expect(fileSize(7 * 1024)).toBe('7 KB');
    expect(fileSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
    expect(changes({ create: 2, update: 3 })).toBe(5);
  });

  it('reads the report of a refused import', () => {
    const report = { committed: false, issues: [{ row: 2, message: '必填' }] };
    expect(refusedImportReport(new ApiRequestError(422, 'import_invalid', 'x', { report }))).toEqual(report);
    expect(refusedImportReport(new ApiRequestError(400, 'invalid_file', 'x', {}))).toBeNull();
    expect(refusedImportReport(new Error('x'))).toBeNull();
  });

  it('explains refusals in plain words, with per-screen wording when given', () => {
    expect(adminProblem(new ApiRequestError(409, 'in_use', 'x'))).toMatch(/不能刪除/);
    expect(adminProblem(new ApiRequestError(409, 'duplicate', 'x'), { duplicate: '這家醫院已有對照。' })).toBe('這家醫院已有對照。');
    expect(adminProblem(new ApiRequestError(413, 'http_error', 'x'))).toBe('檔案太大，上限 10 MB。');
    expect(adminProblem(new ApiRequestError(403, 'forbidden', 'x'))).toBe('你的角色沒有這個頁面的權限。');
  });
});
