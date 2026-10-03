import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest's transform does not emit decorator metadata, so providers are always injected with explicit @Inject(...).
export default defineConfig({
  // Test against the workspace package's source, so it need not be built first.
  resolve: { alias: { '@yutis/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)) } },
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
