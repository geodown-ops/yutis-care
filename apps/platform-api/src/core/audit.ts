import { platformAuditLog } from '@yutis/db';
import type { RequestContext } from './context.js';

export interface PlatformAuditEntry {
  /** e.g. tenant.onboard, tenant.suspend, subscription.set, announcement.create, platform_user.update. */
  action: string;
  tenantId?: string;
  subjectTable?: string;
  subjectId?: string;
  /** What changed. Never personal data of tenant employees. */
  detail?: Record<string, unknown>;
}

/** Append a platform_audit_log row in the request's transaction. Every write route must call it. */
export async function recordPlatformAudit(ctx: RequestContext, entry: PlatformAuditEntry): Promise<void> {
  await ctx.tx.insert(platformAuditLog).values({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    ...entry,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  ctx.audited = true;
}
