import { describe, expect, it } from 'vitest';
import { comparator, compareIcelandic } from '../compare';

const ALPHABET =
  "aábcdðeéfghiíjklłmnoópqrstuúvwxyýzþæöAÁBDÐEÉIÍOÓUÚYÝZÞÆÖŁäøåüçèñßœŒđΩж0123456789 -_.,&'()/\u00ad\u200bSOE";

function* randomPairs(count: number): Generator<[string, string]> {
  let seed = 11;
  const next = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const word = () =>
    Array.from({ length: 1 + next(6) }, () => ALPHABET[next(ALPHABET.length)]).join('');
  for (let i = 0; i < count; i++) yield [word(), word()];
}

describe('compareIcelandic', () => {
  const icu = new Intl.Collator('is');

  it('orders the Icelandic alphabet', () => {
    expect(
      ['ö', 'þ', 'á', 'a', 'ð', 'd', 'æ', 'b', 'z', 'é', 'ý', 'y'].sort(compareIcelandic).join(' ')
    ).toBe('a á b d ð é y ý z þ æ ö');
  });

  it('agrees with ICU on 20,000 random pairs', () => {
    const disagreements = [...randomPairs(20000)].filter(
      ([a, b]) => compareIcelandic(a, b) !== Math.sign(icu.compare(a, b))
    );
    expect(disagreements).toEqual([]);
  });
});

describe('comparator', () => {
  it('is compareIcelandic for Icelandic', () => {
    expect(comparator('is-IS')).toBe(compareIcelandic);
  });

  it('is the runtime collator otherwise', () => {
    expect(['ö', 'z', 'a'].sort(comparator('de-DE')).join('')).toBe('aöz');
  });
});
