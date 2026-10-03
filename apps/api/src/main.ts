import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { assertAppRole, PG_POOL } from './core/database.js';

const config = loadConfig();
const app = await createApp(config);
await assertAppRole(app.get(PG_POOL));
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
