/* Audit search (稽核查詢): the filters in the URL, the API query they make, and plain words for the log's codes. */
import type { DataCategory, Schemas, TenantPaths } from '@yutis/api-client';
import type { Tone } from './ui';

export type AuditEntry = Schemas['AuditEntryDto'];
export type AuditAction = AuditEntry['action'];
type AuditParams = NonNullable<TenantPaths['/api/admin/audit']['get']['parameters']['query']>;

export const AUDIT_PAGE_SIZE = 50;

export const ACTION_LABEL: Record<AuditAction, string> = {
  read: '讀取', create: '新增', update: '修改', delete: '刪除', export: '匯出', sign_in: '登入', break_glass: '破窗存取',
};
export const ACTION_TONE: Record<AuditAction, Tone> = {
  read: 'info', create: 'ok', update: 'warn', delete: 'bad', export: 'warn', sign_in: 'muted', break_glass: 'bad',
};
const ACTIONS = Object.keys(ACTION_LABEL) as AuditAction[];

/** Data sensitivity tiers (DATA_CATEGORIES in apps/api/src/auth/permissions.ts). */
export const CATEGORY_LABEL: Record<DataCategory, string> = { identity: '身分資料', work: '工作安排', health: '健檢數值', medical: '病歷與面談' };
export const CATEGORY_HINT: Record<DataCategory, string> = {
  identity: '姓名、工號、廠區、部門、聯絡方式',
  work: '工作安排建議與追蹤狀態',
  health: '健檢數值、分級、問卷分數',
  medical: '診斷、病史、面談內容、妊娠、不法侵害事件',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as DataCategory[];

/** What kind of record an entry is about, by the table the API names (subjectTable). Unknown tables show as they are. */
export const SUBJECT_LABEL: Record<string, string> = {
  employees: '員工資料', health_exams: '健檢結果', cases: '個案', case_events: '異常事件', assist_records: '協助紀錄',
  interviews: '面談紀錄', work_advice: '工作安排建議', manager_notices: '主管通知', employee_acknowledgements: '員工確認',
  ergo_dispatches: '人因問卷發送', ergo_surveys: '人因問卷', workload_assessments: '異常工作負荷評估',
  maternal_cases: '母性保護個案', maternal_interviews: '母性保護面談', maternal_env_assessments: '母性環境評估',
  violence_incidents: '不法侵害事件', violence_risk_assessments: '不法侵害風險評估', violence_checklists: '不法侵害檢核表',
  violence_reviews: '不法侵害措施查核', service_records: '勞工健康服務紀錄', signatures: '簽核', consents: '同意書',
  reports: '統計報表', exports: '匯出檔案', retention_findings: '保存期限檢查',
  legal_entities: '法人', sites: '廠區', departments: '部門', users: '後台帳號', phrases: '片語', grading_rule_sets: '分級標準',
  exam_import_mappings: '健檢匯入對照', tenant_settings: '租戶設定', audit_log: '稽核查詢',
};

/** The filters as they live in the URL (short names; ids only, never names, so no personal data ends up in links). */
export interface AuditSearch {
  employee?: string; actor?: string; action?: AuditAction; category?: DataCategory; from?: string; to?: string; page?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

/** Keeps only well-formed filters, so a hand-edited link never makes the API refuse the search. */
export function validateAuditSearch(s: Record<string, unknown>): AuditSearch {
  const out: AuditSearch = {};
  if (typeof s.employee === 'string' && UUID.test(s.employee)) out.employee = s.employee;
  if (typeof s.actor === 'string' && UUID.test(s.actor)) out.actor = s.actor;
  if (ACTIONS.includes(s.action as AuditAction)) out.action = s.action as AuditAction;
  if (CATEGORIES.includes(s.category as DataCategory)) out.category = s.category as DataCategory;
  if (isDate(s.from)) out.from = s.from;
  if (isDate(s.to)) out.to = s.to;
  if (out.from && out.to && out.from > out.to) delete out.to;
  const page = Number(s.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

/** GET /api/admin/audit query for the filters and page. */
export function auditParams(s: AuditSearch): AuditParams {
  return {
    employeeId: s.employee, actorUserId: s.actor, action: s.action, dataCategory: s.category, from: s.from, to: s.to,
    limit: AUDIT_PAGE_SIZE, offset: ((s.page ?? 1) - 1) * AUDIT_PAGE_SIZE,
  };
}

/** The same search, ignoring the page: changing filters starts again at page 1. */
export const sameFilters = (a: AuditSearch, b: AuditSearch) =>
  (['employee', 'actor', 'action', 'category', 'from', 'to'] as const).every(k => (a[k] ?? null) === (b[k] ?? null));

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

/** The date filters, checked before searching (Taiwan dates, both days included). */
export function dateRangeProblem(from: string, to: string): string | null {
  if (from && to && from > to) return '開始日期不能晚於結束日期';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY/MM/DD HH:mm:ss" in local time. */
export function formatAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Who did it, in words: a staff member with their role, the employee themself, or the system. */
export function actorText(a: AuditEntry['actor']): { name: string; note: string | null } {
  if (a.kind === 'staff') return { name: a.name ?? '（已刪除的帳號）', note: a.role };
  if (a.kind === 'employee') return { name: a.name ?? '（員工）', note: '員工本人' };
  // No signed-in actor: scheduled jobs, and people signing through an emailed link (the reason names them).
  return { name: '系統', note: '排程或簽核連結' };
}

export const subjectText = (table: string | null) => (table ? SUBJECT_LABEL[table] ?? table : null);
