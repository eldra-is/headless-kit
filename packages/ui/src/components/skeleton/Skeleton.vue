<script setup lang="ts">
import { computed, type StyleValue } from 'vue';
import { frameAspectRatio } from '../../utils/ratio';
import type { SkeletonProps, SkeletonVariant } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<SkeletonProps>(), {
  variant: 'text',
  lines: 1,
  width: undefined,
  height: undefined,
  ratio: '4x5',
  size: '2.5rem',
  busyLabel: null,
  classes: undefined,
});

/** See `SkeletonProps.busyLabel`'s own comment. */
const hasBusyLabel = computed(
  () => props.busyLabel !== undefined && props.busyLabel !== null && props.busyLabel !== ''
);
const rootAria = computed(() =>
  hasBusyLabel.value
    ? {
        role: 'status' as const,
        'aria-busy': 'true' as const,
        'aria-label': props.busyLabel!,
        'aria-hidden': undefined,
      }
    : {
        role: undefined,
        'aria-busy': undefined,
        'aria-label': undefined,
        'aria-hidden': 'true' as const,
      }
);

/**
 * The same trap `Price`'s own loading skeleton once had, generalised: a percentage-width shape
 * inside an `inline-flex`/shrink-to-fit ancestor (auto width) never resolves — it silently
 * collapses to 0 and renders invisible. `Skeleton`'s own default text/title shapes are
 * percentage-wide (see `textWidthClass`/`TITLE_WIDTH_CLASS` below), so the root itself must always
 * be a definite box for them to resolve against: `block` (never `inline-*`) plus `w-full` (fills
 * whatever the root's own parent gives it, which is only "auto" if that parent is itself a
 * shrink-to-fit flex/inline container).
 *
 * `width` is the escape hatch for exactly that remaining case: a consumer who knows their
 * container is shrink-to-fit passes an explicit width (e.g. `"12rem"`), which replaces `w-full`
 * with a literal, always-definite size on the root. Every shape inside then renders at the root's
 * full width (`textWidthClass`/`TITLE_WIDTH_CLASS` fall back to `w-full` whenever `width` is set)
 * rather than its own default percentage of it, so the rendered result is exactly `width` wide,
 * not a fraction of it.
 */
const isBox = computed(() => props.variant === 'box');
// `box` is one shape and nothing else: the root draws the shimmer itself, so `class`, `style`,
// `width` and `height` size the placeholder directly.
const rootClass = computed(() => [
  'eldra:block',
  !props.width && 'eldra:w-full',
  isBox.value && 'eldra:eldra-skeleton eldra:eldra-skeleton-box eldra:rounded-md',
  isBox.value && props.classes?.line,
]);
const rootStyle = computed<StyleValue | undefined>(() => {
  const style: Record<string, string> = {};
  if (props.width) style.width = props.width;
  if (props.height) style.height = props.height;
  return Object.keys(style).length ? style : undefined;
});

/**
 * Spec "Skeleton" → Properties, `width` row: "Vary text widths between 35% and 85%." Deterministic
 * rather than random, so a test can assert an exact value per line index: a fixed four-value
 * cycle, widest first. A single line (the default `lines`) instead renders the row's other stated
 * default, `100%` (`w-full`) — spec: "Default 100% (title 60%)".
 */
const TEXT_WIDTH_CYCLE = ['eldra:w-[85%]', 'eldra:w-[70%]', 'eldra:w-[55%]', 'eldra:w-[35%]'];

/** `title` row: "Default 100% (title 60%)" — one fixed width, no cycling. */
const TITLE_WIDTH_CLASS = 'eldra:w-[60%]';

const lineCount = computed(() =>
  props.variant === 'text' ? Math.max(1, Math.trunc(props.lines)) : 1
);

function textWidthClass(index: number): string {
  if (props.width) return 'eldra:w-full';
  if (lineCount.value <= 1) return 'eldra:w-full';
  return TEXT_WIDTH_CYCLE[index % TEXT_WIDTH_CYCLE.length] as string;
}

/** `media` row: "match the real content ratio" — the same preset table `Image` uses. Skeleton has
 * no `media` object of its own to read an intrinsic ratio from, so `null` always takes the fixed
 * preset (or `Image`'s own 4:3 fallback for the unlikely `ratio="auto"`). */
const mediaAspectRatio = computed(() => frameAspectRatio(props.ratio, null));

/** Spec "Skeleton" → Sizes: the three shapes with no width concern of their own — `circle`'s box
 * comes from `size` on both axes instead, `media`'s from its aspect ratio, `btn`'s from the shared
 * control height, so all three are always `w-full` (never a fraction of the root, `width` or not).
 * `text` and `title` are the two percentage-wide shapes and are handled in `lineClass` below, since
 * their width also depends on `width`/`lines`. */
const SHAPE_CLASS: Record<Exclude<SkeletonVariant, 'text' | 'title' | 'box'>, string> = {
  circle: 'eldra:rounded-full eldra:shrink-0',
  media: 'eldra:w-full eldra:rounded-lg',
  // `--eldra-control-height` (the `control-h` utility `Button`'s `md` size also uses) rather than
  // the spec's own literal 2.75rem: that figure is `target-touch`, the width Button only grows to
  // below a 48rem *container* (a container query this placeholder does not replicate) — the shape
  // that actually needs to be reserved here, in the common (non-narrow) case, is the button's own
  // resting height, which is `control-height`.
  btn: 'eldra:control-h eldra:w-full eldra:rounded-md',
};

function lineClass(index: number): string {
  const base = 'eldra:eldra-skeleton eldra:block';
  const variant = props.variant;
  // The row heights and the text gap are the spec's numbers, behind `--eldra-skeleton-*` variables
  // (see `eldra-skeleton-text` in `src/styles/utilities.css`).
  if (variant === 'text')
    return `${base} eldra:eldra-skeleton-text eldra:rounded-sm ${textWidthClass(index)}`;
  if (variant === 'title') {
    return `${base} eldra:eldra-skeleton-title eldra:rounded-sm ${props.width ? 'eldra:w-full' : TITLE_WIDTH_CLASS}`;
  }
  return `${base} ${SHAPE_CLASS[variant as Exclude<SkeletonVariant, 'text' | 'title' | 'box'>]}`;
}

function lineStyle(): StyleValue | undefined {
  if (props.variant === 'circle') return { width: props.size, height: props.size };
  if (props.variant === 'media') return { aspectRatio: mediaAspectRatio.value };
  return undefined;
}

const lines = computed(() =>
  Array.from({ length: isBox.value ? 0 : lineCount.value }, (_, index) => ({
    key: index,
    class: [lineClass(index), props.classes?.line],
    style: lineStyle(),
  }))
);
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="rootClass"
    :style="rootStyle"
    v-bind="rootAria"
  >
    <div
      v-for="line in lines"
      :key="line.key"
      data-part="line"
      :class="line.class"
      :style="line.style"
      aria-hidden="true"
    />
  </div>
</template>
