import { describe, expect, it } from 'vitest';
import { extractTipTapText, renderTipTapText, truncateTipTapText } from '../text';
import type { RichTextDocument } from '../types';

const content: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Plain text heading' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
        { type: 'hardBreak' },
        { type: 'text', text: 'from TipTap content.' },
      ],
    },
  ],
};

describe('text extraction', () => {
  it('extracts plain text with a space between blocks and at hard breaks', () => {
    expect(extractTipTapText(content)).toBe('Plain text heading Hello world from TipTap content.');
  });

  it('returns an empty string for missing content', () => {
    expect(extractTipTapText(null)).toBe('');
    expect(extractTipTapText(undefined)).toBe('');
  });

  it('truncates by word count and appends the ellipsis only when it cut', () => {
    expect(renderTipTapText(content, { wordCount: 4 })).toEqual({
      text: 'Plain text heading Hello...',
      truncated: true,
    });
    expect(renderTipTapText(content, { wordCount: 20 })).toEqual({
      text: 'Plain text heading Hello world from TipTap content.',
      truncated: false,
    });
  });

  it('treats a missing, negative or non-finite word count as no limit', () => {
    for (const wordCount of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(truncateTipTapText('a b c', wordCount).truncated).toBe(false);
    }
  });

  it('uses a custom ellipsis', () => {
    expect(truncateTipTapText('a b c d', 2, ' [more]')).toEqual({
      text: 'a b [more]',
      truncated: true,
    });
  });
});
