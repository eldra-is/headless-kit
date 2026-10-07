import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXCLUDE_DIR_NAMES,
  EXCLUDE_NESTED_DIRS,
  shouldCopyTemplatePath,
} from '../templateExclude.mjs';

// `shouldCopyTemplatePath` is the one list driving both `scripts/copy-template.mjs` (the
// `prepack` copy into the published `template/`) and `src/commands/init.ts` (`eldra-theme
// init`'s own copy — used directly against `examples/starter-nuxt` whenever `template/` has not
// been built, which is every unit test run). These tests build an isolated fixture rather than
// touching `examples/starter-nuxt`, so they — and every other CLI test that shells out to `init`
// — never depend on whatever a previous local `pnpm --filter starter-nuxt previews`, Storybook
// build, coverage run or Playwright run happened to leave sitting in the real starter directory.
describe('shouldCopyTemplatePath', () => {
  // Every other test in this file derives its expected set from `EXCLUDE_DIR_NAMES` /
  // `EXCLUDE_NESTED_DIRS` themselves, which only proves the function is internally consistent
  // with whatever the module currently exports — shrinking those arrays shrinks what the loops
  // check in lockstep, so a regression that silently drops a name (the exact defect this fix
  // exists for) would pass unnoticed. These two tests name the real set literally, independent
  // of the module's own arrays, so dropping one of them here fails.
  it('excludes these exact directories, named literally', () => {
    const excludedPaths = [
      '/theme/node_modules/some-dep/index.js',
      '/theme/.git/HEAD',
      '/theme/.nuxt/dist/client.js',
      '/theme/.output/public/index.html',
      '/theme/storybook-static/iframe.html',
      '/theme/coverage/index.html',
      '/theme/test-results/results.json',
      '/theme/playwright-report/index.html',
      '/theme/.cache/tmp.bin',
      '/theme/.eldra/previews/hero.png',
    ];
    for (const path of excludedPaths) {
      expect(shouldCopyTemplatePath(path)).toBe(false);
    }
  });

  it('keeps these exact starter directories and files, named literally', () => {
    const keptPaths = [
      '/theme/app/app.vue',
      '/theme/blocks/hero/block.json',
      '/theme/pages/home.page.json',
      '/theme/public/favicon.ico',
      '/theme/.eldra/manifest.json',
      // Substring/segment-boundary guard: a real block named like an excluded directory is not
      // caught by a substring match on "coverage".
      '/theme/blocks/coverage-chart/block.json',
    ];
    for (const path of keptPaths) {
      expect(shouldCopyTemplatePath(path)).toBe(true);
    }
  });

  it('excludes every listed directory name at any depth', () => {
    for (const name of EXCLUDE_DIR_NAMES) {
      expect(shouldCopyTemplatePath(`/theme/${name}`)).toBe(false);
      expect(shouldCopyTemplatePath(`/theme/${name}/nested/file.js`)).toBe(false);
      expect(shouldCopyTemplatePath(`/theme/blocks/promo/${name}/file.js`)).toBe(false);
    }
  });

  it('excludes a nested dir only directly under its declared parent', () => {
    for (const { parent, name } of EXCLUDE_NESTED_DIRS) {
      expect(shouldCopyTemplatePath(`/theme/${parent}/${name}`)).toBe(false);
      expect(shouldCopyTemplatePath(`/theme/${parent}/${name}/shot.png`)).toBe(false);
      // Same name, wrong parent: a real, authored directory may use it.
      expect(shouldCopyTemplatePath(`/theme/blocks/${name}/block.json`)).toBe(true);
    }
  });

  it('keeps ordinary theme paths', () => {
    expect(shouldCopyTemplatePath('/theme/package.json')).toBe(true);
    expect(shouldCopyTemplatePath('/theme/blocks/hero/block.json')).toBe(true);
    expect(shouldCopyTemplatePath('/theme/.eldra/manifest.json')).toBe(true);
    expect(shouldCopyTemplatePath('/theme/.storybook/main.ts')).toBe(true);
  });
});

describe('copying a template source with cpSync', () => {
  let root: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eldra-template-exclude-'));
    source = join(root, 'source');
    target = join(root, 'target');
    mkdirSync(source, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('copies real content but drops a dummy file planted in every excluded directory', () => {
    writeFileSync(join(source, 'package.json'), '{}');
    mkdirSync(join(source, 'blocks', 'hero'), { recursive: true });
    writeFileSync(join(source, 'blocks', 'hero', 'block.json'), '{}');

    for (const name of EXCLUDE_DIR_NAMES) {
      mkdirSync(join(source, name), { recursive: true });
      writeFileSync(join(source, name, 'junk.bin'), 'junk');
    }
    for (const { parent, name } of EXCLUDE_NESTED_DIRS) {
      mkdirSync(join(source, parent, name), { recursive: true });
      writeFileSync(join(source, parent, name, 'junk.bin'), 'junk');
    }

    cpSync(source, target, { recursive: true, filter: shouldCopyTemplatePath });

    expect(readdirSync(target)).toEqual(expect.arrayContaining(['package.json', 'blocks']));
    for (const name of EXCLUDE_DIR_NAMES) {
      expect(readdirSync(target)).not.toContain(name);
    }
    for (const { parent, name } of EXCLUDE_NESTED_DIRS) {
      expect(readdirSync(join(target, parent))).not.toContain(name);
    }
  });
});
