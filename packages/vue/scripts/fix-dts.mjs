#!/usr/bin/env node
// vue-tsc emits declaration files whose relative imports have no extension and point at `.vue`
// modules. Node16 resolution rejects both, so every relative specifier gets the `.js` suffix that
// maps back to its `.d.ts`. `are-the-types-wrong` in CI is what catches a regression here.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const specifier = /((?:from |import\()\s*)(['"])(\.\.?\/[^'"]+)\2/g;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function* declarationFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* declarationFiles(path);
    else if (entry.name.endsWith('.d.ts')) yield path;
  }
}

for await (const file of declarationFiles(dist)) {
  const source = await readFile(file, 'utf8');
  const replacements = [];
  for (const match of source.matchAll(specifier)) {
    const [, , , target] = match;
    if (/\.(js|json)$/.test(target)) continue;
    const base = resolve(dirname(file), target);
    if (await exists(`${base}.d.ts`)) replacements.push([target, `${target}.js`]);
    else if (await exists(join(base, 'index.d.ts')))
      replacements.push([target, `${target}/index.js`]);
    else throw new Error(`${file}: cannot resolve '${target}'`);
  }
  let output = source;
  for (const [from, to] of replacements) {
    output = output.replaceAll(`'${from}'`, `'${to}'`).replaceAll(`"${from}"`, `"${to}"`);
  }
  if (output !== source) await writeFile(file, output);
}
