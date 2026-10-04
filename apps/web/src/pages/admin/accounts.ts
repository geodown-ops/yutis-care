/* Staff accounts (帳號與權限): filtering, counts and the checks made before saving. */
import { STAFF_ROLES, type Schemas, type StaffRole } from '@yutis/api-client';

export type StaffAccount = Schemas['StaffAccountDto'];

/** Roles that work through site scope: without a site they see no employees at all. */
export const SITE_ROLES: readonly StaffRole[] = ['職護', '職醫'];

export interface AccountFilter { q?: string; role?: StaffRole | null; siteId?: string | null; active?: boolean | null }

export function filterAccounts(list: readonly StaffAccount[], f: AccountFilter): StaffAccount[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter(a =>
    (!q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
    && (!f.role || a.role === f.role)
    && (!f.siteId || a.siteIds.includes(f.siteId))
    && (f.active == null || a.active === f.active));
}

/** Active accounts per role, in the back office's role order. */
export function countByRole(list: readonly StaffAccount[]): { role: StaffRole; active: number }[] {
  return STAFF_ROLES.map(role => ({ role, active: list.filter(a => a.active && a.role === role).length }));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Last sign-in as local "YYYY/MM/DD HH:mm", or why there is none. */
export function signInText(a: Pick<StaffAccount, 'lastSignInAt' | 'signedInBefore'>): string {
  if (!a.lastSignInAt) return a.signedInBefore ? '已登入過' : '尚未登入';
  const d = new Date(a.lastSignInAt);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const inactiveCount = (list: readonly StaffAccount[]) => list.filter(a => !a.active).length;

export interface AccountForm {
  name: string; email: string; role: StaffRole; siteIds: string[]; phone: string; qualification: string; active: boolean;
}

export const emptyAccountForm = (): AccountForm => ({ name: '', email: '', role: '職護', siteIds: [], phone: '', qualification: '', active: true });

export const accountToForm = (a: StaffAccount): AccountForm => ({
  name: a.name, email: a.email, role: a.role, siteIds: [...a.siteIds], phone: a.phone ?? '', qualification: a.qualification ?? '', active: a.active,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What stops the form from being sent, as field → message. Empty when it can be saved. */
export function accountFormProblems(f: AccountForm, opts: { isNew: boolean; isSelf: boolean; original?: StaffAccount }): Partial<Record<keyof AccountForm, string>> {
  const p: Partial<Record<keyof AccountForm, string>> = {};
  if (!f.name.trim()) p.name = '請填寫姓名';
  if (opts.isNew && !EMAIL.test(f.email.trim())) p.email = '請填寫正確的 Email';
  if (SITE_ROLES.includes(f.role) && f.active && f.siteIds.length === 0) p.siteIds = `${f.role}至少要負責一個廠區`;
  if (opts.isSelf && opts.original && f.role !== opts.original.role) p.role = '不能變更自己的角色';
  if (opts.isSelf && !f.active) p.active = '不能停用自己';
  return p;
}

const orNull = (s: string) => s.trim() || null;

export const inviteBody = (f: AccountForm) => ({
  email: f.email.trim(), name: f.name.trim(), role: f.role, siteIds: f.siteIds, phone: orNull(f.phone), qualification: orNull(f.qualification),
});

/** Only the fields that changed, so a PATCH never touches what the admin left alone. */
export function updateBody(original: StaffAccount, f: AccountForm) {
  const body: { name?: string; role?: StaffRole; siteIds?: string[]; phone?: string | null; qualification?: string | null; active?: boolean } = {};
  if (f.name.trim() !== original.name) body.name = f.name.trim();
  if (f.role !== original.role) body.role = f.role;
  if ([...f.siteIds].sort().join() !== [...original.siteIds].sort().join()) body.siteIds = f.siteIds;
  if (orNull(f.phone) !== original.phone) body.phone = orNull(f.phone);
  if (orNull(f.qualification) !== original.qualification) body.qualification = orNull(f.qualification);
  if (f.active !== original.active) body.active = f.active;
  return body;
}
