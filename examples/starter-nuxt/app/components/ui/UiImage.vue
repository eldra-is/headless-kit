<script setup lang="ts">
/**
 * A thin wrapper over `@eldrajs/ui`'s `Image` (the public media frame: fixed aspect presets,
 * focal-point/zoom cropping, a live "No image" placeholder, a loading skeleton, an optional
 * caption). `Image` itself must not know about Studio's preview-overlay framing contract
 * (`imageFramingAttrs`/`imageFramingStyle`, `entryId`/`fieldPath`) — that package stays standalone
 * of `@eldrajs/theme-vue` — so this component is where the two meet:
 *
 * - `framing` (`@eldrajs/theme-vue`'s `ImageFraming`, `x`/`y` as 0–1 fractions, `zoom` 1–4) maps to
 *   `Image`'s `focal` (0–100 percent) / `zoom` props. `Image` recomputes the `object-position` and
 *   `transform`/`transform-origin` styles itself from those — the exact same clamped-transform-
 *   origin formula `imageFramingStyle` uses (see `Image.vue`'s own `focalBand`/`clampToFocalBand`
 *   comment), so the rendered style is byte-identical to what the old hand-rolled `UiImage`
 *   produced; `test/framing.spec.ts` (block-level, asserting on `Hero`/`Image` blocks' rendered
 *   `<img>`) is the proof and needed no change.
 * - `aspect` (`"16/9"`-style strings the blocks already pass) maps to `Image`'s `ImageRatio` for
 *   the six presets the starter actually uses; anything else falls back to an inline
 *   `aspect-ratio` style on the root, the same escape hatch the old component had.
 * - `entryId`/`fieldPath` still produce `imageFramingAttrs`' `data-eldra-framing*` marker
 *   attributes (the Studio preview overlay's interactive framing controls key off them) — only the
 *   attributes, never that helper's own `style`, which would otherwise land on `Image`'s root
 *   (class/style go there) instead of the media element it describes; `Image` already recomputes
 *   an equivalent style from `focal`/`zoom` above.
 * - `priority`/`sizes` pass straight through.
 *
 * **`rounded`/`fill`/`fit`/`classes` (fix round 1).** `Image`'s attribute-
 * forwarding contract puts a caller's plain `class`/`style` on the **root** — the figure/frame
 * wrapper `Image` clips its content to — not on the `<img>` itself. A block that used to write
 * `class="rounded-lg object-cover"` straight onto a bare `<img>` therefore needs a different way to
 * reach the parts that actually own those concerns now: `frame` (which has `overflow-hidden`, so a
 * radius on it visibly clips) and `media` (which owns `object-fit`). These four props are that way:
 *
 * - **`rounded`** forwards straight to `Image`'s own `rounded` prop (`'none' | 'lg' | 'xl'`,
 *   default `'none'`) — the two presets the design spec's frame radius actually has.
 * - **`fill`** is for a background image that has to cover its positioned ancestor (the hero
 *   `image-background` variant): it sets `ratio="auto"` and adds `absolute inset-0 h-full w-full`
 *   to `classes.root` and `h-full w-full` to `classes.frame`, so the frame's own height tracks its
 *   *positioned ancestor* (via the `inset-0`/`h-full` chain) instead of trying to derive one from
 *   `media`, which this wrapper never has `width`/`height` for. `media`'s own `object-cover`
 *   (`Image`'s default) does the rest.
 * - **`fit`** (`'cover' | 'contain'`, default `'cover'`) — `cover` changes nothing (`Image`'s own
 *   default). `contain` (fix round 2) is for a lightbox-style full view that
 *   must never crop: it is not just `object-contain` on the media, because `Image`'s `frame` is
 *   unconditionally `w-full overflow-hidden` and a `contain`-fit `<img>` under `h-full w-full`
 *   still computes its own box from the frame's full width scaled by its own intrinsic ratio — a
 *   portrait image's scaled height can exceed a `max-h-[85vh]`-style cap on the frame, and the
 *   frame's `overflow-hidden` then **clips** it instead of shrinking it, the opposite of "contain".
 *   So `contain` also shrink-wraps the frame to its content (`classes.frame` gains `w-auto
 *   max-w-full`, on top of any caller frame classes — a height cap like `max-h-[85vh]` composes
 *   fine, different CSS property) and makes the media itself, not just the frame, respect both a
 *   width and a height constraint together (`classes.media` becomes `object-contain h-auto w-auto
 *   max-w-full max-h-[inherit]` — `max-h-[inherit]` reads the *frame's* own `max-height` back onto
 *   the media, so the browser's replaced-element sizing algorithm scales the image down to fit
 *   inside both caps at once, the same thing the original bare `<img class="max-h-[85vh] w-auto
 *   object-contain">` did by being the frame itself).
 * - **`classes`** is `Image`'s own `classes` prop, passed straight through and merged with
 *   whatever `rounded`/`fill`/`fit` above already set (the caller's own value for a part always
 *   wins) — the general escape hatch for a radius `rounded` has no preset for (`rounded-full`,
 *   `rounded-md`) or a frame-level size constraint neither `fill` nor `fit` covers on their own
 *   (the gallery lightbox's `max-h-[85vh]`).
 *
 * `blocks/*` (`hero`, `image`, `gallery`, `feature-grid`, `testimonials`, `navigation`) keep
 * calling this with the same core props they always have (`src`, `alt`, `framing`, `entryId`,
 * `fieldPath`, `aspect`, `sizes`, `priority`); the ones that relied on a `rounded-*`/`object-*`
 * class landing on the `<img>` now use `rounded`/`fill`/`fit`/`classes` instead — see each block's
 * own diff and `docs/starter-kit.md`'s `UiImage` row.
 */
