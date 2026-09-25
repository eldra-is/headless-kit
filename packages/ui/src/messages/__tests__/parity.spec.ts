import { describe, expect, it } from 'vitest';
import { enUS } from '../en-US';
import { isIS } from '../is-IS';

const keys = Object.keys(enUS) as Array<keyof typeof enUS>;

describe('message catalogues', () => {
  it('ships at least the keys this plan uses', () => {
    expect(keys.length).toBeGreaterThanOrEqual(25);
  });

  it('has exactly the same keys in both locales', () => {
    expect(Object.keys(isIS).sort()).toEqual(Object.keys(enUS).sort());
  });

  it('has the same value kind for every key', () => {
    for (const key of keys) {
      expect(typeof isIS[key], `is-IS.${key}`).toBe(typeof enUS[key]);
    }
  });

  it('has the same arity for every function key', () => {
    for (const key of keys) {
      const en = enUS[key];
      if (typeof en !== 'function') continue;
      const is = isIS[key] as (...args: never[]) => string;
      expect(is.length, `is-IS.${key} arity`).toBe(en.length);
    }
  });

  it('returns a non-empty string from every message in both locales', () => {
    const args = [1, 2] as const;
    for (const key of keys) {
      for (const [locale, catalogue] of [
        ['en-US', enUS],
        ['is-IS', isIS],
      ] as const) {
        const value = catalogue[key];
        const text =
          typeof value === 'function'
            ? (value as (...rest: number[]) => string)(...args.slice(0, value.length))
            : value;
        expect(typeof text, `${locale}.${key}`).toBe('string');
        expect(text.length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('translates every text key rather than copying the English one', () => {
    const untranslated = keys.filter(
      (key) => typeof enUS[key] === 'string' && isIS[key] === enUS[key]
    );
    expect(untranslated).toEqual([]);
  });
});
