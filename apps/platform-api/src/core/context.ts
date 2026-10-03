import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { platformRoleEnum, Tx } from '@yutis/db';
import type { FastifyRequest } from 'fastify';

export type PlatformRole = (typeof platformRoleEnum.enumValues)[number];

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
}

/** What the access guard established about a request. */
export interface RequestState {
  user?: PlatformUser;
  ip: string;
  userAgent?: string;
  /** Set by PlatformTransactionInterceptor around the route handler. */
  tx?: Tx;
  /** Undo steps for work outside the database (KMS keys, Identity Platform tenants), run if the transaction fails. */
  compensations: (() => Promise<void>)[];
  /** Set by recordPlatformAudit; every write must record one. */
  audited: boolean;
}

export interface RequestContext extends RequestState {
  user: PlatformUser;
  tx: Tx;
}

declare module 'fastify' {
  interface FastifyRequest {
    platform?: RequestState;
  }
}

/** The signed-in platform user and the request's transaction. */
export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): RequestContext => {
  const state = ec.switchToHttp().getRequest<FastifyRequest>().platform;
  if (!state?.tx || !state.user) throw new Error('No platform request context: check the route access decorator');
  return state as RequestContext;
});

/** Register an undo step for an external side effect; it runs, newest first, if the request's transaction fails. */
export function onRollback(ctx: RequestContext, undo: () => Promise<void>): void {
  ctx.compensations.push(undo);
}
