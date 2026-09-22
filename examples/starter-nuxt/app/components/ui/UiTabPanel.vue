<script setup lang="ts">
import { computed, inject } from 'vue';
import { TABS_KEY } from '../../composables/useTabs';

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
    class="py-4"
  >
    <slot />
  </div>
</template>
