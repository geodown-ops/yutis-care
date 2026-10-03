import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/**
 * Run `fn` in a transaction scoped to one tenant. Row-Level Security reads `app.tenant_id`, which is set
 * transaction-locally, so a pooled connection never carries one tenant's setting into another request.
 * Every API request that touches tenant data must go through here.
 */
export function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
