/**
 * The amount a person types into `UnitInput` and `CurrencyInput`: one parser for every way text
 * arrives, and the live formatting that shows it back with its symbol and grouping while it is
 * typed. Framework-free and DOM-free, so every edit is a pure function of the text before it, the
 * text after it and the caret. The rules are in the package README, under `UnitInput`.
 */

export type AmountInvalidReason = 'notANumber' | 'noDecimals';

export type AmountReading =
  | { kind: 'empty' }
  | { kind: 'pending' }
  | { kind: 'invalid'; reason: AmountInvalidReason }
  /** `whole` holds digits only, `fraction` the digits after the decimal mark as typed. */
  | { kind: 'number'; value: number; whole: string; fraction: string; mark: boolean };

const NOT_A_NUMBER: AmountReading = { kind: 'invalid', reason: 'notANumber' };
const count = (text: string, mark: string) => text.split(mark).length - 1;
const escaped = (mark: string) => (mark === '.' ? '\\.' : mark);
const grouped = (text: string, mark: string) =>
  new RegExp(`^[1-9]\\d{0,2}(${escaped(mark)}\\d{3})+$`).test(text);
const groupingSoFar = (text: string, mark: string) =>
  new RegExp(`^[1-9]\\d{0,2}(${escaped(mark)}\\d{3})*${escaped(mark)}\\d{0,2}$`).test(text);
const groupedWithFraction = (text: string, group: string, decimal: string) =>
  new RegExp(`^[1-9]\\d{0,2}(${escaped(group)}\\d{3})+${escaped(decimal)}\\d*$`).test(text);

type Split = { whole: string; fraction: string; mark: boolean };

function splitAmount(rest: string, digits: number, decimal: string): Split | AmountReading {
  const group = decimal === ',' ? '.' : ',';
  const at = (mark: string): Split => ({
    whole: rest.slice(0, rest.lastIndexOf(mark)),
    fraction: rest.slice(rest.lastIndexOf(mark) + 1),
    mark: true,
  });
  const hasDecimal = rest.includes(decimal);
  const hasGroup = rest.includes(group);
  if (!hasDecimal && !hasGroup) return { whole: rest, fraction: '', mark: false };
  if (hasDecimal && !hasGroup) {
    if (digits === 0 && grouped(rest, decimal)) return { whole: rest, fraction: '', mark: false };
    return count(rest, decimal) === 1 ? at(decimal) : NOT_A_NUMBER;
  }
  if (!hasDecimal) {
    if (grouped(rest, group)) return { whole: rest, fraction: '', mark: false };
    const several = count(rest, group) > 1;
    const typingGroups = groupingSoFar(rest, group) && (several || digits === 0);
    if (typingGroups || (!several && rest.endsWith(group))) return { kind: 'pending' };
    if (several) return NOT_A_NUMBER;
    return /^\d*[.,]\d{1,2}$/.test(rest) ? at(group) : NOT_A_NUMBER;
  }
  if (groupedWithFraction(rest, group, decimal)) return at(decimal);
  if (groupedWithFraction(rest, decimal, group))
    return rest.endsWith(group) ? { kind: 'pending' } : at(group);
  return NOT_A_NUMBER;
}

/** Full-width digits and marks, which an East Asian IME composes, read as their ASCII forms. */
function asciiDigits(text: string): string {
  return text
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/，/g, ',');
}

/**
 * Reads a number field's whole text strictly in its locale: `decimal` is the locale's decimal
 * mark, `digits` how many fraction digits the field takes, `symbols` the currency or unit strings
 * its format prints (stripped wherever they are).
 */
export function parseAmount(
  text: string,
  symbols: readonly string[],
  digits: number,
  decimal: string
): AmountReading {
  let rest = asciiDigits(text);
  for (const symbol of symbols) if (symbol) rest = rest.replaceAll(symbol, '');
  rest = rest.replace(/[\s\p{Sc}]/gu, '');
  if (rest === '') return { kind: 'empty' };
  if (/[^\d.,]/.test(rest)) return NOT_A_NUMBER;
  if (!/\d/.test(rest)) return rest.length === 1 ? { kind: 'pending' } : NOT_A_NUMBER;

  const split = splitAmount(rest, digits, decimal);
  if ('kind' in split) return split;
  const { fraction, mark } = split;
  let read = fraction;
  if (digits === 0 && fraction !== '') {
    if (/^0{1,2}$/.test(fraction)) read = '';
    else
      return /^\d{1,2}$/.test(fraction) ? { kind: 'invalid', reason: 'noDecimals' } : NOT_A_NUMBER;
  }
  if (read.length > digits) return NOT_A_NUMBER;
  const whole = split.whole.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '') || '0';
  const value = Number(`${whole}.${read || '0'}`);
  if (!Number.isFinite(value) || value * 10 ** digits > Number.MAX_SAFE_INTEGER)
    return NOT_A_NUMBER;
  return { kind: 'number', value, whole, fraction, mark };
}

