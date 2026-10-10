import { describe, expect, it } from 'vitest';
import {
  buildRichTextTree,
  type RichTextNode,
  type RichTextRenderChild,
  type RichTextRenderNode,
} from '../richTextTree';
import { safeHref } from '../richText';
import { encodeStega } from '../stega';

const options = { safeHref };

function doc(content: RichTextNode[]): { type: 'doc'; content: RichTextNode[] } {
  return { type: 'doc', content };
}

function textNode(text: string, marks?: RichTextNode['marks']): RichTextNode {
  return marks === undefined ? { type: 'text', text } : { type: 'text', text, marks };
}

function build(content: RichTextNode[]): RichTextRenderNode[] {
  return buildRichTextTree(doc(content), options);
}

/** Every element in the tree, depth-first, with the given tag. */
function findAll(children: RichTextRenderChild[], tag: string): RichTextRenderNode[] {
  const out: RichTextRenderNode[] = [];
  for (const child of children) {
    if (typeof child === 'string') continue;
    if (child.tag === tag) out.push(child);
    out.push(...findAll(child.children, tag));
  }
  return out;
}

function find(children: RichTextRenderChild[], tag: string): RichTextRenderNode | undefined {
  return findAll(children, tag)[0];
}

/** §18 v3: the stamps every node element carries, plus its own attributes. */
function stamped(
  type: string,
  pos: number,
  attrs: Record<string, string> = {}
): Record<string, string> {
  return { ...attrs, 'data-eldra-node': type, 'data-eldra-pos': String(pos) };
}

/** Flattened text of a subtree, the way a renderer would show it. */
function textOf(child: RichTextRenderChild): string {
  if (typeof child === 'string') return child;
  return child.children.map(textOf).join('');
}

