<script setup lang="ts">
/**
 * A `toggle` facet: one `Switch` per yes/no value, with the count right-aligned beside it (spec
 * "Filter panel" → Variants, `toggle` facet row).
 *
 * **One switch per facet value, never a checkbox pair** such as "In stock / Out of stock" (spec →
 * Do / Don't). A pair asks the shopper to say which half of a binary they want *and* lets them say
 * both, which filters nothing while looking as though it filtered something; a switch says the one
 * thing a yes/no facet can mean.
 *
 * `Switch` already is a `<button role="switch" aria-checked>` named by its own visible label,
 * which is exactly what the spec asks for, so nothing here is drawn by hand. The count sits
 * *outside* the switch as plain text (spec → Accessibility: "The count is plain text beside it"):
 * inside, it would become part of the switch's name and be read as though it were the state.
 */
import { computed } from 'vue';
import { partClass } from '../../../utils/cx';
import Switch from '../../switch/Switch.vue';
import { isValueSelected, visibleFacetValues } from '../useFilterPanel';
import type { FilterFacetValue } from '../types';
import { FACET_COUNT, type FacetProps } from './shared';

const props = withDefaults(defineProps<FacetProps>(), {
  dense: false,
  classes: undefined,
  messages: undefined,
});

const emit = defineEmits<{ toggle: [value: string, checked: boolean] }>();

const values = computed(() => visibleFacetValues(props.facet));

function selected(value: FilterFacetValue): boolean {
  return isValueSelected(props.selection, props.facet.id, value.value);
}

/* ------------------------------------------------------------------ classes */

/** Spec → Sizes, Switch row: "consecutive rows 0.25rem apart." */
const VALUES_BASE = 'flex min-w-0 flex-col gap-1';
/**
 * Spec → Sizes, Switch row: "Min 2.25rem tall, space-between, 0.75rem gap."
 *
 * A switched-off row is never disabled the way a 0-count checkbox is: a toggle facet's count is
 * what the switch *would* leave, and a facet that would leave nothing is still a facet a shopper
 * may be switching off again.
 */
const ROW_BASE = 'flex min-h-9 min-w-0 items-center justify-between gap-3';
/** Spec → Sizes, Switch row: "label 0.9375rem." */
const SWITCH_LABEL = 'text-control text-text';

const valuesClass = computed(() => partClass(VALUES_BASE, props.classes, 'values'));
const rowClass = computed(() => partClass(ROW_BASE, props.classes, 'switchRow'));
const countClass = computed(() => partClass(FACET_COUNT, props.classes, 'count'));
</script>

<template>
  <div data-part="values" :class="valuesClass">
    <div
      v-for="value in values"
      :key="value.value"
      data-part="switchRow"
      :data-value="value.value"
      :class="rowClass"
    >
      <Switch
        size="sm"
        :model-value="selected(value)"
        :data-value="value.value"
        :classes="{ label: SWITCH_LABEL }"
        @update:model-value="emit('toggle', value.value, $event)"
      >
        {{ value.label }}
      </Switch>
      <span data-part="count" :class="countClass">{{ value.count }}</span>
    </div>
  </div>
</template>
