/**
 * ProseMirror-compatible document positions for a §18 rich-text field, with
 * no dependency on ProseMirror (nor TipTap, nor any UI library — the theme
 * SDK is a bridge only).
 *
 * §18 v3 makes the theme's own render the editing surface: the operator types
 * in the theme's DOM and the theme reports what happened as positions, which
 * Studio applies to the one headless TipTap editor that owns the document.
 * That only works if both sides agree on the numbering to the character, so
 * the rules below are ProseMirror's, restated:
 *
 * - the `doc`'s content starts at `0`, and the `doc` itself has no tokens;
 * - every non-text node with content **opens** (+1), its children follow, and
 *   it **closes** (+1) after them;
 * - a text node occupies `text.length` — UTF-16 code units, which is what
 *   ProseMirror counts, so an astral-plane character (an emoji) is 2;
 * - a leaf node (`image`, `hardBreak`, `horizontalRule`, `embed`) occupies 1.
 *
 * `packages/theme-core/test/fixtures/rich-text-positions.fixture.json` pins
 * the numbering for a set of documents and is copied byte-for-byte into
 * Studio's tests, where it is asserted against a real TipTap instance —
 * neither implementation can drift without the other suite failing.
 *
 * The DOM half of the module maps between a DOM point (what a `Selection`
 * gives) and a position, using the `data-eldra-node`/`data-eldra-pos` stamps
 * `buildRichTextTree` puts on **node** elements. Mark elements (`strong`,
 * `em`, `a`, …) and the structural wrappers that are not nodes (`tbody`, the
 * `code` inside a `codeBlock`'s `pre`) carry no stamp and are walked through
 * transparently, which is exactly their status in the document.
 */

import { stripStega } from './stega';
import type { RichTextNode } from './richTextTree';

/** Nodes that occupy exactly one position and have no content. */
export const RICH_TEXT_LEAF_TYPES: readonly string[] = [
  'image',
  'hardBreak',
  'horizontalRule',
  'embed',
];

const LEAF_TYPES = new Set(RICH_TEXT_LEAF_TYPES);

/**
 * Ancestor element → mark name, for reading the active marks of a selection
 * straight off the DOM. `span` counts only when it carries the inline style
 * `textStyle` renders (a bare `span` is the wrapper `buildRichTextTree` puts
 * around stray top-level text, not a mark), and `a` splits by the attribute
 * the `fileAttachment` mark renders.
 */
export const RICH_TEXT_MARK_ELEMENTS: Readonly<Record<string, string>> = {
  strong: 'bold',
  em: 'italic',
  s: 'strike',
  u: 'underline',
  code: 'code',
  mark: 'highlight',
  span: 'textStyle',
  a: 'link',
};

export interface RichTextPositionNode {
  /** Indices into `content` from the `doc` down to this node. */
  path: number[];
  type: string;
  /** The node's open position — the position immediately before it. */
  pos: number;
  /** The position immediately after it: `pos + nodeSize`. */
  end: number;
}

export interface RichTextPositions {
  /** The `doc`'s content size. */
  size: number;
  /** Every node below the `doc`, in document order (the `doc` is not one). */
  nodes: RichTextPositionNode[];
}

/** The DOM point a `Selection`/`Range` boundary is expressed as. */
export interface RichTextDomPoint {
  node: Node;
  offset: number;
}

export interface RichTextSelectionContext {
  /** Mark names from the ancestor mark elements, innermost first — the same
   * order `applyMarks` consumes a text node's `marks` array in. */
  marks: string[];
  /** The nearest stamped node element, which is the position's parent block. */
  block: { type: string; attrs?: Record<string, unknown> } | null;
}

/**
 * A text node's rendered text, stega stripped. Edit mode stega-encodes every
 * text leaf of a rich-text document (`encodeEntryDataStega`), so this is the
 * one definition of "a text node's text" shared by the renderer
 * (`richTextTree.ts`'s `buildNode`) and the position walk below — the DOM
 * must never contain the invisible payload, and a position is a position in
 * the *clean* document Studio holds either way. Non-text nodes have none.
 */
