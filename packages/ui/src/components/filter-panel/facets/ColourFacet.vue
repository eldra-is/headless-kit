<script setup lang="ts">
/**
 * A `colour` facet: the real product colour in a circle, its name and its count, as rows
 * (`layout: 'list'`) or tiles (`layout: 'grid'`).
 *
 * This is the one facet that cannot go through `Checkbox`. The swatch's colour arrives as
 * **data** — the facet value's own `swatch` — so it has to be an inline `style`, and `Checkbox`
 * forwards `$attrs` (`style` included) to its hidden `<input>`, where nothing is visible. So the
 * affordance is drawn here: still a real `<input type="checkbox">` inside a `<label>`, stretched
 * invisibly over the whole row or tile so the whole thing is the click target, with
 * `eldra-focus-proxy` putting the package's one focus ring around it (spec → Accessibility:
 * "a real checkbox stretched invisibly over the whole row or tile").
 *
 * Selection is never shown by colour alone, which would be meaningless here of all places: a ring
 * around the swatch, a check mark inside it, and a bold name — three cues (spec → States, "Swatch,
 * checked"). The check mark's own ink is picked from the swatch's relative luminance by
 * `swatchInk.ts`, which is the only way a mark can stay visible on a colour nobody chose.
 */
import { computed } from 'vue';
import { useMessages } from '../../../composables/useMessages';
import { cx, partClass } from '../../../utils/cx';
import { swatchInk } from '../swatchInk';
import { isValueDisabled, isValueSelected, visibleFacetValues } from '../useFilterPanel';
import type { FilterFacetValue } from '../types';
import { FACET_COUNT, FACET_ROW_HOVER, FACET_SWATCH_GUTTER, type FacetProps } from './shared';

const props = withDefaults(defineProps<FacetProps>(), {
  dense: false,
  classes: undefined,
  messages: undefined,
});

const emit = defineEmits<{ toggle: [value: string, checked: boolean] }>();

const m = useMessages(() => props.messages);

const tiles = computed(() => props.facet.layout === 'grid');
const values = computed(() => visibleFacetValues(props.facet));

function selected(value: FilterFacetValue): boolean {
  return isValueSelected(props.selection, props.facet.id, value.value);
}

function disabled(value: FilterFacetValue): boolean {
  return isValueDisabled(value, props.selection, props.facet.id);
}

/** Spec → Accessibility: 'The accessible name is the colour name plus the count ("Brown, 9
 *  products")', with ", none available" after it for a value nothing is left for. */
function nameOf(value: FilterFacetValue): string {
  const name = m.value.filterPanelValueName(value.label, value.count);
  return disabled(value) ? name + m.value.filterPanelNoneAvailable : name;
}

/**
 * The ink the check mark takes, as the token role it is: `text` on a pale swatch, `focus-inner`
 * (white) on a dark one, a gradient counting as dark. Two classes rather than an inline colour,
 * so a store that restyles either token restyles the mark with it.
 */
function markClass(value: FilterFacetValue): string {
  const ink = swatchInk(value.swatch);
  return ink === 'text' ? 'text-text' : 'text-focus-inner';
}

/* ------------------------------------------------------------------ classes */

/**
 * Spec → Sizes, Panel row: "colour rows switch to 2 columns (gaps 0.125rem × 1.5rem) once the
 * panel is 26rem or wider."
 *
 * `26rem` is written out rather than read from a variable because a container-query condition may
 * not contain `var()` — the same constraint `tailwind.css`'s own header records for every
 * `@container` edge in this package. It measures the **panel**, which is the nearest container
 * ancestor (`FilterPanel`'s root is `@container`), and that is the spec's own rule: the width of
 * the column the panel sits in, not the viewport. A 15rem sidebar therefore keeps one column.
 */
const ROWS_BASE = 'grid min-w-0 grid-cols-1 gap-x-6 gap-y-0.5 @min-[26rem]:grid-cols-2';

/**
 * Spec → Sizes, Swatch tile row: "Grid of `repeat(auto-fill, minmax(4.25rem, 1fr))`, gaps 0.75rem
 * (rows) × 0.5rem."
 */
const TILES_BASE = 'grid min-w-0 grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-x-2 gap-y-3';

/**
 * Spec → Sizes, Swatch row: "Min 2.25rem tall, padding 0.25rem 0.375rem with a −0.375rem side
 * margin, gap 0.625rem, `radius-sm`, line height 1.3."
 *
 * `eldra-focus` owns this element's transition list, so no `transition-*`/`duration-*` utility is
 * written beside it (`src/__tests__/focus-transition.spec.ts`).
 */
const ROW_BASE =
  `relative flex min-h-9 min-w-0 items-center gap-2.5 rounded-sm py-1 ${FACET_SWATCH_GUTTER} ` +
  'eldra-focus eldra-focus-proxy';

/**
 * Spec → Sizes, Swatch tile row: "Each tile is a centred column: padding 0.375rem 0.25rem, gap
 * 0.375rem."
 */
const TILE_BASE =
  'relative flex min-w-0 flex-col items-center gap-1.5 rounded-sm px-1 py-1.5 ' +
  'eldra-focus eldra-focus-proxy';

/** Spec → States, "Value with 0 products (disabled)": "no hover tint". */
const ROW_ENABLED = `cursor-pointer ${FACET_ROW_HOVER}`;
const ROW_DISABLED = 'cursor-not-allowed';

/**
 * The ring shape: the 2px gap is this element's padding and the ring is a real border on it, at
 * `eldra-filter-swatch-ring`'s constant width in every state, so the swatch never resizes when it
 * is picked. No explicit size — the shape wraps the disc inside it, which is what keeps the two
 * layouts' different swatch sizes (1.5rem and 2.25rem) to one declaration each.
 */
