import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
// jsdom (this file's test environment) stands up a window.URL and the test
// runner's global injection rewrites bare `URL` references to it by name
// even inside this module, ignoring a same-named local import — so it
// resolves a relative URL against `http://localhost:3000/` instead of
// `import.meta.url`. Importing Node's under a different name sidesteps that
// and reliably resolves to a real `file://` URL.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  computeRichTextPositions,
  describeSelectionContext,
  restampRichTextPositions,
  richTextMarkNameOf,
  domRangeToPositions,
  resolveDomPoint,
  resolveDomPosition,
  richTextNodeSize,
  RICH_TEXT_LEAF_TYPES,
} from '../richTextPositions';
import {
  buildRichTextTree,
  type RichTextRenderChild,
  type RichTextRenderNode,
} from '../richTextTree';
import { safeHref } from '../richText';
import { encodeStega } from '../stega';
import fixture from './fixtures/rich-text-positions.fixture.json';

interface FixtureCase {
  name: string;
  doc: unknown;
  size: number;
  nodes: Array<{ path: number[]; type: string; pos: number; end: number }>;
}

const cases = fixture as unknown as FixtureCase[];

/** sha256 of `test/fixtures/rich-text-positions.fixture.json`. Studio asserts
 * the same digest over its own copy — see the test below. */
const FIXTURE_SHA256 = '63dc35018650160d74453a7851c0225f8315b8bef99d5a0e5aaf4812517eca97';

/**
 * The fixture is ground truth produced by a **real** ProseMirror/TipTap
 * schema (the same `createRichTextExtensions(RICH_TEXT_CONTROLS, {
 * studioMedia: true, fullSchema: true })` Studio builds its headless editor
 * from) and is copied byte-for-byte into Studio's tests. This module has no
 * dependency on ProseMirror, so this file is the only thing keeping the two
 * numberings identical.
 */

/** Renders a build tree into a real DOM subtree — jsdom only, test only. */
function toDom(children: RichTextRenderChild[], parent: Element): Element {
  for (const child of children) {
    if (typeof child === 'string') {
      parent.appendChild(document.createTextNode(child));
      continue;
    }
    const element = document.createElement(child.tag);
    for (const [name, value] of Object.entries(child.attrs)) element.setAttribute(name, value);
    toDom(child.children, element);
    parent.appendChild(element);
  }
  return parent;
}

function render(doc: unknown): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-eldra-rich-text', '');
  return toDom(buildRichTextTree(doc, { safeHref }), root) as HTMLElement;
}

/** Same as `render`, but with `padEmptyBlocks` on — the edit-mode render an
 * empty textblock gets a `<br data-eldra-pad="">` for the caret to sit on. */
function renderPadded(doc: unknown): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-eldra-rich-text', '');
  return toDom(buildRichTextTree(doc, { safeHref, padEmptyBlocks: true }), root) as HTMLElement;
}

function caseNamed(name: string): FixtureCase {
  const found = cases.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`fixture case "${name}" is missing`);
  return found;
}

/** Every element in a rendered root, depth-first. */
function elements(root: Element): Element[] {
  return [...root.querySelectorAll('*')];
}

function firstText(root: Element, value: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    if ((node as Text).data === value) return node as Text;
    node = walker.nextNode();
  }
  throw new Error(`no text node "${value}"`);
}

/** Deep-clones a TipTap doc, stega-encoding every text leaf — the shape a
 * client re-render of a document produced by `encodeEntryDataStega` sees. */
function encodeAllText(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(encodeAllText);
  if (typeof node !== 'object' || node === null) return node;
  const record = node as Record<string, unknown>;
  if (record.type === 'text' && typeof record.text === 'string') {
    return {
      ...record,
      text: encodeStega(record.text, { entryId: 'e1', fieldPath: 'x', locale: null }),
    };
  }
  if (Array.isArray(record.content)) {
    return { ...record, content: record.content.map(encodeAllText) };
  }
  return record;
}