export function richTextText(node: unknown): string {
  if (!isNode(node) || node.type !== 'text') return '';
  return typeof node.text === 'string' ? stripStega(node.text) : '';
}

/**
 * The number of positions a node occupies, including its own open and close
 * tokens. The `doc` is the one node with no tokens, so it is not measured
 * here — `computeRichTextPositions` sums its children instead.
 */
export function richTextNodeSize(node: unknown): number {
  if (!isNode(node)) return 0;
  if (node.type === 'text') return richTextText(node).length;
  if (typeof node.type === 'string' && LEAF_TYPES.has(node.type)) return 1;
  return 2 + contentSize(node.content);
}

function contentSize(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let size = 0;
  for (const child of content) size += richTextNodeSize(child);
  return size;
}

function isNode(value: unknown): value is RichTextNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walk a TipTap JSON document and return its content size plus every node's
 * open/close position. Non-`doc` input (or a `doc` with no content) is an
 * empty document: `{ size: 0, nodes: [] }`.
 *
 * Text nodes are included, so the fixture pins the whole numbering rather
 * than only the elements the renderer stamps.
 */
export function computeRichTextPositions(doc: unknown): RichTextPositions {
  const nodes: RichTextPositionNode[] = [];
  const root = isNode(doc) && doc.type === 'doc' ? doc : null;
  if (root === null) return { size: 0, nodes };
  const size = collect(root.content, 0, [], nodes);
  return { size, nodes };
}

/** Returns the content size of `content`, appending each node it walks. */
function collect(
  content: unknown,
  start: number,
  path: readonly number[],
  out: RichTextPositionNode[]
): number {
  if (!Array.isArray(content)) return 0;
  let pos = start;
  for (let index = 0; index < content.length; index += 1) {
    const child: unknown = content[index];
    if (!isNode(child)) continue;
    const childPath = [...path, index];
    const type = typeof child.type === 'string' ? child.type : '';
    const size = richTextNodeSize(child);
    out.push({ path: childPath, type, pos, end: pos + size });
    if (type !== 'text' && !LEAF_TYPES.has(type)) {
      collect(child.content, pos + 1, childPath, out);
    }
    pos += size;
  }
  return pos - start;
}

// --- DOM ↔ position ---------------------------------------------------------

const POS_ATTR = 'data-eldra-pos';
const NODE_ATTR = 'data-eldra-node';

/**
 * `buildRichTextTree`'s `padEmptyBlocks` marker: a single unstamped
 * `<br data-eldra-pad="">` child `buildRichTextTree` renders for an empty
 * textblock (an empty paragraph, heading, or `codeBlock`'s `code`) so the
 * browser does not collapse it to zero height and the caret has a line to
 * sit on. Not a `hardBreak` — a real one is stamped (`data-eldra-node`) and
 * still occupies one position via the leaf branch below; this occupies none.
 */
export const RICH_TEXT_PAD_ATTR = 'data-eldra-pad';

function isElement(value: Node | null | undefined): value is Element {
  return value !== null && value !== undefined && value.nodeType === 1;
}

function isText(value: Node): value is Text {
  return value.nodeType === 3;
}

function stampedPos(element: Element): number | null {
  const raw = element.getAttribute(POS_ATTR);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isLeafElement(element: Element): boolean {
  const type = element.getAttribute(NODE_ATTR);
  return type !== null && LEAF_TYPES.has(type);
}

/** `padEmptyBlocks`'s zero-width filler — never a node element (it carries
 * no `data-eldra-node`/`data-eldra-pos`), so this must be checked before the
 * generic "unstamped element" branch would otherwise walk into it. */
function isPadBreak(element: Element): boolean {
  return (
    element.tagName === 'BR' && !isNodeElement(element) && element.hasAttribute(RICH_TEXT_PAD_ATTR)
  );
}

/** Is this element a node element (as opposed to a mark element, a `tbody`,
 * a `codeBlock`'s inner `code`, or the field root itself)? */
function isNodeElement(element: Element): boolean {
  return element.hasAttribute(NODE_ATTR) && element.hasAttribute(POS_ATTR);
}

function contains(root: Node, node: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    if (current === root) return true;
    current = current.parentNode;
  }
  return false;
}

