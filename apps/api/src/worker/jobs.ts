/*
 * Background jobs on pg-boss (PostgreSQL as the queue). The table owner installs pg-boss's schema once
 * (`pnpm --filter @yutis/api jobs:install`, after db:migrate) and lets yutis_app use it; the API only sends jobs and the
 * worker (`pnpm --filter @yutis/api worker`) runs them. Job data carries ids only, never personal data.
 */
import { PgBoss } from 'pg-boss';
import pg from 'pg';

export const JOB_SCHEMA = 'pgboss';
export const EXPORT_QUEUE = 'report-export';
export const RETENTION_QUEUE = 'retention-scan';
/** Nightly at 03:00 Taiwan time. */
export const RETENTION_CRON = '0 3 * * *';

export interface ExportJob { tenantId: string; exportId: string }

/** A pg-boss client that only sends jobs (no migrations, maintenance or cron). */
export function senderBoss(connectionString: string): PgBoss {
  return new PgBoss({ connectionString, schema: JOB_SCHEMA, migrate: false, supervise: false, schedule: false, max: 2 });
}

/** Run as the table owner: create pg-boss's schema and queues, and let the tenant API and worker use them. */
export async function installJobs(ownerConnectionString: string): Promise<void> {
  const boss = new PgBoss({ connectionString: ownerConnectionString, schema: JOB_SCHEMA, migrate: true, supervise: false, schedule: false, max: 1 });
  await boss.start();
  for (const queue of [EXPORT_QUEUE, RETENTION_QUEUE]) {
    if (!(await boss.getQueue(queue))) await boss.createQueue(queue, { retryLimit: 2, retryDelay: 30 });
  }
  await boss.stop({ graceful: false });
  const pool = new pg.Pool({ connectionString: ownerConnectionString, max: 1 });
  try {
    await pool.query(`
      GRANT USAGE ON SCHEMA ${JOB_SCHEMA} TO yutis_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${JOB_SCHEMA} TO yutis_app;
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${JOB_SCHEMA} TO yutis_app;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${JOB_SCHEMA} TO yutis_app;`);
  } finally {
    await pool.end();
  }
}
