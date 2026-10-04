import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** A local API's address: the PORT in that app's .env when it sets one (some machines run it elsewhere), else the default. */
function localApi(app: string, port: number) {
  const env = resolve(import.meta.dirname, `../${app}/.env`);
  return `http://localhost:${(existsSync(env) && parseEnv(readFileSync(env, 'utf8')).PORT) || port}`;
}

/** Served at {tenant}.care.yutis.net/me, next to the tenant admin at /. */
export default defineConfig({
  base: '/me/',
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  // One copy of React and Mantine even though @yutis/ui resolves them from its own folder.
  resolve: { dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'], alias: { '@yutis/domain': resolve(import.meta.dirname, '../../packages/domain/src/index.ts') } },
  // Object form: the string form sets changeOrigin, and the API needs the browser's Host ({tenant}.localhost) to find the tenant.
  server: { port: 5181, proxy: { '/api': { target: localApi('api', 3000) } } },
  preview: { port: 5181 },
});
