<script setup lang="ts">
import { computed, useAttrs, watchEffect, type StyleValue } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass, type ClassValue } from '../../utils/cx';
import { frameAspectRatio } from '../../utils/ratio';
import type { ImageProps } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<ImageProps>(), {
  media: null,
  alt: undefined,
  decorative: false,
  ratio: '4x3',
  focal: () => ({ x: 50, y: 50 }),
  zoom: 1,
  rounded: 'none',
  caption: null,
  sizes: undefined,
  priority: false,
  loading: false,
  classes: undefined,
});

const messages = useMessages();

/**
 * Everything the caller passed that is not a declared prop. `inheritAttrs: false` (above) stops
 * Vue from putting any of it on the root automatically, so it is split by hand: `class`/`style`
 * go to the root (the caller is styling the frame's box — sizing, positioning), and everything
 * else (a `data-testid`, `width`/`height`, the starter's `data-eldra-framing*` marker attributes)
 * goes to the media element, which is the thing those attributes are actually about.
 */
const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

const hasCaption = computed(() => Boolean(props.caption));
const isVideo = computed(() => props.media?.type === 'video');

/**
 * Spec "Image" → Accessibility, 1.1.1: "`alt` is required in the editor, with an explicit
 * decorative toggle." This package has no editor of its own, so the closest equivalent it can
 * enforce is a dev-only warning whenever there is media to describe and neither `alt` nor
 * `decorative` says anything about it — silence here is exactly the state the spec calls out
 * ("Don't leave `alt` empty on product images that are the only product identifier").
 */
if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (props.media && !props.decorative && !props.alt && !props.media.alt) {
      console.warn(
        '[@eldrajs/ui] <Image> has `media` but no `alt` (and `decorative` is not set). Describe ' +
          'what matters for shopping, or pass `decorative` for an image that carries no meaning ' +
          'of its own (WCAG 1.1.1).'
      );
    }
  });
}

/** The rendered `alt`: `""` when decorative, otherwise the prop, then the media's own stored
 * description, then `""` — the attribute is always present, never omitted (spec acceptance
 * criteria: "Images declare `alt` (or `alt=""` via the decorative toggle)"). */
const resolvedAlt = computed(() => {
  if (props.decorative) return '';
  return props.alt ?? props.media?.alt ?? '';
});

const resolvedSizes = computed(() => props.sizes ?? props.media?.sizes);

/** Spec "Image" → Behaviour & motion: eager + high priority for the first hero image, lazy
 * everywhere else. `decoding="async"` never blocks the first paint on the decode. */
const loadingAttr = computed(() => (props.priority ? 'eager' : 'lazy'));
const fetchPriority = computed(() => (props.priority ? 'high' : undefined));

