import { Global, Inject, Injectable, Logger, Module, type CallHandler, type DynamicModule, type ExecutionContext, type NestInterceptor, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { createDb, withTenant, type Db } from '@yutis/db';
import type { FastifyRequest } from 'fastify';
import pg from 'pg';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { ApiConfig } from '../config.js';
import { KmsTenantCrypto, LocalTenantCrypto, TENANT_CRYPTO, UnconfiguredTenantCrypto, type TenantCrypto } from './crypto.js';
import { googleTokenSource, KmsClient } from './gcp.js';
import { ApiExceptionFilter } from './errors.js';
import { createMailer, MAILER, Notifier, type Mailer } from './mail.js';

export const API_CONFIG = Symbol('API_CONFIG');
export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

/**
 * Runs every tenant route's handler inside one `withTenant()` transaction, exposed as `ctx.tx`. Feature code never
 * gets the unscoped database, so it cannot query outside the tenant, and audit rows written on `ctx.tx` commit or
 * roll back together with the work they record.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantTransactionInterceptor.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const state = context.switchToHttp().getRequest<FastifyRequest>().yutis;
    if (!state) return next.handle();
    return from((async () => {
      const result = await withTenant(this.db, state.tenant.id, async tx => {
        state.tx = tx;
        try {
          return await lastValueFrom(next.handle(), { defaultValue: undefined });
        } finally {
          delete state.tx;
        }
      });
      for (const work of state.afterCommit ?? []) {
        await work().catch((error: unknown) => this.logger.error(`after-commit work failed: ${error instanceof Error ? error.message : String(error)}`));
      }
      return result;
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

/** Configuration and the database pool. `DB` is for the request pipeline itself; feature code uses `ctx.tx`. */
@Global()
@Module({})
export class CoreModule {
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: API_CONFIG, useValue: config },
        { provide: PG_POOL, useFactory: () => new pg.Pool({ connectionString: config.databaseUrl, max: 10 }) },
        { provide: DB, useFactory: (pool: pg.Pool) => createDb(pool), inject: [PG_POOL] },
        { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: TENANT_CRYPTO, useFactory: () => tenantCrypto(config) },
        { provide: MAILER, useFactory: () => mailer(config) },
        { provide: Notifier, useFactory: (m: Mailer, db: Db) => new Notifier(m, db), inject: [MAILER, DB] },
        PoolLifecycle,
      ],
      exports: [API_CONFIG, PG_POOL, DB, TENANT_CRYPTO, MAILER, Notifier],
    };
  }
}

/** The TenantCrypto for this deployment: Cloud KMS in production, the local key elsewhere, otherwise unavailable (503). */
export function tenantCrypto(config: Pick<ApiConfig, 'databaseUrl' | 'cryptoKms' | 'cryptoLocalKey'>): TenantCrypto {
  if (config.cryptoKms) {
    // Its own small pool: requests already hold a connection from the main pool while they encrypt.
    const keyPool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
    return new KmsTenantCrypto(createDb(keyPool), new KmsClient(googleTokenSource()));
  }
  return config.cryptoLocalKey ? new LocalTenantCrypto(config.cryptoLocalKey) : new UnconfiguredTenantCrypto();
}

function mailer(config: Pick<ApiConfig, 'email' | 'production' | 'demoSite'>): Mailer {
  if (config.production && !config.demoSite && config.email.provider === 'log') {
    new Logger('Mailer').warn('EMAIL_PROVIDER=log in production: invitations and sign-off links are not emailed');
  }
  return createMailer(config.email);
}

/**
 * Refuse to serve if the API's database login would bypass Row-Level Security: a superuser, a role with BYPASSRLS
 * or the owner of the tables all see every tenant. The API must log in as a plain member of `yutis_app`.
 */
export async function assertAppRole(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ user: string; superuser: boolean; bypassrls: boolean; app_member: boolean; owns_tables: boolean }>(`
    select current_user as user, r.rolsuper as superuser, r.rolbypassrls as bypassrls,
      exists (select 1 from pg_roles a where a.rolname = 'yutis_app' and pg_has_role(current_user, a.oid, 'member')) as app_member,
      exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tableowner = current_user) as owns_tables
    from pg_roles r where r.rolname = current_user`);
  const r = rows[0];
  if (!r) throw new Error('Could not read the database role');
  if (r.superuser || r.bypassrls || r.owns_tables) {
    throw new Error(`Database user "${r.user}" bypasses Row-Level Security; connect as a member of yutis_app instead`);
  }
  if (!r.app_member) throw new Error(`Database user "${r.user}" is not a member of yutis_app (have the migrations run?)`);
}
