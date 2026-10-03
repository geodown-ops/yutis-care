/* Staff accounts, roles and site scope (帳號與權限). Employees sign in to the employee portal via `employees`, not here. */
import { boolean, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { base, staffRoleEnum, tenantKey, tenantRef } from './common.js';
import { sites } from './org.js';

export const users = pgTable('users', {
  ...base(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: staffRoleEnum('role').notNull(),
  phone: text('phone'),
  /** Training or licence that qualifies the person for occupational health work (勞工健康服務人員資格). */
  qualification: text('qualification'),
  /** OIDC issuer + subject from the tenant's identity provider; null for local accounts. */
  idpIssuer: text('idp_issuer'),
  idpSubject: text('idp_subject'),
  mfaEnrolled: boolean('mfa_enrolled').notNull().default(false),
  active: boolean('active').notNull().default(true),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
}, t => [tenantKey(t), unique().on(t.tenantId, t.email), unique().on(t.tenantId, t.idpIssuer, t.idpSubject)]);

/** Sites a staff member is responsible for; all health-data reads are limited to these sites. */
export const userSiteScopes = pgTable('user_site_scopes', {
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  siteId: uuid('site_id').notNull(),
}, t => [
  primaryKey({ columns: [t.tenantId, t.userId, t.siteId] }),
  tenantRef('user_site_scopes_user_fk', t, t.userId, users),
  tenantRef('user_site_scopes_site_fk', t, t.siteId, sites),
]);

/** Time-limited access outside one's own sites (破窗存取): reason required, the site's lead staff is notified. */
export const breakGlassGrants = pgTable('break_glass_grants', {
  ...base(),
  userId: uuid('user_id').notNull(),
  siteId: uuid('site_id').notNull(),
  reason: text('reason').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [
  tenantKey(t),
  tenantRef('break_glass_grants_user_fk', t, t.userId, users),
  tenantRef('break_glass_grants_site_fk', t, t.siteId, sites),
]);