describe('computeRichTextPositions', () => {
  it('has at least the twelve documents the contract names, each with a unique name', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(cases.map((entry) => entry.name)).size).toBe(cases.length);
  });

  it('is byte-for-byte the file Studio mirrors', () => {
    // §18 v3 requires the fixture to be copied into Studio's tests unchanged,
    // where the same positions are asserted against a real TipTap instance.
    // The checksum is asserted on both sides, so an edit to one copy that is
    // not made to the other fails here rather than drifting unnoticed.
    const path = fileURLToPath(
      new NodeURL('./fixtures/rich-text-positions.fixture.json', import.meta.url)
    );
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(digest).toBe(FIXTURE_SHA256);
  });

  it.each(cases.map((entry) => [entry.name, entry] as const))(
    'matches ProseMirror for %s',
    (_name, entry) => {
      expect(computeRichTextPositions(entry.doc)).toEqual({ size: entry.size, nodes: entry.nodes });
    }
  );

  it('is an empty document for anything that is not a doc node', () => {
    for (const value of [null, undefined, 'text', 42, [], { type: 'paragraph' }]) {
      expect(computeRichTextPositions(value)).toEqual({ size: 0, nodes: [] });
    }
  });

  it('numbers the doc from 0 with no open or close token of its own', () => {
    const { size, nodes } = computeRichTextPositions({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] }],
    });
    // doc content starts at 0; the paragraph opens at 0, its text runs 1..3,
    // it closes at 3, so the doc's content size is 4 — not 6.
    expect(nodes).toEqual([
      { path: [0], type: 'paragraph', pos: 0, end: 4 },
      { path: [0, 0], type: 'text', pos: 1, end: 3 },
    ]);
    expect(size).toBe(4);
  });

  it('counts a text node in UTF-16 code units, as ProseMirror does', () => {
    const astral = caseNamed('astral-plane text counts UTF-16 code units');
    const text = astral.nodes.find((node) => node.type === 'text')!;
    // "hi 😀 𝔘 ok" is 9 code points but 11 code units.
    expect(text.end - text.pos).toBe(11);
    expect(richTextNodeSize({ type: 'text', text: '😀' })).toBe(2);
    expect(richTextNodeSize({ type: 'text', text: '' })).toBe(0);
    expect(richTextNodeSize({ type: 'text' })).toBe(0);
  });

  it('counts a literal newline in a text leaf as one ordinary UTF-16 code unit', () => {
    // §18 v3 (floating toolbar follow-up): the document schema never emits
    // one (a line break is a hardBreak node), but nothing here strips or
    // rejects it either — under the overlay's edit-mode
    // `white-space: pre-wrap` a real browser renders it as a visible line
    // break, accepted rather than guarded against. Positions, either way,
    // treat it like any other character.
    expect(richTextNodeSize({ type: 'text', text: 'a\nb' })).toBe(3);
    const withNewline = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\nb' }] }],
    };
    const root = render(withNewline);
    expect(resolveDomPosition(root, firstText(root, 'a\nb'), 3)).toBe(4);
    expect(resolveDomPoint(root, 4)).toEqual({ node: firstText(root, 'a\nb'), offset: 3 });
  });

  it('gives every leaf node exactly one position and every content node two plus its content', () => {
    for (const type of RICH_TEXT_LEAF_TYPES) {
      expect(richTextNodeSize({ type })).toBe(1);
      // A leaf never contributes children, even if a malformed doc gives it some.
      expect(richTextNodeSize({ type, content: [{ type: 'text', text: 'ignored' }] })).toBe(1);
    }
    expect(richTextNodeSize({ type: 'paragraph' })).toBe(2);
    expect(richTextNodeSize({ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] })).toBe(
      5
    );
  });

  it('ends every node exactly where the next one begins', () => {
    for (const entry of cases) {
      const top = entry.nodes.filter((node) => node.path.length === 1);
      let cursor = 0;
      for (const node of top) {
        expect(node.pos).toBe(cursor);
        cursor = node.end;
      }
      expect(cursor).toBe(entry.size);
    }
  });
});

