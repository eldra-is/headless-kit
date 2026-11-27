import { describe, expect, it } from 'vitest';
import { createAmountEditor, parseAmount, readAmount, type AmountText } from '../amount';
import { createNumberFormat, currencyFractionDigits, localeSeparators } from '../number-format';

const eur = ['€', 'EUR'];
const isk = ['kr.', 'kr', 'ISK'];
const percent = ['%'];
const is = ',';
const en = '.';
const pending = { kind: 'pending' };
const notANumber = { kind: 'invalid', reason: 'notANumber' };
const noDecimals = { kind: 'invalid', reason: 'noDecimals' };
const valueOf = (reading: ReturnType<typeof parseAmount>) =>
  reading.kind === 'number' ? { kind: 'number', value: reading.value } : reading;
const number = (value: number) => ({ kind: 'number', value });

// The one parser behind every input event: a number must never be read 10, 100 or 1000 times off.
describe('parseAmount', () => {
  it.each([
    ['34,90', eur, 2, is, number(34.9)],
    ['34.90', eur, 2, en, number(34.9)],
    ['12,', eur, 2, is, number(12)],
    [',5', eur, 2, is, number(0.5)],
    ['.5', eur, 2, en, number(0.5)],
    ['34,90 €', eur, 2, is, number(34.9)],
    ['€34.90', eur, 2, en, number(34.9)],
    ['12,345', eur, 2, is, notANumber],
    ['0.050', eur, 2, en, notANumber],
    ['1.234', eur, 2, en, notANumber],
    ['0.050', percent, 3, en, number(0.05)],
    ['0,050', percent, 3, is, number(0.05)],
    ['0,125', percent, 3, en, notANumber],
    ['12,5,', eur, 2, is, notANumber],
    ['1.234', eur, 2, is, number(1234)],
    ['1,234', eur, 2, en, number(1234)],
    ['1.234.567', eur, 2, is, number(1234567)],
    ['1,234,567.5', eur, 2, en, number(1234567.5)],
    ['1.234,50', eur, 2, is, number(1234.5)],
    ['01.234', eur, 2, is, notANumber],
    ['1.23', eur, 2, is, number(1.23)],
    ['34.90', eur, 2, is, number(34.9)],
    ['34,90', eur, 2, en, number(34.9)],
    ['1,234.50', eur, 2, is, number(1234.5)],
    ['$1,234.50', eur, 2, is, number(1234.5)],
    ['1.234,50', eur, 2, en, number(1234.5)],
    [',', eur, 2, is, pending],
    ['12.', eur, 2, is, pending],
    ['1,', eur, 2, en, pending],
    ['1,234,5', eur, 2, en, pending],
    ['1.234.', eur, 2, is, pending],
    ['1,23,456', eur, 2, en, notANumber],
    ['', eur, 2, is, { kind: 'empty' }],
    [' € ', eur, 2, is, { kind: 'empty' }],
    ['12a', eur, 2, is, notANumber],
    ['..', eur, 2, is, notANumber],
    ['4.990', isk, 0, is, number(4990)],
    ['4,990', isk, 0, is, number(4990)],
    ['4,990', isk, 0, en, number(4990)],
    ['4.990,00', isk, 0, is, number(4990)],
    ['4,990.00', isk, 0, en, number(4990)],
    ['4,990.00', isk, 0, is, number(4990)],
    ['4.990 kr.', isk, 0, is, number(4990)],
    ['12,0', isk, 0, is, number(12)],
    ['1,5', isk, 0, is, noDecimals],
    ['4.99', isk, 0, is, pending],
    ['0.5', isk, 0, is, noDecimals],
    ['4.9900', isk, 0, is, notANumber],
    ['90071992547410,00', eur, 2, is, notANumber],
    ['90071992547,40', eur, 2, is, number(90071992547.4)],
    ['１２,５', eur, 2, is, number(12.5)],
  ])('reads %j (%j, %i decimals, mark %s) as %j', (text, symbols, digits, decimal, expected) => {
    expect(valueOf(parseAmount(text, symbols, digits, decimal))).toEqual(expected);
  });

  it('keeps the fraction as typed, the zero tail of a currency without decimals included', () => {
    expect(parseAmount('4.990,00', isk, 0, is)).toEqual({
      kind: 'number',
      value: 4990,
      whole: '4990',
      fraction: '00',
      mark: true,
    });
    expect(parseAmount('007', eur, 2, is)).toMatchObject({ whole: '7', mark: false });
  });
});

