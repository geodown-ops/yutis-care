/*
 * First step of the release job (deploy/release.sh), run once per deployment before the new revisions take traffic, as
 * the table owner (DATABASE_URL). Idempotent:
 *
 *   1. apply migrations;
 *   2. create or update the API, worker and platform API login roles (passwords from Secret Manager), each a plain
 *      member of yutis_app, yutis_worker or yutis_platform, so Row-Level Security always applies to them;
 *   3. install pg-boss's schema and queues;
 *   4. create the first platform staff (營運) from PLATFORM_ADMIN_EMAILS and the default plan, if missing;
 *   5. on the demo site only, create the fictional demo tenant (release.sh then fills it with the prototype's data).
 *
 * On the demo site, RESET_DEMO_DATABASE=true first drops everything, so the nightly reset starts from clean fictional
 * data. It refuses unless DEMO_SITE=true and the database holds no tenant other than the demo one.
 */
import { createDb, platformUsers, plans, runMigrations } from '@yutis/db';
import pg from 'pg';
import { z } from 'zod';
import { DEMO_TENANT_SLUG, seedDemoTenant } from './demo-seed.js';
import { installJobs, JOB_SCHEMA } from './worker/jobs.js';

const flag = z.enum(['true', 'false']).default('false').transform(v => v === 'true');

const env = z.object({
  DATABASE_URL: z.string().min(1),
  APP_DB_PASSWORD: z.string().min(16),
  WORKER_DB_PASSWORD: z.string().min(16),
  PLATFORM_DB_PASSWORD: z.string().min(16),
  /** Comma-separated Google Workspace accounts that get the 營運 role on the first deployment. */
  PLATFORM_ADMIN_EMAILS: z.string().default(''),
  DEMO_SITE: flag,
  RESET_DEMO_DATABASE: flag,
}).parse(process.env);

/** Login role → the group role it belongs to. The names match the connection strings Terraform stores. */
const LOGIN_ROLES = [
  { name: 'yutis_api', group: 'yutis_app', password: env.APP_DB_PASSWORD },
  { name: 'yutis_worker_login', group: 'yutis_worker', password: env.WORKER_DB_PASSWORD },
  { name: 'yutis_platform_api', group: 'yutis_platform', password: env.PLATFORM_DB_PASSWORD },
] as const;

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const db = createDb(pool);
const log = (message: string) => console.log(`[release] ${message}`);

try {
  if (env.RESET_DEMO_DATABASE) {
    if (!env.DEMO_SITE) throw new Error('RESET_DEMO_DATABASE is only allowed on the demo site (DEMO_SITE=true)');
    const { rows } = await pool.query<{ exists: boolean }>(`select to_regclass('public.tenants') is not null as exists`);
    if (rows[0]?.exists) {
      const other = await pool.query(`select slug from tenants where slug <> $1 limit 1`, [DEMO_TENANT_SLUG]);
      if (other.rowCount) throw new Error(`Refusing to reset: tenant "${other.rows[0].slug}" is not the demo tenant`);
    }
    await pool.query(`DROP SCHEMA IF EXISTS public, drizzle, ${JOB_SCHEMA} CASCADE; CREATE SCHEMA public;`);
    log('demo database reset');
  }

  await runMigrations(db);
  log('migrations applied');

  for (const role of LOGIN_ROLES) {
    const password = pg.escapeLiteral(role.password);
    const { rowCount } = await pool.query(`select 1 from pg_roles where rolname = $1`, [role.name]);
    await pool.query(rowCount
      ? `ALTER ROLE ${role.name} WITH LOGIN PASSWORD ${password}`
      : `CREATE ROLE ${role.name} WITH LOGIN PASSWORD ${password}`);
    await pool.query(`GRANT ${role.group} TO ${role.name}`);
  }
  log(`login roles ${LOGIN_ROLES.map(r => r.name).join(', ')} ready`);

  await installJobs(env.DATABASE_URL);
  log('job queues installed');

  const admins = env.PLATFORM_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (admins.length) {
    await db.insert(platformUsers).values(admins.map(email => ({ email, name: email, role: '營運' as const }))).onConflictDoNothing();
  }
  await db.insert(plans).values({ code: 'standard', name: '標準方案' }).onConflictDoNothing();
  log(`platform staff checked (${admins.length}), plan "standard" ready`);

  if (env.DEMO_SITE) {
    log(await seedDemoTenant(db) ? `demo tenant "${DEMO_TENANT_SLUG}" created` : `demo tenant "${DEMO_TENANT_SLUG}" already present`);
  }
} finally {
  await pool.end();
}
