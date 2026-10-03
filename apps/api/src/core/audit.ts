import { auditLog, type auditActionEnum } from '@yutis/db';
import type { DataCategory } from '../auth/permissions.js';
import type { Principal, RequestContext } from './context.js';

export type AuditAction = (typeof auditActionEnum.enumValues)[number];

export interface AuditEntry {
  action: AuditAction;
  subjectTable?: string;
  subjectId?: string;
  /** Whose data it was, so "who looked at employee X" is one query. */
  employeeId?: string;
  dataCategory?: DataCategory;
  reason?: string;
}

/**
 * Append an audit_log row in the request's transaction, so the record commits if and only if the access it
 * describes does. Required for every read of health or medical data, every write, export and break-glass access.
 * `actor` defaults to the signed-in principal (pass it explicitly while signing someone in).
 */
export async function recordAudit(ctx: RequestContext, entry: AuditEntry, actor: Principal | undefined = ctx.principal): Promise<void> {
  await ctx.tx.insert(auditLog).values({
    tenantId: ctx.tenant.id,
    actorUserId: actor?.kind === 'staff' ? actor.userId : null,
    actorEmployeeId: actor?.kind === 'employee' ? actor.employeeId : null,
    ...entry,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}
