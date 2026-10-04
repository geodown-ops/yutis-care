/* Pure helpers for the 附表八 (勞工健康服務執行紀錄表) screens: form values, request bodies, filters and error text. */
import { ApiRequestError, type Schemas, type TenantInfo, type TenantPaths } from '@yutis/api-client';

export type ServiceRecord = Schemas['ServiceRecordDto'];
/** GET /api/org: company → site → department names. */
export type OrgEntity = Schemas['DirectoryLegalEntityDto'];
export type Signature = Schemas['SignatureDto'];
export type SignLink = Schemas['SignLinkDto'];
export type ServiceStatus = ServiceRecord['status'];
/** POST/PUT /api/service-records body. */
export type ServiceRecordBody = TenantPaths['/api/service-records']['post']['requestBody']['content']['application/json'];
/** The record's 附表八 fields, as the API validates them (`content` comes back untyped). */
export type ServiceContent = Required<ServiceRecordBody['content']>;
export type Headcount = ServiceContent['headcount'];

export const STATUSES: ServiceStatus[] = ['草稿', '簽核中', '已完成'];

/** Sections 二–五 of 附表八, in order. */
export const SECTIONS = [
  ['workplace', '二、作業場所與勞動條件概況'],
  ['services', '三、臨場健康服務執行情形'],
  ['findings', '四、發現問題及建議採行措施'],
  ['followUp', '五、對前次建議改善事項之追蹤辦理情形'],
] as const satisfies readonly (readonly [keyof ServiceContent, string])[];

