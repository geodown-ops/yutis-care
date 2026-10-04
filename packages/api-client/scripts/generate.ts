import { writeFile } from 'node:fs/promises';
import { render, SPECS, type SpecName } from './codegen.ts';

for (const name of Object.keys(SPECS) as SpecName[]) {
  await writeFile(SPECS[name].out, await render(name));
  console.log(`Wrote ${SPECS[name].out.pathname}`);
}
