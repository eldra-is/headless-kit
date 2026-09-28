// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import {
  decodeStega,
  encodeEntryDataStega,
  registerBlockFields,
  type BlockFieldsMap,
} from '@eldrajs/theme-core';
import manifest from '../.eldra/manifest.json';
import { mountOptions } from './support/mountBlock';

/**
 * Inline editing in Studio's preview works because every text field's value
 * carries an invisible payload (a U+FEFF-delimited run of zero-width
 * characters naming the entry and the field path). The preview overlay walks
 * the rendered DOM, decodes that run, wraps the text node it sits in as
 * `[data-eldra-field]` and makes it editable. A block that renders a
 * *derived* string instead of the value it was given destroys the payload,
 * and the field silently stops being editable on the real site — nothing
 * fails, nothing warns, the text simply cannot be clicked.
 *
 * So: every block is mounted with a stega-encoded copy of its own
 * `mock.json`, and every string field the block actually renders must still
 * carry a decodable run naming its own field path, in a text node whose
 * cleaned text contains the value verbatim.
 *
 * What a block may and may not do with a text value:
 *   - `value.trim()` is fine — `@eldrajs/theme-core`'s decoder tolerates a
 *     closing delimiter that `trim()` ate (U+FEFF counts as whitespace).
 *   - `.replace(/\s+/g, ' ')` is not: `\s` matches U+FEFF, so the run is
 *     rewritten into spaces.
 *   - `.toUpperCase()`, `.slice()`, `.split(' ')[0]`, hashing, and composing
 *     the value into a bigger template literal are not: the run is dropped,
 *     moved out of its own text node, or left decorating text the visitor
 *     never sees.
 * Deriving an emptiness check or a storage key from `stripStega(value)` is
 * fine — that copy is never what gets rendered.
 *
 * Out of scope here: rich-text documents. A rich-text root renders through
 * `@eldrajs/vue`'s renderer, which strips the payload and manages its own
 * editing surface (the overlay skips `[data-eldra-rich-text]` for the same
 * reason), so its text leaves are not overlay-decorated fields.
 */

const blockModules = import.meta.glob<{ default: Component }>('../blocks/*/Block.vue', {
  eager: true,
});
const mockModules = import.meta.glob<{ default: Record<string, unknown> }>(
  '../blocks/*/mock.json',
  { eager: true }
);

/**
 * The same registration `@eldrajs/theme-nuxt`'s runtime plugin does from
 * `virtual:eldra/block-fields` on a real page. It is what lets
 * `encodeEntryDataStega` leave a `select` field's value alone: that string is
 * compared with `===` inside a `Block.vue`, never rendered as editable text.
 */
registerBlockFields(
  Object.fromEntries(
    manifest.blocks.map((block) => [block.apiId, block.fields])
  ) as unknown as BlockFieldsMap
);

const blocks = Object.entries(blockModules)
  .map(([path, module]) => {
    const apiId = path.split('/')[2]!;
    return [apiId, module.default, mockModules[`../blocks/${apiId}/mock.json`]!.default] as const;
  })
  .sort(([a], [b]) => a.localeCompare(b));

interface TextField {
  path: string;
  value: string;
}

/** A rich-text document, which the overlay leaves to the rich-text renderer. */
function isRichTextRoot(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === 'doc' &&
    Array.isArray((value as Record<string, unknown>).content)
  );
}

/**
 * Every encoded string leaf of the encoded entry data, by field path. A leaf
 * that came back without metadata was deliberately not encoded (a registered
 * `select` value, a media asset's URL, a catalog reference's slug) and is not
 * an editable text field.
 */
function encodedTextFields(value: unknown, out: TextField[] = []): TextField[] {
  if (typeof value === 'string') {
    const { cleaned, meta } = decodeStega(value);
    if (meta !== null && cleaned.trim() !== '') out.push({ path: meta.fieldPath, value: cleaned });
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) encodedTextFields(item, out);
    return out;
  }
  if (typeof value === 'object' && value !== null) {
    if (isRichTextRoot(value)) return out;
    for (const child of Object.values(value)) encodedTextFields(child, out);
  }
  return out;
}

