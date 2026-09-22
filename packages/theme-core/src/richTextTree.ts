/**
 * Framework-neutral read renderer for a §18 rich-text field's TipTap JSON
 * document. Produces a plain element tree; each framework binding maps that
 * tree onto its own vnode factory (`@eldrajs/theme-vue`'s `renderRichTextDoc`
 * is ~20 lines of `h()`), so the node/mark rules, the URL gating and the
 * attribute whitelist exist exactly once for every adapter.
 *
 * Read mode only — the theme renders rich text, Studio owns the document and
 * the one headless editor that writes it.
 *
 * §18 v3: every **node** element carries `data-eldra-node="<type>"` and
 * `data-eldra-pos="<open position>"` (see `richTextPositions.ts`), so the
 * overlay can map a DOM selection to a ProseMirror document position without
 * a schema. **Mark** elements (`strong`, `em`, `s`, `u`, `code`, `mark`,
 * `span[style]`, `a`) carry no stamps, and neither do the wrappers that are
 * not nodes: a `codeBlock` stamps its `pre`, not the `code` inside it, and a
 * `table` stamps the `table`, not the `tbody`. The stamps are computed from
 * the document, not from the tree, so a node the sanitiser drops (an unsafe
 * image `src`) still consumes its position and everything after it stays
 * numbered as the document numbers it.
 */

import { RICH_TEXT_PAD_ATTR, richTextNodeSize, richTextText } from './richTextPositions';

export interface RichTextMark {
  type?: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

/** One element in the render tree. Attribute values are always strings, so a
 * mapper can hand them to any vnode factory (or to `setAttribute`) unchanged. */
export interface RichTextRenderNode {
  tag: string;
  attrs: Record<string, string>;
  children: RichTextRenderChild[];
}

/** Text leaves are plain strings; everything else is an element. */
export type RichTextRenderChild = RichTextRenderNode | string;

export interface BuildRichTextTreeOptions {
  /** Validates and normalizes a link/image/embed/file-attachment target; unsafe values return null. */
  safeHref: (value: unknown) => string | null;
  /**
   * Pad an empty textblock (a `paragraph`/`heading` with no content, or an
   * empty `codeBlock`) with a single unstamped `<br data-eldra-pad="">`
   * child, the way TipTap/ProseMirror pad an empty textblock with a trailing
   * `<br>` — without it the browser collapses `<p></p>` to zero height, so a
   * fresh paragraph (e.g. from pressing Enter at the end of one) is
   * invisible and has nowhere for the caret to sit. Defaults to `false` so
   * static/published output is unchanged; the theme-vue binding passes
   * `true` only while the field is actually being edited.
   *
   * The pad is zero-width to `richTextPositions.ts`'s DOM walk (see
   * `RICH_TEXT_PAD_ATTR`) — not a `hardBreak`, which is stamped and still
   * counts one position — and `computeRichTextPositions`, which works from
   * the document rather than the DOM, needs no changes at all.
   */
  padEmptyBlocks?: boolean;
}

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const NAMED_COLOR = /^[a-zA-Z]+$/;

/**
 * Build a TipTap JSON document's content as a render tree. Non-doc input
 * builds an empty tree.
 *
 * Every top-level child is an element: a well-formed document only holds
 * block nodes there, and a malformed one (a text node, or an unknown node
 * wrapping text, directly under `doc`) gets its bare text wrapped in a
 * `span` rather than dropped — so the content survives and a mapper never
 * has to place a text node next to the field root's element children.
 */
export function buildRichTextTree(
  doc: unknown,
  options: BuildRichTextTreeOptions
): RichTextRenderNode[] {
  const root = isDocNode(doc) ? doc : { type: 'doc', content: [] };
  // The doc's content starts at 0 and the doc itself has no open/close token.
  const cursor: Cursor = { pos: 0 };
  return buildChildren(root.content, options, cursor).map((child) =>
    typeof child === 'string' ? { tag: 'span', attrs: {}, children: [child] } : child
  );
}

/** The position walk's single mutable cursor, threaded through the build so
 * the tree is produced and numbered in one pass. */
interface Cursor {
  pos: number;
}

function isDocNode(value: unknown): value is RichTextNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'doc'
  );
}

