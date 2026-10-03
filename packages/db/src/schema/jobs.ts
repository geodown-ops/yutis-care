/*
 * Background work (worker, pg-boss): files produced for download, and the retention review list. The worker connects
 * as a member of `yutis_worker` (a member of yutis_app that may also list tenant ids) and still works one tenant at a
 * time through withTenant().
 */
import { date, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './accounts.js';
import { base, bytea, tenantKey, tenantRef } from './common.js';

/** An Excel or PDF export (匯出). The file is encrypted with the tenant key and kept for a day. */
export const exportFiles = pgTable('exports', {
  ...base(),
  requestedBy: uuid('requested_by').notNull(),
  /** What to export, e.g. { kind: 'report', report: 'health', type: 'grade', filters: {…} }. */
  params: jsonb('params').notNull(),
  format: text('format', { enum: ['xlsx', 'pdf'] }).notNull(),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  fileName: text('file_name'),
  contentEnc: bytea('content_enc'),
  error: text('error'),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /** After this the file can no longer be downloaded. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /** Short-lived single-use download link; only the token's SHA-256 is stored. */
  downloadTokenHash: text('download_token_hash'),
  downloadTokenExpiresAt: timestamp('download_token_expires_at', { withTimezone: true }),
}, t => [
  tenantKey(t),
  unique().on(t.downloadTokenHash),
  index('exports_requester_idx').on(t.tenantId, t.requestedBy, t.createdAt),
  tenantRef('exports_requested_by_fk', t, t.requestedBy, users),
]);

/**
 * Rows past their statutory retention date (retain_until), found by the nightly scan, for a person to review and
 * delete by hand. The scan never deletes anything.
 */
export const retentionFindings = pgTable('retention_findings', {
  ...base(),
  tableName: text('table_name').notNull(),
  rowId: uuid('row_id').notNull(),
  employeeId: uuid('employee_id'),
  retainUntil: date('retain_until').notNull(),
  foundAt: timestamp('found_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [tenantKey(t), unique().on(t.tenantId, t.tableName, t.rowId)]);
