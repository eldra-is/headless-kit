import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it (see veeValidateIsolation.spec.ts).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * `vue-i18n` is an optional peer of `@eldrajs/ui/vue-i18n` only, like `vee-validate` of
 * `./vee-validate`: the root entry must load without it, in the source graph and in `dist/`.
 */

vi.mock('vue-i18n', () => {
  throw new Error(
    'the root entry imported vue-i18n, an optional peer of the ./vue-i18n entry only'
  );
});

describe('the root entry does not import vue-i18n', () => {
  it('imports with vue-i18n unavailable', async () => {
    const ui = await import('../index');
    expect(typeof ui.Select).toBe('object');
    expect(typeof ui.provideEldraUiMessages).toBe('function');
  });
});

const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = isBuilt(`${distDir}index.js`);

function reachable(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const match of source.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
    const target = resolve(dirname(entry), match[1] ?? '');
    if (existsSync(target)) reachable(target, seen);
  }
  return seen;
}

const BARE_SPECIFIER = /(?:from|import)\s*["']vue-i18n["']/;

describe('the built root entry does not reference vue-i18n', () => {
  it.runIf(built)('has no vue-i18n specifier in dist/index.js or any chunk it imports', () => {
    const files = [...reachable(`${distDir}index.js`)];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(BARE_SPECIFIER.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it.runIf(built)('finds one in dist/vue-i18n.js, so the check above can fail', () => {
    expect(BARE_SPECIFIER.test(readFileSync(`${distDir}vue-i18n.js`, 'utf8'))).toBe(true);
  });

  itFailsWithoutDist(built);
});
