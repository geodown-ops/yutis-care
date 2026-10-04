/*
 * Publish the default templates (分級規則、片語庫、簽核角色、問卷版本) from defaults.ts to the database, as the table owner
 * (DATABASE_URL). The release job runs it after migrations, so onboarding always copies the current defaults; it only
 * adds a new version when a template changed. Same as POST /platform-api/templates/sync.
 */
import 'reflect-metadata';
import { createDb } from '@yutis/db';
import pg from 'pg';
import { syncDefaultTemplates } from './templates/templates.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (the table owner) is required');
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const results = await createDb(pool).transaction(tx => syncDefaultTemplates(tx, null));
  console.log(`[release] default templates: ${results.map(t => `${t.kind} v${t.version}${t.changed ? ' (new)' : ''}`).join(', ')}`);
} finally {
  await pool.end();
}
