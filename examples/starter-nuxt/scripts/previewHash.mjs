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
 * The installed `@eldrajs/ui` version, as resolved from the starter itself.
 *
 * The screenshots render through the package's own components and stylesheet, so a package change
 * can change every preview with nothing in `blocks/**` or `main.css` touched — which is exactly
 * what happened to the carousel fix (A1): it needed a hand-written "now regenerate every preview"
 * instruction because no test could tell. In this monorepo the starter depends on
 * `workspace:*`, so the version only moves on a release; that is the coarse-grained answer, and it
 * is the honest one — hashing the package's built `dist/` would make the digest depend on whether
 * the workspace happened to be built, and on a customer's install layout.
 */
function uiPackageVersion(rootDir) {
  try {
    const require = createRequire(join(rootDir, 'package.json'));
    const manifest = JSON.parse(readFileSync(require.resolve('@eldrajs/ui/package.json'), 'utf8'));
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
 * `@eldrajs/ui` version, per the previews.json contract.
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
  hash.update(uiPackageVersion(rootDir));
  return hash.digest('hex');
}
