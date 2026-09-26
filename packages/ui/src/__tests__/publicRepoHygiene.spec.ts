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
const monorepoRoot = fileURLToPath(new NodeURL('../../../../', import.meta.url));
const selfPath = fileURLToPath(import.meta.url);

const scannableExtensions = /\.(ts|vue|md|json|css|mjs|cjs)$/;

// Directories that are never source: build output, dependencies and generated caches. Scanning
// them would be slow at best (a bundled `dist/` or `node_modules` tree) and a source of false
// positives at worst — a minified bundle can contain any substring by coincidence.
const skippedDirs = new Set([
  'node_modules',
  'dist',
  '.nuxt',
  '.output',
  'storybook-static',
  'coverage',
  '.git',
  '.turbo',
]);

function collectFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (skippedDirs.has(entry)) continue;
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
  // The starter ships in the same public repository (and `theme-cli`'s `prepack` copies it
  // verbatim into what `eldra-theme init` scaffolds), so a dangling internal reference there is
  // exactly as visible to an external reader as one in this package itself — see I3's own worst
  // offender, `examples/starter-nuxt/app/components/ui/UiImage.vue`, which named this plan's own
  // private planning artifact by its full path.
  ...collectFiles(join(monorepoRoot, 'examples/starter-nuxt/app'), []),
  ...collectFiles(join(monorepoRoot, 'examples/starter-nuxt/blocks'), []),
];

const privateNpmScope = ['@eldra', 'is/'].join('-'); // never write this contiguously above

// Each pattern names what it guards against so a failure says why, not just where.
const forbidden: { label: string; pattern: RegExp }[] = [
  { label: `the private npm scope (${privateNpmScope}…)`, pattern: new RegExp(privateNpmScope) },
  { label: 'an internal-only preview hostname', pattern: /local\.eldra\.app/ },
  { label: 'an internal-only gateway service name', pattern: /studio-gateway/ },
  // This plan's own private SDD planning artifacts (`.superpowers/sdd/...`, `task-7-fix-1.md`,
  // `review-t7-fix1-report.md`) are dangling pointers for every external reader — a name in a
  // comment that resolves to nothing at all outside the private planning repo. See I3.
  {
    label: 'an internal SDD planning artifact reference',
    pattern: /\.superpowers|\btask-\d+-|fix-\d\b|review-t\d/,
  },
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

/**
 * A component this package has **removed** must stop being named in the files npm ships.
 *
 * `NumberInput` was replaced by `UnitInput`/`CurrencyInput` before any release, and ten doc
 * comments across seven files went on describing it — one of them pointing a reader at
 * `number-input.spec.ts`, a file that no longer exists. Nothing failed: prose is not compiled, and
 * a name in a comment resolves to nothing at all. This is what fails next time.
 *
 * Deliberately a list of names rather than something clever. "Every backticked PascalCase word in
 * the package must name something that exists" was measured first: 106 such words, 70 of them
 * legitimately not components (`ArrowDown`, `Intl`, `ISK`, `ComputedRef`, `Price` and the rest of
 * the spec's not-yet-built components), so the allowlist would be the maintenance burden the check
 * was meant to remove. The second `it` below is what keeps this list honest in the other
 * direction: a name that comes back has to be taken out of it.
 *
 * `CHANGELOG.md` is exempt, and only it: telling a reader that a component they may have taken
 * from a pre-release build is gone, and what replaces it, is exactly that file's job.
 */
const removedComponents = ['NumberInput', 'FieldNumberInput'];

describe('public-repo hygiene: no shipped file names a removed component', () => {
  const changelog = join(packageRoot, 'CHANGELOG.md');
  const shipped = files.filter((file) => file !== changelog);

  it('lists only components this package really does not ship', async () => {
    const { componentNames } = await import('../componentNames');
    const veeValidateEntry = readFileSync(join(packageRoot, 'src/vee-validate/index.ts'), 'utf8');
    for (const name of removedComponents) {
      expect(componentNames as readonly string[]).not.toContain(name);
      expect(veeValidateEntry).not.toContain(`export { default as ${name} }`);
    }
  });

  it.each(shipped)('%s names none of them', (file) => {
    const contents = readFileSync(file, 'utf8');
    for (const name of removedComponents) {
      expect(contents, `${file} still mentions the removed ${name}`).not.toMatch(
        new RegExp(`\\b${name}\\b`)
      );
    }
  });
});
