import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createEldraClient } from '@eldrajs/theme-core';
import { generateBlockTypes, type BlockDefinition } from '@eldrajs/vite-plugin-theme';
import { scanTheme } from '@eldrajs/vite-plugin-theme/scan';

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

/**
 * `eldra-theme types --blocks`: scans every block's `block.json` and writes
 * only `.eldra/block-types.d.ts` — no gateway involved, unlike `generateTypes`
 * above (which fetches the org's CMS schema types). Mirrors what the Vite
 * plugin writes on every scan (`plugin.ts`'s `writeBlockTypes`), for a
 * consumer that wants the file without running a dev server or build.
 */
export function generateBlockTypesFile(opts: { themeDir: string }): string {
  const scan = scanTheme({ themeDir: opts.themeDir });
  if (scan.manifest === null) {
    throw new Error(`types --blocks: theme validation failed:\n  ${scan.errors.join('\n  ')}`);
  }
  const target = join(opts.themeDir, '.eldra', 'block-types.d.ts');
  const content = generateBlockTypes(
    scan.manifest.blocks as unknown as BlockDefinition[],
    scan.manifest.messages
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}