function isNode(value: unknown): value is RichTextNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The concatenated, stega-stripped text of every direct text-leaf child of
 * `content` — what `padEmptyBlocks` (see `buildNode`) treats as a
 * textblock's "text". A non-text child (hardBreak, image, embed) contributes
 * no characters. */
function textContentOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const child of content) {
    if (isNode(child) && child.type === 'text') text += richTextText(child);
  }
  return text;
}

function buildChildren(
  nodes: unknown,
  options: BuildRichTextTreeOptions,
  cursor: Cursor
): RichTextRenderChild[] {
  if (!Array.isArray(nodes)) return [];
  const out: RichTextRenderChild[] = [];
  for (const node of nodes) {
    if (!isNode(node)) continue;
    const pos = cursor.pos;
    out.push(...buildNode(node, options, cursor, pos));
    // Advance over the whole node whatever the tree did with it: a dropped
    // node still occupies its positions in the document.
    cursor.pos = pos + richTextNodeSize(node);
  }
  return out;
}

/** Returns 0..n children: a dropped node (unsafe src, textless text node)
 * contributes nothing, and an unknown node splices its own children in. */
function buildNode(
  node: RichTextNode,
  options: BuildRichTextTreeOptions,
  cursor: Cursor,
  pos: number
): RichTextRenderChild[] {
  if (node.type === 'text') {
    if (typeof node.text !== 'string') return [];
    // The DOM must never carry a rich-text root's stega payload (see the
    // `EldraRichText` comment): a client re-render from an
    // `editor:content-update` renders this text again in edit mode, and the
    // invisible characters would corrupt every ProseMirror position computed
    // from it. `richTextText` is the same stripping `richTextNodeSize` counts
    // by, so the two cannot drift.
    return [applyMarks(richTextText(node), node.marks ?? [], options)];
  }

  // Content opens one position after the node's own open token; a leaf has no
  // content, so the value is simply never read.
  cursor.pos = pos + 1;
  const children = (): RichTextRenderChild[] => buildChildren(node.content, options, cursor);
  const stamp = (attrs: Record<string, string>): Record<string, string> =>
    typeof node.type === 'string' && node.type !== ''
      ? { ...attrs, 'data-eldra-node': node.type, 'data-eldra-pos': String(pos) }
      : attrs;
  const element = (tag: string, attrs: Record<string, string> = {}): RichTextRenderChild[] => [
    { tag, attrs: stamp(attrs), children: children() },
  ];
  // §18 v3 (floating toolbar follow-up): a textblock whose text is empty or
  // whitespace-only — a paragraph or heading with no content, one holding
  // only spaces (e.g. the trailing run Enter after the last visible
  // character splits into its own paragraph), or an empty codeBlock —
  // collapses to zero height under normal `white-space` rendering, so a
  // fresh/blank paragraph is invisible and the caret has nowhere to sit.
  // `options.padEmptyBlocks` (edit mode only; see `BuildRichTextTreeOptions`)
  // appends a single unstamped `<br data-eldra-pad="">` *after* whatever
  // content is there, the way TipTap/ProseMirror do — never replacing it, so
  // a run of spaces still renders (and still counts its positions; the pad
  // itself is always zero-width, see `richTextPositions.ts`). "Empty" is
  // based on the concatenated text of the node's own text-leaf children, not
  // whatever else it holds: a non-text child (a real `hardBreak`, an image)
  // contributes no characters, so a block holding only one of those is
  // "textually empty" too, and padding it is harmless — a trailing `<br>` at
  // the end of a block with content adds no extra line in browsers, which is
  // exactly what lets ProseMirror do the same unconditionally.
  //
  // The other half of ProseMirror's own trailing-break rule: a *non*-empty
  // textblock whose last content child is a `hardBreak` — Shift+Enter at the
  // end of a line, `[text("hello"), hardBreak]` — renders `<p>hello<br></p>`,
  // and a trailing `<br>` at the end of a block draws no second line, so the
  // caret placed after it is just as invisible as an empty paragraph's.
  // "Last content child" is read off the *rendered* children (`kids`, passed
  // in below), not `node.content` — a sanitiser-dropped trailing node must
  // not be mistaken for a hardBreak, or vice versa.
  const isBlank = /^\s*$/.test(textContentOf(node.content));
  const endsWithHardBreak = (kids: RichTextRenderChild[]): boolean => {
    const last = kids[kids.length - 1];
    return (
      typeof last === 'object' && last.tag === 'br' && last.attrs['data-eldra-node'] === 'hardBreak'
    );
  };
  const padIfEmpty = (kids: RichTextRenderChild[]): RichTextRenderChild[] =>
    options.padEmptyBlocks === true && (isBlank || endsWithHardBreak(kids))
      ? [...kids, { tag: 'br', attrs: { [RICH_TEXT_PAD_ATTR]: '' }, children: [] }]
      : kids;
  const textblockElement = (
    tag: string,
    attrs: Record<string, string> = {}
  ): RichTextRenderChild[] => [{ tag, attrs: stamp(attrs), children: padIfEmpty(children()) }];

  switch (node.type) {
    case 'paragraph':
      return textblockElement('p');
    case 'heading':
      return textblockElement(`h${clampHeadingLevel(node.attrs?.level)}`);
    case 'bulletList':
      return element('ul');
    case 'orderedList':
      return element('ol');
    case 'listItem':
      return element('li');
    case 'blockquote':
      return element('blockquote');
    case 'horizontalRule':
      return [{ tag: 'hr', attrs: stamp({}), children: [] }];
    case 'hardBreak':
      return [{ tag: 'br', attrs: stamp({}), children: [] }];
    // The `pre` is the node; the `code` inside it is part of the rendering,
    // not a node of its own, so only the `pre` is stamped.
    case 'codeBlock':
      return buildCodeBlock(node, stamp({}), padIfEmpty(children()));
    // Likewise the `tbody`: `table > tableRow` in the document, `table >
    // tbody > tr` in HTML.
    case 'table':
      return [
        {
          tag: 'table',
          attrs: stamp({}),
          children: [{ tag: 'tbody', attrs: {}, children: children() }],
        },
      ];
    case 'tableRow':
      return element('tr');
    case 'tableHeader':
      return element('th', tableCellAttrs(node));
    case 'tableCell':
      return element('td', tableCellAttrs(node));
    case 'image':
      return buildImage(node, options, stamp);
    case 'embed':
      return buildEmbed(node, options, stamp);
    // Nested/repeated doc nodes (should not occur past the root, but stay
    // safe) and unknown nodes have no markup of their own, but they are still
    // nodes: they open and close, and their children sit one position inside
    // them. Rendering them as a bare `span` that carries only the stamps keeps
    // the DOM walk able to count those two tokens — splicing the children in
    // would leave the rendered tree two positions short of the document for
    // everything that follows, which is exactly the kind of silent drift the
    // stamps exist to prevent. A plain span is enough: it inherits layout from
    // its parent, so the theme's own CSS still sees the children where it
    // expects them.
    case 'doc':
      return element('span');
    default:
      return element('span');
  }
}

