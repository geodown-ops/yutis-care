import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest's transform does not emit decorator metadata, so providers are always injected with explicit @Inject(...).
export default defineConfig({
  // Test against the workspace packages' sources, so they need not be built first.
  resolve: {
    alias: {
      '@yutis/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
      '@yutis/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
    },
  },
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
