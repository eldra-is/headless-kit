/**
 * Pure TipTap-JSON heading-level floor for the `rich-text` block (spec `02-blocks.md` "Rich
 * text" line 2470: "In Article the body starts at h2. In Rich text it starts at h3. No h1 in
 * rich text."; Keyboard & accessibility, line 3002: "Headings inside the body start at h3.").
 *
 * `EldraRichText` (`@eldrajs/theme-vue`) renders whatever `level` a `heading` node's TipTap
 * `attrs` carries, clamped only to the generic 1-6 range (`clampHeadingLevel`,
 * `@eldrajs/theme-core`'s `richTextTree.ts`) — there is no `headingOffset`/`minHeadingLevel`-style
 * prop on the component, and `metadata.toolbar`'s `heading` control id is a single, level-agnostic
 * entry (`RICH_TEXT_TOOLBAR_CONTROLS`), so nothing in `block.json` can restrict which level an
 * editor inserts. Enforcing "starts at h3" is therefore this block's own job, done here on the
 * TipTap document itself before it ever reaches `EldraRichText` — never on rendered HTML.
 *
 * `floorRichTextHeadingLevels` walks the doc and raises every `heading` node's `attrs.level` to at
 * least `RICH_TEXT_MIN_HEADING_LEVEL` (a floor, not an offset: an author who already wrote h3/h4
 * keeps those levels unchanged, matching the block's own toolbar, which only ever inserts h3/h4
 * anyway — this only guards content carried over from elsewhere, e.g. a future paste/import path).
 * Every node reached is shallow-copied on the way down, so the input `doc` (`data.body`, Vue
 * reactive state) is never mutated — the function returns a new tree structurally sharing only the
 * parts that needed no change (marks, attrs on non-heading nodes, leaf text nodes).
 *
 * A `minHeadingLevel` prop on `EldraRichText` itself would be the better long-term home for this
 * (tracked as a package follow-up) — this module is the shipped, block-side stand-in.
 */
import type { RichTextNode } from '@eldrajs/theme-vue';

export type { RichTextNode as RichTextJsonNode };

export const RICH_TEXT_MIN_HEADING_LEVEL = 3;
export const RICH_TEXT_MAX_HEADING_LEVEL = 6;

function floorLevel(level: number): number {
  return Math.min(RICH_TEXT_MAX_HEADING_LEVEL, Math.max(RICH_TEXT_MIN_HEADING_LEVEL, level));
}

function mapNode(node: RichTextNode): RichTextNode {
  const mapped: RichTextNode = { ...node };

  if (mapped.type === 'heading' && typeof mapped.attrs?.level === 'number') {
    const level = floorLevel(mapped.attrs.level);
    if (level !== mapped.attrs.level) {
      mapped.attrs = { ...mapped.attrs, level };
    }
  }

  if (Array.isArray(mapped.content)) {
    mapped.content = mapped.content.map(mapNode);
  }

  return mapped;
}

/**
 * Returns a new document with every `heading` node's level floored at `RICH_TEXT_MIN_HEADING_LEVEL`
 * (3) and capped at `RICH_TEXT_MAX_HEADING_LEVEL` (6, the same ceiling `clampHeadingLevel` already
 * applies). `doc` is never mutated. `null`/`undefined` (an unset field) pass straight through —
 * `Block.vue`'s own `hasBody` check handles emptiness separately.
 */
export function floorRichTextHeadingLevels<T extends RichTextNode | null | undefined>(doc: T): T {
  if (doc === null || doc === undefined) return doc;
  return mapNode(doc) as T;
}
