<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import type { StockBadgeProps, StockLevel } from './types';

const props = withDefaults(defineProps<StockBadgeProps>(), {
  quantity: undefined,
  message: undefined,
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
 * own component.
 */
const LEVEL_ICON_PATHS: Record<StockLevel, string[]> = {
  in: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
  low: [
    'M12 9v4',
    'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0',
    'M12 16h.01',
  ],
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
  if (props.level === 'out') return messages.value.stockOut;
  return messages.value.stockPreorder();
});

const text = computed(() => props.message ?? defaultMessage.value);

const rootClass = computed(() =>
  partClass(
    cx('inline-flex items-center gap-1.5 text-stock-status', LEVEL_TEXT_CLASS[props.level]),
    props.classes,
    'root'
  )
);
const iconClass = computed(() => partClass('size-4.5 shrink-0', props.classes, 'icon'));
const labelClass = computed(() => partClass('', props.classes, 'label'));
</script>

<template>
  <span data-part="root" :class="rootClass">
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
  </span>
</template>
