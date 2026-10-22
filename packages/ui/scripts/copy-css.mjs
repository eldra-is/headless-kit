#!/usr/bin/env node
// Ships tokens.css and tailwind.css as source, not as compiled output: a consumer's own Tailwind
// build has to read the `@theme` and `@utility` rules, so the files are copied verbatim rather
// than compiled. `@source './'` inside tailwind.css then resolves against dist/, where the
// compiled component JS with its class strings lives. Also removes the empty JS chunk Vite emits
// for the CSS-only `style` lib entry, and derives components.css from the compiled style.css.
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutPreflight } from './components-css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

for (const name of ['tokens.css', 'tailwind.css']) {
  await copyFile(join(root, 'src', 'styles', name), join(dist, name));
}
await rm(join(dist, 'style.js'), { force: true });

const style = await readFile(join(dist, 'style.css'), 'utf8');
const reset = await readFile(join(root, 'src', 'styles', 'components-reset.css'), 'utf8');
await writeFile(join(dist, 'components.css'), withoutPreflight(style, reset));