const RING_BASE = 'relative inline-flex shrink-0 rounded-full p-0.5 eldra-filter-swatch-ring';
const RING_REST = 'border-transparent';
/** Spec → States, "Swatch, checked": "2px `background` gap + 1.5px `text` ring". */
const RING_SELECTED = 'border-text';

/** Spec → Sizes: the disc itself, 1.5rem in a row and 2.25rem in a tile. */
const SWATCH_BASE = 'block rounded-full eldra-filter-swatch-edge';
/** Spec → States, "Value with 0 products": "swatch at 45% opacity". */
const SWATCH_DISABLED = 'opacity-45';

/** Spec → Sizes, Swatch row: "Check mark 0.875rem, stroke weight 3"; tile: "check mark 1.125rem". */
const MARK_BASE = 'pointer-events-none absolute inset-0 m-auto';

/** Spec → States: the name is bold when the value is checked, `muted` when nothing is left. */
const NAME_BASE = 'min-w-0 break-words text-control';

/** Spec → Sizes, Swatch tile row: "name 0.8125rem, count 0.75rem", both centred. */
const TILE_NAME_BASE = 'min-w-0 break-words text-center text-caption';
const TILE_COUNT_BASE = 'text-center text-filter-tile-count tabular-nums';

/** The control, invisible but focusable, stretched over the whole row or tile. */
const CONTROL =
  'absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 ' +
  'disabled:cursor-not-allowed';

function rowClass(value: FilterFacetValue): string {
  const base = tiles.value ? TILE_BASE : ROW_BASE;
  return partClass(
    cx(base, disabled(value) ? ROW_DISABLED : ROW_ENABLED),
    props.classes,
    tiles.value ? 'tile' : 'row'
  );
}

function ringClass(value: FilterFacetValue): string {
  return cx(RING_BASE, selected(value) ? RING_SELECTED : RING_REST);
}

function swatchClass(value: FilterFacetValue): string {
  return partClass(
    cx(SWATCH_BASE, tiles.value ? 'size-9' : 'size-6', disabled(value) && SWATCH_DISABLED),
    props.classes,
    'swatch'
  );
}

function markPartClass(value: FilterFacetValue): string {
  return partClass(
    cx(MARK_BASE, tiles.value ? 'size-4.5' : 'size-3.5', markClass(value)),
    props.classes,
    'swatchMark'
  );
}

function nameClass(value: FilterFacetValue): string {
  return partClass(
    cx(
      tiles.value ? TILE_NAME_BASE : NAME_BASE,
      selected(value) && 'font-semibold',
      disabled(value) ? 'text-muted' : 'text-text'
    ),
    props.classes,
    tiles.value ? 'tileLabel' : 'rowLabel'
  );
}

const countClass = computed(() =>
  partClass(tiles.value ? cx(TILE_COUNT_BASE, 'text-muted') : FACET_COUNT, props.classes, 'count')
);

const strikeClass = computed(() =>
  partClass(
    'pointer-events-none absolute inset-0 size-full text-text',
    props.classes,
    'swatchStrike'
  )
);
const valuesClass = computed(() =>
  partClass(tiles.value ? TILES_BASE : ROWS_BASE, props.classes, 'values')
);
</script>

<template>
  <div data-part="values" :class="valuesClass">
    <label
      v-for="value in values"
      :key="value.value"
      :data-part="tiles ? 'tile' : 'row'"
      :data-value="value.value"
      :class="rowClass(value)"
    >
      <!-- The real control, invisible but focusable and over the whole row, which is its
           appearance. `eldra-focus-proxy` on the row is what draws the one focus ring around the
           shape a keyboard user can actually see. -->
      <input
        type="checkbox"
        :class="CONTROL"
        :value="value.value"
        :checked="selected(value)"
        :disabled="disabled(value)"
        :aria-label="nameOf(value)"
        @change="emit('toggle', value.value, ($event.target as HTMLInputElement).checked)"
      />

      <span :class="ringClass(value)">
        <!-- The one per-value colour the spec allows, as an inline style: it is product data, not
             a token, and `background` rather than `background-color` so a gradient works as a
             swatch too ("Multi"). `aria-hidden`, because the colour's name is always beside it. -->
        <span
          data-part="swatch"
          :class="swatchClass(value)"
          :style="{ background: value.swatch }"
          aria-hidden="true"
        />

        <!-- Tabler's `check`, stroke 3 (spec → Sizes, Swatch row). Decorative: the checked state
             is the input's, which assistive technology reads. -->
        <svg
          v-if="selected(value)"
          data-part="swatchMark"
          :class="markPartClass(value)"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 12l5 5l10 -10" />
        </svg>

        <!-- Spec → States, "Value with 0 products": "a 1.5px `text` diagonal strike at 45°". An
             inline SVG rather than a class-drawn line, for the reason `VariantPicker`'s own
             sold-out line records: forced-colours mode drops a `background`/`box-shadow` line
             outright and keeps an SVG stroke. -->
        <svg
          v-if="disabled(value)"
          data-part="swatchStrike"
          :class="strikeClass"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <line
            x1="85.36"
            y1="14.64"
            x2="14.64"
            y2="85.36"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </span>

      <span :data-part="tiles ? 'tileLabel' : 'rowLabel'" :class="nameClass(value)">
        {{ value.label }}
      </span>
      <span data-part="count" :class="countClass">{{ value.count }}</span>
    </label>
  </div>
</template>
