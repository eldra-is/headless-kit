# @eldrajs/vue

Vue 3 components for an Eldra storefront: the `RichText` renderer for CMS rich text, and
`EldraImage` for responsive images from Eldra media.

```bash
pnpm add @eldrajs/vue @eldrajs/rich-text @eldrajs/sdk
```

```vue
<script setup lang="ts">
import { RichText } from '@eldrajs/vue';
</script>

<template>
  <RichText :content="entry.data.body" as="article" />
</template>
```

The defaults are plain semantic HTML with no classes, so with a CSS reset the output looks flat
until you style it. Override per node and per mark:

```vue
<RichText
  :content="body"
  :nodes="{
    paragraph: { class: 'prose-p' },
    heading: MyHeading, // a component receiving `node` and `attrs`
    codeBlock: null, // children only, no wrapper
  }"
  :marks="{ bold: 'b', link: { class: 'link' } }"
/>
```

`undefined` keeps the default, a string is a tag, `{ tag?, class?, style? }` styles the default or
a given tag, `null` renders children only, and a component replaces the renderer.

`TextRenderer` renders the plain text of a document, optionally truncated by word count.

`scrollTransitions` forwards its value to a `reveal` directive if your app registered one; without
one it does nothing.

## Images

```vue
<EldraImage
  :src="product.thumbnail"
  :alt="product.thumbnail?.altText || product.title"
  sizes="(min-width: 1024px) 25vw, 50vw"
  :aspect-ratio="4 / 5"
/>
```

It renders an `<img>` with a `srcset` over the sizes the media host serves, the `sizes` you give,
and `width`/`height` from the aspect ratio so the page does not jump when it loads. Lazy by
default; pass `loading="eager"` and `fetchpriority="high"` for the hero. An image from another host
renders as given, under the same source rule as `RichText` below. Images inside `RichText` get the same `srcset`. See
[docs/images.md](../../docs/images.md).

## What is refused

Link hrefs outside `http`, `https`, `mailto`, `tel` and relative paths render without an href;
images outside `http`, `https`, `data:image/` and relative paths do not render; an embed renders
only from a host the editor's own normaliser emits. The same rules as `toHtml` in
`@eldrajs/rich-text`.
