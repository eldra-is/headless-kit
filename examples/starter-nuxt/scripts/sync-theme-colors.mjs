#!/usr/bin/env node
// Regenerates the `@theme static { --color-<id>: var(--eldra-color-<id>) }`
// block in app/assets/main.css from tokens.json's `colors`.
//
// Why this script exists: the Tailwind v4 adapter's own
// `virtual:eldra/tailwind-theme.css` (which would normally generate this
// block from the live token catalog) cannot be consumed from an `@import`
// inside a Vite-processed CSS file — Tailwind v4's Vite plugin resolves
// `@import` itself and never sees vite-plugin-theme's virtual module ids —
// and a second, separate CSS entry's `@theme` block is not merged into the
// Tailwind root defined by main.css either. So main.css hand-writes
// `@import 'tailwindcss'` directly and this script keeps its color block in
// sync with tokens.json, the single source of truth for the palette. Run
// `pnpm sync-theme-colors` after editing tokens.json colors; `pnpm
// check:theme-colors` (wired into the root `lint:check`) fails the build if
// the two have drifted.
import { readFileSync, writeFileSync } from 'node:fs';

const tokensPath = new URL('../tokens.json', import.meta.url);
const cssPath = new URL('../app/assets/main.css', import.meta.url);

const START_MARKER = '/* eldra:colors:start */';
const END_MARKER = '/* eldra:colors:end */';

function generateBlock() {
  const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
  const colors = tokens.colors ?? {};
  const ids = Object.keys(colors).sort();
  const declarations = ids.map((id) => `  --color-${id}: var(--eldra-color-${id});`).join('\n');
  return `${START_MARKER}\n@theme static {\n${declarations}\n}\n${END_MARKER}`;
}

function replaceBlock(css, block) {
  const startIndex = css.indexOf(START_MARKER);
  const endIndex = css.indexOf(END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `${cssPath.pathname}: missing ${START_MARKER} / ${END_MARKER} markers to update`
    );
  }
  const before = css.slice(0, startIndex);
  const after = css.slice(endIndex + END_MARKER.length);
  return `${before}${block}${after}`;
}

const check = process.argv.includes('--check');
const currentCss = readFileSync(cssPath, 'utf8');
const nextBlock = generateBlock();
const nextCss = replaceBlock(currentCss, nextBlock);

if (check) {
  if (currentCss !== nextCss) {
    console.error(
      'app/assets/main.css color theme block is out of date with tokens.json; run pnpm sync-theme-colors'
    );
    process.exit(1);
  }
  process.exit(0);
}

if (currentCss !== nextCss) {
  writeFileSync(cssPath, nextCss);
  console.log('Updated app/assets/main.css color theme block from tokens.json');
} else {
  console.log('app/assets/main.css color theme block already up to date');
}
