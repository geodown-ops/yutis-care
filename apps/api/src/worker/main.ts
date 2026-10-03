/*
 * The worker process (`node dist/worker/main.js`): exports and the nightly retention scan. Logs in as a member of
 * yutis_worker (WORKER_DATABASE_URL); refuses to start as a superuser or table owner.
 */
import { createDb } from '@yutis/db';
import { PgBoss } from 'pg-boss';
import pg from 'pg';
import { z } from 'zod';
import { LocalTenantCrypto, UnconfiguredTenantCrypto } from '../core/crypto.js';
import { assertAppRole } from '../core/database.js';
import { EXPORT_QUEUE, JOB_SCHEMA, RETENTION_CRON, RETENTION_QUEUE, type ExportJob } from './jobs.js';
import { runExport, runRetentionScan } from './work.js';

const env = z.object({
  NODE_ENV: z.string().default('development'),
  WORKER_DATABASE_URL: z.string().min(1),
  TENANT_CRYPTO_LOCAL_KEY: z.string().optional(),
}).parse(process.env);
if (env.NODE_ENV === 'production' && env.TENANT_CRYPTO_LOCAL_KEY) throw new Error('TENANT_CRYPTO_LOCAL_KEY must not be used in production');

const pool = new pg.Pool({ connectionString: env.WORKER_DATABASE_URL, max: 4 });
await assertAppRole(pool);
const db = createDb(pool);
const crypto = env.TENANT_CRYPTO_LOCAL_KEY ? new LocalTenantCrypto(Buffer.from(env.TENANT_CRYPTO_LOCAL_KEY, 'base64')) : new UnconfiguredTenantCrypto();

const boss = new PgBoss({ connectionString: env.WORKER_DATABASE_URL, schema: JOB_SCHEMA, migrate: false });
boss.on('error', error => console.error('[worker]', error.message));
await boss.start();
await boss.work<ExportJob>(EXPORT_QUEUE, async ([job]) => {
  await runExport(db, crypto, job!.data.tenantId, job!.data.exportId);
});
await boss.schedule(RETENTION_QUEUE, RETENTION_CRON, null, { tz: 'Asia/Taipei' });
await boss.work(RETENTION_QUEUE, async () => {
  const found = await runRetentionScan(db);
  console.log(`[worker] retention scan: ${Object.values(found).reduce((a, b) => a + b, 0)} row(s) past retain_until across ${Object.keys(found).length} tenant(s)`);
});
console.log('[worker] started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await boss.stop();
    await pool.end();
    process.exit(0);
  });
}
