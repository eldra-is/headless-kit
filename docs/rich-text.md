# Rich text

A CMS rich text field is a TipTap (ProseMirror) JSON document: a tree of nodes, where text nodes
carry marks. `@eldrajs/rich-text` knows the shape and renders it; `@eldrajs/vue` wraps that as a
component.

## In Vue

```vue
<script setup lang="ts">
import { RichText } from '@eldrajs/vue';
</script>

<template>
  <RichText :content="entry.data.body" as="article" />
</template>
```

## Anywhere else

```ts
import { toHtml } from '@eldrajs/rich-text';
const html = toHtml(entry.data.body);
```

The output is safe to place in the page: text and attributes are escaped, link and image URLs are
limited to safe schemes, and an embed renders only from a source the editor could have produced.

## Overrides

Both share the same override semantics, keyed by node type (`paragraph`, `heading`, `image`, …)
and mark type (`bold`, `link`, …):

| Override                                                      | Effect                                  |
| ------------------------------------------------------------- | --------------------------------------- |
| omitted                                                       | the default renderer                    |
| `'div'`                                                       | that tag, nothing else                  |
| `{ class: 'lead' }`                                           | the default tag with class and/or style |
| `{ tag: 'aside', class: 'callout' }`                          | that tag with class and/or style        |
| `null`                                                        | children only, no wrapper               |
| a component (Vue) or `(node, children, ctx) => string` (HTML) | your renderer                           |

A Vue component override receives `node` and `attrs` (`mark` and `attrs` for a mark) and renders
its children through the default slot. An HTML function receives the node, its already-rendered
children, and a context with `render`, `escape` and `element`.

Unknown node types render their children with no wrapper, and warn once in development. That is
what lets a storefront ignore a node it does not care about, and what an override of that type
hooks into.

## Defaults

Nodes: `paragraph`, `heading` (`level` 1–6, else `h2`), `blockquote`, `bulletList`, `orderedList`
(`start`), `listItem`, `horizontalRule`, `hardBreak`, `codeBlock` (`language` → `class`),
`table` (leading all-header rows go to `<thead>`), `tableRow`, `tableHeader`, `tableCell`, `image`
(`src`, `alt`, `title`, `assetId` → `data-asset-id`, lazy), `embed`.

Marks: `bold`, `italic`, `strike`, `underline`, `code`, `highlight`, `textStyle` (`color`),
`link` (`href`, `target`, `rel`; external links get `noopener noreferrer` unless `rel` is set).

The defaults carry no classes. With a CSS reset the result is flat until you add prose styles or
overrides — that is deliberate; the renderer has no opinion about your typography.

## Embeds

The editor normalises a pasted URL or iframe snippet into `{ provider, render, src, width, height,
title, allow, variant }` — `normalizeEmbedInput` in `@eldrajs/rich-text` is that function. Iframe
providers (YouTube, Vimeo, Spotify, …) render as an iframe. Script providers (X, Instagram,
Pinterest) need the provider's own script: the Vue component loads it once and hands the element
to it; `toHtml` renders a link to the original instead, since static HTML cannot hydrate a widget.

An embed whose `src` host is not one the normaliser emits (`EMBED_SOURCE_HOSTS`) is not rendered
at all.
