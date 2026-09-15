# @eldra-is/vue

Vue 3 components for an Eldra storefront. Today: the `RichText` renderer for CMS rich text.

```bash
pnpm add @eldra-is/vue @eldra-is/rich-text
```

```vue
<script setup lang="ts">
import { RichText } from '@eldra-is/vue';
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

## What is refused

Link hrefs outside `http`, `https`, `mailto`, `tel` and relative paths render without an href;
images outside `http`, `https`, `data:image/` and relative paths do not render; an embed renders
only from a host the editor's own normaliser emits. The same rules as `toHtml` in
`@eldra-is/rich-text`.