const ROUNDED_CLASS: Record<NonNullable<ImageProps['rounded']>, string> = {
  none: '',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

const rootClass = computed(() =>
  partClass(cx('block', attrs.class as ClassValue), props.classes, 'root')
);
const rootStyle = computed(() => attrs.style as StyleValue | undefined);

const frameStyle = computed<StyleValue>(() => ({
  aspectRatio: frameAspectRatio(props.ratio, props.media),
}));

const frameClass = computed(() =>
  partClass(
    cx('relative w-full overflow-hidden bg-surface-strong', ROUNDED_CLASS[props.rounded]),
    props.classes,
    'frame'
  )
);

/**
 * The focal band a given `zoom` keeps safe (percent, 0–100 on either axis): the range a
 * `transform-origin` can sit in without pulling the scaled image away from one edge of the frame
 * and exposing the frame's own background there — which acceptance criterion "images are never
 * stretched or letterboxed" rules out. `object-fit: cover` alone can never letterbox (it always
 * fills the box, whatever `object-position` is), but a `scale()` *on top of* a cover fit can, once
 * its origin sits close enough to an edge that magnifying around it pulls the far side inward. The
 * higher the zoom, the narrower the safe band — at `zoom: 1` every point is safe (the whole 0–100
 * range); this is the same formula `@eldrajs/theme-core`'s `imageFraming.ts#focalBand` uses
 * (independently reimplemented here, in percent rather than a 0–1 fraction, because this package
 * must not depend on that one — see the repo root `CLAUDE.md`'s "Public packages never import a
 * private one"/framework-free rules — not shared code with it).
 */
function focalBand(zoom: number): [number, number] {
  const inset = (1 - 1 / zoom) * 50;
  return [inset, 100 - inset];
}

function clampToFocalBand(value: number, zoom: number): number {
  const [low, high] = focalBand(zoom);
  return Math.min(high, Math.max(low, value));
}

/**
 * Spec "Image" → Behaviour & motion: "The image covers the frame and is cropped, positioned at
 * the focal point and scaled by the zoom around the focal point." `object-position` always
 * follows `focal` exactly — cropping alone can never letterbox, so it needs no clamping.
 * `transform`/`transform-origin` are only added once `zoom` is actually above 1, so an untouched
 * image never carries an inert `scale(1)`; when it is, the origin is `focal` clamped into
 * `focalBand(zoom)` above, so scaling around it never uncovers the frame's own edge.
 */
const mediaStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {
    objectPosition: `${props.focal.x}% ${props.focal.y}%`,
  };
  if (props.zoom > 1) {
    style.transform = `scale(${props.zoom})`;
    style.transformOrigin =
      `${clampToFocalBand(props.focal.x, props.zoom)}% ` +
      `${clampToFocalBand(props.focal.y, props.zoom)}%`;
  }
  return style;
});

const mediaClass = computed(() =>
  partClass(cx('block h-full w-full object-cover'), props.classes, 'media')
);

const placeholderClass = computed(() =>
  partClass(
    cx(
      'eldra-image-placeholder-hatch text-muted flex h-full w-full flex-col items-center ' +
        'justify-center gap-2'
    ),
    props.classes,
    'placeholder'
  )
);

const captionClass = computed(() =>
  partClass(cx('text-caption text-muted mt-2 block'), props.classes, 'caption')
);

const skeletonClass = computed(() =>
  partClass(cx('eldra-skeleton h-full w-full'), props.classes, 'skeleton')
);
</script>

<template>
  <component
    :is="hasCaption ? 'figure' : 'div'"
    data-part="root"
    :class="rootClass"
    :style="rootStyle"
  >
    <div data-part="frame" :class="frameClass" :style="frameStyle">
      <div v-if="loading" data-part="skeleton" :class="skeletonClass" aria-hidden="true" />
      <video
        v-else-if="media && isVideo"
        data-part="media"
        :class="mediaClass"
        :style="mediaStyle"
        v-bind="forwardedAttrs"
        :src="media.src"
        controls
        playsinline
        :width="media.width"
        :height="media.height"
      >
        {{ resolvedAlt }}
      </video>
      <img
        v-else-if="media"
        data-part="media"
        :class="mediaClass"
        :style="mediaStyle"
        v-bind="forwardedAttrs"
        :src="media.src"
        :srcset="media.srcset"
        :sizes="resolvedSizes"
        :alt="resolvedAlt"
        :width="media.width"
        :height="media.height"
        :loading="loadingAttr"
        decoding="async"
        :fetchpriority="fetchPriority"
      />
      <div
        v-else
        data-part="placeholder"
        :class="placeholderClass"
        :role="decorative ? undefined : 'img'"
        :aria-hidden="decorative ? 'true' : undefined"
        :aria-label="decorative ? undefined : messages.noImageAvailable"
      >
        <svg
          class="size-8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.75" />
          <path d="M3 17l5.5 -5.5c.83 -.83 1.67 -.83 2.5 0l7 7" />
          <path d="M14 15l1.5 -1.5c.83 -.83 1.67 -.83 2.5 0l3 3" />
        </svg>
        <span aria-hidden="true">{{ messages.noImage }}</span>
      </div>
    </div>
    <figcaption v-if="hasCaption" data-part="caption" :class="captionClass">
      {{ caption }}
    </figcaption>
  </component>
</template>
