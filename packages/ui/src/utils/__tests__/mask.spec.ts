import { describe, expect, it } from 'vitest';
import { applyMask, defaultCharacterMeaning, stripMask } from '../mask';

/** The design spec's own example formats. */
const PHONE = '(###) ###-####';
const POSTCODE = 'A#A #A#';

describe('defaultCharacterMeaning', () => {
  it('is the three placeholder characters the brief names', () => {
    expect(Object.keys(defaultCharacterMeaning).sort()).toEqual(['#', '*', 'A']);
    expect(defaultCharacterMeaning['#'].test('7')).toBe(true);
    expect(defaultCharacterMeaning['#'].test('a')).toBe(false);
    expect(defaultCharacterMeaning.A.test('a')).toBe(true);
    expect(defaultCharacterMeaning.A.test('A')).toBe(true);
    expect(defaultCharacterMeaning.A.test('1')).toBe(false);
    expect(defaultCharacterMeaning['*'].test('a')).toBe(true);
    expect(defaultCharacterMeaning['*'].test('1')).toBe(true);
    expect(defaultCharacterMeaning['*'].test('-')).toBe(false);
  });
});

describe('applyMask — phone', () => {
  it('formats a full number', () => {
    expect(applyMask('5551234567', PHONE)).toBe('(555) 123-4567');
  });

  it('inserts the separators as the slots fill', () => {
    expect(applyMask('5', PHONE)).toBe('(5');
    expect(applyMask('555', PHONE)).toBe('(555');
    expect(applyMask('5551', PHONE)).toBe('(555) 1');
    expect(applyMask('555123', PHONE)).toBe('(555) 123');
    expect(applyMask('5551234', PHONE)).toBe('(555) 123-4');
  });

  it('never emits a trailing separator with nothing after it', () => {
    expect(applyMask('555', PHONE).endsWith(')')).toBe(false);
    expect(applyMask('555123', PHONE).endsWith('-')).toBe(false);
  });

  it('returns an empty string for empty input', () => {
    expect(applyMask('', PHONE)).toBe('');
  });

  it('drops characters that do not fit the slot', () => {
    expect(applyMask('555abc1234567', PHONE)).toBe('(555) 123-4567');
    expect(applyMask('(555) 123-4567', PHONE)).toBe('(555) 123-4567');
    expect(applyMask('abc', PHONE)).toBe('');
  });

  it('never exceeds the format length', () => {
    const over = applyMask('55512345678901234', PHONE);
    expect(over).toBe('(555) 123-4567');
    expect(over.length).toBeLessThanOrEqual(PHONE.length);
  });
});

describe('applyMask — postcode', () => {
  it('formats letters and digits in their own slots', () => {
    expect(applyMask('M1A1A1', POSTCODE)).toBe('M1A 1A1');
  });

  it('keeps the case the customer typed', () => {
    expect(applyMask('m1a1a1', POSTCODE)).toBe('m1a 1a1');
  });

  it('formats partial input', () => {
    expect(applyMask('M1', POSTCODE)).toBe('M1');
    expect(applyMask('M1A', POSTCODE)).toBe('M1A');
    expect(applyMask('M1A1', POSTCODE)).toBe('M1A 1');
  });

  it('drops a digit where a letter is expected and vice versa', () => {
    expect(applyMask('1M1A1A1', POSTCODE)).toBe('M1A 1A1');
  });
});

describe('applyMask — other formats', () => {
  it('supports the alphanumeric placeholder', () => {
    expect(applyMask('AB12CD', '***-***')).toBe('AB1-2CD');
  });

  it('accepts a custom character meaning', () => {
    expect(applyMask('abc', 'L-L-L', { L: /[a-z]/ })).toBe('a-b-c');
  });

  it('returns the raw value unchanged when the format is empty', () => {
    expect(applyMask('5551234567', '')).toBe('5551234567');
  });

  it('is not confused by a global regex', () => {
    const format = '##-##';
    const meaning = { '#': /\d/g };
    expect(applyMask('1234', format, meaning)).toBe('12-34');
    expect(applyMask('1234', format, meaning)).toBe('12-34');
  });
});

describe('stripMask', () => {
  it('round-trips a formatted phone number', () => {
    expect(stripMask(applyMask('5551234567', PHONE), PHONE)).toBe('5551234567');
  });

  it('round-trips a formatted postcode', () => {
    expect(stripMask(applyMask('M1A1A1', POSTCODE), POSTCODE)).toBe('M1A1A1');
  });

  it('round-trips partial input', () => {
    for (const raw of ['', '5', '555', '5551', '555123', '5551234']) {
      expect(stripMask(applyMask(raw, PHONE), PHONE)).toBe(raw);
    }
  });

  it('strips a value the customer pasted without separators', () => {
    expect(stripMask('5551234567', PHONE)).toBe('5551234567');
  });

  it('drops characters the format has no slot for', () => {
    expect(stripMask('(555) abc-1234567', PHONE)).toBe('5551234567');
  });

  it('returns the value unchanged when the format is empty', () => {
    expect(stripMask('(555)', '')).toBe('(555)');
  });

  it('accepts a custom character meaning', () => {
    expect(stripMask('a-b-c', 'L-L-L', { L: /[a-z]/ })).toBe('abc');
  });
});
