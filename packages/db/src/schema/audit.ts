/*
 * Audit log (稽核日誌): every read of personal health data, every write, export and break-glass access.
 * Append-only: the app role may only INSERT and SELECT, and a trigger rejects UPDATE/DELETE for everyone.
 */
import { bigserial, index, inet, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './common.js';

export const auditActionEnum = pgEnum('audit_action', ['read', 'create', 'update', 'delete', 'export', 'sign_in', 'break_glass']);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id'),
  /** For employee-portal actions. */
  actorEmployeeId: uuid('actor_employee_id'),
  action: auditActionEnum('action').notNull(),
  subjectTable: text('subject_table'),
  subjectId: uuid('subject_id'),
  /** Whose data it was, so "who looked at employee X" is one query (breach response, 個資法 §3 requests). */
  employeeId: uuid('employee_id'),
  /** Sensitivity tier read: identity, work, health, medical. */
  dataCategory: text('data_category'),
  reason: text('reason'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
}, t => [
  index('audit_log_tenant_employee_idx').on(t.tenantId, t.employeeId, t.at),
  index('audit_log_tenant_actor_idx').on(t.tenantId, t.actorUserId, t.at),
]);
