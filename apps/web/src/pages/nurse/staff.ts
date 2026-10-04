/* Staff pickers (GET /api/staff?roles=…): active staff in the roles that may take the job, me first. */
import type { Schemas, StaffRole } from '@yutis/api-client';

export type StaffMember = Schemas['StaffMemberDto'];
export interface StaffOption { value: string; label: string }

/** Case lead, follow-up owner and record helpers: occupational health staff (cases and records need health data). */
export const CARE_ROLES = ['職護', '職醫'] as const satisfies readonly StaffRole[];
/** 附表八 executor: the roles that keep service records (ENVIRONMENT_ROLES in the API). */
export const SERVICE_ROLES = ['職護', '職醫', '職安衛人員'] as const satisfies readonly StaffRole[];

/** People a record already names, kept selectable when they are no longer in the list. */
export interface KeptPerson { id: string | null | undefined; name?: string | null }

/**
 * Picker options: me first, then the others in the API's (name) order, as "姓名（角色）". Someone a record already names
 * who is not in the list (deactivated) stays selectable and marked, so opening an old record does not drop them.
 * While the list loads (`staff` undefined) only the people already named are offered, by name.
 */
export function staffOptions(staff: readonly StaffMember[] | undefined, meId: string, keep: readonly KeptPerson[] = []): StaffOption[] {
  if (!staff) {
    const named: StaffOption[] = [];
    for (const k of keep) if (k.id && !named.some(o => o.value === k.id)) named.push({ value: k.id, label: k.name || '…' });
    return named;
  }
  const ordered = [...staff.filter(s => s.id === meId), ...staff.filter(s => s.id !== meId)];
  const out = ordered.map(s => ({ value: s.id, label: `${s.name}（${s.role}${s.id === meId ? '・我' : ''}）` }));
  for (const k of keep) {
    if (k.id && !out.some(o => o.value === k.id)) out.push({ value: k.id, label: `${k.name || '其他人員'}（已停用）` });
  }
  return out;
}

/** A staff member's name, for showing who helped or follows up. */
export const staffName = (staff: readonly StaffMember[] | undefined, id: string | null | undefined) =>
  (id && staff?.find(s => s.id === id)?.name) || '其他人員';
