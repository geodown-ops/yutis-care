/* Form checks that mirror the platform API's limits, so most mistakes show next to the field before any request. */
import type { PlatformPaths } from '@yutis/api-client';
import type { Plan, PlatformRole } from './api';

/** Field → problem, in plain Chinese; a field without a problem is absent. */
export type Problems<F> = Partial<Record<keyof F, string>>;

export const withoutEmpty = <F>(p: Problems<F>): Problems<F> => Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Problems<F>;

/** A required text field of at most `max` characters (after trimming, as the API counts). */
export const textProblem = (value: string, what: string, max: number) =>
  !value.trim() ? `請輸入${what}` : value.trim().length > max ? `${what}最多 ${max} 字` : undefined;

/** A quick check before the API's own, stricter, email validation. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailProblem = (value: string) => (!value.trim() ? '請輸入 Email' : EMAIL.test(value.trim()) ? undefined : 'Email 格式不正確');

/** POST and PATCH /platform-api/platform-users. The email cannot change after the account exists. */
export interface PlatformUserForm {
  email: string;
  name: string;
  role: PlatformRole;
  active: boolean;
}

export const platformUserProblems = (f: PlatformUserForm, isNew: boolean): Problems<PlatformUserForm> => withoutEmpty({
  email: isNew ? emailProblem(f.email) : undefined,
  name: textProblem(f.name, '姓名', 100),
});

/** PATCH /platform-api/plans/{id}: the name and whether it can still be chosen. The code never changes. */
export interface PlanForm {
  name: string;
  active: boolean;
}

export type PlanUpdate = PlatformPaths['/platform-api/plans/{id}']['patch']['requestBody']['content']['application/json'];

export const planProblems = (f: PlanForm): Problems<PlanForm> => withoutEmpty({ name: textProblem(f.name, '方案名稱', 100) });

/** Only what changed (the API refuses an empty change); null when nothing did. */
export function planUpdate(plan: Pick<Plan, 'name' | 'active'>, f: PlanForm): PlanUpdate | null {
  const body: PlanUpdate = {
    ...(f.name.trim() !== plan.name ? { name: f.name.trim() } : {}),
    ...(f.active !== plan.active ? { active: f.active } : {}),
  };
  return Object.keys(body).length ? body : null;
}
