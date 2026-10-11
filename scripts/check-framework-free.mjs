#!/usr/bin/env node
// The framework-free packages carry the logic; the wrappers are thin. A framework import in one of
// them is a design error, not a lint nit, so this runs in `lint:check` and in CI.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRAMEWORK_FREE = ['sdk', 'rich-text', 'theme-core', 'vite-plugin-theme', 'theme-cli'];
const BANNED = /from\s+['"](vue|nuxt|#app|#imports|@vue\/|nuxt\/|react|svelte)/;

let failed = false;
for (const pkg of FRAMEWORK_FREE) {
  for (const file of walk(join(root, 'packages', pkg, 'src'))) {
    if (file.includes(`${join('src', '__tests__')}`)) continue;
    const match = readFileSync(file, 'utf8').match(BANNED);
    if (match) {
      console.error(`framework-free violation: ${file} imports ${match[1]}`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|mts|js|mjs)$/.test(name)) yield path;
  }
}