/**
 * The nearest stamped node element at or above `node`, stopping at `root`.
 * The walk that computes a position starts from this element's own stamped
 * position, so a long document costs one block's worth of work rather than a
 * full re-count, and a re-stamped tree is authoritative over any cursor this
 * module could keep.
 */
function nearestNodeElement(root: Element, node: Node): Element | null {
  let current: Node | null = node;
  while (current !== null && current !== root) {
    if (isElement(current) && isNodeElement(current)) return current;
    current = current.parentNode;
  }
  return null;
}

/**
 * A node element's stamped position is where the document says it begins, so
 * both walks jump to it rather than trusting the count of what came before.
 * Without this they would only agree while the rendered tree holds every node
 * the document does — which stops being true the moment the sanitiser refuses
 * one (an unsafe `image.src`), and the two directions would then disagree for
 * every position after the hole.
 */
function seedCursorFromStamp(child: Node, state: { cursor: number }): void {
  if (!isElement(child) || !isNodeElement(child)) return;
  const stamped = stampedPos(child);
  if (stamped !== null) state.cursor = stamped;
}

interface WalkTarget {
  node: Node;
  offset: number;
}

interface WalkState {
  cursor: number;
  found: number | null;
}

/**
 * Walk `container`'s children in document order, advancing `state.cursor` by
 * each child's size, and set `state.found` the moment the walk reaches the
 * target point.
 *
 * A stamped non-leaf element contributes its open token, its content and its
 * close token; a stamped leaf contributes 1; an unstamped element (a mark, a
 * `tbody`, a `codeBlock`'s `code`) is transparent — it is not a node, so it
 * contributes nothing of its own and its children are counted in place.
 */
function walk(container: Node, target: WalkTarget, state: WalkState): void {
  const children = container.childNodes;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    // The stamp is the authority, and it is read *before* the boundary check
    // below so the position of a child is the document's, not a running count
    // of what the renderer happened to emit. That is what keeps this function
    // and `resolveDomPoint` exact inverses even when the tree is missing a
    // node the document has — a sanitiser-dropped image, say.
    seedCursorFromStamp(child, state);
    if (state.found === null && container === target.node && index === target.offset) {
      state.found = state.cursor;
    }
    if (isText(child)) {
      const length = child.data.length;
      if (state.found === null && child === target.node) {
        state.found = state.cursor + Math.min(Math.max(target.offset, 0), length);
      }
      state.cursor += length;
      continue;
    }
    if (!isElement(child)) continue;
    if (isPadBreak(child)) {
      // Zero-width, and it has no content of its own to walk into — a point
      // landing directly on it (uncommon; the browser normally addresses the
      // parent, see walkToPoint) still resolves, at the unchanged cursor.
      if (state.found === null && child === target.node) state.found = state.cursor;
      continue;
    }
    if (!isNodeElement(child)) {
      walk(child, target, state);
      continue;
    }
    if (isLeafElement(child)) {
      // A leaf has no inside; a point on it resolves to the leaf's own
      // position, which is where a selection of it starts.
      if (state.found === null && child === target.node) state.found = state.cursor;
      state.cursor += 1;
      continue;
    }
    state.cursor += 1; // open token
    walk(child, target, state);
    state.cursor += 1; // close token
  }
  // offset === childNodes.length: the point is after the last child.
  if (state.found === null && container === target.node && target.offset >= children.length) {
    state.found = state.cursor;
  }
}

/**
 * The document position of a DOM point inside a rendered rich-text root — the
 * shape `Selection.anchorNode`/`anchorOffset` and a `Range`'s boundaries come
 * in. Returns null for a point outside `root`, or one the walk cannot reach
 * (a detached node).
 */
