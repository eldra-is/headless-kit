#!/usr/bin/env node
// @tabler/icons-vue → src/components/tabler-icon/data/NNN.json; `--check` (in the root lint:check) fails on drift.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tabler from '@tabler/icons-vue';
import { tablerBucketFile } from '../src/components/tabler-icon/bucket.ts';

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(here, '../src/components/tabler-icon/data');
const { version } = createRequire(import.meta.url)('@tabler/icons-vue/package.json');

// Names Studio's picker offered that a later Tabler dropped without an alias, mapped to their successor.
const RETIRED = {
  IconMoodConfuzedFilled: 'IconMoodConfusedFilled',
};

const fail = (message) => {
  throw new Error(`build-tabler-icons: ${message}`);
};

const escapeAttribute = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function body(name, component) {
  const svg = component({}, { attrs: {}, slots: {} });
  const filled = svg.props.fill === 'currentColor';
  if (filled !== name.endsWith('Filled')) fail(`${name}: TablerIcon reads "filled" off the name`);
  return svg.children
    .map(({ type, props, children }) => {
      if (!/^[a-z]+$/.test(type) || children) fail(`${name}: unexpected <${type}> node`);
      const attributes = Object.entries(props)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => {
          if (!/^[a-z-]+$/.test(key)) fail(`${name}: unexpected attribute ${key}`);
          return ` ${key}="${escapeAttribute(value)}"`;
        })
        .join('');
      return `<${type}${attributes}/>`;
    })
    .join('');
}

function generate() {
  const bodies = new Map();
  for (const [name, component] of Object.entries(tabler)) {
    if (/^Icon[A-Z0-9]/.test(name) && typeof component === 'function') {
      bodies.set(name, body(name, component));
    }
  }
  for (const [retired, successor] of Object.entries(RETIRED)) {
    if (bodies.has(retired)) continue;
    if (!bodies.has(successor)) fail(`${retired}'s successor ${successor} is not in ${version}`);
    bodies.set(retired, bodies.get(successor));
  }

  const files = new Map();
  for (const name of [...bodies.keys()].sort()) {
    const file = `${tablerBucketFile(name)}.json`;
    files.set(file, [...(files.get(file) ?? []), name]);
  }
  const rendered = new Map();
  for (const [file, names] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const lines = names.map(
      (name) => `  ${JSON.stringify(name)}: ${JSON.stringify(bodies.get(name))}`
    );
    rendered.set(file, `{\n${lines.join(',\n')}\n}\n`);
  }
  return { names: new Set(bodies.keys()), rendered };
}

function checkedInNames() {
  if (!existsSync(TARGET)) return [];
  return readdirSync(TARGET)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => Object.keys(JSON.parse(readFileSync(join(TARGET, file), 'utf8'))));
}

const { names, rendered } = generate();
const dropped = checkedInNames().filter((name) => !names.has(name));
if (dropped.length > 0) {
  fail(`@tabler/icons-vue ${version} no longer has ${dropped.join(', ')}; add each to RETIRED`);
}

if (process.argv.includes('--check')) {
  const onDisk = existsSync(TARGET) ? readdirSync(TARGET).sort() : [];
  const stale = [...rendered].filter(
    ([file, content]) =>
      !onDisk.includes(file) || readFileSync(join(TARGET, file), 'utf8') !== content
  );
  const extra = onDisk.filter((file) => !rendered.has(file));
  if (stale.length > 0 || extra.length > 0) {
    console.error(
      `src/components/tabler-icon/data is stale against @tabler/icons-vue ${version}: run pnpm --filter @eldrajs/ui build-tabler-icons`
    );
    process.exit(1);
  }
} else {
  rmSync(TARGET, { recursive: true, force: true });
  mkdirSync(TARGET, { recursive: true });
  for (const [file, content] of rendered) writeFileSync(join(TARGET, file), content);
  console.log(
    `${names.size} Tabler icons from @tabler/icons-vue ${version} in ${rendered.size} files`
  );
}
