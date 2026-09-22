import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createEldraClient } from '@eldrajs/theme-core';

export async function generateTypes(opts: {
  themeDir: string;
  gatewayUrl: string;
  orgId: string;
  out: string;
  schemas?: string[];
  fetch?: typeof globalThis.fetch;
}): Promise<string> {
  const client = createEldraClient({
    gatewayUrl: opts.gatewayUrl,
    orgId: opts.orgId,
    fetch: opts.fetch,
  });
  const definitions = await client.getTypeScriptDefinitions({
    schemas: opts.schemas,
    moduleName: 'Eldra',
  });
  const target = resolve(opts.themeDir, opts.out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, definitions.endsWith('\n') ? definitions : `${definitions}\n`);
  return target;
}