function buildCodeBlock(
  node: RichTextNode,
  attrs: Record<string, string>,
  children: RichTextRenderChild[]
): RichTextRenderChild[] {
  const language = typeof node.attrs?.language === 'string' ? node.attrs.language : null;
  return [
    {
      tag: 'pre',
      attrs,
      children: [
        {
          tag: 'code',
          attrs: language !== null ? { class: `language-${language}` } : {},
          children,
        },
      ],
    },
  ];
}

function tableCellAttrs(node: RichTextNode): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (typeof node.attrs?.colspan === 'number') attrs.colspan = String(node.attrs.colspan);
  if (typeof node.attrs?.rowspan === 'number') attrs.rowspan = String(node.attrs.rowspan);
  return attrs;
}

function buildImage(
  node: RichTextNode,
  options: BuildRichTextTreeOptions,
  stamp: (attrs: Record<string, string>) => Record<string, string>
): RichTextRenderChild[] {
  const src = options.safeHref(node.attrs?.src);
  if (src === null) return [];
  const attrs: Record<string, string> = { src };
  if (typeof node.attrs?.alt === 'string') attrs.alt = node.attrs.alt;
  if (typeof node.attrs?.title === 'string') attrs.title = node.attrs.title;
  if (typeof node.attrs?.assetId === 'string') attrs['data-asset-id'] = node.attrs.assetId;
  return [{ tag: 'img', attrs: stamp(attrs), children: [] }];
}

