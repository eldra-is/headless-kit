import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own under another name resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * `libphonenumber-js` is an optional peer of `@eldrajs/ui/phone` alone. An app that never imports
 * that entry has not installed it, so neither the root entry nor `@eldrajs/ui/vee-validate` may
 * load it: proven twice, like `veeValidateIsolation.spec.ts`, on the source graph (the peer mocked
 * to throw) and on the built `dist/` (no file either entry reaches names it).
 */
const refuse = vi.hoisted(() => () => {
  throw new Error(
    'an entry other than ./phone imported libphonenumber-js, which is an optional peer of ./phone only'
  );
});
vi.mock('libphonenumber-js', refuse);
vi.mock('libphonenumber-js/min', refuse);
vi.mock('libphonenumber-js/max', refuse);
vi.mock('libphonenumber-js/mobile', refuse);
vi.mock('libphonenumber-js/core', refuse);
vi.mock('libphonenumber-js/mobile/examples', refuse);

describe('no entry but ./phone imports libphonenumber-js', () => {
  it('the root entry imports with it unavailable, and exports no phone component', async () => {
    const ui = await import('../index');
    expect(typeof ui.Input).toBe('object');
    expect(Object.keys(ui).filter((key) => /phone/i.test(key))).toEqual([]);
    const { componentNames } = await import('../componentNames');
    expect(componentNames.filter((name) => /phone/i.test(name))).toEqual([]);
  });

  it('the vee-validate entry imports with it unavailable, and exports no phone field', async () => {
    const fields = await import('../vee-validate/index');
    expect(typeof fields.FieldInput).toBe('object');
    expect(Object.keys(fields).filter((key) => /phone/i.test(key))).toEqual([]);
  });

  it('the phone entry does import it, so the mock above can fail', async () => {
    // vitest wraps a throwing factory in its own error, which names the mock.
    await expect(import('../phone/index')).rejects.toThrow(/error when mocking a module/);
  });
});

const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = isBuilt(`${distDir}index.js`, `${distDir}phone.js`);

/** Every dist file reachable from `entry` through relative imports, static and dynamic. */
function reachable(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
    const target = resolve(dirname(entry), match[1] ?? '');
    if (existsSync(target)) reachable(target, seen);
  }
  return seen;
}

const BARE_SPECIFIER = /(?:from|import)\s*\(?\s*["']libphonenumber-js(?:\/[^"']*)?["']/;
const mentions = (entry: string): string[] =>
  [...reachable(`${distDir}${entry}`)].filter((file) =>
    BARE_SPECIFIER.test(readFileSync(file, 'utf8'))
  );

describe('the built entries', () => {
  it.runIf(built).each(['index.js', 'vee-validate.js', 'vue-i18n.js', 'resolver.js'])(
    'dist/%s reaches no file that names libphonenumber-js',
    (entry) => {
      expect(reachable(`${distDir}${entry}`).size).toBeGreaterThan(0);
      expect(mentions(entry)).toEqual([]);
    }
  );

  it.runIf(built).each(['phone.js', 'phone/vee-validate.js'])(
    'dist/%s does, so the check above can fail',
    (entry) => {
      expect(mentions(entry).length).toBeGreaterThan(0);
    }
  );

  it.runIf(built)('keeps the flag artwork out of dist/phone.js, in a chunk of its own', () => {
    const entry = readFileSync(`${distDir}phone.js`, 'utf8');
    const files = [...reachable(`${distDir}phone.js`)];
    const flags = files.filter((file) => /phoneFlagData-[\w-]+\.js$/.test(file));
    expect(flags).toHaveLength(1);
    expect(readFileSync(flags[0]!, 'utf8')).toContain('0 0 513 342|');
    expect(entry).not.toContain('0 0 513 342|');
    // Only ever imported dynamically, so it is fetched when a field mounts, not with the entry.
    for (const file of files) {
      const name = flags[0]!.split('/').at(-1)!;
      expect(
        new RegExp(`from\\s*["'][^"']*${name}["']`).test(readFileSync(file, 'utf8')),
        file
      ).toBe(false);
    }
  });

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