describe('buildRichTextTree position stamps', () => {
  it('stamps every node element with its type and open position, and nothing else', () => {
    for (const entry of cases) {
      const root = render(entry.doc);
      const stamped = elements(root).filter((element) => element.hasAttribute('data-eldra-pos'));
      const expected = entry.nodes.filter((node) => node.type !== 'text');
      expect(
        stamped.map((element) => ({
          type: element.getAttribute('data-eldra-node'),
          pos: Number(element.getAttribute('data-eldra-pos')),
        }))
      ).toEqual(expected.map((node) => ({ type: node.type, pos: node.pos })));
    }
  });

  it('leaves mark elements unstamped', () => {
    const root = render(caseNamed('nested marks, highlight, code and a file attachment').doc);
    for (const tag of ['strong', 'em', 'mark', 'code', 'a']) {
      const element = root.querySelector(tag);
      expect(element, tag).not.toBeNull();
      expect(element!.hasAttribute('data-eldra-pos'), tag).toBe(false);
      expect(element!.hasAttribute('data-eldra-node'), tag).toBe(false);
    }
    // The paragraph around them is the only stamped element in that document.
    expect(
      elements(root)
        .filter((e) => e.hasAttribute('data-eldra-pos'))
        .map((e) => e.tagName)
    ).toEqual(['P']);
  });

  it('stamps a codeBlock on its pre, never on the code inside it', () => {
    const root = render(caseNamed('code block').doc);
    const pre = root.querySelector('pre')!;
    expect(pre.getAttribute('data-eldra-node')).toBe('codeBlock');
    expect(pre.getAttribute('data-eldra-pos')).toBe('0');
    expect(pre.querySelector('code')!.hasAttribute('data-eldra-pos')).toBe(false);
  });

  it('stamps a table on the table, never on the tbody, and stamps rows and cells', () => {
    const root = render(caseNamed('table').doc);
    const table = root.querySelector('table')!;
    expect(table.getAttribute('data-eldra-node')).toBe('table');
    expect(root.querySelector('tbody')!.hasAttribute('data-eldra-pos')).toBe(false);
    expect(root.querySelector('tr')!.getAttribute('data-eldra-node')).toBe('tableRow');
    expect(root.querySelector('th')!.getAttribute('data-eldra-node')).toBe('tableHeader');
    expect(root.querySelector('td')!.getAttribute('data-eldra-node')).toBe('tableCell');
  });

  it('stamps the leaf elements themselves — br, img, hr and the embed div', () => {
    expect(
      render(caseNamed('hard breaks').doc).querySelector('br')!.getAttribute('data-eldra-node')
    ).toBe('hardBreak');
    expect(
      render(caseNamed('image between paragraphs').doc)
        .querySelector('img')!
        .getAttribute('data-eldra-node')
    ).toBe('image');
    expect(
      render(caseNamed('horizontal rule').doc).querySelector('hr')!.getAttribute('data-eldra-node')
    ).toBe('horizontalRule');
    expect(
      render(caseNamed('embed').doc).querySelector('.eldra-embed')!.getAttribute('data-eldra-node')
    ).toBe('embed');
  });

  it('keeps the numbering of what follows a node the sanitiser dropped', () => {
    // The image's src is refused, so it renders nothing — but it still holds
    // its position in the document Studio owns, and the paragraph after it
    // must stay where that document says it is.
    const tree = buildRichTextTree(
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
          { type: 'image', attrs: { src: 'javascript:alert(1)' } },
          { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
        ],
      },
      { safeHref }
    ) as RichTextRenderNode[];

    expect(tree).toHaveLength(2);
    expect(tree[0]!.attrs['data-eldra-pos']).toBe('0');
    expect(tree[1]!.attrs['data-eldra-pos']).toBe('4');
  });

  it('keeps the node attributes it always rendered', () => {
    const root = render(caseNamed('image between paragraphs').doc);
    const img = root.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(img.getAttribute('alt')).toBe('An image');
    expect(img.getAttribute('data-asset-id')).toBe('asset-2');
  });
});

