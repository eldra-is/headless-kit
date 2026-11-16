#!/usr/bin/env node
// country-flag-icons (3x2) → src/phone/data/flags.json and LICENSE-country-flag-icons; `--check`
// (in the root lint:check) fails on drift. One entry per ISO 3166-1 alpha-2 code:
// "<viewBox>|<the svg's children>". The package is a devDependency: its artwork is copied in, so
// its licence text ships with ours.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/phone/data/flags.json');
const LICENSE = resolve(here, '../LICENSE-country-flag-icons');

const require = createRequire(import.meta.url);
const packageJson = require.resolve('country-flag-icons/package.json');
const { version } = require(packageJson);
const SOURCE = join(dirname(packageJson), '3x2');

const ELEMENTS = new Set(['path', 'g', 'circle', 'ellipse']);
const ATTRIBUTES = new Set([
  'class',
  'clip-rule',
  'cx',
  'cy',
  'd',
  'fill',
  'fill-rule',
  'opacity',
  'r',
  'rx',
  'ry',
  'stroke',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-width',
]);

const fail = (message) => {
  throw new Error(`build-phone-flags: ${message}`);
};

/** The markup is set as `innerHTML`, so anything but plain shapes fails the build. */
function body(code, svg) {
  const match =
    /^<svg (?:xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([\d. ]+)"|viewBox="([\d. ]+)" xmlns="http:\/\/www\.w3\.org\/2000\/svg")>(.*)<\/svg>\s*$/s.exec(
      svg
    );
  if (match === null) fail(`${code}: unexpected <svg> wrapper`);
  const viewBox = match[1] ?? match[2];
  const inner = match[3];
  for (const [, name, attributes] of inner.matchAll(/<([a-zA-Z][\w:-]*)((?:\s[^<>]*)?)\/?>/g)) {
    if (!ELEMENTS.has(name)) fail(`${code}: unexpected <${name}>`);
    for (const [, attribute, value] of attributes.matchAll(/\s([\w:-]+)="([^"]*)"/g)) {
      if (!ATTRIBUTES.has(attribute)) fail(`${code}: unexpected attribute ${attribute}`);
      if (/url\(|javascript:|&/i.test(value)) fail(`${code}: unexpected value in ${attribute}`);
    }
    if (
      attributes
        .replace(/\s[\w:-]+="[^"]*"/g, '')
        .replace(/\/$/, '')
        .trim() !== ''
    )
      fail(`${code}: unparsed attributes on <${name}>`);
  }
  if (/<(?![a-zA-Z/])|<\/(?!(?:path|g|circle|ellipse)>)/.test(inner))
    fail(`${code}: unexpected markup`);
  return `${viewBox}|${inner.replace(/>\s+</g, '><').trim()}`;
}

function generate() {
  const lines = readdirSync(SOURCE)
    .filter((file) => /^[A-Z]{2}\.svg$/.test(file))
    .sort()
    .map((file) => {
      const code = file.slice(0, 2);
      return `  ${JSON.stringify(code)}: ${JSON.stringify(body(code, readFileSync(join(SOURCE, file), 'utf8')))}`;
    });
  if (lines.length < 240) fail(`only ${lines.length} flags in country-flag-icons ${version}`);
  return { count: lines.length, data: `{\n${lines.join(',\n')}\n}\n` };
}

function license() {
  const text = readFileSync(join(dirname(packageJson), 'LICENSE'), 'utf8').trim();
  return `The country flags drawn by CountryFlag and PhoneInput (dist/phoneFlagData-*.js) are copied from\ncountry-flag-icons ${version} (https://gitlab.com/catamphetamine/country-flag-icons), under:\n\n${text}\n`;
}

const { count, data } = generate();
const notice = license();

if (process.argv.includes('--check')) {
  const stale =
    !existsSync(DATA) ||
    readFileSync(DATA, 'utf8') !== data ||
    !existsSync(LICENSE) ||
    readFileSync(LICENSE, 'utf8') !== notice;
  if (stale) {
    console.error(
      `src/phone/data/flags.json is stale against country-flag-icons ${version}: run pnpm --filter @eldrajs/ui build-phone-flags`
    );
    process.exit(1);
  }
} else {
  mkdirSync(dirname(DATA), { recursive: true });
  writeFileSync(DATA, data);
  writeFileSync(LICENSE, notice);
  console.log(`${count} flags from country-flag-icons ${version}`);
}