/**
 * `parseAmount`, and when the locale cannot read the text, the other convention: what a paste,
 * a drop, autofill or dictation brings in whole (`1,000,000` into an Icelandic field is a
 * million, `1.000` into an English money field a thousand). A typed keystroke is read strictly.
 */
export function readAmount(
  text: string,
  symbols: readonly string[],
  digits: number,
  decimal: string,
  lenient = false
): AmountReading {
  const strict = parseAmount(text, symbols, digits, decimal);
  if (!lenient || strict.kind !== 'invalid' || strict.reason !== 'notANumber') return strict;
  const other = parseAmount(text, symbols, digits, decimal === ',' ? '.' : ',');
  return other.kind === 'number' ? other : strict;
}

/** The text in the field, and which of its characters are the amount's own (not a symbol, not
 *  grouping the format put there). */
export interface AmountText {
  text: string;
  /** The amount's own characters, digits and the decimal mark (or, while unreadable, as typed). */
  raw: string;
  owned: readonly boolean[];
  reading: AmountReading;
}

export interface AmountEditorOptions {
  /** The field's display format: currency or unit style, grouping on, any fraction digits. */
  format: (minimumFractionDigits: number) => Intl.NumberFormat;
  /** The locale's decimal mark. */
  decimal: string;
  /** How many fraction digits the field takes (0 for ISK). */
  digits: number;
  /** The largest value the field takes; a text past it is refused. */
  max: number;
}

export type AmountEdit =
  | { refused: false; next: AmountText; caret: number }
  | { refused: true; caret: number };

const DIGIT = /\d/;
const digitCount = (text: string) => [...text].filter((c) => DIGIT.test(c)).length;

/** The text with every symbol blanked out, so a `.` in `kr.` is never read as a mark. */
function masked(text: string, symbols: readonly string[]): string {
  let out = text;
  for (const symbol of symbols) if (symbol) out = out.replaceAll(symbol, ' '.repeat(symbol.length));
  return out;
}

