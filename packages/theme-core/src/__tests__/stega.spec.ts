import { describe, expect, it } from 'vitest';
import { decodeStega, encodeStega, stripStega, type StegaMeta } from '../stega';

const META: StegaMeta = { entryId: 'e1', fieldPath: 'title', locale: 'en-US' };

describe('stega', () => {
  it('round-trips the contracts §2 vector', () => {
    const encoded = encodeStega('Hello', META);
    expect(encoded.startsWith('Hello')).toBe(true);
    expect(encoded).not.toBe('Hello');
    const { cleaned, meta } = decodeStega(encoded);
    expect(cleaned).toBe('Hello');
    expect(meta).toEqual(META);
  });

  it('uses only U+200B/U+200C delimited by U+FEFF for the payload', () => {
    const suffix = encodeStega('x', META).slice(1);
    expect(suffix[0]).toBe('﻿');
    expect(suffix[suffix.length - 1]).toBe('﻿');
    expect([...suffix.slice(1, -1)].every((c) => c === '​' || c === '‌')).toBe(true);
  });

  it('round-trips unicode-heavy values and metadata', () => {
    const meta: StegaMeta = { entryId: 'e-ísl', fieldPath: 'items.2.título', locale: null };
    const value = 'Þór 🎉 — “quoted” ﻿already-has-BOM-char? no: plain';
    const { cleaned, meta: decoded } = decodeStega(encodeStega(value, meta));
    expect(cleaned).toBe(value);
    expect(decoded).toEqual(meta);
  });

  it('strip is idempotent and removes every stega run', () => {
    const s = encodeStega('A', META) + ' mid ' + encodeStega('B', { ...META, fieldPath: 'sub' });
    const once = stripStega(s);
    expect(once).toBe('A mid B');
    expect(stripStega(once)).toBe(once);
  });

  it('decode on a plain string returns meta null and the string unchanged', () => {
    expect(decodeStega('just text')).toEqual({ cleaned: 'just text', meta: null });
    expect(decodeStega('')).toEqual({ cleaned: '', meta: null });
  });

  it('decodes a value whose closing delimiter a trim() removed', () => {
    const trimmed = encodeStega('Hello', META).trim();
    expect(trimmed.endsWith('﻿')).toBe(false);
    expect(decodeStega(trimmed)).toEqual({ cleaned: 'Hello', meta: META });
  });

  it('strips a trimmed value down to no zero-width characters', () => {
    const trimmed = encodeStega('Free shipping over $50', META).trim();
    expect(stripStega(trimmed)).toBe('Free shipping over $50');
    expect(stripStega(trimmed)).not.toMatch(/[​‌﻿]/);
  });

  it('decodes a trimmed value that also had surrounding whitespace', () => {
    // trim() takes the leading spaces and the closing delimiter; the spaces
    // ahead of the payload are inside the value and stay.
    const trimmed = encodeStega('  Hello  ', META).trim();
    expect(decodeStega(trimmed)).toEqual({ cleaned: 'Hello  ', meta: META });
  });

  it('keeps a U+FEFF the value itself contains when it is not a payload run', () => {
    const value = 'before ﻿ after';
    expect(stripStega(value)).toBe(value);
    expect(decodeStega(encodeStega(value, META))).toEqual({ cleaned: value, meta: META });
  });

  it('a lone U+FEFF carries no bits, so it is not a run and is left alone', () => {
    expect(decodeStega('Hi﻿')).toEqual({ cleaned: 'Hi﻿', meta: null });
    expect(stripStega('Hi﻿')).toBe('Hi﻿');
  });

  it('decodes a trimmed value a template put whitespace after', () => {
    // What a Vue block renders: `{{ value.trim() }}` inside an element whose
    // template puts a newline and indentation after the interpolation.
    const node = `\n  ${encodeStega('Hello', META).trim()}\n`;
    const { cleaned, meta } = decodeStega(node);
    expect(cleaned).toBe('\n  Hello\n');
    expect(meta).toEqual(META);
  });

  it('does not read a trimmed payload when text follows it directly', () => {
    // Composition, not trimming: the run no longer sits at a boundary, so it
    // is left in place rather than guessed at.
    const composed = `${encodeStega('Hello', META).trim()}!`;
    expect(decodeStega(composed).meta).toBeNull();
  });

  it('decode on a corrupted payload still cleans but yields meta null', () => {
    const corrupted = 'Hi﻿​‌​﻿'; // 3 bits: not a whole byte
    expect(decodeStega(corrupted)).toEqual({ cleaned: 'Hi', meta: null });
  });
});