export function resolveDomPosition(root: Element, node: Node, offset: number): number | null {
  if (!contains(root, node)) return null;
  const host = nearestNodeElement(root, node);
  if (host === null) {
    const state: WalkState = { cursor: 0, found: null };
    walk(root, { node, offset }, state);
    return state.found;
  }
  const base = stampedPos(host);
  if (base === null) return null;
  // A point on a leaf element resolves to the leaf itself, not to an inside.
  if (isLeafElement(host)) return base;
  const state: WalkState = { cursor: base + 1, found: null };
  walk(host, { node, offset }, state);
  return state.found;
}

interface PointState {
  cursor: number;
  found: RichTextDomPoint | null;
}

/**
 * The inverse walk. A position that falls within a text node resolves to that
 * text node and an offset into it — the caret the browser wants; only a
 * position with no text around it (an empty paragraph, the gap beside a leaf
 * with no text neighbour) resolves to an element/child-index boundary.
 */
function walkToPoint(container: Node, pos: number, state: PointState): void {
  const children = container.childNodes;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    seedCursorFromStamp(child, state);
    if (isText(child)) {
      const length = child.data.length;
      if (state.found === null && pos >= state.cursor && pos <= state.cursor + length) {
        state.found = { node: child, offset: pos - state.cursor };
      }
      state.cursor += length;
      continue;
    }
    if (!isElement(child)) continue;
    if (isPadBreak(child)) {
      // Zero-width padding, and it must not be recursed into: it has no
      // children, so falling through to the generic "unstamped element"
      // branch below would (via that branch's own trailing check) resolve a
      // position that lands exactly here to `{ node: <the pad br>, offset: 0
      // }` instead of to its parent — e.g. resolveDomPoint(root, open+1) for
      // an empty paragraph must resolve to `(p, 0)`, before the pad, not to
      // the pad itself.
      if (state.found === null && pos === state.cursor) {
        state.found = { node: container, offset: index };
      }
      continue;
    }
    if (!isNodeElement(child)) {
      walkToPoint(child, pos, state);
      if (state.found !== null) return;
      continue;
    }
    if (isLeafElement(child)) {
      if (state.found === null && pos === state.cursor) {
        state.found = { node: container, offset: index };
      }
      state.cursor += 1;
      continue;
    }
    if (state.found === null && pos === state.cursor) {
      state.found = { node: container, offset: index };
    }
    state.cursor += 1; // open token
    // The trailing check inside the recursion covers the position at the end
    // of the child's content, which for a childless node (an empty paragraph)
    // is `{ node: child, offset: 0 }`.
    walkToPoint(child, pos, state);
    if (state.found !== null) return;
    state.cursor += 1; // close token
  }
  if (state.found === null && pos === state.cursor) {
    state.found = { node: container, offset: children.length };
  }
}

/**
 * The DOM point for a document position inside a rendered rich-text root, so
 * the theme can put the caret back where Studio says it belongs. Returns null
 * for a position outside the rendered document.
 */
export function resolveDomPoint(root: Element, pos: number): RichTextDomPoint | null {
  if (!Number.isInteger(pos) || pos < 0) return null;
  const state: PointState = { cursor: 0, found: null };
  walkToPoint(root, pos, state);
  return state.found;
}

/**
 * Both boundaries of a DOM range as document positions. A `Range` is always
 * ordered, so `from <= to`; a boundary outside `root` returns null rather
 * than a half-resolved range.
 */