describe('buildRichTextTree', () => {
  it('builds an empty tree for anything that is not a doc node', () => {
    for (const value of [null, undefined, 'text', 42, [], { type: 'paragraph' }]) {
      expect(buildRichTextTree(value, options)).toEqual([]);
    }
  });

  it('builds paragraph, blockquote, hardBreak, horizontalRule', () => {
    const tree = build([
      { type: 'paragraph', content: [textNode('Hello')] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [textNode('Quoted')] }] },
      { type: 'paragraph', content: [textNode('a'), { type: 'hardBreak' }, textNode('b')] },
      { type: 'horizontalRule' },
    ]);

    expect(tree[0]).toEqual({ tag: 'p', attrs: stamped('paragraph', 0), children: ['Hello'] });
    expect(textOf(find(tree, 'blockquote')!)).toBe('Quoted');
    // hardBreak is an element, not a "\n" string, so a mapper never has to
    // special-case whitespace.
    // p(7) blockquote(7..17) p(17) "a"(18) br(19) "b"(20) hr(22)
    expect(find(tree, 'br')).toEqual({ tag: 'br', attrs: stamped('hardBreak', 19), children: [] });
    expect(find(tree, 'hr')).toEqual({
      tag: 'hr',
      attrs: stamped('horizontalRule', 22),
      children: [],
    });
  });

  it('clamps heading levels to 1-6', () => {
    const tree = build([
      { type: 'heading', attrs: { level: 1 }, content: [textNode('H1')] },
      { type: 'heading', attrs: { level: 6 }, content: [textNode('H6')] },
      { type: 'heading', attrs: { level: 0 }, content: [textNode('Low')] },
      { type: 'heading', attrs: { level: 12 }, content: [textNode('High')] },
      { type: 'heading', content: [textNode('NoLevel')] },
    ]);

    // level 0 and a missing level both clamp up to 1; level 12 clamps down to 6.
    expect(findAll(tree, 'h1').map(textOf)).toEqual(['H1', 'Low', 'NoLevel']);
    expect(findAll(tree, 'h6').map(textOf)).toEqual(['H6', 'High']);
  });

  /**
   * `minHeadingLevel` (added 2026-09-27; `BuildRichTextTreeOptions`). A page owns its heading
   * outline and a rich-text field does not, so the same stored document has to be able to render
   * as an h2-and-down section in one block and an h3-and-down one in another. Applying it here, at
   * render time, is what keeps the document itself untouched — the starter's `rich-text` block used
   * to copy and rewrite the whole TipTap tree to get this.
   */
  describe('minHeadingLevel', () => {
    function buildWith(content: RichTextNode[], minHeadingLevel: unknown): RichTextRenderNode[] {
      return buildRichTextTree(doc(content), {
        ...options,
        minHeadingLevel: minHeadingLevel as number,
      });
    }

    const LEVELS: RichTextNode[] = [
      { type: 'heading', attrs: { level: 1 }, content: [textNode('One')] },
      { type: 'heading', attrs: { level: 2 }, content: [textNode('Two')] },
      { type: 'heading', attrs: { level: 3 }, content: [textNode('Three')] },
      { type: 'heading', attrs: { level: 4 }, content: [textNode('Four')] },
    ];

    it('raises every heading above the floor and leaves the rest alone', () => {
      const tree = buildWith(LEVELS, 3);
      // A floor, not an offset: h1 and h2 become h3, h3 stays h3, h4 stays h4.
      expect(findAll(tree, 'h1')).toHaveLength(0);
      expect(findAll(tree, 'h2')).toHaveLength(0);
      expect(findAll(tree, 'h3').map(textOf)).toEqual(['One', 'Two', 'Three']);
      expect(findAll(tree, 'h4').map(textOf)).toEqual(['Four']);
    });

    it('defaults to the generic 1-6 clamp when it is not given', () => {
      const tree = build(LEVELS);
      expect(findAll(tree, 'h1').map(textOf)).toEqual(['One']);
      expect(findAll(tree, 'h4').map(textOf)).toEqual(['Four']);
    });

    it('still caps at 6, so a floor of 6 never produces an h7', () => {
      const tree = buildWith(
        [...LEVELS, { type: 'heading', attrs: { level: 12 }, content: [textNode('Twelve')] }],
        6
      );
      expect(findAll(tree, 'h6').map(textOf)).toEqual(['One', 'Two', 'Three', 'Four', 'Twelve']);
      expect(findAll(tree, 'h7')).toHaveLength(0);
    });

    it('ignores an out-of-range, fractional or non-numeric floor rather than rendering it', () => {
      for (const floor of [0, -3, 2.5, '3', null, Number.NaN, Number.POSITIVE_INFINITY]) {
        const tree = buildWith(LEVELS, floor);
        // Every one of these falls back to the generic floor of 1, so the document's own levels
        // render unchanged — and no `<h0>`/`<h2.5>`/`<hNaN>` tag is ever produced.
        expect(findAll(tree, 'h1').map(textOf), `floor ${String(floor)}`).toEqual(['One']);
        expect(findAll(tree, 'h2').map(textOf), `floor ${String(floor)}`).toEqual(['Two']);
      }
    });

    it('applies to a heading nested inside another node, not just a top-level one', () => {
      const tree = buildWith(
        [
          {
            type: 'blockquote',
            content: [{ type: 'heading', attrs: { level: 2 }, content: [textNode('Quoted')] }],
          },
        ],
        4
      );
      expect(findAll(tree, 'h4').map(textOf)).toEqual(['Quoted']);
      expect(findAll(tree, 'h2')).toHaveLength(0);
    });

    it('leaves the document position stamps untouched — only the tag name moves', () => {
      const content: RichTextNode[] = [
        { type: 'heading', attrs: { level: 1 }, content: [textNode('One')] },
      ];
      const floored = buildWith(content, 3);
      const plain = build(content);
      expect(floored[0]?.tag).toBe('h3');
      expect(plain[0]?.tag).toBe('h1');
      // `data-eldra-pos`/`data-eldra-node` are the document's own numbering, which a rendered tag
      // name cannot change — native editing and selection reporting depend on that.
      expect(floored[0]?.attrs).toEqual(plain[0]?.attrs);
    });
  });

  it('builds lists', () => {
    const tree = build([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [textNode('One')] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [textNode('Two')] }] },
        ],
      },
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [textNode('Uno')] }] },
        ],
      },
    ]);

    expect(findAll(find(tree, 'ul')!.children, 'li').map(textOf)).toEqual(['One', 'Two']);
    expect(findAll(find(tree, 'ol')!.children, 'li').map(textOf)).toEqual(['Uno']);
  });

  it('builds a code block with a language class', () => {
    const tree = build([
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [textNode('const x = 1;')] },
      { type: 'codeBlock', content: [textNode('plain')] },
    ]);

    const [first, second] = findAll(tree, 'code');
    expect(first!.attrs).toEqual({ class: 'language-ts' });
    expect(textOf(first!)).toBe('const x = 1;');
    expect(second!.attrs).toEqual({});
    expect(textOf(second!)).toBe('plain');
    // Each <code> is wrapped in its own <pre>.
    expect(findAll(tree, 'pre')).toHaveLength(2);
  });

  it('builds a table with a tbody and stringified cell spans', () => {
    const tree = build([
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableHeader', attrs: { colspan: 2 }, content: [textNode('Head')] }],
          },
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', attrs: { rowspan: 3 }, content: [textNode('Cell')] }],
          },
        ],
      },
    ]);

    const table = find(tree, 'table')!;
    expect(table.children).toHaveLength(1);
    expect((table.children[0] as RichTextRenderNode).tag).toBe('tbody');
    // Attribute values are strings throughout, so any mapper can pass them on.
    expect(find(tree, 'th')!.attrs).toEqual(stamped('tableHeader', 2, { colspan: '2' }));
    expect(find(tree, 'td')!.attrs).toEqual(stamped('tableCell', 10, { rowspan: '3' }));
  });

  it('builds an image with src/alt/title/data-asset-id and drops an unsafe src', () => {
    const tree = build([
      {
        type: 'image',
        attrs: { src: '/media/a.png', alt: 'Alt', title: 'Title', assetId: 'asset-1' },
      },
    ]);

    expect(find(tree, 'img')!.attrs).toEqual(
      stamped('image', 0, {
        src: '/media/a.png',
        alt: 'Alt',
        title: 'Title',
        'data-asset-id': 'asset-1',
      })
    );
    // The node is dropped entirely, not just stripped of its src.
    expect(build([{ type: 'image', attrs: { src: 'javascript:alert(1)' } }])).toEqual([]);
  });

  it('builds an embed as an inert div with data-src/provider/title, never an iframe', () => {
    const tree = build([
      {
        type: 'embed',
        attrs: { src: 'https://example.com/video', provider: 'vimeo', title: 'A video' },
      },
    ]);

    expect(find(tree, 'div')!.attrs).toEqual(
      stamped('embed', 0, {
        class: 'eldra-embed',
        'data-src': 'https://example.com/video',
        'data-provider': 'vimeo',
        title: 'A video',
      })
    );
    expect(find(tree, 'iframe')).toBeUndefined();
    expect(build([{ type: 'embed', attrs: { src: 'javascript:alert(1)' } }])).toEqual([]);
  });

  it('renders an unknown node as a stamped span, so its two tokens stay countable', () => {
    const tree = build([
      { type: 'someFutureNode', content: [{ type: 'paragraph', content: [textNode('Inside')] }] },
    ]);

    // An unknown node has no markup of its own, but it is still a node: it
    // opens and closes. A bare span carrying only the stamps keeps the DOM
    // walk able to count those two tokens — splicing the children in would
    // leave everything after it two positions short of the document.
    expect(tree).toEqual([
      {
        tag: 'span',
        attrs: stamped('someFutureNode', 0),
        children: [{ tag: 'p', attrs: stamped('paragraph', 1), children: ['Inside'] }],
      },
    ]);
  });

  it('renders a nested doc node the same way', () => {
    const tree = build([
      { type: 'doc', content: [{ type: 'paragraph', content: [textNode('Inside')] }] },
    ]);

    expect(tree).toEqual([
      {
        tag: 'span',
        attrs: stamped('doc', 0),
        children: [{ tag: 'p', attrs: stamped('paragraph', 1), children: ['Inside'] }],
      },
    ]);
  });

  it('drops a text node without a string text, keeping its parent', () => {
    const tree = build([{ type: 'paragraph', content: [{ type: 'text' }] }]);

    expect(tree).toEqual([{ tag: 'p', attrs: stamped('paragraph', 0), children: [] }]);
  });

  it('skips non-object entries in a content array', () => {
    const tree = buildRichTextTree(
      {
        type: 'doc',
        content: ['loose', 7, null, { type: 'paragraph', content: [textNode('kept')] }],
      },
      options
    );

    expect(tree).toEqual([{ tag: 'p', attrs: stamped('paragraph', 0), children: ['kept'] }]);
  });

  it('wraps stray top-level text in a span, so the root has only element children', () => {
    // Malformed only — a well-formed doc holds block nodes at the top level.
    // Keeping the text but wrapping it means nothing is lost and a mapper
    // never has to place a bare text node beside the field root's elements.
    expect(build([textNode('loose')])).toEqual([{ tag: 'span', attrs: {}, children: ['loose'] }]);
    // An unknown node already renders as its own (stamped) span, so its bare
    // text never reaches the top level as a string.
    expect(build([{ type: 'someFutureNode', content: [textNode('spliced')] }])).toEqual([
      { tag: 'span', attrs: stamped('someFutureNode', 0), children: ['spliced'] },
    ]);
    // A well-formed document is untouched: no stray spans appear.
    expect(build([{ type: 'paragraph', content: [textNode('fine')] }])).toEqual([
      { tag: 'p', attrs: stamped('paragraph', 0), children: ['fine'] },
    ]);
  });
});

