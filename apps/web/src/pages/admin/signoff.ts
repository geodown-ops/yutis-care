/* Sign-off roles (簽核角色): who can be asked to sign 附表八 service records and violence-prevention reviews. */

/** Limits of PUT /api/admin/sign-off-roles (SignOffRoles in apps/api/src/service/sign-off.ts). */
export const SIGN_OFF_ROLES_MAX = 30;
export const SIGN_OFF_ROLE_LENGTH = 50;

/** What stops the sign-off roles from being saved; empty when they can be. */
export function signOffRoleProblems(roles: readonly string[]): string[] {
  const names = roles.map(r => r.trim());
  const p: string[] = [];
  if (names.length === 0) p.push('至少要有一個簽核角色');
  if (names.length > SIGN_OFF_ROLES_MAX) p.push(`最多 ${SIGN_OFF_ROLES_MAX} 個簽核角色`);
  if (names.some(n => n === '')) p.push('角色名稱不能空白');
  const long = names.filter(n => n.length > SIGN_OFF_ROLE_LENGTH);
  if (long.length) p.push(`角色名稱最多 ${SIGN_OFF_ROLE_LENGTH} 字：${long.join('、')}`);
  const dup = [...new Set(names.filter((n, i) => n && names.indexOf(n) !== i))];
  if (dup.length) p.push(`角色重複：${dup.join('、')}`);
  return p;
}

/** The list with item `i` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveItem<T>(list: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v.trim() === b[i]);
