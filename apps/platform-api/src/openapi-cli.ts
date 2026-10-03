/* Writes openapi.json, the contract the platform admin frontend is generated from. CI fails if it is out of date. */
import { writeFileSync } from 'node:fs';
import { createApp, openApiDocument } from './app.js';
import { loadConfig } from './config.js';

// Production settings, so local-only behaviour never leaks into the contract. No database or network connection is made.
const config = loadConfig({ NODE_ENV: 'production', PLATFORM_DATABASE_URL: 'postgres://unused/unused', IAP_AUDIENCE: '/projects/0/global/backendServices/0' });
const app = await createApp(config, { logger: false });
const out = new URL('../openapi.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(openApiDocument(app), null, 2)}\n`);
await app.close();
console.log(`Wrote ${out.pathname}`);
