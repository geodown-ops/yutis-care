/*
 * Names for the generated API types the apps use. Everything else comes straight from ./generated, which is generated
 * from the APIs' OpenAPI documents (`pnpm --filter @yutis/api-client generate`); never write API shapes by hand here.
 */
import type { components as PlatformComponents } from './generated/platform-api';
import type { components as TenantComponents } from './generated/tenant-api';

export type Schemas = TenantComponents['schemas'];
export type PlatformSchemas = PlatformComponents['schemas'];

export type StaffMe = Schemas['StaffMeDto'];
export type EmployeeMe = Schemas['EmployeeMeDto'];
/** GET /api/me: a back-office staff member or an employee, by `kind`. */
export type Me = StaffMe | EmployeeMe;
export type StaffRole = StaffMe['role'];
export type Feature = StaffMe['features'][number];
export type DataCategory = StaffMe['dataCategories'][number];
export type LoginMethod = Schemas['TenantDto']['loginMethods'][number];

/** Staff roles, in the order the back office lists them. Same values as the `staff_role` enum. */
export const STAFF_ROLES = ['職護', '職醫', '職安衛人員', '人資', '部門主管', '租戶管理員'] as const satisfies readonly StaffRole[];

/** Identity Platform settings for the sign-in page; null on the demo tenant and wherever only dev sign-in exists. */
export type IdentityPlatformConfig = Schemas['IdentityPlatformDto'];

/** GET /api/tenant: resolved from the subdomain, before sign-in. */
export type TenantInfo = Schemas['TenantDto'];