describe('restampRichTextPositions', () => {
  /** The stamps a fresh render of `doc` would produce, in document order. */
  function stampsOf(root: Element): Array<{ type: string | null; pos: string | null }> {
    return [...root.querySelectorAll('[data-eldra-node][data-eldra-pos]')].map((element) => ({
      type: element.getAttribute('data-eldra-node'),
      pos: element.getAttribute('data-eldra-pos'),
    }));
  }

  const before = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Rich ' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'After' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
    ],
  };

  it('moves every later block to where two native ops put it', () => {
    // The operator typed two characters into the first paragraph while its
    // re-render was deferred: the DOM is right, the document moved, and every
    // stamp after the edit is now two positions behind.
    const root = render(before);
    const stale = stampsOf(root);
    const after = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Rich ab' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'After' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
      ],
    };

    expect(restampRichTextPositions(root, after)).toBe(true);

    // Exactly what a fresh render of the new document would have stamped.
    expect(stampsOf(root)).toEqual(stampsOf(render(after)));
    expect(stampsOf(root)).not.toEqual(stale);
    // The DOM itself is untouched — that is the whole point.
    expect(root.querySelector('p')!.textContent).toBe('Rich ');
  });

  it('keeps the resolved positions in step with the new document', () => {
    const root = render(before);
    const after = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Rich ab' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'After' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
      ],
    };
    restampRichTextPositions(root, after);

    // "After" opens its heading at 9 in the new document, not 7.
    expect(resolveDomPosition(root, firstText(root, 'After'), 0)).toBe(10);
    expect(computeRichTextPositions(after).nodes.find((node) => node.type === 'heading')!.pos).toBe(
      9
    );
  });

  it('restamps every fixture document onto a render of a different one it matches', () => {
    // Same shape, different text: the stamps must follow the document.
    for (const entry of cases) {
      const root = render(entry.doc);
      expect(restampRichTextPositions(root, entry.doc), entry.name).toBe(true);
      expect(stampsOf(root), entry.name).toEqual(stampsOf(render(entry.doc)));
    }
  });

  it('succeeds on a padded DOM: the compare walks stamped node elements only, and the pad is never one', () => {
    // The document itself is unchanged (only its rendering is padded), so a
    // reflexive restamp against its own document must still succeed — the
    // `[data-eldra-node][data-eldra-pos]` query the compare walks never
    // matches the unstamped pad <br>, so its presence cannot throw off the
    // node count or order.
    for (const entry of cases) {
      const root = renderPadded(entry.doc);
      expect(restampRichTextPositions(root, entry.doc), entry.name).toBe(true);
      // The pads are untouched — restamp never adds a stamp to one.
      for (const pad of root.querySelectorAll('[data-eldra-pad]')) {
        expect(pad.hasAttribute('data-eldra-node')).toBe(false);
        expect(pad.hasAttribute('data-eldra-pos')).toBe(false);
      }
    }
  });

  it('refuses and changes nothing when the tree and the document disagree', () => {
    const root = render(before);
    const stamps = stampsOf(root);

    // A block more than the render has.
    expect(
      restampRichTextPositions(root, {
        type: 'doc',
        content: [
          ...before.content,
          { type: 'paragraph', content: [{ type: 'text', text: 'New' }] },
        ],
      })
    ).toBe(false);
    // The same count, but a different node where the heading is.
    expect(
      restampRichTextPositions(root, {
        type: 'doc',
        content: [
          before.content[0],
          {
            type: 'blockquote',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
          },
          before.content[2],
        ],
      })
    ).toBe(false);
    // Nothing is left half-written: the caller falls back to a full re-render.
    expect(stampsOf(root)).toEqual(stamps);
  });

  it('refuses a document whose nodes the renderer would drop', () => {
    const root = render(before);

    // The sanitiser refuses the image, so a fresh render would hold three
    // node elements for a four-node document — the stamps cannot describe it.
    expect(
      restampRichTextPositions(root, {
        type: 'doc',
        content: [
          before.content[0],
          { type: 'image', attrs: { src: 'javascript:alert(1)' } },
          before.content[1],
          before.content[2],
        ],
      })
    ).toBe(false);
  });
});

