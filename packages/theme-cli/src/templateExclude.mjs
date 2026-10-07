// Shared by `scripts/copy-template.mjs` (packs the public `template/` directory on `prepack`)
// and `src/commands/init.ts` (`eldra-theme init`'s own copy, run directly against
// `examples/starter-nuxt` whenever `template/` has not been built yet — which is every unit
// test run, since `template/` is git-ignored and only produced by `prepack`). One list drives
// both, so a directory a local build can leave behind in the starter — a Storybook build, a
// coverage report, a Playwright run — never ships inside `template/` and never changes what a
// test sees either, regardless of what currently happens to sit in the working tree.
//
// Plain ESM: `scripts/copy-template.mjs` runs via a bare `node`, with no build step, so this
// file cannot be TypeScript. `src/commands/init.ts` imports it directly; see the sibling
// `templateExclude.d.mts` for its types.

/** A directory with this name, at any depth, is never copied. */
export const EXCLUDE_DIR_NAMES = [
  'node_modules',
  '.git',
  '.nuxt',
  '.output',
  // A Storybook build (`storybook build` / `pnpm --filter starter-nuxt previews`) — ~17 MB, and
  // the original defect: it shipped inside every `eldra-theme init` on a machine that had built
  // it before packing.
  'storybook-static',
  // vitest --coverage.
  'coverage',
  // Default Playwright Test output directories (`@playwright/test` is a devDependency of the
  // starter).
  'test-results',
  'playwright-report',
  // Generic build/tool cache directory some tooling writes into the project root.
  '.cache',
];

/**
 * A directory excluded only directly under one specific parent — unlike the names above,
 * "previews" alone is a real, authored directory name (e.g. a block could be named that), so
 * only `.eldra/previews` (the generated preview screenshots) is excluded.
 */
export const EXCLUDE_NESTED_DIRS = [{ parent: '.eldra', name: 'previews' }];

/**
 * `cpSync`'s `filter` predicate: false skips the path (and, for a directory, everything under
 * it). `path` is an absolute filesystem path; only its segments matter here.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function shouldCopyTemplatePath(path) {
  const parts = path.split(/[\\/]/);
  if (parts.some((part) => EXCLUDE_DIR_NAMES.includes(part))) return false;
  return !parts.some((part, index) =>
    EXCLUDE_NESTED_DIRS.some(
      (nested) => part === nested.parent && parts[index + 1] === nested.name
    )
  );
}
