<script setup lang="ts">
/**
 * The decorative distribution above a range facet's track (spec "Filter panel" → Anatomy item 10:
 * "24 bars showing where the products sit on the range").
 *
 * **Entirely `aria-hidden`.** It says nothing a screen-reader user can act on and nothing the
 * facet does not already say: the two thumbs announce their own values and every value has its own
 * count. A bar chart read out bucket by bucket would be twenty-four numbers nobody asked for.
 *
 * It renders exactly as many bars as the facet supplied rather than padding or truncating to 24 —
 * the spec's own distribution is 24 buckets, and a store that answers a different resolution still
 * gets a correct picture of its own range rather than a misaligned picture of the spec's.
 *
 * Heights are a share of the **largest** bucket, not of the total: the shape of the distribution is
 * the whole information, and a catalogue whose busiest bucket holds 8% of the products would
 * otherwise draw twenty-four flat lines.
 */
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { histogramBarInRange } from './useFilterPanel';
import type { FilterPanelPart } from './types';

const props = withDefaults(
  defineProps<{
    /** One product count per equal bucket over `limits`. */
    bars: number[];
    /** The selected span, which decides which bars read as inside it. */
    range: [number, number];
    /** The facet's own bounds, which the buckets are spread over. */
    limits: [number, number];
    classes?: Partial<Record<FilterPanelPart, string>>;
  }>(),
  { classes: undefined }
);

const peak = computed(() => Math.max(...props.bars, 0));

interface Bar {
  index: number;
  /** A share of the tallest bucket, `0`–`1`. The utility's own minimum keeps `0` visible. */
  height: number;
  inside: boolean;
}

const drawn = computed<Bar[]>(() =>
  props.bars.map((count, index) => ({
    index,
    height: peak.value > 0 ? Math.max(0, count) / peak.value : 0,
    inside: histogramBarInRange(index, props.bars.length, props.range, props.limits),
  }))
);

/**
 * Spec → Sizes, Histogram row: "2.5rem tall, 24 bars with 2px gaps, inset 0.625rem on each side so
 * it lines up with the track."
 *
 * The inset is **not** written here. This sits in `RangeSlider`'s `track` slot, inside the gutter
 * box that already reserves exactly the room a thumb, its focus ring and its pointer target need —
 * so the bars span precisely the track's own width whatever that reservation currently is, which a
 * literal 0.625rem would only match while the thumb stayed 1.25rem.
 */
const ROOT_BASE = 'mb-1 flex h-10 w-full items-end gap-0.5';

/** Spec → States, Range: "histogram bars between the thumbs `border-strong`, outside
 *  `surface-strong`." */
const BAR_BASE = 'flex-1 eldra-filter-histogram-bar';
const BAR_INSIDE = 'bg-border-strong';
const BAR_OUTSIDE = 'bg-surface-strong';

const rootClass = computed(() => partClass(ROOT_BASE, props.classes, 'histogram'));

function barClass(bar: Bar): string {
  return partClass(
    cx(BAR_BASE, bar.inside ? BAR_INSIDE : BAR_OUTSIDE),
    props.classes,
    'histogramBar'
  );
}
</script>

<template>
  <div data-part="histogram" :class="rootClass" aria-hidden="true">
    <span
      v-for="bar in drawn"
      :key="bar.index"
      data-part="histogramBar"
      :data-inside="bar.inside ? 'true' : 'false'"
      :class="barClass(bar)"
      :style="{ height: `${bar.height * 100}%` }"
    />
  </div>
</template>
