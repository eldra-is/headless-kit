import { describe, expect, it } from 'vitest';
import { floorRichTextHeadingLevels, type RichTextJsonNode } from '../headingLevels';

function heading(level: number, text: string): RichTextJsonNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function paragraph(text: string): RichTextJsonNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

describe('floorRichTextHeadingLevels', () => {
  it('floors levels 1 and 2 up to 3, leaves 3 and 4 untouched, and caps at 6', () => {
    const doc: RichTextJsonNode = {
      type: 'doc',
      content: [
        heading(1, 'one'),
        heading(2, 'two'),
        heading(3, 'three'),
        heading(4, 'four'),
        heading(6, 'six'),
      ],
    };

    const result = floorRichTextHeadingLevels(doc);

    expect(result.content!.map((node) => node.attrs!.level)).toEqual([3, 3, 3, 4, 6]);
  });

  it('never mutates the original document', () => {
    const doc: RichTextJsonNode = { type: 'doc', content: [heading(1, 'one')] };
    const original = JSON.parse(JSON.stringify(doc));

    floorRichTextHeadingLevels(doc);

    expect(doc).toEqual(original);
    expect(doc.content![0]!.attrs!.level).toBe(1);
  });

  it('leaves non-heading nodes untouched, including nested list content', () => {
    const doc: RichTextJsonNode = {
      type: 'doc',
      content: [
        paragraph('a paragraph'),
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [paragraph('an item')],
            },
          ],
        },
      ],
    };

    const result = floorRichTextHeadingLevels(doc);

    expect(result).toEqual(doc);
  });

  it('returns a new tree rather than the same object references', () => {
    const doc: RichTextJsonNode = { type: 'doc', content: [heading(1, 'one')] };
    const result = floorRichTextHeadingLevels(doc);

    expect(result).not.toBe(doc);
    expect(result.content).not.toBe(doc.content);
  });

  it('passes non-object input straight through', () => {
    expect(floorRichTextHeadingLevels(null)).toBeNull();
    expect(floorRichTextHeadingLevels(undefined)).toBeUndefined();
  });
});
