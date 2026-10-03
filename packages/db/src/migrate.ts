import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Apply all migrations. Must run as the table owner (not as yutis_app). */
export function runMigrations(db: Db): Promise<void> {
  return migrate(db, { migrationsFolder });
}
