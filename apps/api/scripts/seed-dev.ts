/*
 * Local development only: creates the API's login role and a fictional "demo" tenant to sign in to
 * (http://demo.localhost:3000). Runs as the table owner (DATABASE_URL). Idempotent. Never point it at a real database.
 */
import { createDb } from '@yutis/db';
import pg from 'pg';
import { seedDemoTenant } from '../src/demo-seed.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (the table owner, as for db:migrate) is required');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = createDb(pool);

await pool.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_api_local') THEN
    CREATE ROLE yutis_api_local LOGIN PASSWORD 'yutis_api_local' IN ROLE yutis_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_worker_local') THEN
    CREATE ROLE yutis_worker_local LOGIN PASSWORD 'yutis_worker_local' IN ROLE yutis_worker;
  END IF;
END $$`);

if (await seedDemoTenant(db)) {
  console.log('Created tenant "demo" with staff nurse@, doctor@, safety@, hr@, manager@, admin@demo.test and employees E001–E003.');
} else {
  console.log('Tenant "demo" already exists; nothing to do.');
}
await pool.end();
