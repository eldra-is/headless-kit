import type { RichTextDocument, RichTextNode } from './types';

/**
 * Writes a `price` node's attributes in the shopper's currency, or answers `null` when it cannot.
 * A theme binds `@eldrajs/sdk/tokens`' `resolvePriceNode` to its currency, regional locale and
 * money formatter; this package imports nothing, so the resolver is always the caller's.
 */
export type PriceResolver = (attrs: unknown) => string | null;

/** The nodes a price can sit in directly: dropping one drops the sentence-sized unit. */
const TEXTBLOCKS = new Set(['paragraph', 'heading']);

/**
 * The document with every `price` node (a price token in rich text, WS-1474) written out as text in
 * the shopper's currency, carrying the node's own marks. A paragraph or heading holding a price that
 * cannot be written is left out whole: a missing amount reads as a shorter text, never as a sentence
 * with a hole in it, and never as another currency's amount.
 *
 * Without a resolver no price resolves. The input is never modified; a document with no `price`
 * node comes back as the same object.
 */
export function resolvePrices(
  content: RichTextDocument | null | undefined,
  resolve?: PriceResolver | null
): RichTextDocument | null | undefined {
  if (!content || !holdsPrice(content)) return content;
  return transform(content, resolve ?? null) ?? undefined;
}

function holdsPrice(node: RichTextNode): boolean {
  return node.type === 'price' || (node.content ?? []).some(holdsPrice);
}

/** The node with its prices written, or `null` when it is a price or a block to leave out. */
function transform(node: RichTextNode, resolve: PriceResolver | null): RichTextNode | null {
  if (node.type === 'price') {
    const text = resolve?.(node.attrs) ?? null;
    if (text === null) return null;
    return node.marks ? { type: 'text', text, marks: node.marks } : { type: 'text', text };
  }
  if (!node.content) return node;
  if (typeof node.type === 'string' && TEXTBLOCKS.has(node.type)) {
    const children: RichTextNode[] = [];
    for (const child of node.content) {
      const written = transform(child, resolve);
      if (written === null) return null;
      children.push(written);
    }
    return { ...node, content: children };
  }
  const children: RichTextNode[] = [];
  for (const child of node.content) {
    const written = transform(child, resolve);
    if (written !== null) children.push(written);
  }
  return { ...node, content: children };
}
