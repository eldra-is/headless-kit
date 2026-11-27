import { describe, expect, it } from 'vitest';
import { specsFromBody } from '../specs';

const bold = (text: string) => ({ type: 'text', marks: [{ type: 'bold' }], text });
const plain = (text: string, marks?: Array<{ type: string }>) => ({ type: 'text', text, marks });
const item = (...runs: unknown[]) => ({
  type: 'listItem',
  content: [{ type: 'paragraph', content: runs }],
});
const list = (...items: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'bulletList', content: items }],
});

describe('specsFromBody', () => {
  it('reads a bullet list of bold labels as label/value pairs', () => {
    expect(
      specsFromBody(
        list(item(bold('Material'), plain(' Wool')), item(bold('Made in:'), plain(' Biella')))
      )
    ).toEqual([
      { label: 'Material', value: 'Wool' },
      { label: 'Made in', value: 'Biella' },
    ]);
  });

  it('joins a label split across bold runs and a value across plain ones', () => {
    expect(
      specsFromBody(
        list(
          item(
            bold('Made '),
            { ...bold('in'), marks: [{ type: 'bold' }, { type: 'italic' }] },
            plain(' Biella, '),
            plain('Italy', [{ type: 'italic' }])
          )
        )
      )
    ).toEqual([{ label: 'Made in', value: 'Biella, Italy' }]);
  });

  it.each([
    ['an empty body', { type: 'doc', content: [] }],
    ['no body at all', null],
    ['a paragraph', { type: 'doc', content: [{ type: 'paragraph', content: [plain('Hi')] }] }],
    [
      'an item without a bold label',
      list(item(bold('Material'), plain(' Wool')), item(plain('Hand wash'))),
    ],
    ['an item that is only a label', list(item(bold('Material')))],
    ['a link in the value', list(item(bold('Guide'), plain(' here', [{ type: 'link' }])))],
    [
      'an ordered list',
      { type: 'doc', content: [{ type: 'orderedList', content: [item(bold('A'), plain(' b'))] }] },
    ],
    [
      'a list followed by a paragraph',
      {
        type: 'doc',
        content: [
          ...list(item(bold('A'), plain(' b'))).content,
          { type: 'paragraph', content: [plain('More')] },
        ],
      },
    ],
    [
      'an item with two paragraphs',
      list({
        type: 'listItem',
        content: [
          { type: 'paragraph', content: [bold('A'), plain(' b')] },
          { type: 'paragraph', content: [plain('c')] },
        ],
      }),
    ],
  ])('answers null for %s, which then renders as rich text', (_, body) => {
    expect(specsFromBody(body as never)).toBeNull();
  });
});
