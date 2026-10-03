import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@eldrajs/ui';
import { formatMoney } from '../app/storefront/money';

/**
 * One formatter for every currency on the storefront, and it is the public one.
 *
 * `@eldrajs/ui`'s `formatCurrency` (and the `<Price>`/`<ProductCard>`/`<CurrencyInput>` components
 * that format through it) writes the currency's **narrow** sign — `kr 2,800` on an English page,
 * `2.800 kr.` on an Icelandic one. A hand-built `Intl.NumberFormat({ style: 'currency' })` writes
 * the *wide* sign instead (`ISK 2,800`), and the two look nothing alike on the same page: that is
 * exactly how this theme came to show `ISK 2,800` in an Add-to-cart label beside a `<Price>`
 * reading `kr 2,800` for the same money.
 *
 * So no block and no app module may build a currency formatter of its own. `app/storefront/money.ts`
 * is the single exception — it is the module that calls the public util — and it builds only a
 * plain `style: 'decimal'` formatter for the store that publishes no currency at all.
 *
 * This is a source scan rather than a convention, because the failure is silent: a second formatter
 * renders perfectly good-looking money that simply disagrees with the money beside it.
 */

const rootDir = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = ['app', 'blocks'];
const SCAN_EXTENSIONS = new Set(['.ts', '.vue']);

/** The one module allowed to reach for `Intl.NumberFormat`, and why — see the note above. */
const ALLOWED = new Set(['app/storefront/money.ts']);

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // A block's own tests are not shipped output and may assert against raw `Intl` to prove what
      // the theme's formatter produces.
      if (name === '__tests__') continue;
      files.push(...listSourceFiles(full));
      continue;
    }
    if (SCAN_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) files.push(full);
  }
  return files;
}

const sourceFiles = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(rootDir, dir)))
  .map((file) => relative(rootDir, file))
  .filter((file) => !ALLOWED.has(file))
  .sort();

describe('money is formatted in exactly one place', () => {
  it('scans a real set of files, so a passing scan is not an empty one', () => {
    expect(sourceFiles.length).toBeGreaterThan(80);
    expect(sourceFiles).toContain('blocks/product-detail/Block.vue');
    expect(sourceFiles).not.toContain('app/storefront/money.ts');
  });

  it('builds no Intl.NumberFormat outside app/storefront/money.ts', () => {
    // A *call* — with or without `new`, the way the private library writes it — not a mention: the
    // name appears in prose in `app/storefront/commerce.ts`, explaining which codes it rejects.
    const offenders = sourceFiles.filter((file) =>
      /(?:new\s+)?Intl\.NumberFormat\s*\(/.test(readFileSync(join(rootDir, file), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('asks for no currency style outside app/storefront/money.ts', () => {
    // Catches a currency formatter built through `@eldrajs/ui`'s own `createNumberFormat` too,
    // which would be a second set of options rather than a second constructor.
    const offenders = sourceFiles.filter((file) => {
      const source = readFileSync(join(rootDir, file), 'utf8');
      return /style:\s*['"]currency['"]/.test(source) || source.includes('currencyDisplay');
    });
    expect(offenders).toEqual([]);
  });

  it('formats through the public util, which is what gives every price the narrow sign', () => {
    // The module under the exception, held to the util it exists to call.
    expect(formatMoney(2800, 'ISK', 'en-US')).toBe(formatCurrency(2800, 'en-US', 'ISK', true, 0));
    expect(formatMoney(2800, 'ISK', 'en-US')).toBe('kr 2,800');
    expect(formatMoney(2800, 'ISK', 'is-IS')).toBe('2.800 kr.');
  });
});