export function domRangeToPositions(
  root: Element,
  range: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number }
): { from: number; to: number } | null {
  const from = resolveDomPosition(root, range.startContainer, range.startOffset);
  if (from === null) return null;
  const to = resolveDomPosition(root, range.endContainer, range.endOffset);
  if (to === null) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * Refresh the `data-eldra-pos` stamps of an already-rendered root against a
 * new document, without replacing any DOM.
 *
 * §18 v3 lets a field's re-render be **deferred** while a native text op is in
 * flight: the browser owns that subtree, and replacing it would take the caret
 * with it. The document underneath still moves — Studio applies the op and
 * echoes the result — so every position after the edit shifts, and a stamp
 * that still says what it said before the operator typed would send the next
 * selection report to the wrong place in the document.
 *
 * Returns false, changing nothing, when the rendered tree and the document
 * disagree on the number or the order of node elements — a node the sanitiser
 * dropped, or a structural change that arrived while deferred. The caller must
 * then fall back to a full re-render, which is the only honest answer: the
 * stamps cannot describe a tree that is not the document's.
 */
export function restampRichTextPositions(root: Element, doc: unknown): boolean {
  const expected = computeRichTextPositions(doc).nodes.filter((node) => node.type !== 'text');
  // querySelectorAll returns document order, which is the order
  // `computeRichTextPositions` walks in.
  const rendered = root.querySelectorAll(`[${NODE_ATTR}][${POS_ATTR}]`);
  if (rendered.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (rendered[index]!.getAttribute(NODE_ATTR) !== expected[index]!.type) return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    rendered[index]!.setAttribute(POS_ATTR, String(expected[index]!.pos));
  }
  return true;
}

/**
 * The marks and the block a DOM point sits in, read off the rendered tree —
 * enough for the toolbar's active state, and it needs no schema on the theme
 * side. Marks come from the ancestor mark elements innermost first (the order
 * a text node's own `marks` array is applied in); the block is the nearest
 * stamped node element.
 *
 * Pass the **caret's own node** — `Selection.focusNode`, which is the text
 * node the caret sits in. Passing a block element instead answers for that
 * element's own ancestry, so a caret inside `<strong>` reported as its parent
 * `<p>` would come back with no marks at all and the toolbar would show bold
 * as inactive while the operator is typing in bold.
 */
export function describeSelectionContext(root: Element, node: Node): RichTextSelectionContext {
  const marks: string[] = [];
  if (!contains(root, node)) return { marks, block: null };
  let current: Node | null = isElement(node) ? node : node.parentNode;
  while (isElement(current) && current !== root) {
    if (isNodeElement(current)) {
      return { marks, block: blockOf(current) };
    }
    const mark = richTextMarkNameOf(current);
    if (mark !== null && !marks.includes(mark)) marks.push(mark);
    current = current.parentNode;
  }
  return { marks, block: null };
}

/**
 * The mark an ancestor element stands for, or null when it is not a mark.
 * Exported because `RICH_TEXT_MARK_ELEMENTS` alone is misleading: three of its
 * entries are conditional — a `span` is `textStyle` only with an inline
 * `style`, an `a` splits by `data-file-attachment`, and a `code` directly
 * inside a `codeBlock`'s `pre` is part of that node rather than an inline
 * `code` mark. Anyone classifying an element must come through here.
 */
export function richTextMarkNameOf(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag === 'span') return element.hasAttribute('style') ? 'textStyle' : null;
  if (tag === 'a') return element.hasAttribute('data-file-attachment') ? 'fileAttachment' : 'link';
  if (tag === 'code') {
    // `pre > code` is how a codeBlock renders: the `code` there is part of the
    // node, not an inline `code` mark, and ProseMirror carries no mark on that
    // text either.
    const parent = element.parentElement;
    if (parent !== null && parent.getAttribute(NODE_ATTR) === 'codeBlock') return null;
    return 'code';
  }
  return RICH_TEXT_MARK_ELEMENTS[tag] ?? null;
}

/**
 * The block descriptor for a stamped node element. `attrs` carries only what
 * the toolbar needs and the DOM actually preserves: a heading's level and a
 * code block's language. Everything else is omitted rather than guessed.
 */
function blockOf(element: Element): { type: string; attrs?: Record<string, unknown> } {
  const type = element.getAttribute(NODE_ATTR) ?? '';
  if (type === 'heading') {
    const level = Number(element.tagName.slice(1));
    if (Number.isInteger(level) && level >= 1 && level <= 6) return { type, attrs: { level } };
    return { type };
  }
  if (type === 'codeBlock') {
    const code = element.querySelector('code');
    const className = code?.getAttribute('class') ?? '';
    const match = /(?:^|\s)language-(\S+)/.exec(className);
    // The class comes from the rendered DOM, which a theme's own CSS or a
    // malformed document can widen; the toolbar only ever needs a short token.
    if (match !== null && match[1]!.length <= 64) return { type, attrs: { language: match[1] } };
    return { type };
  }
  return { type };
}
