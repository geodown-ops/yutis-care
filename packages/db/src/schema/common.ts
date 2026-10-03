/*
 * Shared building blocks. Every tenant-owned table has:
 * - `id` (uuid) and `tenant_id`, with UNIQUE (tenant_id, id) so other tables can reference it by both columns.
 *   References use composite foreign keys (tenant_id, x_id), so a row can never point at another tenant's row.
 * - Row-Level Security on tenant_id (see migrations/0001_row_level_security.sql).
 * - created/updated by and at.
 * Columns ending in `_enc` hold application-side envelope-encrypted bytes (per-tenant data key in Cloud KMS);
 * the database never sees their plaintext.
 */
import { customType, date, foreignKey, pgEnum, pgTable, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Subdomain, e.g. `acme` → acme.yutiscare.tw. */
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'suspended', 'closed'] }).notNull().default('active'),
  /** Cloud KMS key that wraps this tenant's data keys; destroying it makes the tenant's `_enc` columns unreadable. */
  kmsKeyName: text('kms_key_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const base = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

/** UNIQUE (tenant_id, id): the target of composite foreign keys. */
export const tenantKey = (t: { tenantId: AnyPgColumn; id: AnyPgColumn }) => unique().on(t.tenantId, t.id);

/** Composite foreign key (tenant_id, col) → target (tenant_id, id). */
export const tenantRef = (
  name: string,
  t: { tenantId: AnyPgColumn },
  col: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) => foreignKey({ name, columns: [t.tenantId, col], foreignColumns: [target.tenantId, target.id] });

/** Statutory retention end date; a scheduled job lists expired rows for manual deletion. */
export const retainUntil = () => date('retain_until');

export const sexEnum = pgEnum('sex', ['男', '女']);
export const staffRoleEnum = pgEnum('staff_role', ['職護', '職醫', '職安衛人員', '人資', '部門主管', '租戶管理員']);
export const caseStatusEnum = pgEnum('case_status', ['未開單', '起單', '處理中', '結案']);
export const eventTypeEnum = pgEnum('event_type', ['hc', 'sp', 'wl', 'er', 'mat', 'age']);
export const surveyStatusEnum = pgEnum('survey_status', ['未填寫', '已填寫']);
export const filledByEnum = pgEnum('filled_by', ['self', 'nurse']);
export const matLevelEnum = pgEnum('mat_level', ['第一級管理', '第二級管理', '第三級管理']);
