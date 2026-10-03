import { resolve } from 'node:path';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Served at {tenant}.yutiscare.tw/me, next to the tenant admin at /. */
export default defineConfig({
  base: '/me/',
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  // One copy of React and Mantine even though @yutis/ui resolves them from its own folder.
  resolve: { dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'], alias: { '@yutis/domain': resolve(import.meta.dirname, '../../packages/domain/src/index.ts') } },
  server: { port: 5181, proxy: { '/api': 'http://localhost:3000' } },
  preview: { port: 5181 },
});
