/* Pure helpers for 健檢匯入: the clinic mapping a file is read with, and the file checks done before uploading. */
import type { Schemas } from '@yutis/api-client';
import { EXAM_ITEMS, type Grade } from '@yutis/domain';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** The API refuses bigger uploads (MAX_IMPORT_BYTES in apps/api). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type ExamMapping = Schemas['ExamMappingDto'];
export type ImportReport = Schemas['ExamImportReportDto'];
export type ImportIssue = Schemas['ImportIssueDto'];
export type ImportRow = Schemas['ExamImportRowDto'];
export type ExamBatch = Schemas['ExamBatchDto'];

const COLUMN_LABEL = {
  empNo: '工號', nationalId: '身分證字號', examDate: '檢查日期', kind: '健檢類別', smoker: '吸菸',
  history: '病史', symptoms: '自覺症狀', workNote: '作業經歷', specialHazard: '特殊作業類別', specialLevel: '特殊健檢管理分級',
} as const;
type Column = keyof typeof COLUMN_LABEL;

export interface MappedColumn { label: string; header: string; required: boolean }

/** The Excel headers a clinic's file is read with: identity and date columns first, then the exam items. */
export function mappingColumns(mapping: ExamMapping['mapping']): { columns: MappedColumn[]; items: MappedColumn[] } {
  const cols = (mapping.columns ?? {}) as Partial<Record<Column, string>>;
  const items = (mapping.items ?? {}) as Record<string, string | undefined>;
  const required = (k: Column) => k === 'examDate' || k === 'empNo' || (k === 'nationalId' && !cols.empNo);
  return {
    columns: (Object.keys(COLUMN_LABEL) as Column[]).flatMap(k => (cols[k] ? [{ label: COLUMN_LABEL[k], header: cols[k], required: required(k) }] : [])),
    items: EXAM_ITEMS.flatMap(i => (items[i.code] ? [{ label: i.name, header: items[i.code]!, required: false }] : [])),
  };
}

/** Why a picked file cannot be sent, or null. */
export function fileProblem(file: { name: string; size: number }): string | null {
  if (!/\.xlsx$/i.test(file.name)) return '請選擇 Excel 活頁簿（.xlsx）檔案。';
  if (file.size === 0) return '這個檔案是空的。';
  if (file.size > MAX_IMPORT_BYTES) return '檔案超過 10 MB，請分批匯入。';
  return null;
}

/** Problems in Excel order: by row, then column. */
export const sortIssues = (issues: readonly ImportIssue[]) =>
  [...issues].sort((a, b) => a.row - b.row || (a.column ?? '').localeCompare(b.column ?? ''));

/** A preview can be committed when every row is readable and at least one exam would be written. */
export const canCommit = (r: ImportReport) => !r.committed && r.issues.length === 0 && r.exams > 0;

/** A grade the badges can show (1–4); anything else (0: no graded item) shows as —. */
export const asGrade = (n: number | null | undefined): Grade | null => (n === 1 || n === 2 || n === 3 || n === 4 ? n : null);
