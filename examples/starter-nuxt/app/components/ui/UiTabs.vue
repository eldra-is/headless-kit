<script setup lang="ts">
/**
 * Provides the selected tab id (`v-model`) and renders the `role="tablist"`
 * wrapper around the `#tabs` slot only — per the ARIA Authoring Practices a
 * tablist should contain tab elements alone, not panels, so panels go in
 * the default slot instead and render as siblings after the tablist, not
 * inside it. Both slots are still descendants of this component for
 * `provide()`/`inject()` purposes (see `useTabs.ts`).
 */
import { computed, provide } from 'vue';
import { TABS_KEY } from '../../composables/useTabs';

const props = defineProps<{
  modelValue: string;
  /** Accessible name for the tablist, e.g. "Product details". */
  label?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const selectedId = computed<string>({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

provide(TABS_KEY, { selectedId, select: (id: string) => (selectedId.value = id) });
</script>

<template>
  <div>
    <div role="tablist" :aria-label="label" class="border-border flex gap-1 border-b">
      <slot name="tabs" />
    </div>
    <slot />
  </div>
</template>
