import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { platformUsers, type Db } from '@yutis/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { DB } from '../core/database.js';
import { ACCESS_RULE, type AccessRule } from './access.js';
import { PLATFORM_IDENTITY, type PlatformIdentityVerifier } from './identity.js';
import { can } from './permissions.js';

/** Identify the caller (IAP), require an active platform account, and check the route's permission. */
@Injectable()
export class PlatformAccessGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAccessGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
    @Inject(PLATFORM_IDENTITY) private readonly identity: PlatformIdentityVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [context.getHandler(), context.getClass()]);
    if (!rule) {
      this.logger.error(`${context.getClass().name}.${context.getHandler().name} has no access decorator; refusing`);
      throw new ForbiddenException();
    }
    if (rule.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const email = await this.identity.identify(request);
    if (!email) throw new UnauthorizedException();
    const [user] = await this.db.select({ id: platformUsers.id, email: platformUsers.email, name: platformUsers.name, role: platformUsers.role })
      .from(platformUsers).where(and(eq(platformUsers.email, email), eq(platformUsers.active, true)));
    if (!user) throw new ForbiddenException({ code: 'not_platform_user', message: 'Not an active platform user' });
    request.platform = { user, ip: request.ip, userAgent: request.headers['user-agent'], compensations: [], audited: false };
    if (rule.permission && !can(user.role, rule.permission)) throw new ForbiddenException();
    return true;
  }
}
