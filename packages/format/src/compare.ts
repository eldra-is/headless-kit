const PUNCTUATION = '\t \u00a0_-–—,;:!¡?¿.…·\'‘’"“”„«»()[]{}§@*/\\&#%`^°+÷×<=>|~$£€';
const LETTERS = 'aábcdðeéfghiíjklłmnoópqrstuúvwxyýzþæöå';
const IGNORED = new Set(['\u00ad', '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff']);
const SECONDARY_OF: Record<string, string> = { ä: 'æ', ø: 'ö', đ: 'd' };
const EXPANSIONS: Record<string, string> = { ß: 'ss', œ: 'oe' };
const DIGITS_AT = PUNCTUATION.length;
const LETTERS_AT = DIGITS_AT + 10;
const OTHER_AT = LETTERS_AT + LETTERS.length;

type Key = [primary: number[], secondary: number[], tertiary: number[]];

function key(text: string): Key {
  const result: Key = [[], [], []];
  for (const char of text.normalize('NFC')) {
    if (IGNORED.has(char)) continue;
    const lower = char.toLowerCase();
    const expansion = EXPANSIONS[lower];
    const tertiary = (char === lower ? 0 : 1) + (expansion ? 2 : 0);
    for (const unit of expansion ?? lower) {
      const [primary, secondary] = weigh(unit);
      result[0].push(primary);
      result[1].push(secondary);
      result[2].push(tertiary);
    }
  }
  return result;
}

function weigh(char: string): [primary: number, secondary: number] {
  const letter = LETTERS.indexOf(char);
  if (letter >= 0) return [LETTERS_AT + letter, 0];
  const base = SECONDARY_OF[char] ?? char.normalize('NFD')[0] ?? char;
  const accented = LETTERS.indexOf(base);
  if (accented >= 0) return [LETTERS_AT + accented, char.codePointAt(0) ?? 0];
  if (char >= '0' && char <= '9') return [DIGITS_AT + Number(char), 0];
  const mark = PUNCTUATION.indexOf(char);
  if (mark >= 0) return [mark, 0];
  return [OTHER_AT + (char.codePointAt(0) ?? 0), 0];
}

function compareWeights(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  return a.length - b.length;
}

/** Icelandic alphabetical order (`Intl.Collator('is')`), for runtimes that ship without it. */
export function compareIcelandic(a: string, b: string): number {
  const [ka, kb] = [key(a), key(b)];
  return Math.sign(
    compareWeights(ka[0], kb[0]) || compareWeights(ka[1], kb[1]) || compareWeights(ka[2], kb[2])
  );
}

/** A sort comparator for `locale`: Icelandic order from {@link compareIcelandic}, any other from the runtime. */
export function comparator(locale: string): (a: string, b: string) => number {
  if ((Intl.getCanonicalLocales(locale)[0] ?? locale).split('-')[0] === 'is')
    return compareIcelandic;
  return new Intl.Collator(locale).compare;
}
