/*
 * What each platform role may do (平台角色). Nobody on the platform can see tenant employees or health data; that is
 * enforced by the database role, not here. This table is a first proposal for Yutis to confirm.
 */
import type { PlatformRole } from '../core/context.js';

export const PERMISSIONS = [
  /** Tenant list and detail, plans, usage counts, announcements, templates. */
  'tenants:read',
  /** Onboard, suspend and reactivate tenants. */
  'tenants:write',
  /** Plans and tenant subscriptions. */
  'subscriptions:write',
  /** Create and edit system announcements. */
  'announcements:write',
  /** Publish new versions of the default templates new tenants start from. */
  'templates:write',
  /** Platform accounts and their roles. */
  'platform-users:manage',
  /** The platform audit log: who did what in the platform admin. */
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  /** Operations: customers, plans, announcements and templates. */
  營運: ['tenants:read', 'tenants:write', 'subscriptions:write', 'announcements:write', 'templates:write', 'audit:read'],
  /** Support: reads customer status, posts announcements. Entering a tenant needs that tenant admin's grant. */
  客服: ['tenants:read', 'announcements:write', 'audit:read'],
  /** Engineering: reads customer status, templates and platform accounts. */
  工程: ['tenants:read', 'templates:write', 'platform-users:manage', 'audit:read'],
};

export const can = (role: PlatformRole, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);