describe('resolveDomPosition / resolveDomPoint', () => {
  it('round-trips every position of every fixture document through the DOM', () => {
    for (const entry of cases) {
      const root = render(entry.doc);
      for (let pos = 0; pos <= entry.size; pos += 1) {
        const point = resolveDomPoint(root, pos);
        expect(point, `${entry.name} @ ${pos}`).not.toBeNull();
        expect(resolveDomPosition(root, point!.node, point!.offset), `${entry.name} @ ${pos}`).toBe(
          pos
        );
      }
    }
  });

  it('resolves a caret inside a text run to the position the document gives it', () => {
    const entry = caseNamed('paragraph with plain text');
    const root = render(entry.doc);
    const text = firstText(root, 'Hello');
    expect(resolveDomPosition(root, text, 0)).toBe(1);
    expect(resolveDomPosition(root, text, 3)).toBe(4);
    expect(resolveDomPosition(root, text, 5)).toBe(6);
  });

  it('counts through mark elements as if they were not there', () => {
    const entry = caseNamed('paragraph with marks');
    const root = render(entry.doc);
    const bold = firstText(root, 'bold');
    // "Plain " is 6 characters from the paragraph's content start at 1.
    expect(resolveDomPosition(root, bold, 0)).toBe(7);
    expect(resolveDomPosition(root, bold, 4)).toBe(11);
    // …and the document agrees.
    const boldNode = entry.nodes.find((node) => node.type === 'text' && node.pos === 7);
    expect(boldNode).toBeDefined();
  });

  it('gives a leaf its own position from either side of it', () => {
    const root = render(caseNamed('hard breaks').doc);
    const br = root.querySelector('br')!;
    const paragraph = root.querySelector('p')!;
    const index = [...paragraph.childNodes].indexOf(br);
    const expected = Number(br.getAttribute('data-eldra-pos'));
    expect(resolveDomPosition(root, paragraph, index)).toBe(expected);
    expect(resolveDomPosition(root, br, 0)).toBe(expected);
    expect(resolveDomPoint(root, expected)).toEqual({
      node: firstText(root, 'Line one'),
      offset: 8,
    });
  });

  it('resolves the inside of an empty paragraph', () => {
    const root = render(caseNamed('empty paragraph before and after text').doc);
    const empty = root.querySelectorAll('p')[0]!;
    expect(empty.childNodes).toHaveLength(0);
    expect(resolveDomPosition(root, empty, 0)).toBe(1);
    expect(resolveDomPoint(root, 1)).toEqual({ node: empty, offset: 0 });
  });

  it('resolves the inside of a padded empty paragraph the same way, before the pad', () => {
    const root = renderPadded(caseNamed('empty paragraph before and after text').doc);
    const empty = root.querySelectorAll('p')[0]!;
    const pad = empty.firstElementChild!;
    expect(empty.childNodes).toHaveLength(1);
    expect(pad.tagName.toLowerCase()).toBe('br');
    expect(pad.getAttribute('data-eldra-pad')).toBe('');
    // Unstamped: it is not a node, so it must carry neither stamp — a real
    // hardBreak (see below) always does.
    expect(pad.hasAttribute('data-eldra-node')).toBe(false);
    expect(pad.hasAttribute('data-eldra-pos')).toBe(false);

    // A caret placed on either side of the pad — offset 0 (before it) or
    // targeting the pad element directly — still resolves to the same single
    // position an unpadded empty paragraph has (open + 1).
    expect(resolveDomPosition(root, empty, 0)).toBe(1);
    expect(resolveDomPosition(root, pad, 0)).toBe(1);
    // The inverse: that position resolves to the paragraph itself, before
    // the pad — not to the pad element (which has no children of its own to
    // hand back a point into).
    expect(resolveDomPoint(root, 1)).toEqual({ node: empty, offset: 0 });
  });

  it('still counts a real hardBreak as one position, unaffected by padding elsewhere in the document', () => {
    const root = renderPadded(caseNamed('hard breaks').doc);
    const br = root.querySelector('br')!;
    const paragraph = root.querySelector('p')!;
    // A real hardBreak is always stamped — never mistaken for the padding
    // marker, even though both render as a bare <br>.
    expect(br.hasAttribute('data-eldra-pad')).toBe(false);
    const index = [...paragraph.childNodes].indexOf(br);
    const expected = Number(br.getAttribute('data-eldra-pos'));
    expect(resolveDomPosition(root, paragraph, index)).toBe(expected);
    expect(resolveDomPosition(root, br, 0)).toBe(expected);
  });

  it('resolves a paragraph with trailing spaces + a pad: the caret after the text, and after the pad, both land at open + 1 + length', () => {
    const trailing = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '  ' }] }],
    };
    const root = renderPadded(trailing);
    const p = root.querySelector('p')!;
    const text = firstText(root, '  ');
    const pad = p.querySelector('[data-eldra-pad]')!;
    expect([...p.childNodes]).toEqual([text, pad]);

    // open (0) + 1 (content start) + length (2) = 3.
    expect(resolveDomPosition(root, text, 2)).toBe(3);
    // The boundary right after the text node — offset 1 among p's children,
    // i.e. before the pad — resolves to the same position.
    expect(resolveDomPosition(root, p, 1)).toBe(3);
    // The pad itself is zero-width, so targeting it directly agrees too.
    expect(resolveDomPosition(root, pad, 0)).toBe(3);
    // The inverse: that position prefers the text node — the natural target
    // for a caret about to receive a keystroke — over the pad after it.
    expect(resolveDomPoint(root, 3)).toEqual({ node: text, offset: 2 });
  });

  it('resolves a paragraph ending in a hardBreak + a pad (Shift+Enter at the end of a line): before and after the pad agree, and the inverse lands after the real br', () => {
    const trailingBreak = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hi' }, { type: 'hardBreak' }],
        },
      ],
    };
    const root = renderPadded(trailingBreak);
    const p = root.querySelector('p')!;
    const br = root.querySelector('br[data-eldra-node="hardBreak"]')!;
    const pad = root.querySelector('[data-eldra-pad]')!;
    expect([...p.childNodes]).toEqual([firstText(root, 'hi'), br, pad]);
    const childCount = p.childNodes.length; // 3

    // open (0) + 1 (content start) + len (2) + 1 (the hardBreak's own
    // position) = 4 — the position right after the real hardBreak.
    const afterBreak = 4;
    // (p, childCount) — after everything, including the pad — and
    // (p, childCount - 1) — before the pad, right after the hardBreak — are
    // the same position: the pad is zero-width either side of it.
    expect(resolveDomPosition(root, p, childCount)).toBe(afterBreak);
    expect(resolveDomPosition(root, p, childCount - 1)).toBe(afterBreak);
    // The inverse resolves after the stamped br, not after the pad.
    expect(resolveDomPoint(root, afterBreak)).toEqual({ node: p, offset: childCount - 1 });
  });

  it('counts through a table without counting the tbody', () => {
    const entry = caseNamed('table');
    const root = render(entry.doc);
    const h1 = firstText(root, 'H1');
    const cell = entry.nodes.find((node) => node.type === 'tableHeader')!;
    // table(0) > row(1) > header(2) > paragraph(3) > text(4)
    expect(resolveDomPosition(root, h1, 0)).toBe(cell.pos + 2);
  });

  it('counts through a codeBlock without counting its code element', () => {
    const root = render(caseNamed('code block').doc);
    const text = firstText(root, 'const a = 1;');
    expect(resolveDomPosition(root, text, 0)).toBe(1);
  });

  it('clamps an offset past the end of a text node', () => {
    const root = render(caseNamed('paragraph with plain text').doc);
    expect(resolveDomPosition(root, firstText(root, 'Hello'), 99)).toBe(6);
  });

  /**
   * The renderer drops a node the sanitiser refuses (an unsafe `image.src`)
   * and gives an unknown node a stamped wrapper rather than splicing its
   * children in. Both are places where the rendered tree and the document
   * could disagree, and both directions have to keep agreeing anyway — the
   * stamps are what make that true, and these are the documents that prove it.
   */
  it.each([
    [
      'a node the sanitiser dropped',
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
          { type: 'image', attrs: { src: 'javascript:alert(1)' } },
          { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
        ],
      },
      7,
    ],
    [
      'an unknown node inside a paragraph',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'ab' },
              { type: 'someFutureNode', content: [{ type: 'text', text: 'cd' }] },
              { type: 'text', text: 'ef' },
            ],
          },
        ],
      },
      10,
    ],
  ] as const)('round-trips every position of %s', (_name, doc, size) => {
    expect(computeRichTextPositions(doc).size).toBe(size);
    const root = render(doc);
    for (let pos = 0; pos <= size; pos += 1) {
      const point = resolveDomPoint(root, pos);
      // A dropped node's own position has no DOM to land on; every other
      // position must resolve, and must resolve back to itself.
      if (point === null) continue;
      expect(resolveDomPosition(root, point.node, point.offset), `@ ${pos}`).toBe(pos);
    }
  });

  it('keeps the positions after a dropped node where the document puts them', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'image', attrs: { src: 'javascript:alert(1)' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    };
    const root = render(doc);

    // The second paragraph opens at 4, not at 2: the refused image still holds
    // its position in the document Studio owns.
    expect(resolveDomPoint(root, 4)).toEqual({ node: root, offset: 1 });
    expect(resolveDomPosition(root, firstText(root, 'b'), 0)).toBe(5);
    expect(resolveDomPoint(root, 7)).toEqual({ node: root, offset: 2 });
  });

  it("counts an unknown node's own two tokens", () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ab' },
            { type: 'someFutureNode', content: [{ type: 'text', text: 'cd' }] },
            { type: 'text', text: 'ef' },
          ],
        },
      ],
    };
    const root = render(doc);

    // "ab" is 1..3, the unknown node opens at 3 and closes at 7, so "ef"
    // starts at 7 — not at 5, which is where a spliced-in render would put it.
    expect(resolveDomPosition(root, firstText(root, 'ef'), 0)).toBe(7);
    expect(
      root.querySelector('[data-eldra-node="someFutureNode"]')!.getAttribute('data-eldra-pos')
    ).toBe('3');
  });

  it('returns null for a point outside the root, and for a position past the document', () => {
    const root = render(caseNamed('paragraph with plain text').doc);
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    expect(resolveDomPosition(root, outside.firstChild!, 0)).toBeNull();
    expect(resolveDomPoint(root, 999)).toBeNull();
    expect(resolveDomPoint(root, -1)).toBeNull();
    expect(resolveDomPoint(root, 1.5)).toBeNull();
  });
});

