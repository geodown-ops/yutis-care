/* Install pg-boss's schema and queues as the table owner (DATABASE_URL). Run after db:migrate; idempotent. */
import { installJobs } from '../src/worker/jobs.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (the table owner, as for db:migrate) is required');
await installJobs(url);
console.log('pg-boss schema and queues installed');
