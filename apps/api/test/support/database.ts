/*
 * A fresh database per test file. DATABASE_URL must point at a server where the user can create databases and roles
 * (CI provides one; locally `docker compose up -d db`). The API under test logs in as a plain member of yutis_app,
 * exactly as in production, so Row-Level Security is really in force.
 */
import { randomBytes } from 'node:crypto';
import { createDb, runMigrations, type Db } from '@yutis/db';
import pg from 'pg';

export interface TestDatabase {
  /** Table owner: for seeding and inspecting, bypasses RLS. */
  owner: Db;
  /** Connection string for the API's login role (member of yutis_app). */
  appUrl: string;
  /** The table owner's connection string (installing pg-boss). */
  ownerUrl: string;
  /** The worker's login role (member of yutis_worker). */
  workerUrl: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL is required for @yutis/api tests (see README: docker compose up -d db)');
  const suffix = randomBytes(4).toString('hex');
  const dbName = `yutis_api_test_${suffix}`;
  const appRole = `yutis_api_test_app_${suffix}`;
  const appPassword = randomBytes(12).toString('hex');
  const workerRole = `yutis_api_test_worker_${suffix}`;
  const urlFor = (user?: string, password?: string) => {
    const u = new URL(adminUrl);
    u.pathname = `/${dbName}`;
    if (user) { u.username = user; u.password = password ?? ''; }
    return u.toString();
  };

  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`create database ${dbName}`);
  const ownerPool = new pg.Pool({ connectionString: urlFor(), max: 2 });
  const owner = createDb(ownerPool);
  await runMigrations(owner);
  await admin.query(`create role ${appRole} login password '${appPassword}' in role yutis_app`);
  await admin.query(`create role ${workerRole} login password '${appPassword}' in role yutis_worker`);

  return {
    owner,
    appUrl: urlFor(appRole, appPassword),
    ownerUrl: urlFor(),
    workerUrl: urlFor(workerRole, appPassword),
    /** Call after closing the app. Pool.end() resolves before sockets close, so wait for them before dropping. */
    async drop() {
      await ownerPool.end();
      for (let i = 0; i < 100; i++) {
        const { rows } = await admin.query<{ n: number }>('select count(*)::int as n from pg_stat_activity where datname = $1', [dbName]);
        if (rows[0]!.n === 0) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.query(`drop role if exists ${appRole}`);
      await admin.query(`drop role if exists ${workerRole}`);
      await admin.end();
    },
  };
}
