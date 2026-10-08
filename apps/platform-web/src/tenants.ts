/* Tenant figures and checks the platform admin works out from the API's tenant rows. */
import { DEMO_SITE_SUBDOMAIN, isAvailableTenantSubdomain, RESERVED_SUBDOMAINS } from '@yutis/domain';
import type { Subscription, SubscriptionStatus, Tenant, TenantDetail, Usage } from './api';
import { emailProblem, textProblem, withoutEmpty, type Problems } from './forms';

export interface TenantOverview {
  active: number;
  suspended: number;
  closed: number;
  /** Active tenants whose current subscription is a trial. */
  trial: number;
  /** In-service employees across active and suspended tenants. */
  activeEmployees: number;
  staffAccounts: number;
  /** Tenants with more in-service employees than their seat limit (a reminder; nothing is blocked). */
  overSeatLimit: number;
}

export function tenantOverview(tenants: readonly Tenant[]): TenantOverview {
  const open = tenants.filter(t => t.status !== 'closed');
  return {
    active: tenants.filter(t => t.status === 'active').length,
    suspended: tenants.filter(t => t.status === 'suspended').length,
    closed: tenants.length - open.length,
    trial: tenants.filter(t => t.status === 'active' && t.subscription?.status === 'trial').length,
    activeEmployees: open.reduce((sum, t) => sum + t.activeEmployees, 0),
    staffAccounts: open.reduce((sum, t) => sum + t.staffAccounts, 0),
    overSeatLimit: open.filter(t => t.overSeatLimit).length,
  };
}

/** Usage summed over every tenant, for the usage page's tiles. */
export function usageTotals(rows: readonly Usage[]): Pick<Usage, 'activeEmployees' | 'staffAccounts' | 'examsInMonth' | 'smsSent'> {
  const sum = (k: 'activeEmployees' | 'staffAccounts' | 'examsInMonth' | 'smsSent') => rows.reduce((s, r) => s + r[k], 0);
  return { activeEmployees: sum('activeEmployees'), staffAccounts: sum('staffAccounts'), examsInMonth: sum('examsInMonth'), smsSent: sum('smsSent') };
}

/** Name or subdomain contains the query (case-insensitive). */
export function matchesTenant(t: Pick<Tenant, 'name' | 'subdomain'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || t.name.toLowerCase().includes(q) || t.subdomain.includes(q);
}

/** Seat use for a progress bar: percent is capped at 100 and null when there is no limit. */
export function seatUsage(activeEmployees: number, seatLimit: number | null): { percent: number | null; over: boolean } {
  if (seatLimit == null || seatLimit <= 0) return { percent: null, over: false };
  return { percent: Math.min(100, (activeEmployees / seatLimit) * 100), over: activeEmployees > seatLimit };
}

/** Onboarding steps the tenant still lacks, in plain Chinese; empty when it is fully set up. */
export function pendingSetup(t: Pick<TenantDetail, 'encryptionKeyReady' | 'signInTenantReady'>): string[] {
  return [
    ...(t.encryptionKeyReady ? [] : ['租戶金鑰（Cloud KMS）尚未建立']),
    ...(t.signInTenantReady ? [] : ['登入租戶（Identity Platform）尚未建立']),
  ];
}

/**
 * The domain tenants are served under, for the address preview when onboarding: taken from a tenant the API already
 * lists (the API builds each url from its own setting), else from this site's address (admin.{domain}); null when
 * neither tells, as on a local machine with no tenants yet.
 */
export function tenantBaseDomain(tenants: readonly Pick<Tenant, 'subdomain' | 'url'>[] | undefined, hostname: string): string | null {
  for (const t of tenants ?? []) {
    let host: string;
    try { host = new URL(t.url).hostname; } catch { continue; }
    if (host.startsWith(`${t.subdomain}.`)) return host.slice(t.subdomain.length + 1);
  }
  return hostname.startsWith('admin.') ? hostname.slice('admin.'.length) : null;
}

/** What the API does with a typed subdomain before checking it (OnboardTenant: trim, lower-case). */
export const normalizeSubdomain = (value: string) => value.trim().toLowerCase();

/**
 * Why a new tenant cannot have this subdomain, or null if onboarding accepts it: the domain's
 * `isAvailableTenantSubdomain` (one lower-case DNS label of letters, digits and inner hyphens, at most 63, not reserved
 * for the platform, and not demo.{domain}, the separate marketing demo site).
 */
export function subdomainProblem(slug: string): string | null {
  if (isAvailableTenantSubdomain(slug)) return null;
  if (slug === DEMO_SITE_SUBDOMAIN) return `「${slug}」是展示網站使用的網址，請換一個`;
  if (!slug) return '請輸入子網域';
  if (RESERVED_SUBDOMAINS.has(slug)) return `「${slug}」是平台保留的名稱，請換一個`;
  if (/[^a-z0-9-]/.test(slug)) return '只能使用小寫英文字母、數字和連字號（-）';
  if (slug.startsWith('-') || slug.endsWith('-')) return '開頭和結尾不能是連字號';
  if (slug.length > 63) return '最多 63 個字元';
  return '子網域格式不正確';
}

/** Seat limit as a NumberInput holds it: '' means no limit. */
export type SeatLimitInput = number | string;

export const seatLimitValue = (v: SeatLimitInput): number | null => (v === '' ? null : Number(v));
export const seatLimitProblem = (v: SeatLimitInput) => {
  const n = seatLimitValue(v);
  return n != null && (!Number.isInteger(n) || n <= 0) ? '人數上限要是正整數，不限人數請留空' : undefined;
};
export const termProblem = (startsOn: string, endsOn: string) => (endsOn && startsOn && endsOn < startsOn ? '結束日不能早於開始日' : undefined);

