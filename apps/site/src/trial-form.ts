/* The trial application form's rules, without the DOM: what counts as valid, the request it sends, and how the API's
 * answers read to the applicant. The same rules from @yutis/domain run again on the platform API. */
import {
  isFreeMailAddress,
  isPlausiblePhone,
  isValidTaxId,
  normalizeCompanyCode,
  TRIAL_EMPLOYEE_RANGES,
  TRIAL_IDENTITY_PROVIDERS,
  type TrialEmployeeRange,
  type TrialIdentityProvider,
} from '@yutis/domain';

/** Where the site sends applications; nginx serves the platform API under this path on the site's own host. */
export const TRIAL_ENDPOINT = '/platform-api/public/trial-applications';
export const CONTACT_EMAIL = 'care@yutis.net';

/** What the applicant typed, as read from the form. */
export interface TrialFormValues {
  companyName: string;
  taxId: string;
  employeeRange: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  preferredSubdomain: string;
  identityProvider: string;
  consent: boolean;
  /** Honeypot. */
  website: string;
}

export type TrialField = Exclude<keyof TrialFormValues, 'website'>;
export type FieldErrors = Partial<Record<TrialField, string>>;

export interface TrialApplicationRequest {
  companyName: string;
  taxId: string;
  employeeRange: TrialEmployeeRange;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  preferredSubdomain: string | null;
  identityProvider: TrialIdentityProvider | null;
  consent: true;
  website: string;
  elapsedMs: number;
}

export const FREE_MAIL_MESSAGE = '請使用公司信箱，不能使用免費信箱：這個 Email 會成為貴公司的第一位管理員。';
export const TAX_ID_MESSAGE = '統一編號不正確，請再確認一次。';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fullwidth digits and stray spaces or dashes in a 統一編號, the way people paste it. */
export function cleanTaxId(value: string): string {
  return value.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[\s-]/g, '');
}

function required(value: string, label: string, max: number): string | undefined {
  const v = value.trim();
  if (!v) return `請填寫${label}`;
  if (v.length > max) return `${label}最多 ${max} 個字`;
  return undefined;
}

/** Field errors in 繁體中文, empty when the form can be sent. */
export function validateTrialForm(v: TrialFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const set = (field: TrialField, message: string | undefined) => { if (message) errors[field] = message; };

  set('companyName', required(v.companyName, '公司名稱', 100));
  const taxId = cleanTaxId(v.taxId);
  set('taxId', !taxId ? '請填寫統一編號' : !/^\d{8}$/.test(taxId) ? '統一編號是 8 位數字' : !isValidTaxId(taxId) ? TAX_ID_MESSAGE : undefined);
  set('employeeRange', (TRIAL_EMPLOYEE_RANGES as readonly string[]).includes(v.employeeRange) ? undefined : '請選擇員工人數');
  set('contactName', required(v.contactName, '聯絡人姓名', 50));
  set('contactTitle', required(v.contactTitle, '職稱', 50));
  const email = v.email.trim();
  set('email', !email ? '請填寫公司 Email' : email.length > 254 || !EMAIL.test(email) ? 'Email 格式不正確' : isFreeMailAddress(email) ? FREE_MAIL_MESSAGE : undefined);
  const phone = v.phone.trim();
  set('phone', !phone ? '請填寫電話' : phone.length > 30 || !isPlausiblePhone(phone) ? '電話格式不正確，例如 02-2345-6789' : undefined);
  if (v.preferredSubdomain.trim() && !normalizeCompanyCode(v.preferredSubdomain)) {
    set('preferredSubdomain', '公司代碼請用英文字母、數字或連字號（-）');
  }
  if (v.identityProvider && !(TRIAL_IDENTITY_PROVIDERS as readonly string[]).includes(v.identityProvider)) {
    set('identityProvider', '請選擇公司帳號系統');
  }
  if (!v.consent) set('consent', '請閱讀並同意隱私權政策與試用條款');
  return errors;
}

/** The web address a preferred company code would become, or null while there is nothing usable to show. */
export function subdomainPreview(value: string, base = 'care.yutis.net'): string | null {
  const code = normalizeCompanyCode(value);
  return code ? `${code}.${base}` : null;
}

/** The JSON body for the platform API. Call only with values that passed validateTrialForm. */
export function buildTrialRequest(v: TrialFormValues, elapsedMs: number): TrialApplicationRequest {
  const provider = (TRIAL_IDENTITY_PROVIDERS as readonly string[]).includes(v.identityProvider) ? (v.identityProvider as TrialIdentityProvider) : null;
  return {
    companyName: v.companyName.trim(),
    taxId: cleanTaxId(v.taxId),
    employeeRange: v.employeeRange as TrialEmployeeRange,
    contactName: v.contactName.trim(),
    contactTitle: v.contactTitle.trim(),
    email: v.email.trim().toLowerCase(),
    phone: v.phone.trim(),
    preferredSubdomain: normalizeCompanyCode(v.preferredSubdomain) || null,
    identityProvider: provider,
    consent: true,
    website: v.website,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

export type SubmitOutcome =
  | { kind: 'received' }
  | { kind: 'field'; field: TrialField; message: string }
  | { kind: 'error'; message: string; contact: boolean };

export const GENERIC_ERROR = `送出時發生問題，請稍後再試，或直接來信 ${CONTACT_EMAIL}。`;

/** What a response from the platform API means for the applicant. `status` 0 means the request never got an answer. */
export function interpretTrialResponse(status: number, body: unknown): SubmitOutcome {
  if (status === 202 || status === 200) return { kind: 'received' };
  if (status === 429) return { kind: 'error', message: '申請次數過多，請稍後再試。', contact: false };
  if (status === 400) {
    const code = typeof body === 'object' && body !== null && 'code' in body ? (body as { code: unknown }).code : undefined;
    if (code === 'free_mail') return { kind: 'field', field: 'email', message: FREE_MAIL_MESSAGE };
    if (code === 'invalid_tax_id') return { kind: 'field', field: 'taxId', message: TAX_ID_MESSAGE };
    return { kind: 'error', message: `部分欄位內容無法接受，請檢查後再送出。若問題持續，請來信 ${CONTACT_EMAIL}。`, contact: true };
  }
  return { kind: 'error', message: GENERIC_ERROR, contact: true };
}
