import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tenantBySlug, type Db } from '@yutis/db';
import type { FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config.js';
import type { Principal } from '../core/context.js';
import { API_CONFIG, DB } from '../core/database.js';
import { tenantSlugFromHost } from '../core/host.js';
import { ACCESS_RULE, type AccessRule } from './access.js';
import { canSee, canUse } from './permissions.js';
import { SessionService } from './sessions.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The front of the tenant API's request pipeline, run for every route:
 * 1. resolve the tenant from the subdomain and refuse suspended or closed tenants;
 * 2. refuse state-changing requests from another origin;
 * 3. find the signed-in principal from the session cookie, within that tenant only;
 * 4. check the route's access rule (role, data category, feature).
 * TenantTransactionInterceptor then runs the handler inside a `withTenant()` transaction (`ctx.tx`); handlers check
 * the employee's site with `assertSiteAccess` and write `recordAudit` on that same transaction.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [context.getHandler(), context.getClass()]);
    if (!rule) {
      this.logger.error(`${context.getClass().name}.${context.getHandler().name} has no access decorator; refusing`);
      throw new ForbiddenException();
    }
    if (rule.kind === 'no-tenant') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const slug = tenantSlugFromHost(request.hostname, this.config.tenantBaseDomain);
    const tenant = slug ? await tenantBySlug(this.db, slug) : undefined;
    if (!tenant) throw new NotFoundException('Unknown tenant');
    if (tenant.status !== 'active') throw new ForbiddenException('Tenant is not active');
    request.yutis = { tenant, ip: request.ip, userAgent: request.headers['user-agent'] };

    if (!SAFE_METHODS.has(request.method)) this.assertSameOrigin(request);
    if (rule.kind === 'public') return true;

    const principal = await this.sessions.authenticate(tenant.id, request);
    if (!principal) throw new UnauthorizedException();
    request.yutis.principal = principal;
    if (!allows(rule, principal)) throw new ForbiddenException();
    return true;
  }

  /**
   * SameSite=Lax already keeps the cookie off cross-site POSTs, but every tenant subdomain is the same "site",
   * so also require that a browser's state-changing request comes from this exact origin.
   */
  private assertSameOrigin(request: FastifyRequest) {
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') throw new ForbiddenException('Cross-origin request');
    const origin = request.headers.origin;
    if (origin && hostOf(origin) !== request.headers.host?.toLowerCase()) throw new ForbiddenException('Cross-origin request');
  }
}

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return undefined;
  }
}

export function allows(rule: AccessRule, principal: Principal): boolean {
  switch (rule.kind) {
    case 'no-tenant':
    case 'public':
    case 'signed-in':
      return true;
    case 'employee':
      return principal.kind === 'employee';
    case 'staff':
      return principal.kind === 'staff'
        && (!rule.data || canSee(principal.role, rule.data))
        && (!rule.feature || canUse(principal.role, rule.feature));
  }
}
