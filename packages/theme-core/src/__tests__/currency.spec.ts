import { describe, expect, it } from 'vitest';
import {
  countryFromHeader,
  currencyForCountry,
  offeredCurrencies,
  resolveVisitorCurrency,
} from '../currency';

const SHOP = { base: 'ISK', offered: ['ISK', 'EUR', 'USD'] };

describe('resolveVisitorCurrency', () => {
  it('takes the remembered choice over the country', () => {
    expect(resolveVisitorCurrency({ ...SHOP, remembered: 'USD', country: 'DE' })).toBe('USD');
  });

  it('takes the remembered ISK over a country the shop sells to', () => {
    expect(resolveVisitorCurrency({ ...SHOP, remembered: 'ISK', country: 'DE' })).toBe('ISK');
  });

  it('ignores a remembered currency the shop no longer shows', () => {
    expect(resolveVisitorCurrency({ ...SHOP, remembered: 'GBP', country: 'DE' })).toBe('EUR');
  });

  it("starts a first-time visitor in their country's currency when the shop shows it", () => {
    expect(resolveVisitorCurrency({ ...SHOP, country: 'DE' })).toBe('EUR');
    expect(resolveVisitorCurrency({ ...SHOP, country: 'US' })).toBe('USD');
  });

  it("falls back to the shop's own currency when the country's is not shown", () => {
    expect(resolveVisitorCurrency({ ...SHOP, country: 'SE' })).toBe('ISK');
    expect(resolveVisitorCurrency({ ...SHOP, country: 'XX' })).toBe('ISK');
    expect(resolveVisitorCurrency({ ...SHOP, country: null })).toBe('ISK');
  });

  it('answers ISK for an ISK-only shop whatever the visitor', () => {
    expect(
      resolveVisitorCurrency({ base: 'ISK', offered: ['ISK'], remembered: 'EUR', country: 'FR' })
    ).toBe('ISK');
  });
});

describe('currencyForCountry', () => {
  it('maps the euro area, the Nordics and the English-speaking markets', () => {
    expect(currencyForCountry('FR')).toBe('EUR');
    expect(currencyForCountry('BG')).toBe('EUR');
    expect(currencyForCountry('FO')).toBe('DKK');
    expect(currencyForCountry('NO')).toBe('NOK');
    expect(currencyForCountry('SE')).toBe('SEK');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('CA')).toBe('CAD');
    expect(currencyForCountry('IS')).toBe('ISK');
    expect(currencyForCountry('JP')).toBeNull();
    expect(currencyForCountry('T1')).toBeNull();
  });
});

describe('offeredCurrencies', () => {
  it('keeps the selling currencies in order, base first', () => {
    expect(offeredCurrencies('ISK', ['SEK', 'ISK', 'EUR', 'CHF', 'EUR'])).toEqual([
      'ISK',
      'EUR',
      'SEK',
    ]);
  });

  it('answers the base alone when the list is missing or leaves the base out', () => {
    expect(offeredCurrencies('ISK', undefined)).toEqual(['ISK']);
    expect(offeredCurrencies('ISK', ['EUR'])).toEqual(['ISK']);
  });
});

describe('countryFromHeader', () => {
  it('accepts a country and refuses unknown and Tor', () => {
    expect(countryFromHeader(' de ')).toBe('DE');
    expect(countryFromHeader('XX')).toBeNull();
    expect(countryFromHeader('T1')).toBeNull();
    expect(countryFromHeader(undefined)).toBeNull();
  });
});
