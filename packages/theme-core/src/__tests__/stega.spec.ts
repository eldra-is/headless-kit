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

  it('decode on a corrupted payload still cleans but yields meta null', () => {
    const corrupted = 'Hi﻿​‌​﻿'; // 3 bits: not a whole byte
    expect(decodeStega(corrupted)).toEqual({ cleaned: 'Hi', meta: null });
  });
});
