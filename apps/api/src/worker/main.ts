/*
 * The worker process (`node dist/worker/main.js`): exports and the nightly retention scan. Logs in as a member of
 * yutis_worker (WORKER_DATABASE_URL); refuses to start as a superuser or table owner.
 */
import { createServer } from 'node:http';
import { createDb } from '@yutis/db';
import { PgBoss } from 'pg-boss';
import pg from 'pg';
import { z } from 'zod';
import { assertAppRole, tenantCrypto } from '../core/database.js';
import { EXPORT_QUEUE, JOB_SCHEMA, RETENTION_CRON, RETENTION_QUEUE, type ExportJob } from './jobs.js';
import { runExport, runRetentionScan } from './work.js';

const env = z.object({
  NODE_ENV: z.string().default('development'),
  WORKER_DATABASE_URL: z.string().min(1),
  TENANT_CRYPTO_LOCAL_KEY: z.string().optional(),
  /** Per-tenant data keys wrapped by Cloud KMS (production). */
  TENANT_CRYPTO_KMS: z.enum(['true', 'false']).default('false'),
  /** The marketing demo site (fictional data only): the local encryption key is allowed there. */
  DEMO_SITE: z.enum(['true', 'false']).default('false'),
  /** On Cloud Run the worker must answer HTTP on PORT, or the revision is not considered started. */
  PORT: z.coerce.number().int().positive().optional(),
}).parse(process.env);
if (env.NODE_ENV === 'production' && env.TENANT_CRYPTO_LOCAL_KEY && env.DEMO_SITE !== 'true') throw new Error('TENANT_CRYPTO_LOCAL_KEY must not be used in production');

const pool = new pg.Pool({ connectionString: env.WORKER_DATABASE_URL, max: 4 });
await assertAppRole(pool);
const db = createDb(pool);
const crypto = tenantCrypto({
  databaseUrl: env.WORKER_DATABASE_URL,
  cryptoKms: env.TENANT_CRYPTO_KMS === 'true',
  cryptoLocalKey: env.TENANT_CRYPTO_LOCAL_KEY ? Buffer.from(env.TENANT_CRYPTO_LOCAL_KEY, 'base64') : undefined,
});

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

const health = env.PORT ? createServer((_req, res) => res.writeHead(204).end()).listen(env.PORT) : undefined;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    health?.close();
    await boss.stop();
    await pool.end();
    process.exit(0);
  });
}
