#!/usr/bin/env node
// Copies formatjs's `is` and `en` locale data into src/data as JSON; `--check` fails on drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const check = process.argv.includes('--check');

const SETS = {
  number: ['@formatjs/intl-numberformat', 'NumberFormat'],
  date: ['@formatjs/intl-datetimeformat', 'DateTimeFormat'],
  list: ['@formatjs/intl-listformat', 'ListFormat'],
  'relative-time': ['@formatjs/intl-relativetimeformat', 'RelativeTimeFormat'],
  'display-names': ['@formatjs/intl-displaynames', 'DisplayNames'],
};

// CLDR's "at" join for long and full dates with a time, which ICU uses and formatjs's data lacks.
const AT_TIME = { is: "{1} 'kl'. {0}", en: "{1} 'at' {0}" };

function matchIcu({ data, locale }) {
  // V8's format() prints a plain space where CLDR puts U+202F before AM/PM; formatRange keeps it.
  const { intervalFormats, ...rest } = data;
  const spaced = JSON.parse(JSON.stringify(rest).replaceAll('\u202f', ' '));
  const join = AT_TIME[locale];
  const formats = spaced.formats.gregory;
  const atoms = [
    ...Object.keys(formats).filter((key) => !key.includes(', ')),
    ...Object.values(spaced.dateFormat),
    ...Object.values(spaced.timeFormat),
  ];
  const isTime = (atom) => /[hHkKmsaBb]/.test(atom.replace(/'[^']*'/g, ''));
  // A long-month date is joined to a time by the "at" pattern too, as ICU does for skeletons.
  for (const date of atoms.filter((atom) => !isTime(atom))) {
    const pattern = formats[date] ?? date;
    if (!pattern.includes('MMMM') && !pattern.includes('LLLL')) continue;
    for (const time of atoms.filter(isTime)) {
      const key = `${date}, ${time}`;
      if (key in formats)
        formats[key] = join.replace('{1}', pattern).replace('{0}', formats[time] ?? time);
    }
  }
  return {
    locale,
    data: {
      ...spaced,
      intervalFormats,
      dateTimeFormat: { ...spaced.dateTimeFormat, full: join, long: join },
    },
  };
}

let stale = 0;
for (const [name, [pkg, ctor]] of Object.entries(SETS)) {
  for (const locale of ['is', 'en']) {
    const captured = [];
    const Intl = { [ctor]: { __addLocaleData: (...data) => captured.push(...data) } };
    runInNewContext(readFileSync(require.resolve(`${pkg}/locale-data/${locale}.js`), 'utf8'), {
      Intl,
      globalThis: { Intl },
      JSON,
    });
    if (captured.length !== 1)
      throw new Error(`${pkg} ${locale}: expected one data set, got ${captured.length}`);
    const file = join(out, `${name}-${locale}.json`);
    const data = name === 'date' ? matchIcu(captured[0]) : captured[0];
    const json = `${JSON.stringify(data)}\n`;
    if (!check) writeFileSync(file, json);
    else if (readFileSync(file, 'utf8') !== json) {
      console.error(`stale: ${file} (run pnpm --filter @eldrajs/format data)`);
      stale++;
    }
  }
}
process.exit(stale ? 1 : 0);
