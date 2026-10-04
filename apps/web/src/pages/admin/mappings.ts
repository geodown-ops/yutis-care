/* Clinic import mappings (健檢匯入對照): which Excel column of a clinic's file holds which field and exam item. */
import type { Schemas, TenantPaths } from '@yutis/api-client';
import { EXAM_ITEMS } from '@yutis/domain';

type MappingBody = TenantPaths['/api/admin/exam-mappings']['post']['requestBody']['content']['application/json'];
export type MappingColumns = MappingBody['columns'];
export type ColumnKey = keyof MappingColumns;
export type ExamMapping = Schemas['ExamMappingDto'];

/** The fields of a clinic file other than exam values, in the order the form lists them. */
export const COLUMN_FIELDS: { key: ColumnKey; label: string; hint?: string }[] = [
  { key: 'empNo', label: '工號', hint: '工號或身分證字號至少對照一個' },
  { key: 'nationalId', label: '身分證字號' },
  { key: 'examDate', label: '檢查日期' },
  { key: 'kind', label: '健檢類別', hint: '沒有對照時一律記為「年度健檢」' },
  { key: 'smoker', label: '吸菸', hint: '欄位內容為 是／否' },
  { key: 'history', label: '病史' },
  { key: 'symptoms', label: '自覺症狀' },
  { key: 'workNote', label: '工作相關備註' },
  { key: 'specialHazard', label: '特殊作業危害' },
  { key: 'specialLevel', label: '特殊健檢管理分級', hint: '欄位內容為 1–4' },
];

/** Exam items by code (one per code; waist, HDL… have one item for both sexes). */
export const MAPPABLE_ITEMS = EXAM_ITEMS.filter((it, i) => EXAM_ITEMS.findIndex(x => x.code === it.code) === i);

export interface MappingForm { clinic: string; columns: Partial<Record<ColumnKey, string>>; items: Record<string, string> }

export const emptyMappingForm = (): MappingForm => ({ clinic: '', columns: {}, items: {} });

/** The stored mapping as form values (the contract types it loosely). */
export function mappingToForm(m: ExamMapping): MappingForm {
  const raw = m.mapping as { columns?: Record<string, unknown>; items?: Record<string, unknown> };
  const strings = (o: Record<string, unknown> | undefined) =>
    Object.fromEntries(Object.entries(o ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return { clinic: m.clinic, columns: strings(raw.columns) as MappingForm['columns'], items: strings(raw.items) };
}

const clean = (o: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.trim() ?? '']).filter(([, v]) => v !== ''));

export function mappingProblems(f: MappingForm): Partial<Record<'clinic' | 'match' | 'examDate' | 'items', string>> {
  const c = clean(f.columns);
  const p: Partial<Record<'clinic' | 'match' | 'examDate' | 'items', string>> = {};
  if (!f.clinic.trim()) p.clinic = '請填寫健檢醫院名稱';
  if (!c.empNo && !c.nationalId) p.match = '請對照工號或身分證字號欄位，才能找到員工';
  if (!c.examDate) p.examDate = '請對照檢查日期欄位';
  if (Object.keys(clean(f.items)).length === 0) p.items = '至少對照一個檢查項目';
  return p;
}

export function mappingBody(f: MappingForm): MappingBody {
  return { clinic: f.clinic.trim(), columns: clean(f.columns) as MappingColumns, items: clean(f.items) };
}

/** A one-line summary for the list: how employees are matched and how many items are read. */
export function mappingSummary(m: ExamMapping): { matchBy: string; items: number; fields: number } {
  const f = mappingToForm(m);
  const matchBy = [f.columns.empNo && '工號', f.columns.nationalId && '身分證字號'].filter(Boolean).join('、') || '—';
  return { matchBy, items: Object.keys(f.items).length, fields: Object.keys(f.columns).length };
}
