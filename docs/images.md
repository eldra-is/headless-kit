# Images

Every image the API gives you — a product's `thumbnail`, its `mediaLinks`, a collection's `image`,
a cart line's `thumbnail`, a CMS media field, an image inside rich text — is a bare media URL:

```text
https://media.eldra.app/public/{organisationId}/assets/{assetId}
```

That URL serves a copy **800 pixels wide**. Render it as-is and a full-width banner is 800 px
stretched across a 1440 px screen, twice that on a high-density one, and it looks soft. The media
host serves other sizes from the same URL, and the kit builds the `srcset` that lets the browser
pick one.

## The variants

Append a variant to the asset URL:

| Variant    | URL                      | Width at most                 |
| ---------- | ------------------------ | ----------------------------- |
| `sm`       | `…/assets/{id}/sm`       | 400 px                        |
| `md`       | `…/assets/{id}/md`       | 800 px (what the bare URL is) |
| `lg`       | `…/assets/{id}/lg`       | 1200 px                       |
| `xl`       | `…/assets/{id}/xl`       | 1920 px                       |
| `full`     | `…/assets/{id}/full`     | 2560 px                       |
| `original` | `…/assets/{id}/original` | the uploaded file, untouched  |

- **Width only, never cropped or enlarged.** A variant is the original scaled down to that width,
  keeping its proportions. An original narrower than the variant comes back at its own width, so a
  1000 px upload is 1000 px at `lg`, `xl` and `full` alike. Crop in CSS with `object-fit`.
- **The format is negotiated.** A browser that accepts AVIF or WebP gets one of them, any other
  client gets JPEG (PNG when the original can be transparent). You do not choose the format and
  you do not need `<picture>` for it.
- **Not every file is resized.** SVG, GIF and anything that is not a JPEG, PNG, WebP, AVIF or HEIC
  photo is served as uploaded whatever the variant.
- Responses are public, cacheable for 30 days, and allowed from any origin.

The widths are exported as `ELDRA_IMAGE_VARIANT_WIDTHS`.

## In Vue

`@eldrajs/vue` has a component that does all of it:

```vue
<script setup lang="ts">
import { EldraImage } from '@eldrajs/vue';
</script>

<template>
  <EldraImage
    :src="product.thumbnail"
    :alt="product.thumbnail?.altText || product.title"
    sizes="(min-width: 1024px) 25vw, 50vw"
    :aspect-ratio="4 / 5"
    class="h-full w-full object-cover"
  />
</template>
```

