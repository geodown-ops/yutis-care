import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@yutis/domain': resolve(import.meta.dirname, '../domain/src/index.ts') } },
});
