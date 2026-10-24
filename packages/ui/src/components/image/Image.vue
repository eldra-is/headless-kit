<script setup lang="ts">
import { computed, useAttrs, useId, watchEffect, type StyleValue } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass, type ClassValue } from '../../utils/cx';
import { frameAspectRatio } from '../../utils/ratio';
import { scopeSizes, zoomSizes } from '../../utils/sizes';
import type { ImageCrop, ImageProps } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<ImageProps>(), {
  media: null,
  alt: undefined,
  decorative: false,
  ratio: '4x3',
  fit: 'cover',
  focal: () => ({ x: 50, y: 50 }),
  zoom: 1,
  zoomOrigin: 'band',
  crops: () => [],
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

// The page builder's band (theme-core imageFraming.ts); any origin in the frame keeps it covered.
function focalBand(zoom: number): [number, number] {
  const inset = (1 - 1 / zoom) * 50;
  return [inset, 100 - inset];
}

function clampToFocalBand(value: number, zoom: number): number {
  const [low, high] = focalBand(zoom);
  return Math.min(high, Math.max(low, value));
}

const percent = (value: number) => `${Number(value.toFixed(4))}%`;

// 'focal' sizes the media instead of scaling it: a transform would multiply the browser's pixel-rounded cover offset.
function cropStyle(focal: { x: number; y: number }, zoom: number, rule = false) {
  const style: Record<string, string> = { objectPosition: `${focal.x}% ${focal.y}%` };
  if (props.zoomOrigin === 'focal') {
    if (zoom <= 1 && !rule) return style;
    const scale = Math.max(1, zoom);
    return Object.assign(style, {
      // Absolute, so the percentages resolve against the frame: older Safari ignores a relative child's `top` % in an aspect-ratio box.
      position: 'absolute',
      left: percent(focal.x * (1 - scale)),
      top: percent(focal.y * (1 - scale)),
      width: percent(scale * 100),
      height: percent(scale * 100),
      maxWidth: 'none',
    });
  }
  if (rule) style.transform = 'none';
  if (zoom > 1) {
    style.transform = `scale(${zoom})`;
    style.transformOrigin =
      `${clampToFocalBand(focal.x, zoom)}% ` + `${clampToFocalBand(focal.y, zoom)}%`;
  }
  return style;
}

const mediaStyle = computed<StyleValue>(() => cropStyle(props.focal, props.zoom));

interface ResolvedCrop {
  media: string;
  aspectRatio: string;
  focal: { x: number; y: number };
  zoom: number;
  sizes?: string;
}

// Both are written into a <style> element, so anything that could close a rule or it is refused.
const MEDIA_CONDITION = /^(?!.*(?:<\/|\/\*))[\w ().:<>=/+*-]+$/;
const ASPECT_RATIO = /^(?:auto|[\d.]+(?: \/ [\d.]+)?)$/;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function resolveCrop(crop: ImageCrop): ResolvedCrop | undefined {
  const focal = crop.focal ?? props.focal;
  const zoom = crop.zoom ?? props.zoom;
  const aspectRatio = frameAspectRatio(crop.ratio ?? props.ratio, props.media);
  const valid =
    typeof crop.media === 'string' &&
    MEDIA_CONDITION.test(crop.media.trim()) &&
    ASPECT_RATIO.test(aspectRatio) &&
    finite(focal?.x) &&
    finite(focal?.y) &&
    finite(zoom);
  if (!valid) {
    if (import.meta.env?.DEV) console.warn('[@eldrajs/ui] <Image> ignores an invalid crop:', crop);
    return undefined;
  }
  return { media: crop.media.trim(), aspectRatio, focal, zoom, sizes: crop.sizes };
}

const crops = computed(() => props.crops.flatMap((crop) => resolveCrop(crop) ?? []));

const scaledSizes = (sizes: string | undefined, zoom: number) =>
  sizes && props.fit === 'cover' ? zoomSizes(sizes, zoom) : sizes;

const resolvedSizes = computed(() => {
  const sizes = props.sizes ?? props.media?.sizes;
  const own = scaledSizes(sizes, props.zoom);
  if (crops.value.length === 0) return own;
  const scoped = crops.value.flatMap((crop) => {
    const cropSizes = scaledSizes(crop.sizes ?? sizes, crop.zoom);
    return cropSizes ? [scopeSizes(cropSizes, crop.media)] : [];
  });
  return [...scoped, ...(own ? [own] : [])].join(', ') || undefined;
});

const cropId = useId();
const cropScope = computed(() => (crops.value.length > 0 ? cropId : undefined));

const hyphenate = (property: string) => property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const cssString = (value: string) =>
  `"${value.replace(/[^\w-]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `)}"`;

// Later rules win in CSS and the first crop wins in `sizes`, so the rules are written last first.
const cropCss = computed(() => {
  const root = `[data-eldra-image-crops=${cssString(cropId)}]`;
  return [...crops.value]
    .reverse()
    .map((crop) => {
      const declarations = Object.entries(cropStyle(crop.focal, crop.zoom, true))
        .map(([property, value]) => `${hyphenate(property)}:${value}!important`)
        .join(';');
      return (
        `@media ${crop.media}{` +
        `${root}>[data-part=frame]{aspect-ratio:${crop.aspectRatio}!important}` +
        `${root}>[data-part=frame]>[data-part=media]{${declarations}}}`
      );
    })
    .join('');
});

const mediaClass = computed(() =>
  partClass(
    cx('block h-full w-full', props.fit === 'contain' ? 'object-contain' : 'object-cover'),
    props.classes,
    'media'
  )
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
    data-eldra-ui
    data-part="root"
    :data-eldra-image-crops="cropScope"
    :class="rootClass"
    :style="rootStyle"
  >
    <component :is="'style'" v-if="cropScope" v-html="cropCss" />
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
