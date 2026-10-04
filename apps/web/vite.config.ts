import { resolve } from 'node:path';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  // Use the domain package's source directly, so dev, tests and typecheck never need its dist build.
  // One copy of React and Mantine even though @yutis/ui resolves them from its own folder.
  resolve: { dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'], alias: { '@yutis/domain': resolve(import.meta.dirname, '../../packages/domain/src/index.ts') } },
  // Object form: keeps the Host header (demo.localhost:5180), which the API uses to find the tenant and check same-origin.
  server: { port: 5180, proxy: { '/api': { target: 'http://localhost:3000' } } },
  preview: { port: 5180 },
});