/** PUT /platform-api/tenants/{id}/subscription, as a form. Dates are YYYY-MM-DD; endsOn '' means open-ended. */
export interface SubscriptionForm {
  planCode: string;
  status: SubscriptionStatus;
  seatLimit: SeatLimitInput;
  startsOn: string;
  endsOn: string;
}

export const subscriptionToForm = (s: Subscription | null, today: string): SubscriptionForm => ({
  planCode: s?.planCode ?? '', status: s?.status ?? 'trial', seatLimit: s?.seatLimit ?? '', startsOn: s?.startsOn ?? today, endsOn: s?.endsOn ?? '',
});

export const subscriptionBody = (f: SubscriptionForm) => ({
  planCode: f.planCode, status: f.status, seatLimit: seatLimitValue(f.seatLimit), startsOn: f.startsOn, endsOn: f.endsOn || null,
});

export const subscriptionProblems = (f: SubscriptionForm): Problems<SubscriptionForm> => withoutEmpty({
  planCode: f.planCode ? undefined : '請選擇方案',
  seatLimit: seatLimitProblem(f.seatLimit),
  startsOn: f.startsOn ? undefined : '請選擇開始日',
  endsOn: termProblem(f.startsOn, f.endsOn),
});

/** ISO dates (YYYY-MM-DD) one day apart. */
export const dayBefore = (date: string) => new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
export const dayAfter = (date: string) => new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);

/**
 * Which history row (newest first) is the current subscription, as the API picks it: the newest that has started,
 * else the earliest. -1 without any. A renewal can start later, so the newest row is not always the current one.
 */
export function currentPeriodIndex(subscriptions: readonly Pick<Subscription, 'startsOn'>[], today: string): number {
  if (!subscriptions.length) return -1;
  const started = subscriptions.findIndex(s => s.startsOn <= today);
  return started === -1 ? subscriptions.length - 1 : started;
}

/**
 * POST /platform-api/tenants/{id}/subscriptions (續約、換方案), as a form: same plan and seat limit as the latest
 * period, starting the day after it ends (or today when it has no end), as a paid period without an end date.
 */
export function newPeriodToForm(latest: Subscription | null, today: string): SubscriptionForm {
  let startsOn = latest?.endsOn ? dayAfter(latest.endsOn) : today;
  if (latest && startsOn <= latest.startsOn) startsOn = dayAfter(latest.startsOn);
  return { planCode: latest?.planCode ?? '', status: 'active', seatLimit: latest?.seatLimit ?? '', startsOn, endsOn: '' };
}

/** As the subscription form, and a new period must start after the latest one's start (the API's period_overlap). */
export function newPeriodProblems(f: SubscriptionForm, latest: Pick<Subscription, 'startsOn'> | null, activePlanCodes: readonly string[] | null): Problems<SubscriptionForm> {
  const problems = subscriptionProblems(f);
  return withoutEmpty({
    ...problems,
    planCode: problems.planCode ?? (activePlanCodes && !activePlanCodes.includes(f.planCode) ? '這個方案已停用，請選擇其他方案' : undefined),
    startsOn: problems.startsOn ?? (latest && f.startsOn <= latest.startsOn ? `要晚於最近一期的開始日（${latest.startsOn.replaceAll('-', '/')}）` : undefined),
  });
}

/** The end date the API gives the latest period when a new one starts on `startsOn`, or null when it stays as it is. */
export function latestPeriodNewEnd(latest: Pick<Subscription, 'startsOn' | 'endsOn'> | null, startsOn: string): string | null {
  if (!latest || !startsOn || startsOn <= latest.startsOn) return null;
  return latest.endsOn === null || latest.endsOn >= startsOn ? dayBefore(startsOn) : null;
}

/** POST /platform-api/tenants, as a form. A new tenant starts on a trial or a paid subscription only. */
export interface NewTenantForm {
  name: string;
  subdomain: string;
  planCode: string;
  subscriptionStatus: 'trial' | 'active';
  seatLimit: SeatLimitInput;
  startsOn: string;
  endsOn: string;
  adminName: string;
  adminEmail: string;
}

export const emptyNewTenantForm = (today: string): NewTenantForm => ({
  name: '', subdomain: '', planCode: '', subscriptionStatus: 'trial', seatLimit: '', startsOn: today, endsOn: '', adminName: '', adminEmail: '',
});

export const newTenantBody = (f: NewTenantForm) => ({
  name: f.name.trim(),
  subdomain: normalizeSubdomain(f.subdomain),
  planCode: f.planCode,
  subscriptionStatus: f.subscriptionStatus,
  seatLimit: seatLimitValue(f.seatLimit),
  startsOn: f.startsOn,
  endsOn: f.endsOn || null,
  admin: { name: f.adminName.trim(), email: f.adminEmail.trim().toLowerCase() },
});

export const newTenantProblems = (f: NewTenantForm): Problems<NewTenantForm> => withoutEmpty({
  name: textProblem(f.name, '公司名稱', 100),
  subdomain: subdomainProblem(normalizeSubdomain(f.subdomain)) ?? undefined,
  planCode: f.planCode ? undefined : '請選擇方案',
  seatLimit: seatLimitProblem(f.seatLimit),
  startsOn: f.startsOn ? undefined : '請選擇開始日',
  endsOn: termProblem(f.startsOn, f.endsOn),
  adminName: textProblem(f.adminName, '姓名', 100),
  adminEmail: emailProblem(f.adminEmail),
});
