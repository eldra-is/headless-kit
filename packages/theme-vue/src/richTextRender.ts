import { h, type VNodeChild } from 'vue';
import {
  buildRichTextTree,
  type BuildRichTextTreeOptions,
  type RichTextRenderChild,
  type RichTextRenderNode,
} from '@eldrajs/theme-core';

/**
 * Vue binding for theme-core's framework-neutral rich-text render tree. Every
 * node/mark rule, the `safeHref` gating and the attribute whitelist live in
 * `buildRichTextTree`; this file only maps the resulting tree onto `h()` and
 * supplies the vnode keys Vue wants (the tree itself carries none — keys are
 * a framework concern).
 */
export type RenderRichTextOptions = BuildRichTextTreeOptions;
export type { RichTextMark, RichTextNode } from '@eldrajs/theme-core';

/**
 * Render a TipTap JSON document's content as Vue VNodes. Non-doc input renders
 * as an empty root.
 *
 * `generation` changes the key prefix, which makes Vue discard the subtree and
 * build it again instead of patching. §18 v3's deferred rendering needs that
 * exactly once per deferral: while a field is deferred the browser edits the
 * DOM behind Vue's back, so the vnode tree Vue is holding no longer describes
 * what is on screen, and an ordinary patch can skip a change it believes is
 * already applied. Generation 0 keeps the original keys, so nothing about the
 * ordinary render path changes.
 */
export function renderRichTextDoc(
  doc: unknown,
  options: RenderRichTextOptions,
  generation = 0
): VNodeChild[] {
  return mapChildren(buildRichTextTree(doc, options), generation === 0 ? 'rt' : `rt${generation}`);
}

function mapChildren(children: RichTextRenderChild[], key: string): VNodeChild[] {
  return children.map((child, index) =>
    typeof child === 'string' ? child : mapNode(child, `${key}-${index}`)
  );
}

function mapNode(node: RichTextRenderNode, key: string): VNodeChild {
  // Void elements (hr, br, img) must not be handed a children array.
  if (node.children.length === 0) return h(node.tag, { key, ...node.attrs });
  return h(node.tag, { key, ...node.attrs }, mapChildren(node.children, key));
}