/** Form state: the body's fields side by side; numbers stay numbers, everything else is text. */
export interface ServiceForm {
  serviceOn: string;
  siteId: string;
  from: string;
  to: string;
  executorUserId: string;
  unit: string;
  departmentName: string;
  headcount: Headcount;
  special: { category: string; count: number }[];
  workplace: string;
  services: string;
  findings: string;
  followUp: string;
  signers: { role: string; name: string; email: string }[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Reads a record's `content` defensively: missing or malformed fields become empty values. */
export function readContent(content: unknown): ServiceContent {
  const c = (content && typeof content === 'object' ? content : {}) as Record<string, unknown>;
  const h = (c.headcount && typeof c.headcount === 'object' ? c.headcount : {}) as Record<string, unknown>;
  const special = Array.isArray(c.special) ? c.special : [];
  return {
    from: str(c.from), to: str(c.to), executorUserId: str(c.executorUserId),
    unit: str(c.unit), departmentName: str(c.departmentName),
    headcount: { adminM: num(h.adminM), adminF: num(h.adminF), opM: num(h.opM), opF: num(h.opF), general: num(h.general) },
    special: special.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object').map(s => ({ category: str(s.category), count: num(s.count) })),
    workplace: str(c.workplace), services: str(c.services), findings: str(c.findings), followUp: str(c.followUp),
  };
}

export const EMPTY_HEADCOUNT: Headcount = { adminM: 0, adminF: 0, opM: 0, opF: 0, general: 0 };

/** A blank record for today at my first site, executed by me, with me as the first signer; 事業單位 is the site's company. */
export function newForm({ today, siteId, me, unit = '' }: { today: string; siteId: string; me: { id: string; name: string; email: string }; unit?: string }): ServiceForm {
  return {
    serviceOn: today, siteId, from: '09:00', to: '12:00', executorUserId: me.id, unit, departmentName: '',
    headcount: { ...EMPTY_HEADCOUNT }, special: [], workplace: '', services: '', findings: '', followUp: '',
    signers: [{ role: '', name: me.name, email: me.email }],
  };
}

export function formFromRecord(r: ServiceRecord): ServiceForm {
  const { headcount, special, ...c } = readContent(r.content);
  return {
    ...c, serviceOn: r.serviceOn, siteId: r.siteId, headcount: { ...headcount }, special: special.map(s => ({ ...s })),
    signers: r.signatures.map(s => ({ role: s.role, name: s.name, email: s.email })),
  };
}

/** The prototype's 複製: a new draft dated today with the same content and signers, executed by me. */
export function copyForm(r: ServiceRecord, today: string, myId: string): ServiceForm {
  return { ...formFromRecord(r), serviceOn: today, executorUserId: myId };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type FormErrors = Partial<Record<'serviceOn' | 'siteId' | 'from' | 'to' | 'executorUserId' | 'special' | 'signers', string>>;

/** The checks the API makes, so most mistakes are caught before sending. `roles`: the tenant's sign-off roles, once loaded. */
export function formErrors(f: ServiceForm, roles?: readonly string[]): FormErrors {
  const e: FormErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.serviceOn)) e.serviceOn = '請填寫執行日期';
  if (!f.siteId) e.siteId = '請選擇地點';
  if (!TIME.test(f.from)) e.from = '請填寫開始時間';
  if (!TIME.test(f.to)) e.to = '請填寫結束時間';
  else if (TIME.test(f.from) && f.to <= f.from) e.to = '結束時間需晚於開始時間';
  if (!f.executorUserId) e.executorUserId = '請選擇執行人員';
  if (f.special.some(s => !s.category.trim() && s.count > 0)) e.special = '有人數的列請填寫作業類別';
  const signers = f.signers.filter(s => s.role.trim() || s.name.trim() || s.email.trim());
  if (!signers.length) e.signers = '至少要有一位簽核人員';
  else if (signers.some(s => !s.role.trim() || !s.name.trim())) e.signers = '每位簽核人員都要填人員類別與姓名';
  else if (roles && signers.some(s => !roles.includes(s.role.trim()))) e.signers = '有簽核人員類別不在租戶設定的簽核角色中，請重新選擇';
  else if (signers.some(s => !EMAIL.test(s.email.trim()))) e.signers = '請確認簽核人員的 Email';
  else if (signers.length > 10) e.signers = '簽核人員最多 10 位';
  return e;
}

/** The request body: trimmed text, empty special rows and blank signer rows dropped. */
export function toBody(f: ServiceForm): ServiceRecordBody {
  return {
    serviceOn: f.serviceOn, siteId: f.siteId,
    content: {
      from: f.from, to: f.to, executorUserId: f.executorUserId, unit: f.unit.trim(), departmentName: f.departmentName.trim(),
      headcount: { ...f.headcount },
      special: f.special.filter(s => s.category.trim()).map(s => ({ category: s.category.trim(), count: s.count })),
      workplace: f.workplace, services: f.services, findings: f.findings, followUp: f.followUp,
    },
    signers: f.signers.filter(s => s.role.trim() || s.name.trim() || s.email.trim())
      .map(s => ({ role: s.role.trim(), name: s.name.trim(), email: s.email.trim().toLowerCase() })),
  };
}

export const signProgress = (sigs: readonly Signature[]) => ({ signed: sigs.filter(s => s.signedAt).length, total: sigs.length });

export interface RecordFilter {
  status?: ServiceStatus;
  /** A company (法人), as the ids of its sites. */
  companySites?: readonly string[];
  siteId?: string;
  /** 部門名稱 as written on the record. */
  department?: string;
  executor?: string;
  from?: string;
  to?: string;
}

/** Newest service date first (the API's order), narrowed by status, company, site, department, executor and date range. */
export function filterRecords(records: readonly ServiceRecord[], f: RecordFilter): ServiceRecord[] {
  return records.filter(r => (!f.status || r.status === f.status) && (!f.companySites || f.companySites.includes(r.siteId))
    && (!f.siteId || r.siteId === f.siteId) && (!f.department || readContent(r.content).departmentName === f.department)
    && (!f.executor || readContent(r.content).executorUserId === f.executor)
    && (!f.from || r.serviceOn >= f.from) && (!f.to || r.serviceOn <= f.to));
}

export interface Company { id: string; name: string; siteIds: string[] }

/** Companies with at least one of my sites, with those sites. */
export function myCompanies(org: readonly OrgEntity[]): Company[] {
  return org.map(e => ({ id: e.id, name: e.name, siteIds: e.sites.filter(s => s.mine).map(s => s.id) })).filter(c => c.siteIds.length > 0);
}

/** Department names of these sites (all of mine when none are given), once each, in the organisation's order. */
export function departmentNames(org: readonly OrgEntity[], siteIds?: readonly string[]): string[] {
  const sites = org.flatMap(e => e.sites).filter(s => (siteIds ? siteIds.includes(s.id) : s.mine));
  return [...new Set(sites.flatMap(s => s.departments.map(d => d.name)))];
}

/** The company a site belongs to (事業單位 on the record). */
export const companyOfSite = (org: readonly OrgEntity[], siteId: string) => org.find(e => e.sites.some(s => s.id === siteId));

/** 事業單位 after picking another site: follows the site's company unless someone typed their own. */
export function unitForSite(org: readonly OrgEntity[], f: Pick<ServiceForm, 'siteId' | 'unit'>, nextSiteId: string): string {
  const before = companyOfSite(org, f.siteId)?.name ?? '';
  return !f.unit.trim() || f.unit.trim() === before ? companyOfSite(org, nextSiteId)?.name ?? f.unit : f.unit;
}

/** Executors named on these records, by name, for the filter. */
export function executorsOf(records: readonly ServiceRecord[]): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const r of records) {
    const id = readContent(r.content).executorUserId;
    if (id && !out.some(o => o.value === id)) out.push({ value: id, label: r.executorName ?? '已刪除的帳號' });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}

