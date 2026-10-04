/*
 * Per-tenant data keys (envelope encryption). Each tenant has one random data key per purpose, stored only wrapped by
 * the tenant's Cloud KMS key (tenants.kms_key_name). The tenant API and worker unwrap it through Cloud KMS and keep it
 * in memory; destroying the KMS key makes the wrapped keys, and so the tenant's `_enc` data, unreadable. Created on
 * first use by the tenant API; never updated or deleted by it.
 */
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bytea, tenants } from './common.js';

export const tenantKeys = pgTable('tenant_keys', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  /** `data` encrypts `_enc` columns; `fingerprint` keys the HMAC of national ID numbers. */
  purpose: text('purpose', { enum: ['data', 'fingerprint'] }).notNull(),
  /** The key, as Cloud KMS returned it from encrypt (with the tenant id and purpose as additional authenticated data). */
  wrappedKey: bytea('wrapped_key').notNull(),
  /** The KMS key version that wrapped it, for audits and key rotation reviews. */
  kmsKeyVersion: text('kms_key_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.tenantId, t.purpose] })]);
