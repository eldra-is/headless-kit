<script setup lang="ts">
/**
 * `tabindex="0"` makes the panel itself focusable — the spec's way of reaching
 * a panel whose content holds nothing focusable — so it carries the shared
 * `focusRing` explicitly. There is no blanket `:focus-visible` base rule any
 * more (see `app/assets/main.css`): every focusable element names its own ring.
 */
import { computed, inject } from 'vue';
import { TABS_KEY } from '../../composables/useTabs';
import { focusRing } from '../../utils/classes';

const props = defineProps<{ id: string }>();

const context = inject(TABS_KEY);
if (!context) throw new Error('UiTabPanel must be used inside UiTabs');

const isSelected = computed(() => context.selectedId.value === props.id);
</script>

<template>
  <div
    :id="`ui-tabpanel-${id}`"
    role="tabpanel"
    :aria-labelledby="`ui-tab-${id}`"
    :hidden="!isSelected"
    tabindex="0"
    :class="['py-4', focusRing]"
  >
    <slot />
  </div>
</template>
