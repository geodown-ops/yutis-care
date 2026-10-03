/*
 * Every route declares who may call it with exactly one of these decorators; a route without one is refused
 * (deny by default). The access guard reads the rule.
 */
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { DataCategory, Feature } from './permissions.js';

export type AccessRule =
  | { kind: 'no-tenant' }
  | { kind: 'public' }
  | { kind: 'signed-in' }
  | { kind: 'staff'; data?: DataCategory; feature?: Feature }
  | { kind: 'employee' };

export const ACCESS_RULE = 'yutis:access-rule';
export const SESSION_SECURITY = 'session';

const tenantResponses = [
  ApiNotFoundResponse({ description: '網址不是任何租戶的子網域' }),
  ApiForbiddenResponse({ description: '租戶已停用，或沒有權限' }),
];
const signedInResponses = [ApiCookieAuth(SESSION_SECURITY), ApiUnauthorizedResponse({ description: '未登入或登入已逾時' })];

/** Not tied to a tenant: health checks. */
export const NoTenant = () => SetMetadata(ACCESS_RULE, { kind: 'no-tenant' } satisfies AccessRule);

/** Resolves the tenant from the subdomain but needs no sign-in. */
export const Public = () => applyDecorators(SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule), ...tenantResponses);

/** Any signed-in staff member or employee of this tenant. */
export const SignedIn = () =>
  applyDecorators(SetMetadata(ACCESS_RULE, { kind: 'signed-in' } satisfies AccessRule), ...tenantResponses, ...signedInResponses);

/**
 * Signed-in staff whose role may see `data` and use `feature`. Routes about one employee must also check the
 * employee's site with `assertSiteAccess`.
 */
export const StaffOnly = (need: { data?: DataCategory; feature?: Feature } = {}) =>
  applyDecorators(SetMetadata(ACCESS_RULE, { kind: 'staff', ...need } satisfies AccessRule), ...tenantResponses, ...signedInResponses);

/** A signed-in employee (employee portal); such routes only ever return the employee's own data. */
export const EmployeeOnly = () =>
  applyDecorators(SetMetadata(ACCESS_RULE, { kind: 'employee' } satisfies AccessRule), ...tenantResponses, ...signedInResponses);