describe('readAmount, lenient (a paste, a drop, autofill, dictation)', () => {
  it.each([
    ['1,000,000', eur, 2, is, number(1000000)],
    ['1,000', eur, 2, is, number(1000)],
    ['12,345.67', eur, 2, is, number(12345.67)],
    ['1.000.000', eur, 2, en, number(1000000)],
    ['1.000', eur, 2, en, number(1000)],
    ['0,125', percent, 3, en, number(0.125)],
    ['1,234', percent, 3, is, number(1.234)],
    ['12a', eur, 2, is, notANumber],
  ])('reads %j (%j, %i decimals, mark %s) as %j', (text, symbols, digits, decimal, expected) => {
    expect(valueOf(readAmount(text, symbols, digits, decimal, true))).toEqual(expected);
  });

  it('reads strictly when not lenient', () => {
    expect(readAmount('1,000,000', eur, 2, is)).toEqual(notANumber);
  });
});

function editor(locale: string, currency: string, max = Number.MAX_SAFE_INTEGER) {
  const digits = currencyFractionDigits(currency);
  return createAmountEditor({
    format: (minFraction) =>
      createNumberFormat({
        locale,
        style: 'currency',
        currency,
        narrow: true,
        maxFraction: Math.max(digits, minFraction),
        minFraction,
      }),
    decimal: localeSeparators(locale).decimal,
    digits,
    max,
  });
}

/** Types `keys` one at a time at the caret, the way a browser would before the `input` event. */
function typeKeys(ed: ReturnType<typeof editor>, start: AmountText, keys: string, caret?: number) {
  let state = start;
  let at = caret ?? state.text.length;
  for (const key of keys) {
    const text = state.text.slice(0, at) + key + state.text.slice(at);
    const result = ed.edit(state, text, at + 1, 'insertText');
    if (!result.refused) state = result.next;
    at = result.caret;
  }
  return { state, caret: at };
}

const NBSP = ' ';

