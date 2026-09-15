# @eldra-is/rich-text

Framework-free handling of the rich text the Eldra CMS delivers: a TipTap (ProseMirror) JSON
document. Render it to an HTML string, extract its plain text, or build a renderer for your own
framework on top of the types and helpers.

```bash
pnpm add @eldra-is/rich-text
```

## Render to HTML

```ts
import { toHtml } from '@eldra-is/rich-text';

const html = toHtml(entry.data.body);
```

Every text node and attribute value is escaped. Link hrefs are limited to `http`, `https`,
`mailto`, `tel` and relative paths; image sources to `http`, `https`, `data:image/` and relative
paths; an embed renders only from a host the editor's own normaliser can emit. A `script`-mode
embed (X, Instagram, Pinterest) becomes a link card — static HTML cannot run a provider's widget
script, and this package never emits one.

The output is deliberately plain: `<p>`, `<h2>`, `<ul>`, `<table>` with `<thead>`/`<tbody>`, and so
on, with no classes. Style it with your own prose styles, or override:

```ts
toHtml(doc, {
  nodes: {
    paragraph: { class: 'lead' },
    heading: (node, children, { element }) =>
      element(`h${node.attrs?.level ?? 2}`, { class: 'display' }, children),
    codeBlock: null, // children only, no <pre>
  },
  marks: { bold: 'b' },
});
```

An override is a tag name, `{ tag?, class?, style? }`, `null` for children only, or a function
`(node, children, context) => string`. `children` is already rendered and escaped.

## Plain text

```ts
import { renderTipTapText } from '@eldra-is/rich-text';

const { text, truncated } = renderTipTapText(doc, { wordCount: 30 });
```

## Building a framework renderer

The Vue renderer in `@eldra-is/vue` is built on this package: `RichTextDocument` and friends for
the shape, `resolveOverride` for the override semantics, `safeHref` / `safeImageSrc` /
`isTrustedEmbedSource` for the same safety rules, and `normalizeEmbedInput` for embeds. A React or
Svelte renderer would use exactly the same pieces. The contract a wrapper has to satisfy is written
in [docs/frameworks.md](../../docs/frameworks.md) — a wrapper for another framework is welcome.