/** Sign-off roles to pick from: the tenant's list, plus any role a record already uses that is no longer on it. */
export function roleOptions(roles: readonly string[], used: readonly string[]): { value: string; label: string }[] {
  const extra = [...new Set(used.map(r => r.trim()).filter(r => r && !roles.includes(r)))];
  return [...roles.map(r => ({ value: r, label: r })), ...extra.map(r => ({ value: r, label: `${r}（已不在簽核角色）` }))];
}

/**
 * Whether sign-off links really go out by email. Only local development and the demo site sign in with the dev method,
 * and there the API only logs mail (EMAIL_PROVIDER=log); everywhere else it is sent.
 */
export const linksAreEmailed = (tenant: Pick<TenantInfo, 'loginMethods'>) => !tenant.loginMethods.includes('dev');

export function countByStatus(records: readonly ServiceRecord[]): Record<ServiceStatus, number> {
  const out = { 草稿: 0, 簽核中: 0, 已完成: 0 };
  for (const r of records) out[r.status] += 1;
  return out;
}

/** Values already used in this tenant's records, offered as suggestions (the API has no list of 作業類別). */
export function usedValues(records: readonly ServiceRecord[], pick: (r: ServiceRecord) => string[]): string[] {
  return [...new Set(records.flatMap(pick).map(v => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

/** Plain-language text for errors from the service-record endpoints. */
export function serviceProblem(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case 'unknown_sign_off_role': return '有簽核人員類別不在租戶設定的簽核角色中，請向租戶管理員確認可用的類別。';
      case 'unknown_staff': return '執行人員的帳號已停用，請改由在職的人員建立紀錄。';
      case 'outside_sites': return '這個地點不在你負責的廠區。';
      case 'not_draft': return '這筆紀錄已送出簽核，不能再修改或刪除。';
      case 'not_in_sign_off': return '這筆紀錄目前不在簽核中，不能重寄連結。';
      case 'already_signed': return '這位簽核人員已經簽核了。';
      case 'validation_failed': return '有欄位格式不正確，請檢查後再試一次。';
      case 'not_found': return '找不到這筆紀錄，可能已被刪除。';
    }
    if (err.status === 403) return '你的角色不能操作勞工健康服務紀錄。';
  }
  return '暫時無法完成，請檢查網路後再試一次。';
}

/** HH:mm～HH:mm, or — when missing. */
export const timeRange = (c: Pick<ServiceContent, 'from' | 'to'>) => (c.from && c.to ? `${c.from}～${c.to}` : '—');

export const slashDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).replaceAll('-', '/') : '—');