describe('createAmountEditor — formatting while typing', () => {
  it('shows the symbol and grouping on every keystroke, the caret after the last digit', () => {
    const ed = editor('en-US', 'USD');
    const { state, caret } = typeKeys(ed, ed.fromValue(null), '1234.5');
    expect(state.text).toBe('$1,234.5');
    expect(state.reading).toMatchObject({ kind: 'number', value: 1234.5 });
    expect(caret).toBe(8);
  });

  it('formats Icelandic krónur as they are typed', () => {
    const ed = editor('is-IS', 'ISK');
    const { state, caret } = typeKeys(ed, ed.fromValue(null), '4990');
    expect(state.text).toBe(`4.990${NBSP}kr.`);
    expect(caret).toBe(5);
  });

  it('keeps a typed decimal mark and trailing zeros while typing', () => {
    const ed = editor('is-IS', 'EUR');
    expect(typeKeys(ed, ed.fromValue(null), '12,').state.text).toBe(`12,${NBSP}€`);
    expect(typeKeys(ed, ed.fromValue(null), '12,50').state.text).toBe(`12,50${NBSP}€`);
  });

  it('reads a leading mark as 0, and puts the caret after the digit typed', () => {
    const ed = editor('is-IS', 'EUR');
    const { state, caret } = typeKeys(ed, ed.fromValue(null), ',5');
    expect(state.text).toBe(`0,5${NBSP}€`);
    expect(state.reading).toMatchObject({ value: 0.5 });
    expect(caret).toBe(3);
  });

  it('takes the other mark as the decimal once a digit follows, kept as typed until blur', () => {
    const ed = editor('en-US', 'EUR');
    const typed = typeKeys(ed, ed.fromValue(null), '12,5');
    expect(typed.state.text).toBe('€12,5');
    expect(typed.state.reading).toMatchObject({ value: 12.5 });
    expect(ed.fromValue(12.5).text).toBe('€12.5');
  });

  it('shows the locale’s mark once the whole number is grouped', () => {
    const ed = editor('is-IS', 'EUR');
    const typed = typeKeys(ed, ed.fromValue(1234), '.5');
    expect(typed.state.text).toBe(`1.234,5${NBSP}€`);
    expect(typed.state.reading).toMatchObject({ value: 1234.5 });
  });

  it.each([
    ['en-US', '1,234,567', '€1,234,567'],
    ['is-IS', '1.234.567', `1.234.567${NBSP}€`],
  ])('keeps grouping typed by hand in %s, so it ends a million', (locale, keys, text) => {
    const ed = editor(locale, 'EUR');
    const typed = typeKeys(ed, ed.fromValue(null), keys);
    expect(typed.state.text).toBe(text);
    expect(typed.state.reading).toMatchObject({ value: 1234567 });
  });

  it('refuses a keystroke that makes the text unreadable', () => {
    const ed = editor('is-IS', 'EUR');
    expect(typeKeys(ed, ed.fromValue(null), '12a').state.text).toBe(`12${NBSP}€`);
    expect(typeKeys(ed, ed.fromValue(null), '0,050').state.text).toBe(`0,05${NBSP}€`);
  });

  it('holds a third decimal typed into a two-decimal currency, never reads it as a thousand', () => {
    const ed = editor('is-IS', 'EUR');
    const typed = typeKeys(ed, ed.fromValue(null), '1,000');
    expect(typed.state.text).toBe(`1,000${NBSP}€`);
    expect(typed.state.reading).toEqual(pending);
  });

  it('lets English grouping be typed into an Icelandic field on its way to a fraction', () => {
    const ed = editor('is-IS', 'EUR');
    const typed = typeKeys(ed, ed.fromValue(null), '1,234.50');
    expect(typed.state.reading).toMatchObject({ value: 1234.5 });
  });

  it('refuses a value above max', () => {
    const ed = editor('en-US', 'USD', 100);
    expect(typeKeys(ed, ed.fromValue(null), '999').state.text).toBe('$99');
  });

  it('inserts a digit before a group mark without moving the caret off it', () => {
    const ed = editor('en-US', 'USD');
    const start = ed.fromValue(1234);
    // "$1,234": the caret after the 1, before the comma.
    const { state, caret } = typeKeys(ed, start, '5', 2);
    expect(state.text).toBe('$15,234');
    expect(caret).toBe(3);
  });

  it('marks a fraction in a currency without decimals invalid, and keeps a zero tail', () => {
    const ed = editor('is-IS', 'ISK');
    expect(typeKeys(ed, ed.fromValue(null), '1,5').state.reading).toEqual(noDecimals);
    const tail = typeKeys(ed, ed.fromValue(null), '4990,00').state;
    expect(tail.text).toBe(`4.990,00${NBSP}kr.`);
    expect(tail.reading).toMatchObject({ value: 4990 });
  });
});

describe('createAmountEditor — deleting', () => {
  it('Backspace after a group mark deletes the digit before it', () => {
    const ed = editor('en-US', 'USD');
    const start = ed.fromValue(1234);
    const result = ed.edit(start, '$1234', 2, 'deleteContentBackward');
    expect(result.refused).toBe(false);
    if (result.refused) return;
    expect(result.next.text).toBe('$234');
    expect(result.caret).toBe(1);
  });

  it('Backspace on a leading symbol changes nothing', () => {
    const ed = editor('en-US', 'USD');
    const result = ed.edit(ed.fromValue(12), '12', 0, 'deleteContentBackward');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe('$12');
    expect(result.caret).toBe(1);
  });

  it('Delete before a trailing symbol changes nothing', () => {
    const ed = editor('is-IS', 'ISK');
    const result = ed.edit(ed.fromValue(12), `12kr.`, 2, 'deleteContentForward');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe(`12${NBSP}kr.`);
  });

  it('deleting the decimal mark leaves what the field then shows', () => {
    const ed = editor('is-IS', 'EUR');
    const start = ed.fromValue(34.9);
    const result = ed.edit(start, `349${NBSP}€`, 2, 'deleteContentBackward');
    if (result.refused) throw new Error('refused');
    expect(result.next.reading).toMatchObject({ value: 349 });
  });

  it('emptying the text reads as empty', () => {
    const ed = editor('en-US', 'USD');
    const result = ed.edit(ed.fromValue(5), '$', 1, 'deleteContentBackward');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe('');
    expect(result.next.reading).toEqual({ kind: 'empty' });
  });
});

