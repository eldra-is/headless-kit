<script setup lang="ts">
/**
 * A `size` facet: equal tiles, grouped under one sub-heading per size system, with a **Size
 * guide** link below (spec "Filter panel" → Variants, `size` facet row).
 *
 * Hand-drawn for the same reason the colour facet is, minus the inline colour: the whole tile is
 * the target and carries the focus ring, with a real `<input type="checkbox">` stretched over it
 * and the visible tile text `aria-hidden`, because the tile's own name has to carry the size
 * system as well — "42" is a shoe and a sock, and a facet that offers both must say which
 * (spec → Accessibility: '`aria-label` naming the size system and count ("Knitwear M, 14
 * products")').
 *
 * **Systems are never mixed in one grid** (spec → Do / Don't), and their order is the store's own:
 * see `sizeSystemGroups`. A store that has not told us its systems gets one grid and no
 * sub-headings, which is the honest rendering of "we do not know" rather than an invented heading.
 */
import { computed } from 'vue';
import { useMessages } from '../../../composables/useMessages';
import Link from '../../link/Link.vue';
import {
  isValueDisabled,
  isValueSelected,
  sizeSystemGroups,
  visibleFacetValues,
} from '../useFilterPanel';
import type { FilterFacetValue } from '../types';
import type { FacetProps } from './shared';
import { useEldraScope } from '../../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<FacetProps>(), {
  dense: false,
  classes: undefined,
  messages: undefined,
});

const emit = defineEmits<{ toggle: [value: string, checked: boolean] }>();

const m = useMessages(() => props.messages);

const groups = computed(() => sizeSystemGroups(visibleFacetValues(props.facet)));

function selected(value: FilterFacetValue): boolean {
  return isValueSelected(props.selection, props.facet.id, value.value);
}

function disabled(value: FilterFacetValue): boolean {
  return isValueDisabled(value, props.selection, props.facet.id);
}

/**
 * One tile's whole accessible name. With a size system it reads "Knitwear M, 14 products"; without
 * one there is nothing to qualify it with, so it is the plain value name every other facet uses.
 */
function nameOf(value: FilterFacetValue): string {
  const name =
    value.group === undefined
      ? m.value.filterPanelValueName(value.label, value.count)
      : m.value.filterPanelSizeName(value.group, value.label, value.count);
  return disabled(value) ? name + m.value.filterPanelNoneAvailable : name;
}

/* ------------------------------------------------------------------ classes */

/**
 * Spec → Sizes, Size-system sub-heading row: "0.75rem weight 600, uppercase, 0.06em letter
 * spacing, `muted`; 0.75rem above (none for the first) and 0.5rem below."
 */
const SUBHEADING_BASE = 'eldra:mb-2 eldra:block eldra:text-filter-subheading eldra:text-muted';
const SUBHEADING_NOT_FIRST = 'eldra:mt-3';

/** Spec → Sizes, Size tile row: "Grid of `repeat(auto-fill, minmax(3.25rem, 1fr))`, gap 0.375rem." */
const TILES_BASE =
  'eldra:grid eldra:min-w-0 eldra:grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] eldra:gap-1.5';

/**
 * Spec → Sizes, Size tile row: "Tile min height `control-height` (2.5rem), 0 0.375rem padding, 1px
 * `border-strong` border, `radius-md`, `background` fill, 0.875rem weight 500, tabular figures,
 * centred, never wraps."
 *
 * `eldra-focus` owns this element's transition list, so the border and fill changes below carry no
 * `transition-*`/`duration-*` of their own (`src/__tests__/focus-transition.spec.ts`) — they ride
 * the ring's own `background-color`/`border-color` entries.
 */
const TILE_BASE =
  'eldra:relative eldra:flex eldra:min-w-0 eldra:control-h eldra:items-center eldra:justify-center eldra:rounded-md eldra:border eldra:px-1.5 ' +
  'eldra:text-center eldra:text-label eldra:whitespace-nowrap eldra:tabular-nums eldra:eldra-focus eldra:eldra-focus-proxy';

