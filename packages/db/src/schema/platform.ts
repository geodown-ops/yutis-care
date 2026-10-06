/*
 * Platform tables (平台): used by the platform API (admin.care.yutis.com.tw) as the `yutis_platform` role, which has no
 * privileges on any employee, health or programme table (migrations/0007_platform_access.sql). Tenant sessions
 * (`yutis_app`) cannot read these tables either, except announcements and their own support grants.
 */
import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, inet, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './accounts.js';
import { base, tenantKey, tenantRef, tenants } from './common.js';

export const platformRoleEnum = pgEnum('platform_role', ['營運', '客服', '工程']);

/** Yutis staff who may use the platform admin. Signed in through Identity-Aware Proxy with their Workspace account. */
export const platformUsers = pgTable('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: platformRoleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A tenant admin letting Yutis support into their tenant for a limited time (客服授權). Support then signs in to the
 * tenant back office and goes through the tenant API's permissions and audit, never through the platform API.
 */
export const supportAccessGrants = pgTable('support_access_grants', {
  ...base(),
  platformUserId: uuid('platform_user_id').notNull().references(() => platformUsers.id),
  /** The tenant admin who granted it. */
  grantedBy: uuid('granted_by').notNull(),
  reason: text('reason').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [tenantKey(t), tenantRef('support_access_grants_granted_by_fk', t, t.grantedBy, users)]);

export const announcementKindEnum = pgEnum('announcement_kind', ['maintenance', 'feature', 'notice']);

/** System announcements shown in tenant back offices (系統公告). `tenant_id` null = every tenant. */
export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  kind: announcementKindEnum('kind').notNull().default('notice'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  publishAt: timestamp('publish_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only log of everything done in the platform admin (平台稽核). */
export const platformAuditLog = pgTable('platform_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid('actor_id'),
  actorEmail: text('actor_email').notNull(),
  /** e.g. tenant.onboard, tenant.suspend, subscription.set, announcement.create, platform_user.update. */
  action: text('action').notNull(),
  /** The tenant acted on, if any. */
  tenantId: uuid('tenant_id'),
  subjectTable: text('subject_table'),
  subjectId: text('subject_id'),
  /** What changed. Never personal data of a tenant's employees (the platform cannot read any). */
  detail: jsonb('detail'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
}, t => [index('platform_audit_log_tenant_idx').on(t.tenantId, t.at), index('platform_audit_log_actor_idx').on(t.actorId, t.at)]);

export const templateKindEnum = pgEnum('template_kind', ['grading_rules', 'phrases', 'sign_off_roles', 'survey_versions']);

/**
 * Platform defaults copied into every new tenant at onboarding (預設範本): grading rules, phrase library, sign-off
 * roles and questionnaire versions. One active version per kind; tenants change their own copies afterwards.
 */
export const defaultTemplates = pgTable('default_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: templateKindEnum('kind').notNull(),
  version: integer('version').notNull(),
  content: jsonb('content').notNull(),
  active: boolean('active').notNull().default(false),
  createdBy: uuid('created_by').references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique().on(t.kind, t.version), uniqueIndex('default_templates_one_active').on(t.kind).where(sql`${t.active}`)]);

/** Per-tenant settings without a table of their own: sign-off roles, questionnaire versions, later branding. */
export const tenantSettings = pgTable('tenant_settings', {
  ...base(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
}, t => [tenantKey(t), unique().on(t.tenantId, t.key)]);

export const trialApplicationStatusEnum = pgEnum('trial_application_status', ['pending', 'approved', 'declined']);

/**
 * Online trial applications from the marketing site (線上申請試用). Company and contact details only, never health data.
 * The public form only inserts; platform staff approve (which onboards a tenant) or decline. Applications that never
 * became a tenant are deleted after a year.
 */
export const trialApplications = pgTable('trial_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: trialApplicationStatusEnum('status').notNull().default('pending'),
  companyName: text('company_name').notNull(),
  /** 統一編號 */
  taxId: text('tax_id').notNull(),
  /** One of TRIAL_EMPLOYEE_RANGES (@yutis/domain). */
  employeeRange: text('employee_range').notNull(),
  contactName: text('contact_name').notNull(),
  contactTitle: text('contact_title').notNull(),
  /** The work address that becomes the first tenant admin. */
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  preferredSubdomain: text('preferred_subdomain'),
  /** One of TRIAL_IDENTITY_PROVIDERS (@yutis/domain). */
  identityProvider: text('identity_provider'),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull(),
  /** Keyed hash of the client IP, only to limit how often one address may apply. */
  ipHash: text('ip_hash').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedBy: uuid('decided_by').references(() => platformUsers.id),
  declineReason: text('decline_reason'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('trial_applications_status_idx').on(t.status, t.createdAt), index('trial_applications_ip_idx').on(t.ipHash, t.createdAt)]);
