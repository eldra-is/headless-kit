# Rendering rich text in another framework

`@eldrajs/vue` is one wrapper over `@eldrajs/rich-text`. A React, Svelte or Solid wrapper is
welcome, and this is the contract it has to satisfy so that a document renders the same wherever
it lands. If you write one, open a pull request — it lands as `@eldrajs/<framework>` in this
repository.

## What the core gives you

- `RichTextDocument`, `RichTextNode`, `RichTextMark` — the shape. A document is a node of type
  `doc`; a `text` node has `text` and optional `marks`; every other node may have `attrs` and
  `content`.
- `resolveOverride(override, defaultComponent)` — the override semantics. Given the consumer's
  override for a type and your default component, it returns `{ is, class?, style? }` or `null`
  for "children only". Do not reimplement the rules; use it.
- `safeHref`, `safeImageSrc`, `safeCssColor`, `isTrustedEmbedSource` — the safety rules. Use them
  in exactly the places the Vue defaults do: the link's `href`, the image's `src`, `textStyle`'s
  colour, the embed's `src`.
- `normalizeEmbedInput`, `EMBED_SOURCE_HOSTS` — embeds.
- `extractTipTapText`, `renderTipTapText` — plain text.
- `toHtml` — if your framework can take an HTML string, you may not need a wrapper at all.

## What a wrapper must do

1. **Walk the tree** the way `RenderNode` does: a `text` node renders its text wrapped in its marks
   with `marks[0]` outermost; any other node resolves an override or default for its `type` and
   renders `content` inside it; an unknown type with no override renders its children with no
   wrapper.
2. **Pass `node` and `attrs`** to a node component, `mark` and `attrs` to a mark component, and
   the rendered children as the component's children.
3. **Implement the same defaults** with the same output — the list in [rich-text.md](./rich-text.md).
   The Vue components under `packages/vue/src/rich-text/defaults/` are the reference; each is a
   few lines.
4. **Apply the safety rules** through the core helpers, not your own.
5. **Split tables** into `<thead>` for the leading rows made only of `tableHeader` cells and
   `<tbody>` for the rest.
6. **Embeds:** iframe mode renders the iframe with `loading="lazy"` and
   `referrerpolicy="strict-origin-when-cross-origin"`, sized from `width`/`height`, and may accept
   posted height messages only from `https://embed.reddit.com`; script mode loads the provider
   script once per page and calls its hydrate hook, or renders a link to the original.
7. **Warn once per unknown node type** in development, and never in production.

## What a wrapper must not do

- Import anything from `@eldrajs/vue` or from the private UI library.
- Emit consumer-supplied HTML verbatim, anywhere.
- Add a dependency for animation, styling or icons. The Vue wrapper has none; a `reveal` directive
  is looked up from the host app if it registered one.

## Tests to port

`packages/vue/src/rich-text/__tests__/RichText.spec.ts` is the behavioural spec: defaults,
each override kind, `null`, unknown nodes, tables, embeds, and the safety cases (a `javascript:`
href, a `javascript:` image, an embed from an unknown host). Port it; a wrapper is done when the
same assertions pass.
