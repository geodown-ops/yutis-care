import { createParamDecorator, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { staffRoleEnum, TenantSummary, Tx } from '@yutis/db';
import type { FastifyRequest } from 'fastify';

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];

export type StaffPrincipal = { kind: 'staff'; sessionId: string; userId: string; name: string; email: string; role: StaffRole };
export type EmployeePrincipal = { kind: 'employee'; sessionId: string; employeeId: string; name: string; lang: string };
export type Principal = StaffPrincipal | EmployeePrincipal;

/** What the access guard established about a request: whose subdomain it came in on and who is signed in. */
export interface RequestState {
  tenant: TenantSummary;
  principal?: Principal;
  ip: string;
  userAgent?: string;
  /** Set by TenantTransactionInterceptor around the route handler. */
  tx?: Tx;
}

/** A route handler's view of the request: tenant, principal and the request's tenant-scoped transaction. */
export interface RequestContext extends RequestState {
  /** The request's transaction; Row-Level Security limits every statement on it to this tenant. */
  tx: Tx;
}

declare module 'fastify' {
  interface FastifyRequest {
    yutis?: RequestState;
  }
}

/** The request context, on every route except `@NoTenant()` ones. */
export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): RequestContext => {
  const state = ec.switchToHttp().getRequest<FastifyRequest>().yutis;
  if (!state?.tx) throw new Error('No tenant transaction: this route does not resolve a tenant');
  return state as RequestContext;
});

export function signedIn(ctx: RequestState): Principal {
  if (!ctx.principal) throw new Error('Route reached without a signed-in principal; check its access decorator');
  return ctx.principal;
}

export function staff(ctx: RequestState): StaffPrincipal {
  const p = signedIn(ctx);
  if (p.kind !== 'staff') throw new ForbiddenException();
  return p;
}
