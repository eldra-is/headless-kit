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
    // `avatarGroup(label, names, more)` takes a string and an array, not the two numbers every
    // other function key here happens to accept — so it gets its own sample call instead of a
    // slice of `args`, which would spread `2` as `names` and throw (numbers are not iterable).
    const sampleArgs: Partial<Record<keyof typeof enUS, unknown[]>> = {
      avatarGroup: ['Makers', ['Ingrid', 'Tomas'], 2],
    };
    for (const key of keys) {
      for (const [locale, catalogue] of [
        ['en-US', enUS],
        ['is-IS', isIS],
      ] as const) {
        const value = catalogue[key];
        const callArgs = sampleArgs[key] ?? args.slice(0, value.length);
        const text =
          typeof value === 'function'
            ? (value as (...rest: unknown[]) => string)(...callArgs)
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

  /**
   * M15: `soldOut` and `stockOut` were the same string in both locales ('Sold out'/'Uppselt') —
   * `StockBadge`'s `out` level now aliases `soldOut` instead of carrying a second, separately
   * translatable key for the identical phrase.
   */
  it('has no separate stockOut key — StockBadge aliases the shared soldOut key', () => {
    expect(Object.keys(enUS)).not.toContain('stockOut');
    expect(Object.keys(isIS)).not.toContain('stockOut');
  });
});

describe('counted messages read naturally at one', () => {
  it('uses the English singular for exactly one, and the plural otherwise', () => {
    expect(enUS.charactersLeft(1)).toBe('1 character left');
    expect(enUS.charactersLeft(0)).toBe('0 characters left');
    expect(enUS.charactersLeft(12)).toBe('12 characters left');
    expect(enUS.resultsCount(1)).toBe('1 result');
    expect(enUS.resultsCount(0)).toBe('0 results');
    expect(enUS.resultsCount(12)).toBe('12 results');
    expect(enUS.viewAllResults(1)).toBe('See 1 result');
    expect(enUS.viewAllResults(12)).toBe('See all 12 results');
    // The same two with the query the search bar names (spec "Search bar" -> Announcements and
    // Panel views). An empty query reads as no query at all, not as a pair of empty quotes.
    expect(enUS.resultsCount(1, 'mer')).toBe('1 result for “mer”');
    expect(enUS.resultsCount(4, 'mer')).toBe('4 results for “mer”');
    expect(enUS.resultsCount(4, '')).toBe('4 results');
    expect(enUS.viewAllResults(1, 'mer')).toBe('See 1 result for “mer”');
    expect(enUS.viewAllResults(12, 'mer')).toBe('See all 12 results for “mer”');
    expect(enUS.viewAllResults(12, '')).toBe('See all 12 results');
  });

  it('uses the Icelandic singular for any count ending in 1 except 11', () => {
    expect(isIS.charactersLeft(1)).toBe('1 stafur eftir');
    expect(isIS.charactersLeft(11)).toBe('11 stafir eftir');
    expect(isIS.charactersLeft(21)).toBe('21 stafur eftir');
    expect(isIS.resultsCount(1)).toBe('1 niðurstaða');
    expect(isIS.resultsCount(11)).toBe('11 niðurstöður');
    expect(isIS.resultsCount(21)).toBe('21 niðurstaða');
    expect(isIS.viewAllResults(1)).toBe('Sjá 1 niðurstöðu');
    expect(isIS.viewAllResults(12)).toBe('Sjá allar 12 niðurstöður');
    expect(isIS.resultsCount(4, 'mer')).toBe('4 niðurstöður fyrir „mer“');
    expect(isIS.viewAllResults(12, 'mer')).toBe('Sjá allar 12 niðurstöður fyrir „mer“');
  });

  it("reads Rating's review count naturally at one, in both locales", () => {
    expect(enUS.reviewCount(1)).toBe('1 review');
    expect(enUS.reviewCount(128)).toBe('128 reviews');
    expect(isIS.reviewCount(1)).toBe('1 umsögn');
    expect(isIS.reviewCount(11)).toBe('11 umsagnir');
    expect(isIS.reviewCount(21)).toBe('21 umsögn');
  });

  it("formats Rating's accessible sentence, including the Icelandic comma decimal", () => {
    expect(enUS.rating(4.5, 128)).toBe('Rated 4.5 out of 5, 128 reviews');
    expect(enUS.rating(4, 1)).toBe('Rated 4.0 out of 5, 1 review');
    expect(isIS.rating(4.5, 128)).toBe('Einkunn 4,5 af 5, 128 umsagnir');
    expect(isIS.rating(4, 1)).toBe('Einkunn 4,0 af 5, 1 umsögn');
  });

  it("formats AvatarGroup's accessible sentence exactly as the design spec gives it", () => {
    // Spec "Avatar" → Accessibility: `aria-label="Makers: Ingrid, Tomas, Maya and 4 more"` — no
    // Oxford comma before "and", which is what `formatConjunctionList` exists to strip back out
    // of `Intl.ListFormat`'s own English output (see that module's own comment).
    expect(enUS.avatarGroup('Makers', ['Ingrid', 'Tomas', 'Maya'], 4)).toBe(
      'Makers: Ingrid, Tomas, Maya and 4 more'
    );
    expect(isIS.avatarGroup('Smiðir', ['Ingrid', 'Tomas', 'Maya'], 4)).toBe(
      'Smiðir: Ingrid, Tomas, Maya og 4 til viðbótar'
    );
  });

  it('reads naturally with no overflow at all, in both locales', () => {
    expect(enUS.avatarGroup('Makers', ['Ingrid'], 0)).toBe('Makers: Ingrid');
    expect(enUS.avatarGroup('Makers', ['Ingrid', 'Tomas'], 0)).toBe('Makers: Ingrid and Tomas');
    expect(isIS.avatarGroup('Smiðir', ['Ingrid', 'Tomas'], 0)).toBe('Smiðir: Ingrid og Tomas');
  });
});
