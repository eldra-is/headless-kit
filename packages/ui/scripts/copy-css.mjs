#!/usr/bin/env node
// Finishes the stylesheets after the Vite build: derives components.css from style.css. Ships tokens.css and the Tailwind
// entry for an app's own markup (tailwind.css, theme.css, utilities.css) as source. Also removes
// the empty JS chunk Vite emits for the CSS-only `style` lib entry.
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutPreflight } from './components-css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

for (const name of ['tokens.css', 'tailwind.css', 'theme.css', 'utilities.css']) {
  await copyFile(join(root, 'src', 'styles', name), join(dist, name));
}
await rm(join(dist, 'style.js'), { force: true });

const style = await readFile(join(dist, 'style.css'), 'utf8');
const reset = await readFile(join(root, 'src', 'styles', 'components-reset.css'), 'utf8');
await writeFile(join(dist, 'components.css'), withoutPreflight(style, reset));
