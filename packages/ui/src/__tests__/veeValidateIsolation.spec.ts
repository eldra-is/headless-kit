import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `source-scan.spec.ts` documents).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/**
 * `vee-validate` is an **optional** peer: only `@eldrajs/ui/vee-validate` needs it, and the root
 * entry must load with it absent. Nothing about the source makes that true on its own — one stray
 * `import { useField } from 'vee-validate'` in a component, or one `Field*` added to
 * `src/index.ts`, and every consumer who did not install it gets a resolution error on an entry
 * that has nothing to do with validation.
 *
 * Two proofs, because neither covers the other:
 *
 * 1. **The source graph.** `vee-validate` is mocked to throw the moment anything asks for it, and
 *    the real root entry is imported. A transitive import anywhere under `src/` fails here.
 * 2. **The built artifact.** A bundler can hoist a shared module into a chunk both entries import,
 *    so the source graph can be clean while `dist/index.js` still pulls the dependency in through a
 *    chunk. So the emitted files are read too, following every relative import out of
 *    `dist/index.js`, and asserting none of them carries a bare `vee-validate` specifier. Skipped
 *    when `dist/` has not been built.
 */

vi.mock('vee-validate', () => {
  throw new Error(
    'the root entry imported vee-validate, which is an optional peer of the ./vee-validate entry only'
  );
});

describe('the root entry does not import vee-validate', () => {
  it('imports with vee-validate unavailable, and still exports its components', async () => {
    const ui = await import('../index');
    expect(typeof ui.Input).toBe('object');
    expect(typeof ui.FormLayout).toBe('object');
    expect(typeof ui.FieldWrapper).toBe('object');
  });

  it('exports no Field* component but the wrapper, and names none of them in componentNames', async () => {
    const ui = await import('../index');
    const { componentNames } = await import('../componentNames');
    const fieldExports = Object.keys(ui).filter(
      (key) => key.startsWith('Field') && key !== 'FieldWrapper'
    );
    expect(fieldExports).toEqual([]);
    expect(componentNames.filter((name) => name.startsWith('Field'))).toEqual(['FieldWrapper']);
  });
});

const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = existsSync(`${distDir}index.js`);

/** Every emitted file the given entry reaches through relative imports, itself included. */
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

/** A bare `vee-validate` specifier — an actual dependency, not a mention of the name in a comment. */
const BARE_SPECIFIER = /(?:from|import)\s*["']vee-validate["']/;

describe('the built root entry does not reference vee-validate', () => {
  it.runIf(built)('has no vee-validate specifier in dist/index.js or any chunk it imports', () => {
    const files = [...reachable(`${distDir}index.js`)];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(BARE_SPECIFIER.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it.runIf(built)('finds one in dist/vee-validate.js, so the check above can fail', () => {
    expect(BARE_SPECIFIER.test(readFileSync(`${distDir}vee-validate.js`, 'utf8'))).toBe(true);
  });

  it.skipIf(built)('needs a build first: run `pnpm --filter @eldrajs/ui build`', () => {
    expect(built).toBe(false);
  });
});
