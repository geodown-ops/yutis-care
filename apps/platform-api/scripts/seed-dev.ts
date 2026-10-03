/*
 * Local development only: creates the platform API's login role, fictional platform staff, a plan and the default
 * templates, so tenants can be onboarded at http://localhost:3001/platform-api/docs. Runs as the table owner
 * (DATABASE_URL). Idempotent. Never point it at a real database.
 */
import { createDb, platformUsers, plans } from '@yutis/db';
import pg from 'pg';
import { syncDefaultTemplates } from '../src/templates/templates.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (the table owner, as for db:migrate) is required');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = createDb(pool);

await pool.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yutis_platform_local') THEN
    CREATE ROLE yutis_platform_local LOGIN PASSWORD 'yutis_platform_local' IN ROLE yutis_platform;
  END IF;
END $$`);
await db.insert(platformUsers).values([
  { email: 'ops@yutis.test', name: '營運示範', role: '營運' },
  { email: 'support@yutis.test', name: '客服示範', role: '客服' },
  { email: 'eng@yutis.test', name: '工程示範', role: '工程' },
]).onConflictDoNothing();
await db.insert(plans).values({ code: 'standard', name: '標準方案' }).onConflictDoNothing();
const templates = await db.transaction(tx => syncDefaultTemplates(tx, null));
console.log(`Platform users ops@, support@, eng@yutis.test; plan "standard"; templates ${templates.map(t => `${t.kind} v${t.version}`).join(', ')}.`);
await pool.end();
