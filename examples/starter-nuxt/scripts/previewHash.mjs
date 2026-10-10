// Shared by scripts/previews.mjs (writes .eldra/previews.json) and
// test/previewsFresh.spec.ts (recomputes and compares it), so the two can
// never drift apart from independently-written hashing logic.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function listBlockIds(rootDir) {
  const blocksDir = join(rootDir, 'blocks');
  return readdirSync(blocksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(join(blocksDir, id, 'block.json')))
    .sort();
}

/** Never part of a block's own rendered output, so never part of its hash. */
const EXCLUDED_DIRS = new Set(['__tests__']);
const EXCLUDED_FILES = new Set(['preview.png']);

/**
 * Every shipped file under `blocks/<id>/`, relative to that directory, sorted — so the digest is
 * stable across platforms and directory-read order.
 *
 * Deliberately the *whole* directory rather than a named list. The hash used to be
 * `Block.vue` + `mock.json` + `preview.json` only, which left twelve source files shipping inside
 * blocks outside it — `cart/parts/*.vue`, `collection-grid/parts/*`, `product-detail/parts/*`,
 * `search/TypeSection.vue`, `search/results.ts`, `video-embed/embed.ts` — so editing, say,
 * `cart/parts/Summary.vue` changed the rendered block while `test/previewsFresh.spec.ts` stayed
 * green over a stale screenshot. A whole-directory walk cannot go stale as a block grows a new
 * part file; a named list silently can. `block.json` is in it too (a `variant` option added there
 * adds a screenshotted story).
 */
function blockFiles(blockDir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(blockDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...blockFiles(join(blockDir, entry.name), `${prefix}${entry.name}/`));
    } else if (!EXCLUDED_FILES.has(entry.name)) {
      out.push(`${prefix}${entry.name}`);
    }
  }
  return out.sort();
}

/**
 * What `@eldrajs/ui` contributes to a block's hash.
 *
 * The screenshots render through the package's own components and stylesheet, so a package change
 * can change every preview with nothing in `blocks/**` or `main.css` touched — which is exactly
 * what happened to the carousel fix (A1): it needed a hand-written "now regenerate every preview"
 * instruction because no test could tell.
 *
 * Inside this monorepo the starter depends on `workspace:*`, so the package resolves to
 * `packages/ui` itself: the digest is then the package's **source** (`src/**`, minus tests,
 * stories and screenshots), which moves exactly when the rendered output can and never on a
 * version bump — a release pull request changes only `package.json`'s version and cannot run the
 * preview generator, so hashing the version made every release fail this suite. A theme
 * scaffolded by `eldra-theme init` resolves an installed copy with no `src/`; there the version is
 * the only honest signal and is used as before. Hashing the built `dist/` is avoided in both
 * cases: it would make the digest depend on whether the workspace happened to be built.
 */
const UI_SOURCE_EXCLUDED_DIRS = new Set(['__tests__', '__screenshots__']);
const UI_SOURCE_EXCLUDED_SUFFIXES = ['.stories.ts', '.spec.ts', '.test.ts'];

function uiSourceFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (UI_SOURCE_EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...uiSourceFiles(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (!UI_SOURCE_EXCLUDED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      out.push(`${prefix}${entry.name}`);
    }
  }
  return out.sort();
}

function uiPackageDigest(rootDir) {
  try {
    const require = createRequire(join(rootDir, 'package.json'));
    const manifestPath = require.resolve('@eldrajs/ui/package.json');
    const packageDir = join(manifestPath, '..');
    const sourceDir = join(packageDir, 'src');
    if (existsSync(sourceDir)) {
      const hash = createHash('sha256');
      for (const file of uiSourceFiles(sourceDir)) {
        hash.update(`${file}\0`);
        hash.update(readFileSync(join(sourceDir, file)));
        hash.update('\0');
      }
      return `@eldrajs/ui#src:${hash.digest('hex')}`;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return `@eldrajs/ui@${manifest.version}`;
  } catch {
    // A tree with no installed packages (a fresh clone before `pnpm install`) still hashes, it just
    // cannot contribute this part — better than failing `pnpm previews` outright.
    return '@eldrajs/ui@unresolved';
  }
}

/**
 * sha256 of every file under `blocks/<id>/` except `__tests__/` and the screenshot itself, plus
 * `app/assets/main.css` (a shared style change invalidates every block) and the resolved
 * `@eldrajs/ui` digest (its source in this workspace, its version in a scaffolded theme), per the
 * previews.json contract.
 *
 * Each file's path is folded into the digest alongside its bytes, so moving content between two
 * files inside a block changes the hash too.
 */
export function hashBlock(rootDir, id) {
  const blockDir = join(rootDir, 'blocks', id);
  const hash = createHash('sha256');
  for (const file of blockFiles(blockDir)) {
    hash.update(file);
    hash.update(readFileSync(join(blockDir, ...file.split('/'))));
  }
  hash.update('app/assets/main.css');
  hash.update(readFileSync(join(rootDir, 'app', 'assets', 'main.css')));
  hash.update(uiPackageDigest(rootDir));
  return hash.digest('hex');
}
