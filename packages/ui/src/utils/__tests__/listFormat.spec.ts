import { describe, expect, it } from 'vitest';
import { formatConjunctionList } from '../listFormat';

describe('formatConjunctionList', () => {
  it('returns an empty string for an empty list', () => {
    expect(formatConjunctionList([], 'en-US')).toBe('');
  });

  it('returns the single item verbatim for a one-item list', () => {
    expect(formatConjunctionList(['Maya'], 'en-US')).toBe('Maya');
  });

  it('joins two items with "and" and no comma', () => {
    expect(formatConjunctionList(['Maya', 'Tomas'], 'en-US')).toBe('Maya and Tomas');
  });

  /**
   * The boundary case `formatConjunctionList` exists for: `Intl.ListFormat`'s own English output
   * for three or more items has an Oxford comma ("a, b, and c"), which the spec's own example
   * ("Ingrid, Tomas, Maya and 4 more") does not. This is the guard against a mutant that deletes
   * the comma-stripping regex replace and lets the raw `Intl.ListFormat` output through instead.
   */
  it('joins three or more items with a comma list and no Oxford comma before "and"', () => {
    expect(formatConjunctionList(['Ingrid', 'Tomas', 'Maya'], 'en-US')).toBe(
      'Ingrid, Tomas and Maya'
    );
    expect(formatConjunctionList(['Ingrid', 'Tomas', 'Maya', '4 more'], 'en-US')).toBe(
      'Ingrid, Tomas, Maya and 4 more'
    );
  });

  it('joins with "og" in Icelandic, also with no comma before it', () => {
    expect(formatConjunctionList(['Ingrid', 'Tomas'], 'is-IS')).toBe('Ingrid og Tomas');
    expect(formatConjunctionList(['Ingrid', 'Tomas', 'Maya'], 'is-IS')).toBe(
      'Ingrid, Tomas og Maya'
    );
  });

  it('falls back to a hand-written join when Intl.ListFormat is unavailable', () => {
    const original = Intl.ListFormat;
    // @ts-expect-error -- deliberately removing the constructor to exercise the fallback branch.
    delete Intl.ListFormat;
    try {
      expect(formatConjunctionList(['Ingrid', 'Tomas', 'Maya'], 'en-US')).toBe(
        'Ingrid, Tomas and Maya'
      );
      expect(formatConjunctionList(['Ingrid', 'Tomas', 'Maya'], 'is-IS')).toBe(
        'Ingrid, Tomas og Maya'
      );
    } finally {
      // @ts-expect-error -- restoring the constructor removed above.
      Intl.ListFormat = original;
    }
  });
});
