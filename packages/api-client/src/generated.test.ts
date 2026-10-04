import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { render, SPECS, type SpecName } from '../scripts/codegen.ts';

describe('generated API types', () => {
  for (const name of Object.keys(SPECS) as SpecName[]) {
    it(`${name} matches its openapi.json (run pnpm --filter @yutis/api-client generate)`, async () => {
      expect(await readFile(SPECS[name].out, 'utf8')).toBe(await render(name));
    });
  }
});