import { computed } from 'vue';
import { Image, cx, type ImagePart, type ImageRatio } from '@eldrajs/ui';
import { imageFramingAttrs, type ImageFraming } from '@eldrajs/theme-vue';

const props = withDefaults(
  defineProps<{
    src: string;
    /** Required; pass an empty string for a purely decorative image. */
    alt: string;
    framing?: ImageFraming | null;
    /** Entry/field the framing belongs to — enables the Studio overlay's
     * interactive framing controls. Omit for images with no CMS entry
     * (e.g. a static logo) to still get plain focal/zoom styling. */
    entryId?: string;
    fieldPath?: string;
    /** `aspect-ratio` value, e.g. `"16/9"`. One of the six presets `Image` supports maps to its
     * `ratio` prop; anything else becomes an inline `aspect-ratio` style on the root. Ignored
     * when `fill` is set. */
    aspect?: string;
    sizes?: string;
    /** Marks an above-the-fold image: `loading="eager"` + `fetchpriority="high"`. */
    priority?: boolean;
    /** Frame corner radius — `Image`'s own `rounded` prop. For a radius it has no preset for
     * (`rounded-full`, `rounded-md`), use `classes.frame` instead. */
    rounded?: 'none' | 'lg' | 'xl';
    /** Fills the nearest positioned ancestor (`absolute inset-0 h-full w-full` on the root,
     * `h-full w-full` on the frame, `ratio="auto"`) instead of reserving its own aspect-ratio box
     * — for a background image behind other content. The ancestor needs `position: relative` (or
     * similar) and a real height of its own for `inset-0`/`h-full` to resolve against. */
    fill?: boolean;
    /** `Image`'s media covers its frame by default (`cover`); `contain` letterboxes instead, for a
     * full, uncropped view (a lightbox). */
    fit?: 'cover' | 'contain';
    /** Passed straight through to `Image`'s own `classes` prop, merged with whatever `rounded`/
     * `fill`/`fit` above already set — the caller's own value for a part always wins. */
    classes?: Partial<Record<ImagePart, string>>;
  }>(),
  {
    framing: null,
    entryId: undefined,
    fieldPath: undefined,
    aspect: undefined,
    sizes: '100vw',
    priority: false,
    rounded: 'none',
    fill: false,
    fit: 'cover',
    classes: undefined,
  }
);

/** The six ratios the starter's blocks actually pass (`feature-grid`/`gallery`/`testimonials`:
 * `"1/1"`; `gallery`: `"4/3"`; `hero`: `"4/3"`/`"16/9"`). */
