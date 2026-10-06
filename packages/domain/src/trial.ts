/* Online trial applications (線上申請試用) from the marketing site care.yutis.net. Shared by the site's form and the
 * platform API, so both reject the same input. */

/** Company size brackets offered on the form (員工人數). */
export const TRIAL_EMPLOYEE_RANGES = ['1-49', '50-99', '100-299', '300-999', '1000+'] as const;
export type TrialEmployeeRange = (typeof TRIAL_EMPLOYEE_RANGES)[number];

export const TRIAL_EMPLOYEE_RANGE_LABELS: Record<TrialEmployeeRange, string> = {
  '1-49': '50 人以下',
  '50-99': '50–99 人',
  '100-299': '100–299 人',
  '300-999': '300–999 人',
  '1000+': '1,000 人以上',
};

/** The company's account system (公司帳號系統), which decides how the tenant will sign in later. */
export const TRIAL_IDENTITY_PROVIDERS = ['microsoft', 'google', 'none'] as const;
export type TrialIdentityProvider = (typeof TRIAL_IDENTITY_PROVIDERS)[number];

export const TRIAL_IDENTITY_PROVIDER_LABELS: Record<TrialIdentityProvider, string> = {
  microsoft: 'Microsoft 365 / Entra ID',
  google: 'Google Workspace',
  none: '沒有統一帳號系統',
};

/** Trial length and seat cap the operator starts from when approving (adjustable before 開通). */
export const TRIAL_DAYS = 30;
export const TRIAL_SEAT_LIMIT = 100;

/**
 * Free and personal mailbox domains. The work email becomes the tenant's first administrator, so it must belong to the
 * company. Not exhaustive: the operator still reviews every application.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.tw', 'ymail.com', 'hotmail.com', 'hotmail.com.tw',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'proton.me',
  'protonmail.com', 'pm.me', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com', '163.com', '126.com', 'sina.com',
  'pchome.com.tw', 'seed.net.tw', 'hinet.net', 'msa.hinet.net', 'kimo.com',
]);

/** True when the address is at a free or personal mailbox provider. */
export function isFreeMailAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return FREE_MAIL_DOMAINS.has(domain);
}

const TAX_ID_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/**
 * 統一編號 (8 digits) with its check digit: each digit times its weight, the digits of each product summed, and the total
 * divisible by 5 (the 2023 rule, which also accepts every number valid under the old divisible-by-10 rule). When the
 * seventh digit is 7 its product 28 may count as 10 or 11, so one more than the total also passes.
 */
export function isValidTaxId(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = Number(value[i]) * TAX_ID_WEIGHTS[i]!;
    sum += Math.floor(product / 10) + (product % 10);
  }
  return sum % 5 === 0 || (value[6] === '7' && (sum + 1) % 5 === 0);
}

/** A Taiwan phone number as people type it: digits with optional +, spaces, dashes, brackets and an extension. */
export function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^[+(\d][\d\s()\-#]*$/.test(value.trim()) && digits.length >= 8 && digits.length <= 15;
}

/** Turn what an applicant typed as their preferred company code into a tenant subdomain candidate. */
export function normalizeCompanyCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 63);
}
