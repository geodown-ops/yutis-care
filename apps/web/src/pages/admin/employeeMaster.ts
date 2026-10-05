/* 員工主檔: the employee form a tenant admin fills in by hand, its checks, and the request bodies it sends. */
import type { Schemas } from '@yutis/api-client';
import { EMPLOYEE_LANGS } from '@yutis/domain';

/** GET /api/admin/employees/records: one employee as the admin sees and edits it. */
export type EmployeeRecord = Schemas['EmployeeRecordDto'];
export const EMPLOYEE_STATUSES = ['在職', '留停', '離職'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const LANG_OPTIONS = EMPLOYEE_LANGS.map(value => ({
  value, label: ({ zh: '中文', en: 'English', ja: '日本語', vi: 'Tiếng Việt', th: 'ไทย' } as Record<string, string>)[value] ?? value,
}));

export interface EmployeeForm {
  empNo: string; name: string; sex: '男' | '女' | ''; birthDate: string; siteId: string; departmentId: string;
  title: string; shift: string; examCategory: string; specialOperations: string; lang: string; hireDate: string;
  email: string; phone: string; status: EmployeeStatus;
  /** Typed only to set or replace the number; blank keeps what is stored. */
  nationalId: string;
  /** Edit only: remove the stored national ID. */
  clearNationalId: boolean;
}

export const emptyEmployeeForm = (): EmployeeForm => ({
  empNo: '', name: '', sex: '', birthDate: '', siteId: '', departmentId: '', title: '', shift: '', examCategory: '', specialOperations: '',
  lang: 'zh', hireDate: '', email: '', phone: '', status: '在職', nationalId: '', clearNationalId: false,
});

export const employeeToForm = (e: EmployeeRecord): EmployeeForm => ({
  empNo: e.empNo, name: e.name, sex: e.sex, birthDate: e.birthDate, siteId: e.siteId, departmentId: e.departmentId,
  title: e.title ?? '', shift: e.shift ?? '', examCategory: e.examCategory ?? '', specialOperations: e.specialOperations.join('、'),
  lang: e.lang, hireDate: e.hireDate ?? '', email: e.email ?? '', phone: e.phone ?? '', status: e.status, nationalId: '', clearNationalId: false,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Same rule as the API and the import: a letter, then 1/2 (or 8/9, A–D for residents), then 8 digits. */
const NATIONAL_ID = /^[A-Z][12890ABCD]\d{8}$/;

/** What stops the form from being sent, as field → message. Empty when it can be saved. */
export function employeeFormProblems(f: EmployeeForm): Partial<Record<keyof EmployeeForm, string>> {
  const p: Partial<Record<keyof EmployeeForm, string>> = {};
  if (!f.empNo.trim()) p.empNo = '請填寫工號';
  if (!f.name.trim()) p.name = '請填寫姓名';
  if (!f.sex) p.sex = '請選擇性別';
  if (!DATE.test(f.birthDate)) p.birthDate = '請填寫出生日期';
  if (!f.siteId) p.siteId = '請選擇廠區';
  if (!f.departmentId) p.departmentId = '請選擇部門';
  if (f.hireDate && !DATE.test(f.hireDate)) p.hireDate = '日期格式不正確';
  if (f.email.trim() && !EMAIL.test(f.email.trim())) p.email = 'Email 格式不正確';
  if (f.nationalId.trim() && !NATIONAL_ID.test(f.nationalId.trim().toUpperCase())) p.nationalId = '身分證字號格式不正確';
  return p;
}

const orNull = (s: string) => s.trim() || null;
export const splitOperations = (s: string) => s.split(/[、,，;；]/).map(x => x.trim()).filter(Boolean);

/** POST /api/admin/employees */
export function createEmployeeBody(f: EmployeeForm) {
  return {
    empNo: f.empNo.trim(), name: f.name.trim(), sex: f.sex as '男' | '女', birthDate: f.birthDate, siteId: f.siteId, departmentId: f.departmentId,
    title: orNull(f.title), shift: orNull(f.shift), examCategory: orNull(f.examCategory), specialOperations: splitOperations(f.specialOperations),
    lang: f.lang, hireDate: orNull(f.hireDate), email: orNull(f.email), phone: orNull(f.phone), status: f.status,
    nationalId: orNull(f.nationalId.toUpperCase()),
  };
}

export type EmployeeUpdate = Partial<Omit<ReturnType<typeof createEmployeeBody>, 'nationalId'>> & { nationalId?: string | null };

/** PATCH /api/admin/employees/{id}: only the fields that changed, so it never touches what the admin left alone. */
export function updateEmployeeBody(original: EmployeeRecord, f: EmployeeForm): EmployeeUpdate {
  const next = createEmployeeBody(f);
  const body: EmployeeUpdate = {};
  const set = <K extends keyof EmployeeUpdate>(k: K, v: EmployeeUpdate[K]) => { body[k] = v; };
  for (const k of ['empNo', 'name', 'sex', 'birthDate', 'title', 'shift', 'examCategory', 'lang', 'hireDate', 'email', 'phone', 'status'] as const) {
    const before = original[k] ?? null;
    const after = next[k] ?? null;
    if (k === 'email' ? (after as string | null)?.toLowerCase() !== before : after !== before) set(k, next[k] as never);
  }
  if (next.siteId !== original.siteId || next.departmentId !== original.departmentId) { body.siteId = next.siteId; body.departmentId = next.departmentId; }
  if (next.specialOperations.join('、') !== original.specialOperations.join('、')) body.specialOperations = next.specialOperations;
  if (next.nationalId) body.nationalId = next.nationalId;
  else if (f.clearNationalId && original.nationalIdMasked) body.nationalId = null;
  return body;
}
