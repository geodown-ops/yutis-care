import { readFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

/** Each API's OpenAPI document (committed, checked by CI) and the file its types go to. */
export const SPECS = {
  'tenant-api': { spec: new URL('../../../apps/api/openapi.json', import.meta.url), out: new URL('../src/generated/tenant-api.ts', import.meta.url) },
  'platform-api': { spec: new URL('../../../apps/platform-api/openapi.json', import.meta.url), out: new URL('../src/generated/platform-api.ts', import.meta.url) },
} as const;

export type SpecName = keyof typeof SPECS;

/** The generated TypeScript for one API, exactly as it is committed. */
export async function render(name: SpecName): Promise<string> {
  const { spec } = SPECS[name];
  const ast = await openapiTS(JSON.parse(await readFile(spec, 'utf8')) as Parameters<typeof openapiTS>[0]);
  const source = name === 'tenant-api' ? 'apps/api/openapi.json' : 'apps/platform-api/openapi.json';
  return `/* Generated from ${source} by \`pnpm --filter @yutis/api-client generate\`. Do not edit. */\n\n${astToString(ast)}`;
}
