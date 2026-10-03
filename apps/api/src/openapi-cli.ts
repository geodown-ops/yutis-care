/* Writes openapi.json, the contract packages/api-client is generated from. CI fails if it is out of date. */
import { writeFileSync } from 'node:fs';
import { createApp, openApiDocument } from './app.js';
import { loadConfig } from './config.js';

// Production settings, so local-only behaviour never leaks into the contract. No database connection is made.
const app = await createApp(loadConfig({ NODE_ENV: 'production', APP_DATABASE_URL: 'postgres://unused/unused' }), { logger: false });
const out = new URL('../openapi.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(openApiDocument(app), null, 2)}\n`);
await app.close();
console.log(`Wrote ${out.pathname}`);
