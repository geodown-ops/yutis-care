import { Global, Inject, Injectable, Logger, Module, type CallHandler, type DynamicModule, type ExecutionContext, type NestInterceptor, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { createDb, type Db } from '@yutis/db';
import type { FastifyRequest } from 'fastify';
import pg from 'pg';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { PlatformConfig } from '../config.js';
import { ApiExceptionFilter } from './errors.js';

export const PLATFORM_CONFIG = Symbol('PLATFORM_CONFIG');
export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Runs every signed-in route's handler in one transaction (`ctx.tx`). A write that did not record a platform audit
 * entry is rolled back. If the transaction fails, the undo steps registered with `onRollback` (for KMS keys and
 * Identity Platform tenants created along the way) run newest first, so a failed onboarding leaves nothing behind.
 */
@Injectable()
export class PlatformTransactionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PlatformTransactionInterceptor.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const state = request.platform;
    if (!state?.user) return next.handle();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const write = !SAFE_METHODS.has(request.method);
    return from((async () => {
      try {
        return await this.db.transaction(async tx => {
          state.tx = tx;
          try {
            const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
            if (write && !state.audited) throw new Error(`${route} changed data without a platform audit entry`);
            return result;
          } finally {
            delete state.tx;
          }
        });
      } catch (error) {
        for (const undo of state.compensations.reverse()) {
          try {
            await undo();
          } catch (undoError) {
            this.logger.error(`${route}: undo step failed; clean up by hand: ${undoError instanceof Error ? undoError.message : String(undoError)}`);
          }
        }
        throw error;
      }
    })());
  }
}

@Injectable()
class PoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class CoreModule {
  static forRoot(config: PlatformConfig): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: PLATFORM_CONFIG, useValue: config },
        { provide: PG_POOL, useFactory: () => new pg.Pool({ connectionString: config.databaseUrl, max: 5 }) },
        { provide: DB, useFactory: (pool: pg.Pool) => createDb(pool), inject: [PG_POOL] },
        { provide: APP_INTERCEPTOR, useClass: PlatformTransactionInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        PoolLifecycle,
      ],
      exports: [PLATFORM_CONFIG, PG_POOL, DB],
    };
  }
}

/**
 * Refuse to serve unless the database login is a plain member of `yutis_platform`: not a superuser, not BYPASSRLS,
 * not the table owner, and not a member of `yutis_app` (which could read tenant health data).
 */
export async function assertPlatformRole(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ user: string; elevated: boolean; platform_member: boolean; app_member: boolean }>(`
    select current_user as user,
      r.rolsuper or r.rolbypassrls or exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tableowner = current_user) as elevated,
      exists (select 1 from pg_roles p where p.rolname = 'yutis_platform' and pg_has_role(current_user, p.oid, 'member')) as platform_member,
      exists (select 1 from pg_roles a where a.rolname = 'yutis_app' and pg_has_role(current_user, a.oid, 'member')) as app_member
    from pg_roles r where r.rolname = current_user`);
  const r = rows[0];
  if (!r) throw new Error('Could not read the database role');
  if (r.elevated) throw new Error(`Database user "${r.user}" can bypass access control; connect as a member of yutis_platform instead`);
  if (r.app_member) throw new Error(`Database user "${r.user}" is a member of yutis_app; the platform must not reach tenant data`);
  if (!r.platform_member) throw new Error(`Database user "${r.user}" is not a member of yutis_platform (have the migrations run?)`);
}
