<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { ALERT_TRIANGLE_PATHS } from '../../icons/paths';
import Spinner from '../spinner/Spinner.vue';
import type { StockBadgeProps, StockLevel } from './types';

const props = withDefaults(defineProps<StockBadgeProps>(), {
  quantity: undefined,
  message: undefined,
  revalidating: false,
  classes: undefined,
});

const messages = useMessages();

/**
 * Icons for the four levels (spec "Badge" → Stock status line → Properties): "circle-check",
 * "alert-triangle", "circle-x" and "clock" — inline SVG path data copied from `@tabler/icons-vue`
 * (`IconCircleCheck`/`IconAlertTriangle`/`IconCircleX`/`IconClock`, MIT licensed), the same
 * "outline" 24x24 viewBox those icons use, rather than a runtime dependency on the package: a
 * decision recorded in the plan (like `Button`'s spinner, which is also a hand-written SVG). Each
 * level's colour and icon are fixed by the spec, so there is no `icon` prop to take a consumer's
 * own component. `low`'s `alert-triangle` path data lives in `src/icons/paths.ts`, shared with
 * `EmptyState`'s own `error` default icon rather than duplicated (M19).
 */
const LEVEL_ICON_PATHS: Record<StockLevel, string[]> = {
  in: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
  low: ALERT_TRIANGLE_PATHS,
  out: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'],
  preorder: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'],
};

/** Badge's own icon stroke (spec "Badge" → Sizes): no separate weight is given for the status
 * line's 1.125rem icon, so it keeps the same 2.25 the badge's own leading icon uses — one stroke
 * weight for the whole section rather than inventing a second number the spec never gives. */
const ICON_STROKE_WIDTH = 2.25;

/**
 * Colour (spec "Badge" → States, "Status line" row): "`success`/`warning`/`danger`/`muted`, same
 * as its text" — the icon has no colour class of its own; it inherits `currentColor` from the
 * text colour set here.
 */
const LEVEL_TEXT_CLASS: Record<StockLevel, string> = {
  in: 'text-success',
  low: 'text-warning',
  out: 'text-danger',
  preorder: 'text-muted',
};

const defaultMessage = computed<string>(() => {
  if (props.level === 'in') return messages.value.stockIn;
  if (props.level === 'low') return messages.value.stockLow(props.quantity ?? null);
  // `out` aliases the shared `soldOut` key (M15) rather than a separately-translatable
  // `stockOut` — `en-US`/`is-IS` had the same string under both keys, so a translator had to
  // render the same phrase twice, and they could drift.
  if (props.level === 'out') return messages.value.soldOut;
  return messages.value.stockPreorder();
});

const text = computed(() => props.message ?? defaultMessage.value);

/**
 * The stock line is on screen but a fresher one is on its way — the same refresh state `Price`
 * carries, and drawn the same way: the level keeps its icon, its colour and its words, dimmed to
 * `--eldra-revalidating-opacity`, with a spinner beside it. `StockBadge` has no `loading` state of
 * its own (a stock line a page does not know yet is simply not rendered), so there is no
 * precedence rule here the way there is on `Price`.
 *
 * The dim goes on the icon and the label rather than on the root, because CSS opacity composites
 * down the tree and a dimmed root would take the spinner with it — the spinner is the state's own
 * signal and stays at full strength.
 */
const dim = computed(() => (props.revalidating ? 'eldra-revalidating' : ''));

const rootClass = computed(() =>
  partClass(
    cx('inline-flex items-center gap-1.5 text-stock-status', LEVEL_TEXT_CLASS[props.level]),
    props.classes,
    'root'
  )
);
const iconClass = computed(() =>
  partClass(cx('size-4.5 shrink-0', dim.value), props.classes, 'icon')
);
const labelClass = computed(() => partClass(dim.value, props.classes, 'label'));

/**
 * The same zero-width spinner `Price` draws, for the reason spelled out there: a flex item of
 * width `0` whose `-ms-1.5` cancels exactly the `gap-1.5` the root would otherwise put in front of
 * it, with the circle absolutely positioned inside that box and overflowing to the right of it —
 * so the stock line's own width, and every character in it, are identical with the state on and
 * off. `text-muted` keeps the circle furniture beside the status rather than part of it.
 */
const spinnerClass = computed(() =>
  partClass(
    'pointer-events-none relative -ms-1.5 flex h-[1em] w-0 shrink-0 items-center text-muted',
    props.classes,
    'spinner'
  )
);

/**
 * `srStatus`, not `status`, for the reason `Price.vue` spells out: `LoadMore`'s own visible
 * `status` part would otherwise collide with it on a page holding both.
 *
 * Rendered whether or not there is anything to say, with only its text changing: a live region
 * that arrives in the DOM already holding its message is announced unreliably, because a screen
 * reader takes the region and its content in one pass and has no change to report.
 */
const srStatusClass = computed(() => partClass('sr-only', props.classes, 'srStatus'));
const srStatusText = computed(() => (props.revalidating ? messages.value.updatingStock : ''));
</script>

<template>
  <span data-part="root" :class="rootClass" :aria-busy="revalidating ? 'true' : undefined">
    <svg
      data-part="icon"
      :class="iconClass"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      :stroke-width="ICON_STROKE_WIDTH"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path v-for="d in LEVEL_ICON_PATHS[level]" :key="d" :d="d" />
    </svg>
    <span data-part="label" :class="labelClass">{{ text }}</span>
    <span v-if="revalidating" data-part="spinner" :class="spinnerClass" aria-hidden="true">
      <Spinner class="absolute start-[0.25em] top-0 size-[1em]" />
    </span>
    <span data-part="srStatus" :class="srStatusClass" aria-live="polite">{{ srStatusText }}</span>
  </span>
</template>