/** Spec → States, "Size tile, hover": `background` fill, `text` border. */
const TILE_REST =
  'eldra:cursor-pointer eldra:border-border-strong eldra:bg-background eldra:text-text eldra:hover:border-text';
/** Spec → States, "Size tile, checked": `primary` fill and border, `primary-contrast` weight 600. */
const TILE_SELECTED =
  'eldra:cursor-pointer eldra:border-primary eldra:bg-primary eldra:font-semibold eldra:text-primary-contrast';
/**
 * Spec → States, "Value with 0 products (disabled)": "size tile `surface`", "size tile dashed
 * `border-strong`", "`muted`; size label struck through (1px)".
 */
const TILE_DISABLED =
  'eldra:cursor-not-allowed eldra:border-dashed eldra:border-border-strong eldra:bg-surface eldra:text-muted eldra:line-through';

/** Spec → Sizes, Size guide row: "Link, 0.8125rem, 0.5rem below the tiles." */
const SIZE_GUIDE_BASE = 'eldra:mt-2 eldra:inline-block eldra:text-caption';

/** The control, invisible but focusable, stretched over the whole tile. */
const CONTROL =
  'eldra:absolute eldra:inset-0 eldra:m-0 eldra:size-full eldra:cursor-pointer eldra:appearance-none eldra:opacity-0 ' +
  'eldra:disabled:cursor-not-allowed';

function tileState(value: FilterFacetValue): string {
  if (selected(value)) return TILE_SELECTED;
  return disabled(value) ? TILE_DISABLED : TILE_REST;
}

function tileClass(value: FilterFacetValue) {
  return [[TILE_BASE, tileState(value)], props.classes?.tile];
}

function subheadingClass(first: boolean) {
  return [[SUBHEADING_BASE, !first && SUBHEADING_NOT_FIRST], props.classes?.subheading];
}

const tilesClass = computed(() => [TILES_BASE, props.classes?.values]);
const tileLabelClass = computed(() => props.classes?.tileLabel);
const sizeGuideClass = computed(() => [SIZE_GUIDE_BASE, props.classes?.sizeGuide]);
</script>

<template>
  <div data-eldra-ui :data-eldra-scope="eldra.scope" class="eldra:min-w-0">
    <template v-for="(group, index) in groups" :key="group.key ?? ''">
      <!-- Only a system that has a name gets a heading. A `<p>` rather than a heading element: it
           labels a grid inside a `<fieldset>` the group's own `<legend>` already names, and a
           fourth heading level inside a disclosure body would put "KNITWEAR" into the page's
           outline as a section of its own. -->
      <p
        v-if="group.key !== undefined"
        data-part="subheading"
        :class="subheadingClass(index === 0)"
      >
        {{ group.key }}
      </p>

      <div data-part="values" :class="tilesClass">
        <label
          v-for="value in group.values"
          :key="value.value"
          data-part="tile"
          :data-value="value.value"
          :class="tileClass(value)"
        >
          <input
            type="checkbox"
            :class="CONTROL"
            :value="value.value"
            :checked="selected(value)"
            :disabled="disabled(value)"
            :aria-label="nameOf(value)"
            @change="emit('toggle', value.value, ($event.target as HTMLInputElement).checked)"
          />
          <!-- The visible text is `aria-hidden` (spec → Accessibility): the name above already
               carries the size, its system and its count, and the bare "M" beside it would be
               read twice. -->
          <span data-part="tileLabel" :class="tileLabelClass" aria-hidden="true">
            {{ value.label }}
          </span>
        </label>
      </div>
    </template>

    <!-- Spec → Anatomy item 9. Content, not a facet: with no destination there is no link. -->
    <Link
      v-if="facet.sizeGuideHref"
      :href="facet.sizeGuideHref"
      data-part="sizeGuide"
      :class="sizeGuideClass"
    >
      {{ m.filterPanelSizeGuide }}
    </Link>
  </div>
</template>