describe('createAmountEditor — text that arrives in bulk', () => {
  it('a paste into a selection replaces only the selection', () => {
    const ed = editor('en-US', 'USD');
    // "$1,234" with "234" selected, "999" pasted over it.
    const result = ed.edit(ed.fromValue(1234), '$1,999', 6, 'insertFromPaste');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe('$1,999');
    expect(result.next.reading).toMatchObject({ value: 1999 });
    expect(result.caret).toBe(6);
  });

  it('a paste in the other convention is read and shown in the field’s own', () => {
    const ed = editor('is-IS', 'ISK');
    const result = ed.edit(ed.fromValue(null), '1,000,000', 9, 'insertFromPaste');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe(`1.000.000${NBSP}kr.`);
    expect(result.next.reading).toMatchObject({ value: 1000000 });
    expect(result.caret).toBe(9);
  });

  it('an ISK paste of "4.990,00" is 4990, never 499000', () => {
    const ed = editor('is-IS', 'ISK');
    const result = ed.edit(ed.fromValue(null), '4.990,00', 8, 'insertFromPaste');
    if (result.refused) throw new Error('refused');
    expect(result.next.reading).toMatchObject({ value: 4990 });
  });

  it('a pasted symbol and code are stripped, the mark beside a symbol is not the decimal', () => {
    const ed = editor('is-IS', 'ISK');
    const result = ed.edit(ed.fromValue(null), '4.990 kr.', 9, 'insertFromPaste');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe(`4.990${NBSP}kr.`);
    expect(result.caret).toBe(5);
  });

  it('autofill or a script replacing the whole text, with no input type', () => {
    const ed = editor('en-US', 'USD');
    const result = ed.edit(ed.fromValue(12), '34.50', 5);
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe('$34.50');
    expect(result.next.reading).toMatchObject({ value: 34.5 });
  });

  it('a mark arriving without a key event (virtual keyboard) is read like a typed one', () => {
    const ed = editor('is-IS', 'EUR');
    const start = ed.fromValue(12);
    const marked = ed.edit(start, `12,${NBSP}€`, 3, 'insertText');
    if (marked.refused) throw new Error('refused');
    const digit = ed.edit(marked.next, `12,5${NBSP}€`, 4, 'insertText');
    if (digit.refused) throw new Error('refused');
    expect(digit.next.reading).toMatchObject({ value: 12.5 });
  });

  it('a composition (IME) committing full-width digits', () => {
    const ed = editor('en-US', 'USD');
    const result = ed.edit(ed.fromValue(null), '１２３４', 4, 'insertCompositionText');
    if (result.refused) throw new Error('refused');
    expect(result.next.text).toBe('$1,234');
  });

  it('unreadable bulk text stays as it arrived, marked invalid', () => {
    const ed = editor('en-US', 'USD');
    const result = ed.edit(ed.fromValue(null), '12ab', 4, 'insertFromPaste');
    if (result.refused) throw new Error('refused');
    expect(result.next.reading).toEqual(notANumber);
    expect(result.next.text).toBe('$12ab');
  });
});

describe('createAmountEditor — fromValue', () => {
  it('pads a fixed currency’s decimals at rest', () => {
    const ed = editor('is-IS', 'EUR');
    expect(ed.fromValue(34.9, 2).text).toBe(`34,90${NBSP}€`);
    expect(ed.fromValue(1234.5).text).toBe(`1.234,5${NBSP}€`);
  });
});
