/*
 * A fresh database per test file. DATABASE_URL must point at a server where the user can create databases and roles
 * (CI provides one; locally `docker compose up -d db`). The platform API under test logs in as a plain member of
 * yutis_platform, exactly as in production, so its database privileges are really in force.
 */
import { randomBytes } from 'node:crypto';
import { createDb, runMigrations, type Db } from '@yutis/db';
import pg from 'pg';

export interface TestDatabase {
  /** Table owner: for seeding and inspecting. */
  owner: Db;
  /** Connection string for the platform API's login role (member of yutis_platform). */
  platformUrl: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL is required for @yutis/platform-api tests (see README: docker compose up -d db)');
  const suffix = randomBytes(4).toString('hex');
  const dbName = `yutis_platform_test_${suffix}`;
  const role = `yutis_platform_test_${suffix}`;
  const password = randomBytes(12).toString('hex');
  const urlFor = (user?: string, pw?: string) => {
    const u = new URL(adminUrl);
    u.pathname = `/${dbName}`;
    if (user) { u.username = user; u.password = pw ?? ''; }
    return u.toString();
  };

  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`create database ${dbName}`);
  const ownerPool = new pg.Pool({ connectionString: urlFor(), max: 2 });
  const owner = createDb(ownerPool);
  await runMigrations(owner);
  await admin.query(`create role ${role} login password '${password}' in role yutis_platform`);

  return {
    owner,
    platformUrl: urlFor(role, password),
    /** Call after closing the app. Pool.end() resolves before sockets close, so wait for them before dropping. */
    async drop() {
      await ownerPool.end();
      for (let i = 0; i < 100; i++) {
        const { rows } = await admin.query<{ n: number }>('select count(*)::int as n from pg_stat_activity where datname = $1', [dbName]);
        if (rows[0]!.n === 0) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.query(`drop role if exists ${role}`);
      await admin.end();
    },
  };
}
