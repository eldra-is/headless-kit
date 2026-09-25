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
 * `blocks/*` (`hero`, `image`, `gallery`, `feature-grid`, `testimonials`, `navigation`) keep
 * calling this with the same props they always have — see plan ruling in
 * `.superpowers/sdd/2026-09-25-eldrajs-ui-plan-2/task-7-report.md`. One difference a caller may
 * notice: `class`/`style` passed to `UiImage` now land on `Image`'s root (the figure/frame
 * wrapper), not the `<img>` itself — `object-cover`/`object-contain` classes some blocks still
 * pass are now redundant (`Image`'s `media` part always covers its frame) rather than load-
 * bearing, and sizing classes (`h-12 w-12`, `max-h-[85vh] w-auto`) now size the frame that wraps
 * the image rather than the image directly.
 */
import { computed } from 'vue';
import { Image, type ImageRatio } from '@eldrajs/ui';
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
     * `ratio` prop; anything else becomes an inline `aspect-ratio` style on the root. */
    aspect?: string;
    sizes?: string;
    /** Marks an above-the-fold image: `loading="eager"` + `fetchpriority="high"`. */
    priority?: boolean;
  }>(),
  {
    framing: null,
    entryId: undefined,
    fieldPath: undefined,
    aspect: undefined,
    sizes: '100vw',
    priority: false,
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
  if (!props.aspect) return 'auto';
  return ASPECT_TO_RATIO[props.aspect] ?? 'auto';
});

/** Only for an `aspect` with no matching preset — none of the blocks currently pass one, but this
 * keeps the prop's old "any `w/h` string" contract intact rather than silently ignoring it. */
const rootStyle = computed(() => {
  if (props.aspect && !(props.aspect in ASPECT_TO_RATIO)) {
    return { aspectRatio: props.aspect };
  }
  return undefined;
});

const media = computed(() => ({ src: props.src, alt: props.alt }));

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
    :sizes="sizes"
    :priority="priority"
    :style="rootStyle"
    v-bind="framingDataAttrs"
  />
</template>
