/* Staff pickers (GET /api/staff?roles=…): active staff in the roles that may take the job, me first. */
import type { ComboboxItem, ComboboxParsedItem } from '@mantine/core';
import type { Schemas, StaffRole } from '@yutis/api-client';

export type StaffMember = Schemas['StaffMemberDto'];
/**
 * A picker option. `title` is "姓名（角色）" and `email` the work email shown under it, so two people with the same name
 * can be told apart; `label` (what the closed picker shows) carries the email too when the name is not unique.
 */
export interface StaffOption { value: string; label: string; title?: string; email?: string }

/** Case lead, follow-up owner and record helpers: occupational health staff (cases and records need health data). */
export const CARE_ROLES = ['職護', '職醫'] as const satisfies readonly StaffRole[];
/** 附表八 executor: the roles that keep service records (ENVIRONMENT_ROLES in the API). */
export const SERVICE_ROLES = ['職護', '職醫', '職安衛人員'] as const satisfies readonly StaffRole[];

/** People a record already names, kept selectable when they are no longer in the list. */
export interface KeptPerson { id: string | null | undefined; name?: string | null }

/** Names that more than one person in the list has. */
const sharedNames = (staff: readonly Pick<StaffMember, 'name'>[]) => {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const s of staff) (seen.has(s.name) ? shared : seen).add(s.name);
  return shared;
};

/**
 * Picker options: me first, then the others in the API's (name) order, as "姓名（角色）" with the email under it. Someone a
 * record already names who is not in the list (deactivated) stays selectable and marked, so opening an old record does
 * not drop them. While the list loads (`staff` undefined) only the people already named are offered, by name.
 */
export function staffOptions(staff: readonly StaffMember[] | undefined, meId: string, keep: readonly KeptPerson[] = []): StaffOption[] {
  if (!staff) {
    const named: StaffOption[] = [];
    for (const k of keep) if (k.id && !named.some(o => o.value === k.id)) named.push({ value: k.id, label: k.name || '…' });
    return named;
  }
  const shared = sharedNames(staff);
  const ordered = [...staff.filter(s => s.id === meId), ...staff.filter(s => s.id !== meId)];
  const out: StaffOption[] = ordered.map(s => {
    const title = `${s.name}（${s.role}${s.id === meId ? '・我' : ''}）`;
    return { value: s.id, label: shared.has(s.name) ? `${title} ${s.email}` : title, title, email: s.email };
  });
  for (const k of keep) {
    if (k.id && !out.some(o => o.value === k.id)) out.push({ value: k.id, label: `${k.name || '其他人員'}（已停用）` });
  }
  return out;
}

/** Search for staff pickers: by name, role or email. */
export function staffFilter({ options, search }: { options: ComboboxParsedItem[]; search: string }): ComboboxParsedItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return options;
  return options.filter(o => {
    if ('group' in o) return true;
    const email = (o as ComboboxItem & { email?: string }).email ?? '';
    return o.label.toLowerCase().includes(q) || email.toLowerCase().includes(q);
  });
}

/** A staff member's name, for showing who helped or follows up; with the email when someone else has the same name. */
export function staffName(staff: readonly StaffMember[] | undefined, id: string | null | undefined): string {
  const s = id ? staff?.find(x => x.id === id) : undefined;
  if (!s) return '其他人員';
  return staff!.some(x => x.id !== s.id && x.name === s.name) ? `${s.name}（${s.email}）` : s.name;
}