describe('buildRichTextTree marks', () => {
  it('wraps bold, italic, strike, underline and code', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [
          textNode('bold', [{ type: 'bold' }]),
          textNode('italic', [{ type: 'italic' }]),
          textNode('strike', [{ type: 'strike' }]),
          textNode('underline', [{ type: 'underline' }]),
          textNode('code', [{ type: 'code' }]),
        ],
      },
    ]);

    expect((tree[0] as RichTextRenderNode).children).toEqual([
      { tag: 'strong', attrs: {}, children: ['bold'] },
      { tag: 'em', attrs: {}, children: ['italic'] },
      { tag: 's', attrs: {}, children: ['strike'] },
      { tag: 'u', attrs: {}, children: ['underline'] },
      { tag: 'code', attrs: {}, children: ['code'] },
    ]);
  });

  it('nests multiple marks on one text leaf, outermost last', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [textNode('both', [{ type: 'bold' }, { type: 'italic' }])],
      },
    ]);

    expect((tree[0] as RichTextRenderNode).children).toEqual([
      { tag: 'em', attrs: {}, children: [{ tag: 'strong', attrs: {}, children: ['both'] }] },
    ]);
  });

  it('validates highlight and textStyle colours and drops anything else', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [
          textNode('hi', [{ type: 'highlight', attrs: { color: '#ff0' } }]),
          textNode('named', [{ type: 'highlight', attrs: { color: 'yellow' } }]),
          textNode('unsafe', [{ type: 'highlight', attrs: { color: 'red; background:url(x)' } }]),
          textNode('colored', [{ type: 'textStyle', attrs: { color: '#123456' } }]),
        ],
      },
    ]);

    const marks = findAll(tree, 'mark');
    expect(marks[0]!.attrs).toEqual({ style: 'background-color: #ff0' });
    expect(marks[1]!.attrs).toEqual({ style: 'background-color: yellow' });
    // A value that would smuggle a second declaration carries no style at all.
    expect(marks[2]!.attrs).toEqual({});
    expect(find(tree, 'span')!.attrs).toEqual({ style: 'color: #123456' });
  });

  it('gates link hrefs and adds rel only for target=_blank', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [
          textNode('site', [{ type: 'link', attrs: { href: '/about' } }]),
          textNode('ext', [
            { type: 'link', attrs: { href: 'https://example.com', target: '_blank' } },
          ]),
          // Only "_blank" is an honored target value (spec §4.1); anything else is dropped.
          textNode('same', [{ type: 'link', attrs: { href: '/x', target: '_self' } }]),
          textNode('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
        ],
      },
    ]);

    const links = findAll(tree, 'a');
    expect(links).toHaveLength(3);
    expect(links[0]!.attrs).toEqual({ href: '/about' });
    expect(links[1]!.attrs).toEqual({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(links[2]!.attrs).toEqual({ href: '/x' });
    // The unsafe link loses its anchor but keeps its text.
    expect(textOf(tree[0]!)).toContain('bad');
  });

  it('builds a fileAttachment mark as a marked anchor with asset id and download name', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [
          textNode('Download', [
            {
              type: 'fileAttachment',
              attrs: {
                href: '/files/a.pdf',
                assetId: 'asset-9',
                filename: 'a.pdf',
                contentType: 'application/pdf',
              },
            },
          ]),
        ],
      },
    ]);

    const link = find(tree, 'a')!;
    expect(link.attrs).toEqual({
      href: '/files/a.pdf',
      'data-file-attachment': '',
      'data-asset-id': 'asset-9',
      download: 'a.pdf',
    });
    expect(textOf(link)).toBe('Download');
  });

  it('drops a fileAttachment mark with an unsafe href but keeps the text', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [
          textNode('X', [{ type: 'fileAttachment', attrs: { href: 'javascript:alert(1)' } }]),
        ],
      },
    ]);

    expect(tree).toEqual([{ tag: 'p', attrs: stamped('paragraph', 0), children: ['X'] }]);
  });

  it('ignores an unknown mark and still keeps the text', () => {
    const tree = build([
      { type: 'paragraph', content: [textNode('plain', [{ type: 'someFutureMark', attrs: {} }])] },
    ]);

    expect(tree).toEqual([{ tag: 'p', attrs: stamped('paragraph', 0), children: ['plain'] }]);
  });
});

