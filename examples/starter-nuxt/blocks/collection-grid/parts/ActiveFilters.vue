<script setup lang="ts">
/**
 * The `collection-grid` block's active-filter row: one removable `Chip` per selected value, then
 * the **Clear all** link button 0.5rem after the last chip (spec `02-blocks.md` "Collection grid" →
 * Layout, below 48rem).
 *
 * The chip list is its own `<ul>` labelled "Active filters" (spec Accessibility) with **Clear all**
 * outside it — it is a control over the whole selection, not one of its members.
 *
 * Focus after a removal is the block's business, not this component's ("After removing a chip,
 * focus lands on the next chip or on the count; after Clear all, on the count", spec Acceptance):
 * only the block knows whether any chip is left, so this exposes `focusChip(index)` for it to aim
 * at once the list has re-rendered, and reports back whether there was anything there to focus.
 */
import { ref } from 'vue';
import { Button, Chip } from '@eldrajs/ui';
import { useT } from '../../../app/composables/useT';

export interface ActiveFilterChip {
  /** Stable identity: `<source>:<value>`, or `price` for the range. */
  key: string;
  /** "Size: M" — the group title and the value, which is also what names the remove button. */
  label: string;
}

defineProps<{ chips: ActiveFilterChip[] }>();

const emit = defineEmits<{ remove: [key: string]; clear: [] }>();

const t = useT();

const list = ref<HTMLUListElement | null>(null);

/**
 * Moves focus to the remove button of the chip now at `index`. Returns `false` when there is none
 * (an empty list, or an index past its end), which is the block's cue to focus the count instead.
 */
function focusChip(index: number): boolean {
  const buttons = list.value?.querySelectorAll<HTMLElement>('[data-part="removeButton"]');
  const target = buttons?.[index];
  if (!target) return false;
  target.focus();
  return true;
}

defineExpose({ focusChip });
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <ul
      ref="list"
      role="list"
      :aria-label="t('grid.activeFilters')"
      class="flex flex-wrap items-center gap-2"
    >
      <li v-for="chip in chips" :key="chip.key">
        <Chip :label="chip.label" removable @remove="emit('remove', chip.key)" />
      </li>
    </ul>
    <Button variant="link" size="sm" @click="emit('clear')">{{ t('grid.clearAll') }}</Button>
  </div>
</template>
