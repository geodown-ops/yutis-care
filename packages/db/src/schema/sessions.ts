/*
 * Signed-in sessions (登入工作階段) of the tenant API, for staff (`users`) and for the employee portal (`employees`).
 * The browser holds a random token in an HttpOnly cookie; only its SHA-256 is stored, so a database leak does not
 * hand out live sessions. Sessions are tenant-isolated like every other table, so a token presented on another
 * tenant's subdomain finds nothing. Revoking a row signs the person out immediately.
 */
import { sql } from 'drizzle-orm';
import { check, index, inet, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './accounts.js';
import { bytea, tenantRef, tenants } from './common.js';
import { employees } from './employees.js';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  /** SHA-256 of the cookie token. */
  tokenHash: bytea('token_hash').notNull().unique(),
  /** Exactly one of user (staff) or employee (portal) is set. */
  userId: uuid('user_id'),
  employeeId: uuid('employee_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Idle expiry is last_seen_at plus the API's idle timeout (15 minutes for staff). */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  /** Absolute expiry, however active the session is. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ip: inet('ip'),
  userAgent: text('user_agent'),
}, t => [
  tenantRef('sessions_user_fk', t, t.userId, users),
  tenantRef('sessions_employee_fk', t, t.employeeId, employees),
  check('sessions_one_principal', sql`(${t.userId} is null) <> (${t.employeeId} is null)`),
  index('sessions_tenant_user_idx').on(t.tenantId, t.userId),
  index('sessions_tenant_employee_idx').on(t.tenantId, t.employeeId),
]);