/**
 * The text a visitor actually reads, as text nodes. `<script>` (a block's
 * JSON-LD) and `<style>` carry text content that is never rendered and that
 * the overlay never walks, so they are not part of it.
 */
function visibleTextNodes(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('script, style') === null
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  return nodes;
}

/**
 * The field paths the preview overlay would find in this DOM, mapped to the
 * cleaned text of the node each run sits in. Mirrors the overlay's own walk:
 * one decode per text node, so a node carrying two runs (a template literal
 * that composed two fields) only ever yields the first — which is exactly the
 * field that stays editable on the real site.
 */
function decorableFields(nodes: Text[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const node of nodes) {
    const { cleaned, meta } = decodeStega(node.data);
    if (meta === null) continue;
    const texts = found.get(meta.fieldPath);
    if (texts === undefined) found.set(meta.fieldPath, [cleaned]);
    else texts.push(cleaned);
  }
  return found;
}

/**
 * The rendered text that no field's payload accounts for: every text node,
 * cleaned, with the value of the field whose run that node carries taken out
 * of it once.
 *
 * Subtracting it is what keeps the gate from blaming the wrong field. Values
 * overlap — a testimonial's `meta` line quotes its `productLabel`, a
 * `highlightedPlan` names one of the plans — so "this string is on the page"
 * on its own says nothing about which field put it there. What is left after
 * the subtraction is text that arrived without a payload, which is the thing
 * this gate is looking for; and because only the carried field's own value is
 * removed, a node that composed two fields into one string still leaves the
 * second one exposed.
 */
function unaccountedText(nodes: Text[], valueOf: Map<string, string>): string {
  return nodes
    .map((node) => {
      const { cleaned, meta } = decodeStega(node.data);
      const value = meta === null ? undefined : valueOf.get(meta.fieldPath);
      if (value === undefined) return cleaned;
      const at = cleaned.indexOf(value);
      return at === -1 ? cleaned : cleaned.slice(0, at) + cleaned.slice(at + value.length);
    })
    .join('\n');
}

describe('every text field a block renders stays inline-editable', () => {
  it('covers every block the manifest declares', () => {
    expect(blocks.map(([apiId]) => apiId)).toEqual(
      manifest.blocks.map((block) => block.apiId).sort((a, b) => a.localeCompare(b))
    );
  });

  it.each(blocks)(
    '%s keeps the editing payload on every field it renders',
    async (apiId, Block, mock) => {
      const entryId = `${apiId}-stega`;
      const data = encodeEntryDataStega(entryId, mock, null, apiId);
      const wrapper = mount(Block, mountOptions({ entry: { id: entryId, data } }));
      await flushPromises();

      const nodes = visibleTextNodes(wrapper.element);
      const fields = encodedTextFields(data);
      const decorable = decorableFields(nodes);
      const unaccounted = unaccountedText(
        nodes,
        new Map(fields.map((field) => [field.path, field.value]))
      );
      const broken: string[] = [];

      for (const field of fields) {
        const runs = decorable.get(field.path);
        // Neither the value nor its payload reached the DOM: the block does not
        // render this field as text (a URL, an icon name, an `alt`), so there is
        // nothing for the overlay to decorate and nothing to assert.
        if (runs === undefined && !unaccounted.includes(field.value)) continue;
        if (runs === undefined) {
          broken.push(
            `${field.path}: rendered as text but its editing payload is gone — ` +
              `render the value as it was given (${JSON.stringify(field.value)})`
          );
          continue;
        }
        if (!runs.some((text) => text.includes(field.value))) {
          broken.push(
            `${field.path}: the payload survived but the text around it was rewritten — ` +
              `expected a text node containing ${JSON.stringify(field.value)}, got ` +
              runs.map((text) => JSON.stringify(text)).join(', ')
          );
        }
      }

      expect(broken, `${apiId} destroys the editing payload of:\n  ${broken.join('\n  ')}`).toEqual(
        []
      );
    }
  );
});
