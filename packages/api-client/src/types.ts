/*
 * Provisional types for the first two tenant API endpoints, written from the frontend/backend plan.
 * They will be replaced by types generated from the API's OpenAPI document; keep field names in sync until then.
 */

/** Staff roles, same values as the `staff_role` enum in @yutis/db. */
export const STAFF_ROLES = ['職護', '職醫', '職安衛人員', '人資', '部門主管', '租戶管理員'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type LoginMethod = 'sso' | 'password' | 'sms' | 'email_otp';

/** GET /api/tenant: resolved by the API from the subdomain, before login. */
export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  logoUrl: string | null;
  loginMethods: LoginMethod[];
}

/** GET /api/me: the signed-in staff member. Used only to hide menus; the API enforces permissions. */
export interface Me {
  id: string;
  name: string;
  role: StaffRole;
  /** Site ids this person is responsible for. */
  siteIds: string[];
}

/** Error body for non-2xx responses. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
}
