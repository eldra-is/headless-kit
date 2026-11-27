import { describe, expect, it } from 'vitest';
import { toHtml } from '../html';
import { resolvePrices } from '../prices';
import type { RichTextDocument } from '../types';

/** WS-1474: a price token in rich text is an inline `price` node the theme writes. */
const doc = (attrs: Record<string, unknown>): RichTextDocument => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Over ' },
        { type: 'price', attrs, marks: [{ type: 'bold' }] },
        { type: 'text', text: '!' },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Returns are free.' }],
    },
  ],
});
const isk = (attrs: unknown): string | null => {
  const amount = (attrs as { amounts?: Record<string, number> }).amounts?.ISK;
  return typeof amount === 'number' ? `${amount} kr.` : null;
};

describe('resolvePrices', () => {
  it("writes a price as text carrying the node's marks", () => {
    expect(resolvePrices(doc({ id: 'a3f', amounts: { ISK: 500 } }), isk)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Over ' },
            { type: 'text', text: '500 kr.', marks: [{ type: 'bold' }] },
            { type: 'text', text: '!' },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Returns are free.' }],
        },
      ],
    });
  });

  it('leaves out the paragraph holding a price it cannot write, and only that one', () => {
    const out = resolvePrices(doc({ id: 'a3f', amounts: { EUR: 500 } }), isk);
    expect(out?.content).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Returns are free.' }],
      },
    ]);
    expect(resolvePrices(doc({ id: 'a3f', amounts: { ISK: 500 } }))?.content).toHaveLength(1);
  });

  it('returns a document with no price as the same object, and never modifies its input', () => {
    const plain: RichTextDocument = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    expect(resolvePrices(plain, isk)).toBe(plain);
    const input = doc({ id: 'a3f', amounts: { ISK: 500 } });
    const before = JSON.stringify(input);
    resolvePrices(input, isk);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('toHtml price nodes', () => {
  it('writes the price inside its marks', () => {
    expect(toHtml(doc({ id: 'a3f', amounts: { ISK: 500 } }), { resolvePrice: isk })).toBe(
      '<p>Over <strong>500 kr.</strong>!</p><p>Returns are free.</p>'
    );
  });

  it('escapes whatever a resolver returns: a price can never inject markup', () => {
    const hostile = () => '<img src=x onerror=alert(1)>"</p><script>alert(1)</script>';
    const html = toHtml(doc({ id: 'a3f', amounts: {} }), {
      resolvePrice: hostile,
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('never renders a price node raw when no resolver is given', () => {
    expect(toHtml(doc({ id: 'a3f', amounts: { ISK: 500 } }))).toBe('<p>Returns are free.</p>');
  });
});