describe('domRangeToPositions', () => {
  it('maps both boundaries of a range', () => {
    const root = render(caseNamed('paragraph with marks').doc);
    const range = document.createRange();
    range.setStart(firstText(root, 'Plain '), 0);
    range.setEnd(firstText(root, 'bold'), 4);
    expect(domRangeToPositions(root, range)).toEqual({ from: 1, to: 11 });
  });

  it('spans blocks', () => {
    const entry = caseNamed('text at the document start and end');
    const root = render(entry.doc);
    const range = document.createRange();
    range.setStart(firstText(root, 'Start'), 1);
    range.setEnd(firstText(root, 'End'), 2);
    // "Start" runs 1..6, its paragraph closes at 6; "End" starts at 8.
    expect(domRangeToPositions(root, range)).toEqual({ from: 2, to: 10 });
  });

  it('orders the boundaries even when handed a reversed pair', () => {
    const root = render(caseNamed('paragraph with plain text').doc);
    const text = firstText(root, 'Hello');
    expect(
      domRangeToPositions(root, {
        startContainer: text,
        startOffset: 4,
        endContainer: text,
        endOffset: 1,
      })
    ).toEqual({ from: 2, to: 5 });
  });

  it('resolves a collapsed caret inside a padded empty paragraph to open + 1', () => {
    const root = renderPadded(caseNamed('empty paragraph before and after text').doc);
    const empty = root.querySelectorAll('p')[0]!;
    expect(
      domRangeToPositions(root, {
        startContainer: empty,
        startOffset: 0,
        endContainer: empty,
        endOffset: 0,
      })
    ).toEqual({ from: 1, to: 1 });
  });

  it('returns null when either boundary is outside the root', () => {
    const root = render(caseNamed('paragraph with plain text').doc);
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    const text = firstText(root, 'Hello');
    expect(
      domRangeToPositions(root, {
        startContainer: text,
        startOffset: 0,
        endContainer: outside.firstChild!,
        endOffset: 1,
      })
    ).toBeNull();
    expect(
      domRangeToPositions(root, {
        startContainer: outside.firstChild!,
        startOffset: 0,
        endContainer: text,
        endOffset: 1,
      })
    ).toBeNull();
  });
});