describe('buildRichTextTree stega', () => {
  const meta = { entryId: 'entry-1', fieldPath: 'body', locale: null };

  it('renders the same tree text for a stega-encoded document as for the clean one', () => {
    const clean = build([
      {
        type: 'paragraph',
        content: [textNode('Hello '), textNode('world', [{ type: 'bold' }])],
      },
    ]);
    const encoded = build([
      {
        type: 'paragraph',
        content: [
          textNode(encodeStega('Hello ', meta)),
          textNode(encodeStega('world', meta), [{ type: 'bold' }]),
        ],
      },
    ]);

    expect(textOf(encoded[0]!)).toBe(textOf(clean[0]!));
    expect(textOf(encoded[0]!)).toBe('Hello world');
  });

  it('never puts a stega character in the DOM text, even from an encoded text leaf', () => {
    const tree = build([
      {
        type: 'paragraph',
        content: [textNode(encodeStega('Hello world', meta))],
      },
    ]);

    expect(textOf(tree[0]!)).not.toMatch(/[​‌﻿]/);
    expect(textOf(tree[0]!)).toBe('Hello world');
  });
});

describe('padEmptyBlocks (§18 v3 floating toolbar follow-up)', () => {
  function buildPadded(content: RichTextNode[]): RichTextRenderNode[] {
    return buildRichTextTree(doc(content), { ...options, padEmptyBlocks: true });
  }

  it('renders an empty paragraph with no children by default (padEmptyBlocks unset)', () => {
    const tree = build([{ type: 'paragraph' }]);
    expect(tree[0]).toEqual({ tag: 'p', attrs: stamped('paragraph', 0), children: [] });
  });

  it('pads an empty paragraph with a single unstamped <br data-eldra-pad=""> when padEmptyBlocks is true', () => {
    const tree = buildPadded([{ type: 'paragraph' }]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: [{ tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] }],
    });
  });

  it('pads an empty heading the same way', () => {
    const tree = buildPadded([{ type: 'heading', attrs: { level: 2 }, content: [] }]);
    expect(tree[0]).toEqual({
      tag: 'h2',
      attrs: stamped('heading', 0),
      children: [{ tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] }],
    });
  });

  it('pads an empty codeBlock, inside the code element, not the pre', () => {
    const tree = buildPadded([{ type: 'codeBlock', content: [] }]);
    const pre = tree[0]!;
    expect(pre).toMatchObject({ tag: 'pre', attrs: stamped('codeBlock', 0) });
    expect(pre.children).toEqual([
      {
        tag: 'code',
        attrs: {},
        children: [{ tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] }],
      },
    ]);
  });

  it('does not pad a non-empty paragraph', () => {
    const tree = buildPadded([{ type: 'paragraph', content: [textNode('Hello')] }]);
    expect(tree[0]).toEqual({ tag: 'p', attrs: stamped('paragraph', 0), children: ['Hello'] });
  });

  it('pads an empty paragraph nested inside a listItem, and one inside a tableCell', () => {
    const tree = buildPadded([
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
          },
        ],
      },
    ]);
    const paragraphs = findAll(tree, 'p');
    expect(paragraphs).toHaveLength(2);
    for (const p of paragraphs) {
      expect(p.children).toEqual([{ tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] }]);
    }
  });

  it('still stamps a real hardBreak, and pads after it too — "empty" is text content, and the trailing pad adds no extra line', () => {
    // A paragraph holding only a hardBreak has no *text* content, so it is
    // padded like any other textually-empty block — appended after the real
    // (stamped) hardBreak, never replacing it. A trailing <br> at the end of
    // a block with content adds no extra line in browsers, so this is safe.
    const tree = buildPadded([{ type: 'paragraph', content: [{ type: 'hardBreak' }] }]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: [
        { tag: 'br', attrs: stamped('hardBreak', 1), children: [] },
        { tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] },
      ],
    });
  });

  it('pads a paragraph holding only a sanitiser-dropped image, since its rendered text content is empty', () => {
    const tree = buildPadded([
      {
        type: 'paragraph',
        content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }],
      },
    ]);
    // The image is dropped (unsafe src) and contributes no text either way,
    // so the paragraph is textually empty and gets the pad — the same
    // zero-height collapse the unpadded case has.
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: [{ tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] }],
    });
  });

  it('pads a whitespace-only paragraph (e.g. the trailing spaces Enter splits into their own paragraph), appending after the space', () => {
    const tree = buildPadded([{ type: 'paragraph', content: [textNode('  ')] }]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: ['  ', { tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] }],
    });
  });

  it('leaves a whitespace-only paragraph untouched without padEmptyBlocks', () => {
    const tree = build([{ type: 'paragraph', content: [textNode('  ')] }]);
    expect(tree[0]).toEqual({ tag: 'p', attrs: stamped('paragraph', 0), children: ['  '] });
  });

  it('does not pad a paragraph with real, non-whitespace text', () => {
    const tree = buildPadded([{ type: 'paragraph', content: [textNode(' Hi ')] }]);
    expect(tree[0]).toEqual({ tag: 'p', attrs: stamped('paragraph', 0), children: [' Hi '] });
  });

  // --- ProseMirror's other trailing-break rule: last child is a hardBreak --

  it('pads a non-empty paragraph whose last content child is a hardBreak (Shift+Enter at the end of a line)', () => {
    const tree = buildPadded([
      { type: 'paragraph', content: [textNode('hello'), { type: 'hardBreak' }] },
    ]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: [
        'hello',
        { tag: 'br', attrs: stamped('hardBreak', 6), children: [] },
        { tag: 'br', attrs: { 'data-eldra-pad': '' }, children: [] },
      ],
    });
  });

  it('leaves a paragraph ending in a hardBreak untouched without padEmptyBlocks', () => {
    const tree = build([
      { type: 'paragraph', content: [textNode('hello'), { type: 'hardBreak' }] },
    ]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: ['hello', { tag: 'br', attrs: stamped('hardBreak', 6), children: [] }],
    });
  });

  it('does not pad when a hardBreak is followed by more content', () => {
    const tree = buildPadded([
      { type: 'paragraph', content: [textNode('a'), { type: 'hardBreak' }, textNode('b')] },
    ]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: ['a', { tag: 'br', attrs: stamped('hardBreak', 2), children: [] }, 'b'],
    });
  });

  it('does not pad when the hardBreak is first, not last', () => {
    const tree = buildPadded([
      { type: 'paragraph', content: [{ type: 'hardBreak' }, textNode('hello')] },
    ]);
    expect(tree[0]).toEqual({
      tag: 'p',
      attrs: stamped('paragraph', 0),
      children: [{ tag: 'br', attrs: stamped('hardBreak', 1), children: [] }, 'hello'],
    });
  });
});

describe('literal newline in a text leaf under edit-mode pre-wrap (§18 v3 floating toolbar follow-up)', () => {
  // Accepted, not guarded against: the document schema never emits a
  // literal "\n" inside text (a line break is a hardBreak node), but nothing
  // here strips or rejects one either. Under the overlay's edit-mode
  // `white-space: pre-wrap` (see overlay.ts's applyRichTextWhiteSpace) a real
  // browser renders it as a visible line break; this pins that it is treated
  // as an ordinary character everywhere else — the tree, and (in
  // richTextPositions.test.ts) position counting.
  it('renders a literal newline as an ordinary character, not stripped or specially escaped', () => {
    const tree = build([{ type: 'paragraph', content: [textNode('a\nb')] }]);
    expect(tree[0]).toEqual({ tag: 'p', attrs: stamped('paragraph', 0), children: ['a\nb'] });
  });
});
