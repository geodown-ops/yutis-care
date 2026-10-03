import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { employees, sessions, users, withTenant, type Db } from '@yutis/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Principal, RequestContext } from '../core/context.js';
import { API_CONFIG, DB } from '../core/database.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest();

/** Seconds between last-seen updates, so an active session is not written on every request. */
const TOUCH_INTERVAL_SECONDS = 60;

/**
 * Database-backed sessions. The cookie is HttpOnly, SameSite=Lax and, outside local development, `__Host-` prefixed
 * (Secure, no Domain), so it is only ever sent to the tenant subdomain that set it.
 */
@Injectable()
export class SessionService {
  readonly cookieName: string;

  constructor(@Inject(DB) private readonly db: Db, @Inject(API_CONFIG) private readonly config: ApiConfig) {
    this.cookieName = config.cookieSecure ? '__Host-yutis_session' : 'yutis_session';
  }

  /** Start a session for a staff user or an employee and set the cookie. */
  async start(ctx: RequestContext, reply: FastifyReply, who: { userId: string } | { employeeId: string }): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const [row] = await ctx.tx.insert(sessions).values({
      tenantId: ctx.tenant.id,
      tokenHash: hashToken(token),
      ...who,
      expiresAt: sql`now() + make_interval(secs => ${this.config.sessionMaxSeconds})`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    }).returning({ id: sessions.id });
    reply.setCookie(this.cookieName, token, { path: '/', httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax' });
    return row!.id;
  }

  /**
   * The principal signed in on this tenant with the request's cookie, or undefined. The lookup runs in the URL's
   * tenant scope, so another tenant's session is simply not found. Slides the idle timeout.
   */
  async authenticate(tenantId: string, request: FastifyRequest): Promise<Principal | undefined> {
    const token = request.cookies[this.cookieName];
    if (!token || token.length > 128) return undefined;
    return withTenant(this.db, tenantId, async tx => {
      const [row] = await tx
        .select({
          sessionId: sessions.id,
          stale: sql<boolean>`${sessions.lastSeenAt} < now() - make_interval(secs => ${TOUCH_INTERVAL_SECONDS})`,
          user: { id: users.id, name: users.name, email: users.email, role: users.role, active: users.active },
          employee: { id: employees.id, name: employees.name, lang: employees.lang, status: employees.status },
        })
        .from(sessions)
        .leftJoin(users, and(eq(users.tenantId, sessions.tenantId), eq(users.id, sessions.userId)))
        .leftJoin(employees, and(eq(employees.tenantId, sessions.tenantId), eq(employees.id, sessions.employeeId)))
        .where(and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          gt(sessions.lastSeenAt, sql`now() - make_interval(secs => ${this.config.sessionIdleSeconds})`),
        ));
      if (!row) return undefined;

      let principal: Principal | undefined;
      if (row.user?.active) {
        principal = { kind: 'staff', sessionId: row.sessionId, userId: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role };
      } else if (row.employee && row.employee.status !== '離職') {
        principal = { kind: 'employee', sessionId: row.sessionId, employeeId: row.employee.id, name: row.employee.name, lang: row.employee.lang };
      }
      if (principal && row.stale) await tx.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.id, row.sessionId));
      return principal;
    });
  }

  /** End the session and clear the cookie. */
  async end(ctx: RequestContext, sessionId: string, reply: FastifyReply): Promise<void> {
    await ctx.tx.update(sessions).set({ revokedAt: sql`now()` }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    reply.clearCookie(this.cookieName, { path: '/', httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax' });
  }
}
