import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { native, render, type Formatters } from './cases';
import { withoutIcelandic } from './withoutIcelandic';

const LOCALES = ['is-IS', 'is', 'en-US', 'en'];
const expected = new Map(LOCALES.map((locale) => [locale, render(native, locale)]));

describe('with the runtime missing Icelandic, as Chrome and Workers do', () => {
  let restore: () => void;
  let ours: Formatters;
  beforeAll(async () => {
    restore = withoutIcelandic();
    ({ ours } = await import('./ours'));
  });
  afterAll(() => restore());

  it('really is missing it', () => {
    expect(
      new Intl.NumberFormat('is-IS', { style: 'currency', currency: 'ISK' }).format(12900)
    ).toBe('ISK\u00a012,900');
  });

  it.each(LOCALES)('%s matches full ICU exactly', (locale) => {
    expect(render(ours, locale)).toEqual(expected.get(locale));
  });
});

describe('the standard strings', () => {
  it.each([
    ['is-IS', 'ISK', 12900, '12.900\u00a0kr.'],
    ['en-US', 'ISK', 12900, 'ISK\u00a012,900'],
    ['is-IS', 'EUR', 1234.5, '1.234,50\u00a0EUR'],
    ['en-US', 'EUR', 1234.5, '€1,234.50'],
  ])('%s %s %d → %s', async (locale, currency, amount, text) => {
    const { formatPrice } = await import('../number');
    expect(formatPrice(amount, currency, locale)).toBe(text);
  });
});
