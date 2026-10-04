/* Excel imports (organisation, employee master): checks before upload and how the API's report is shown. */
import type { Schemas } from '@yutis/api-client';

export type ImportIssue = Schemas['ImportIssueDto'];
export type OrgImportReport = Schemas['OrgImportReportDto'];
export type EmployeeImportReport = Schemas['EmployeeImportReportDto'];

/** The API's body limit (MAX_IMPORT_BYTES). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Why a picked file cannot be sent, or null. The API reads .xlsx only (not .xls or .csv). */
export function fileProblem(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.xlsx$/i.test(file.name)) return '請選擇 .xlsx 格式的 Excel 檔（.xls 與 .csv 請先另存為 .xlsx）。';
  if (file.size === 0) return '這個檔案是空的。';
  if (file.size > MAX_IMPORT_BYTES) return '檔案太大，上限 10 MB。';
  return null;
}

/** Where an issue is, e.g. "廠區 · 第 7 列 · 法人代碼". */
export const issueWhere = (i: ImportIssue) => [i.sheet, `第 ${i.row} 列`, i.column].filter(Boolean).join(' · ');

/** Issues in sheet, row and column order, so problems in one row read together. */
export const sortIssues = (issues: readonly ImportIssue[]) =>
  [...issues].sort((a, b) => (a.sheet ?? '').localeCompare(b.sheet ?? '') || a.row - b.row || (a.column ?? '').localeCompare(b.column ?? ''));

/** Number of distinct rows with a problem (header problems count as row 1). */
export const rowsWithIssues = (issues: readonly ImportIssue[]) => new Set(issues.map(i => `${i.sheet ?? ''}/${i.row}`)).size;

export const changes = (c: { create: number; update: number }) => c.create + c.update;

export const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