describe('describeSelectionContext', () => {
  it('reports the marks innermost first and the block the point sits in', () => {
    const root = render(caseNamed('nested marks, highlight, code and a file attachment').doc);
    expect(describeSelectionContext(root, firstText(root, 'bold italic')))
      // `applyMarks` reduces the doc's `marks` array outward, so the first
      // mark is the innermost element and the walk back up returns the array.
      .toEqual({ marks: ['bold', 'italic'], block: { type: 'paragraph' } });
    expect(describeSelectionContext(root, firstText(root, 'marked'))).toEqual({
      marks: ['highlight'],
      block: { type: 'paragraph' },
    });
    expect(describeSelectionContext(root, firstText(root, 'inline'))).toEqual({
      marks: ['code'],
      block: { type: 'paragraph' },
    });
    expect(describeSelectionContext(root, firstText(root, 'file.pdf'))).toEqual({
      marks: ['fileAttachment'],
      block: { type: 'paragraph' },
    });
    expect(describeSelectionContext(root, firstText(root, 'a'))).toEqual({
      marks: [],
      block: { type: 'paragraph' },
    });
  });

  it('exposes the element-to-mark decision, conditions included', () => {
    const root = render(caseNamed('nested marks, highlight, code and a file attachment').doc);
    expect(richTextMarkNameOf(root.querySelector('strong')!)).toBe('bold');
    expect(richTextMarkNameOf(root.querySelector('a')!)).toBe('fileAttachment');
    // The three entries the map alone would get wrong.
    const bareSpan = document.createElement('span');
    expect(richTextMarkNameOf(bareSpan)).toBeNull();
    bareSpan.setAttribute('style', 'color: red');
    expect(richTextMarkNameOf(bareSpan)).toBe('textStyle');
    const link = document.createElement('a');
    expect(richTextMarkNameOf(link)).toBe('link');
    const codeBlock = render(caseNamed('code block').doc);
    expect(richTextMarkNameOf(codeBlock.querySelector('code')!)).toBeNull();
    expect(richTextMarkNameOf(root.querySelector('code')!)).toBe('code');
  });

  it('maps every mark element the renderer produces', () => {
    const root = render({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'i', marks: [{ type: 'italic' }] },
            { type: 'text', text: 's', marks: [{ type: 'strike' }] },
            { type: 'text', text: 'u', marks: [{ type: 'underline' }] },
            { type: 'text', text: 'c', marks: [{ type: 'code' }] },
            { type: 'text', text: 'h', marks: [{ type: 'highlight', attrs: { color: '#ff0' } }] },
            { type: 'text', text: 't', marks: [{ type: 'textStyle', attrs: { color: '#f00' } }] },
            {
              type: 'text',
              text: 'l',
              marks: [{ type: 'link', attrs: { href: 'https://e.test' } }],
            },
          ],
        },
      ],
    });
    const marksAt = (value: string): string[] =>
      describeSelectionContext(root, firstText(root, value)).marks;
    expect(marksAt('b')).toEqual(['bold']);
    expect(marksAt('i')).toEqual(['italic']);
    expect(marksAt('s')).toEqual(['strike']);
    expect(marksAt('u')).toEqual(['underline']);
    expect(marksAt('c')).toEqual(['code']);
    expect(marksAt('h')).toEqual(['highlight']);
    expect(marksAt('t')).toEqual(['textStyle']);
    expect(marksAt('l')).toEqual(['link']);
  });

  it('does not read the code element of a codeBlock as an inline code mark', () => {
    const root = render(caseNamed('code block').doc);
    expect(describeSelectionContext(root, firstText(root, 'const a = 1;'))).toEqual({
      marks: [],
      block: { type: 'codeBlock', attrs: { language: 'javascript' } },
    });
  });

  it('does not read the stray-text span wrapper as a textStyle mark', () => {
    // A malformed document with bare text under `doc`: the renderer wraps it
    // in a span so a mapper never has to place a text node beside elements.
    const root = render({ type: 'doc', content: [{ type: 'text', text: 'bare' }] });
    expect(root.querySelector('span')!.hasAttribute('style')).toBe(false);
    expect(describeSelectionContext(root, firstText(root, 'bare'))).toEqual({
      marks: [],
      block: null,
    });
  });

  it('reports a heading with its level and the nearest block inside a list', () => {
    const root = render(caseNamed('headings').doc);
    expect(describeSelectionContext(root, firstText(root, 'Title')).block).toEqual({
      type: 'heading',
      attrs: { level: 1 },
    });
    expect(describeSelectionContext(root, firstText(root, 'Sub')).block).toEqual({
      type: 'heading',
      attrs: { level: 3 },
    });

    const lists = render(caseNamed('nested lists').doc);
    // The nearest node element is the paragraph inside the list item, which
    // is what ProseMirror's own `$from.parent` reports too.
    expect(describeSelectionContext(lists, firstText(lists, 'Nested a')).block).toEqual({
      type: 'paragraph',
    });
  });

  it('reports the cell as the block for a table, not the row or the table', () => {
    const root = render(caseNamed('table').doc);
    const paragraph = describeSelectionContext(root, firstText(root, 'H1')).block;
    expect(paragraph).toEqual({ type: 'paragraph' });
    expect(describeSelectionContext(root, root.querySelector('th')!).block).toEqual({
      type: 'tableHeader',
    });
  });

  it('is empty for a node outside the root', () => {
    const root = render(caseNamed('paragraph with plain text').doc);
    const outside = document.createElement('strong');
    outside.textContent = 'elsewhere';
    expect(describeSelectionContext(root, outside.firstChild!)).toEqual({ marks: [], block: null });
  });
});