| Prop             | Default  | What it does                                                                                  |
| ---------------- | -------- | --------------------------------------------------------------------------------------------- |
| `src`            | required | The URL, or the object carrying it (`thumbnail`, a `mediaLinks` item, …)                      |
| `alt`            | required | Alternative text; `''` for a purely decorative image                                          |
| `sizes`          | required | How wide the image is drawn — see [choosing `sizes`](#choosing-sizes)                         |
| `aspectRatio`    | —        | Width ÷ height of the box, to reserve its space — see [layout shift](#reserving-the-space)    |
| `width`/`height` | —        | Explicit attributes instead of `aspectRatio`                                                  |
| `variant`        | `md`     | The variant in `src`, for the rare browser that ignores `srcset`                              |
| `originalWidth`  | —        | The original's pixel width, when you know it — see [below](#when-you-know-the-original-width) |
| `loading`        | `lazy`   | `eager` for an image above the fold                                                           |

Anything else — `class`, `style`, `fetchpriority` — goes onto the `<img>`. It renders nothing when
there is no URL or the URL is not `http`, `https`, `data:image/` or relative (the rule `RichText`
applies to images), and renders an external image (one not on Eldra's media host) as given, without
`srcset`.

## In any framework

`responsiveImage` from `@eldrajs/sdk` returns the attributes; spread them onto the tag:

```ts
import { responsiveImage } from '@eldrajs/sdk';

const image = responsiveImage(product.thumbnail, {
  sizes: '(min-width: 1024px) 25vw, 50vw',
  aspectRatio: 4 / 5,
});
// { src: '…/md', srcset: '…/sm 400w, …/md 800w, …/lg 1200w, …/xl 1920w, …/full 2560w',
//   sizes: '(min-width: 1024px) 25vw, 50vw', width: 800, height: 1000 }
```

```tsx
// React, Solid, Preact
{
  image && <img {...image} alt={product.title} loading="lazy" decoding="async" />;
}
```

```svelte
{#if image}<img {...image} alt={product.title} loading="lazy" decoding="async" />{/if}
```

It returns `undefined` when there is no URL, and only `src` (plus `width`/`height`) for an image it
cannot resize. A framework-free renderer is in
[examples/node-script/images.ts](../examples/node-script/images.ts).

The pieces are exported on their own too:

| Function                           | Returns                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| `imageSrcset(source, options?)`    | The `srcset` string, or `undefined` for an image it cannot resize |
| `imageUrl(source, variant)`        | One variant's URL; any other URL unchanged                        |
| `imageVariantFor(width, density?)` | The narrowest variant at least `width × density` pixels wide      |
| `isEldraImage(source)`             | Whether the source is a resizable Eldra asset                     |

## Choosing `sizes`

`srcset` lists what exists; `sizes` tells the browser how wide the image will be drawn, before it
has laid out the page. The browser multiplies that by the screen's pixel density and fetches the
narrowest variant that covers it. Without `sizes` it assumes the full viewport width, which is
right for a banner and wasteful for a grid.

Describe your layout, widest breakpoint first:

| Layout                                         | `sizes`                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Full-width banner                              | `100vw`                                                     |
| Product grid, 4 across on desktop, 2 on phones | `(min-width: 1024px) 25vw, 50vw`                            |
| Grid inside a 1280 px container                | `(min-width: 1280px) 320px, (min-width: 1024px) 25vw, 50vw` |
| Product page gallery, half the page on desktop | `(min-width: 1024px) 50vw, 100vw`                           |
| Cart line thumbnail, always 96 px              | `96px`                                                      |

It does not have to be exact — being a little generous costs a few kilobytes; too small looks
soft. Two things catch people out:

- **`object-fit: cover` can draw the image wider than its box.** A 16:9 photo in a square mobile
  hero is drawn at the box's height, so about 1.8 times the viewport wide. Say so in `sizes`
  (`(max-width: 639px) 178vw, 100vw`) or the browser picks a variant that is too small.
- **Give the image a CSS width.** The descriptors in `srcset` are each variant's _maximum_ width.
  An image without a CSS width is drawn at its natural size, which the browser works out from
  those descriptors, and is wrong for an original narrower than the variant. `width: 100%` (or a
  fixed box with `object-fit`) avoids it.

## Reserving the space

The API does not return an image's dimensions, so the browser does not know how tall an image is
until it arrives, and the page jumps when it does. Give it the shape of the box instead:
`aspectRatio: 4 / 5` becomes `width="800" height="1000"`. Browsers use those two attributes for the
ratio only, so pair them with CSS that sets the real size:

```css
img {
  width: 100%;
  height: auto;
}
```

or a box of fixed ratio with the image filling it:

```html
<div style="aspect-ratio: 4 / 5">
  <img … style="width: 100%; height: 100%; object-fit: cover" />
</div>
```

When the image fills a box of fixed ratio, the attributes are a fallback and the CSS decides.

## Above the fold

The largest image on the first screen — usually the hero — should load immediately and be fetched
first:

```vue
<EldraImage
  :src="hero.image"
  :alt="hero.image.altText ?? ''"
  sizes="100vw"
  variant="xl"
  :aspect-ratio="16 / 7"
  loading="eager"
  fetchpriority="high"
/>
```

Everything else stays `loading="lazy"`, which is `EldraImage`'s default.

## One URL, no `srcset`

Where only one URL fits — an Open Graph image, a CSS `background-image`, a link to the full-size
file — pick a variant:

```ts
import { imageUrl, imageVariantFor } from '@eldrajs/sdk';

useSeoMeta({ ogImage: imageUrl(product.thumbnail, 'lg') }); // shared cards are about 1200 px
const zoom = imageUrl(image, imageVariantFor(window.innerWidth, devicePixelRatio));
const download = imageUrl(image, 'original');
```

`imageUrl` accepts a URL that already names a variant and switches it, so `imageUrl(url, 'lg')`
never produces `…/md/lg`.

## When you know the original width

A variant wider than the original is the same pixels at another URL. If you know the original's
width — your own hero uploaded at 1856 px, say — pass it and the `srcset` stops there, with the last
entry described at its true width:

```ts
imageSrcset(hero.image, { originalWidth: 1856 });
// '…/sm 400w, …/md 800w, …/lg 1200w, …/xl 1856w'
```

Without it nothing breaks; the browser may just fetch `full` where `xl` was the same picture.

## Rich text

`RichText` from `@eldrajs/vue` adds the `srcset` to images inside CMS rich text, with
`sizes="100vw"` since it cannot know your column width. For a narrower article column, replace the
image node with your own component:

```vue
<RichText :content="body" :nodes="{ image: ArticleImage }" />
```

```vue
<!-- ArticleImage.vue -->
<script setup lang="ts">
import { safeImageSrc } from '@eldrajs/rich-text';
import { EldraImage, type NodeComponentProps } from '@eldrajs/vue';

defineProps<NodeComponentProps>();
</script>

<template>
  <EldraImage
    :src="safeImageSrc(attrs.src)"
    :alt="attrs.alt ?? ''"
    sizes="(min-width: 768px) 720px, 100vw"
  />
</template>
```

`toHtml` in `@eldrajs/rich-text` renders the image with its URL as stored and no `srcset`.

## What is left alone

- **External images** — a URL that is not an Eldra media asset is returned unchanged, with no
  `srcset`, so a merchant's link to another host still renders.
- **Formats the host does not resize** — when the source carries a `contentType` (a `mediaLinks`
  item does) and it is SVG, GIF or a document, the URL is returned unchanged with no `srcset`. A
  bare string has no content type; an SVG passed as one gets a `srcset` whose entries all return
  the same file, which is harmless.
- **No URL** — `null`, `undefined` or an empty string gives `undefined`, and `EldraImage`
  renders nothing.