/** No iframe in read mode: an inert div carrying the safe source and provider/title metadata. */
function buildEmbed(
  node: RichTextNode,
  options: BuildRichTextTreeOptions,
  stamp: (attrs: Record<string, string>) => Record<string, string>
): RichTextRenderChild[] {
  const src = options.safeHref(node.attrs?.src);
  if (src === null) return [];
  const attrs: Record<string, string> = { class: 'eldra-embed', 'data-src': src };
  if (typeof node.attrs?.provider === 'string') attrs['data-provider'] = node.attrs.provider;
  if (typeof node.attrs?.title === 'string') attrs.title = node.attrs.title;
  return [{ tag: 'div', attrs: stamp(attrs), children: [] }];
}

function clampHeadingLevel(value: unknown): number {
  const level = typeof value === 'number' && Number.isInteger(value) ? value : 1;
  return Math.min(6, Math.max(1, level));
}

function colorStyle(property: 'color' | 'background-color', value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!HEX_COLOR.test(value) && !NAMED_COLOR.test(value)) return null;
  return `${property}: ${value}`;
}

function applyMarks(
  text: string,
  marks: RichTextMark[],
  options: BuildRichTextTreeOptions
): RichTextRenderChild {
  return marks.reduce<RichTextRenderChild>((child, mark) => {
    const wrap = (tag: string, attrs: Record<string, string> = {}): RichTextRenderNode => ({
      tag,
      attrs,
      children: [child],
    });
    switch (mark.type) {
      case 'bold':
        return wrap('strong');
      case 'italic':
        return wrap('em');
      case 'strike':
        return wrap('s');
      case 'underline':
        return wrap('u');
      case 'code':
        return wrap('code');
      case 'highlight': {
        const style = colorStyle('background-color', mark.attrs?.color);
        return wrap('mark', style !== null ? { style } : {});
      }
      case 'textStyle': {
        const style = colorStyle('color', mark.attrs?.color);
        return wrap('span', style !== null ? { style } : {});
      }
      case 'link':
        return buildLinkMark(mark, options, child);
      case 'fileAttachment':
        return buildFileAttachmentMark(mark, options, child);
      // Unknown marks are ignored.
      default:
        return child;
    }
  }, text);
}

function buildLinkMark(
  mark: RichTextMark,
  options: BuildRichTextTreeOptions,
  child: RichTextRenderChild
): RichTextRenderChild {
  const href = options.safeHref(mark.attrs?.href);
  if (href === null) return child;
  const attrs: Record<string, string> = { href };
  if (mark.attrs?.target === '_blank') {
    attrs.target = '_blank';
    attrs.rel = 'noopener noreferrer';
  }
  return { tag: 'a', attrs, children: [child] };
}

function buildFileAttachmentMark(
  mark: RichTextMark,
  options: BuildRichTextTreeOptions,
  child: RichTextRenderChild
): RichTextRenderChild {
  const href = options.safeHref(mark.attrs?.href);
  if (href === null) return child;
  const attrs: Record<string, string> = { href, 'data-file-attachment': '' };
  if (typeof mark.attrs?.assetId === 'string') attrs['data-asset-id'] = mark.attrs.assetId;
  if (typeof mark.attrs?.filename === 'string') attrs.download = mark.attrs.filename;
  return { tag: 'a', attrs, children: [child] };
}