export function createAmountEditor(options: AmountEditorOptions) {
  const { format, decimal, digits, max } = options;

  const symbols = (() => {
    const parts = format(0).formatToParts(1000);
    return parts
      .filter((part) => ['currency', 'unit', 'literal'].includes(part.type))
      .map((part) => part.value)
      .sort((a, b) => b.length - a.length);
  })();

  function frame(wholeValue: number) {
    const parts = format(0).formatToParts(wholeValue);
    const first = parts.findIndex((p) => p.type === 'integer');
    let last = -1;
    parts.forEach((p, i) => {
      if (p.type === 'integer' || p.type === 'group') last = i;
    });
    const join = (list: Intl.NumberFormatPart[]) => list.map((p) => p.value).join('');
    return {
      prefix: join(parts.slice(0, first)),
      body: parts.slice(first, last + 1),
      suffix: join(
        parts.slice(last + 1).filter((p) => p.type !== 'decimal' && p.type !== 'fraction')
      ),
    };
  }

  /**
   * The field text for an amount's own characters and their reading. `verbatim` shows a number's
   * characters as typed, for grouping the person typed themselves.
   */
  function render(raw: string, reading: AmountReading, verbatim = false): AmountText {
    if (raw === '' || reading.kind === 'empty') {
      return { text: '', raw: '', owned: [], reading: { kind: 'empty' } };
    }
    if (reading.kind !== 'number' || verbatim) {
      const { prefix, suffix } = frame(reading.kind === 'number' ? Number(reading.whole) : 0);
      return {
        text: prefix + raw + suffix,
        raw,
        owned: [...prefix]
          .map(() => false)
          .concat(
            [...raw].map(() => true),
            [...suffix].map(() => false)
          ),
        reading,
      };
    }
    const { prefix, body, suffix } = frame(Number(reading.whole));
    const owned: boolean[] = [...prefix].map(() => false);
    let text = prefix;
    for (const part of body) {
      text += part.value;
      for (const _ of part.value) owned.push(part.type === 'integer');
    }
    if (reading.mark) {
      const tail = raw.slice(reading.whole.length);
      text += tail;
      for (const _ of tail) owned.push(true);
    }
    text += suffix;
    for (const _ of suffix) owned.push(false);
    return { text, raw, owned, reading };
  }

  function canonical(reading: Extract<AmountReading, { kind: 'number' }>, mark = decimal): string {
    return reading.whole + (reading.mark ? mark + reading.fraction : '');
  }

  function read(raw: string, lenient = false): AmountText {
    const reading = readAmount(raw, symbols, digits, decimal, lenient);
    return render(reading.kind === 'number' ? canonical(reading) : raw, reading);
  }

  /** The text for a number at rest: grouped, with `minimumFractionDigits` (a fixed currency's). */
  function fromValue(value: number | null, minimumFractionDigits = 0): AmountText {
    if (value === null) return render('', { kind: 'empty' });
    const plain = new Intl.NumberFormat('en-US', {
      useGrouping: false,
      minimumFractionDigits,
      maximumFractionDigits: Math.max(digits, minimumFractionDigits),
    }).format(value);
    const [whole = '0', fraction = ''] = plain.split('.');
    return render(whole + (fraction ? decimal + fraction : ''), {
      kind: 'number',
      value,
      whole,
      fraction,
      mark: fraction !== '',
    });
  }

  /** How many of the amount's own characters come before a position in the field. */
  function rawIndex(state: AmountText, position: number): number {
    let index = 0;
    for (let i = 0; i < position && i < state.owned.length; i += 1) if (state.owned[i]) index += 1;
    return index;
  }

  /** The field position right after the amount's `index`-th own character. */
  function textIndex(state: AmountText, index: number): number {
    const first = state.owned.indexOf(true);
    if (first === -1) return state.text.length;
    if (index <= 0) return first;
    let seen = 0;
    for (let i = 0; i < state.owned.length; i += 1) {
      if (!state.owned[i]) continue;
      seen += 1;
      if (seen === index) return i + 1;
    }
    return state.owned.lastIndexOf(true) + 1;
  }

  /**
   * One `input` event: the field held `previous`, it now holds `text` with the caret at `caret`.
   * What changed is found by comparing the two texts around the caret, so a keystroke, a paste
   * into a selection, autofill and a composition all arrive the same way; the symbol and the
   * grouping in `previous` are this field's own and are never read as typed marks.
   */
  function edit(previous: AmountText, text: string, caret: number, inputType = ''): AmountEdit {
    const before = previous.text;
    const end = Math.min(Math.max(caret, 0), text.length);
    let start = 0;
    while (start < end && start < before.length && before[start] === text[start]) start += 1;
    let tail = 0;
    while (
      tail < text.length - end &&
      tail < before.length - start &&
      before[before.length - 1 - tail] === text[text.length - 1 - tail]
    )
      tail += 1;
    const inserted = text.slice(start, text.length - tail);
    let rawStart = rawIndex(previous, start);
    let rawEnd = rawIndex(previous, before.length - tail);

    // Deleting only a symbol or a group mark deletes the digit beyond it instead.
    if (inserted === '' && rawStart === rawEnd && before.length - tail - start === 1) {
      if (inputType === 'deleteContentForward') rawEnd = Math.min(previous.raw.length, rawEnd + 1);
      else rawStart = Math.max(0, rawStart - 1);
    }

    const candidate = previous.raw.slice(0, rawStart) + inserted + previous.raw.slice(rawEnd);
    const candidateCaret = rawStart + Math.min(inserted.length, Math.max(0, end - start));
    const keystroke = inserted.length === 1 && (inputType === '' || inputType === 'insertText');
    let reading = readAmount(candidate, symbols, digits, decimal, !keystroke);
    const refuse = { refused: true as const, caret: textIndex(previous, rawStart) };

    if (reading.kind === 'number' && reading.value > max) return refuse;
    if (keystroke && reading.kind === 'invalid' && reading.reason === 'notANumber') {
      // A key never makes a thousand of `1,000` in a two-decimal field; it may still be on its
      // way to `1,000.50`, so text only the other convention reads is held as in progress.
      if (readAmount(candidate, symbols, digits, decimal, true).kind === 'number')
        reading = { kind: 'pending' };
      else if (previous.reading.kind !== 'invalid') return refuse;
    }

    if (reading.kind !== 'number') {
      const next = render(candidate, reading);
      return { refused: false, next, caret: textIndex(next, candidateCaret) };
    }

    const plain = masked(candidate, symbols);
    // Grouping the person typed stays as typed while typing, so `1,2` can still become `1,234`.
    const marks = (plain.match(/[.,]/g) ?? []).length;
    if (keystroke && marks > (reading.mark ? 1 : 0)) {
      const next = render(candidate, reading, true);
      return { refused: false, next, caret: textIndex(next, candidateCaret) };
    }
    const mark = reading.mark ? Math.max(plain.lastIndexOf(','), plain.lastIndexOf('.')) : -1;
    // A typed mark is kept as typed while it cannot be mistaken for the grouping around it.
    const shown = keystroke && mark !== -1 && reading.whole.length <= 3 ? plain[mark] : decimal;
    const next = render(canonical(reading, shown), reading);
    let rawCaret: number;
    if (mark !== -1 && mark < candidateCaret) {
      const typed = digitCount(candidate.slice(mark + 1, candidateCaret));
      rawCaret = reading.whole.length + 1 + Math.min(typed, reading.fraction.length);
    } else {
      const after = digitCount(candidate.slice(candidateCaret, mark === -1 ? undefined : mark));
      rawCaret = Math.max(0, reading.whole.length - after);
    }
    return { refused: false, next, caret: textIndex(next, rawCaret) };
  }

  return { symbols, render, read, fromValue, edit, textIndex };
}

export type AmountEditor = ReturnType<typeof createAmountEditor>;