const ASPECT_TO_RATIO: Record<string, ImageRatio> = {
  '1/1': '1x1',
  '4/3': '4x3',
  '3/2': '3x2',
  '16/9': '16x9',
  '3/4': '3x4',
  '4/5': '4x5',
};

const ratio = computed<ImageRatio>(() => {
  if (props.fill) return 'auto';
  if (!props.aspect) return 'auto';
  return ASPECT_TO_RATIO[props.aspect] ?? 'auto';
});

/** Only for an `aspect` with no matching preset, and never while `fill` is set (which owns the
 * root's sizing entirely) — none of the blocks currently pass one, but this keeps the prop's old
 * "any `w/h` string" contract intact rather than silently ignoring it. */
const rootStyle = computed(() => {
  if (props.fill) return undefined;
  if (props.aspect && !(props.aspect in ASPECT_TO_RATIO)) {
    return { aspectRatio: props.aspect };
  }
  return undefined;
});

const FILL_ROOT_CLASS = 'absolute inset-0 h-full w-full';
const FILL_FRAME_CLASS = 'h-full w-full';

/** `contain`'s frame shrink-wraps to its content instead of the frame's own default `w-full` — see
 * the module doc comment's `fit` entry for why width alone is not enough. */
const CONTAIN_FRAME_CLASS = 'w-auto max-w-full';
/** `max-h-[inherit]` reads the *frame's* own `max-height` (e.g. the lightbox's `max-h-[85vh]`) back
 * onto the media, so a tall image is scaled down to fit both the frame's width and its height cap
 * together, rather than being cropped by the frame's `overflow-hidden` once its width-driven scaled
 * height exceeds that cap. */
const CONTAIN_MEDIA_CLASS = 'object-contain h-auto w-auto max-w-full max-h-[inherit]';

/** `fill`/`fit` set `root`/`frame`/`media` first; the caller's own `classes` prop is merged on top
 * of each (via `cx`, so a real conflict resolves in the caller's favour) rather than replacing it
 * outright, and every other part passes through untouched. */
const mergedClasses = computed<Partial<Record<ImagePart, string>>>(() => {
  const base = props.classes ?? {};
  const result: Partial<Record<ImagePart, string>> = { ...base };
  if (props.fill) {
    result.root = cx(FILL_ROOT_CLASS, base.root);
    result.frame = cx(FILL_FRAME_CLASS, base.frame);
  }
  if (props.fit === 'contain') {
    result.frame = cx(CONTAIN_FRAME_CLASS, result.frame ?? base.frame);
    result.media = cx(CONTAIN_MEDIA_CLASS, base.media);
  }
  return result;
});

/**
 * An empty `src` is "there is no image", not "load the current document as one": `Image` draws its
 * own placeholder (spec "Image" → States, "No image") whenever `media` is falsy, and that branch is
 * unreachable while this always builds an object — which is how a missing image used to render an
 * `<img src="">`. A caller with an optional image (a cart line whose product has no photo) can
 * therefore pass the media through as-is and get the placeholder, decorative or labelled according
 * to `alt` exactly like a real image.
 */
const media = computed(() => (props.src === '' ? null : { src: props.src, alt: props.alt }));

/** `Image`'s own decorative toggle, driven the same way the old component's `role="presentation"`
 * was: an explicitly empty `alt`. */
const decorative = computed(() => props.alt === '');

const focal = computed(() => {
  if (!props.framing) return undefined;
  return { x: props.framing.x * 100, y: props.framing.y * 100 };
});
const zoom = computed(() => props.framing?.zoom);

/** The Studio overlay's marker attributes only — see the module doc comment above for why
 * `imageFramingAttrs`' own `style` is dropped here. */
const framingDataAttrs = computed(() => {
  if (!props.entryId || !props.fieldPath) return {};
  const { style: _style, ...rest } = imageFramingAttrs(
    props.entryId,
    props.fieldPath,
    props.framing
  );
  return rest;
});
</script>

<template>
  <Image
    :media="media"
    :alt="alt"
    :decorative="decorative"
    :ratio="ratio"
    :focal="focal"
    :zoom="zoom"
    :rounded="rounded"
    :sizes="sizes"
    :priority="priority"
    :classes="mergedClasses"
    :style="rootStyle"
    v-bind="framingDataAttrs"
  />
</template>