describe('stega inside rich-text documents', () => {
  // A client re-render from editor:content-update renders whatever document
  // Studio holds, and every text leaf of that document carries a stega
  // payload in edit mode (encodeEntryDataStega). Positions must be computed
  // — and the DOM restamped — against the *clean* text, or every position
  // after the first stega-encoded leaf drifts from what Studio holds.
  it('computes the same positions for every fixture document whether or not its text is stega-encoded', () => {
    for (const entry of cases) {
      const encoded = encodeAllText(entry.doc);
      expect(computeRichTextPositions(encoded), entry.name).toEqual(
        computeRichTextPositions(entry.doc)
      );
    }
  });

  it('restamps successfully against a DOM rendered from the clean document when the document is stega-encoded', () => {
    for (const entry of cases) {
      const root = render(entry.doc);
      const before = [...root.querySelectorAll('[data-eldra-node][data-eldra-pos]')].map(
        (element) => element.getAttribute('data-eldra-pos')
      );
      const encoded = encodeAllText(entry.doc);

      expect(restampRichTextPositions(root, encoded), entry.name).toBe(true);

      // Stega adds no positions, so nothing about the stamps changes.
      const after = [...root.querySelectorAll('[data-eldra-node][data-eldra-pos]')].map((element) =>
        element.getAttribute('data-eldra-pos')
      );
      expect(after, entry.name).toEqual(before);
    }
  });

  it('renders no stega characters when the tree is built from a stega-encoded document', () => {
    for (const entry of cases) {
      const root = render(encodeAllText(entry.doc));
      expect(root.textContent ?? '', entry.name).not.toMatch(/[​‌﻿]/);
    }
  });
});
