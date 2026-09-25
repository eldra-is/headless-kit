import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `source-scan.spec.ts` and
// `custom-utility-coverage.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `@eldrajs/ui` ships publicly on the npm registry. A private npm scope exists in the same GitHub
 * organisation for Eldra's own internal UI library, a different audience entirely — see
 * `headless-kit/CLAUDE.md`'s Invariants for why the two are kept apart and never mixed. A docs pass
 * once wrote that private scope's exact package specifier straight into this package's `README.md`
 * and `src/resolver.ts`'s own JSDoc — both of which npm ships regardless of `package.json`'s
 * `files` allowlist, README always and a `.ts` source file's doc comments along with its compiled
 * declaration. Nothing caught it before it shipped once; this spec is what catches it next time.
 *
 * Scans every text file under `src/`, plus `README.md` and `CHANGELOG.md` (the two files npm
 * always includes), for that private scope and a couple of representative internal-only
 * hostnames/service names. The one legitimate use of the organisation's name in this package is the
 * *public* GitHub repository it lives in (in `package.json`'s `homepage`/`bugs`/`repository` URLs)
 * — a different thing from the private npm scope of the same name — so `package.json` is
 * deliberately not scanned here.
 *
 * This file's own source deliberately never spells the private scope out as one contiguous string:
 * doing so would trip the very hygiene grep this spec backs up (see the fix report for the exact
 * command), the same way the docs pass's original mistake would have tripped this spec had it
 * existed then. The pattern is assembled from parts instead — a `RegExp` matches the *contents
 * being scanned*, not its own construction, so this weakens nothing.
 */

const packageRoot = fileURLToPath(new NodeURL('../../', import.meta.url));
const selfPath = fileURLToPath(import.meta.url);

const scannableExtensions = /\.(ts|vue|md|json|css|mjs|cjs)$/;

function collectFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (scannableExtensions.test(entry) && full !== selfPath) {
      out.push(full);
    }
  }
  return out;
}

const files = [
  ...collectFiles(join(packageRoot, 'src'), []),
  join(packageRoot, 'README.md'),
  join(packageRoot, 'CHANGELOG.md'),
];

const privateNpmScope = ['@eldra', 'is/'].join('-'); // never write this contiguously above

// Each pattern names what it guards against so a failure says why, not just where.
const forbidden: { label: string; pattern: RegExp }[] = [
  { label: `the private npm scope (${privateNpmScope}…)`, pattern: new RegExp(privateNpmScope) },
  { label: 'an internal-only preview hostname', pattern: /local\.eldra\.app/ },
  { label: 'an internal-only gateway service name', pattern: /studio-gateway/ },
];

describe('public-repo hygiene: no private scope or internal hostname in shipped files', () => {
  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)('%s carries none of the forbidden patterns', (file) => {
    const contents = readFileSync(file, 'utf8');
    for (const { label, pattern } of forbidden) {
      expect(contents, `${file} contains ${label}`).not.toMatch(pattern);
    }
  });
});
