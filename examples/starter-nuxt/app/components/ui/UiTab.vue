<script setup lang="ts">
/**
 * Roving tabindex: only the selected tab is in the Tab sequence
 * (`tabindex="0"`); every other tab is `-1`. Arrow keys move both DOM focus
 * and the selection together (the "automatic activation" model from the
 * ARIA APG tabs pattern) by walking `[role="tab"]` siblings inside the
 * nearest `[role="tablist"]` — no separate registry needed since `UiTab`/
 * `UiTabPanel` already derive matching ids from the same `id` prop.
 */
import { computed, inject } from 'vue';
import { TABS_KEY } from '../../composables/useTabs';
import { focusRing } from '../../utils/classes';

const props = withDefaults(defineProps<{ id: string; disabled?: boolean }>(), {
  disabled: false,
});

const context = inject(TABS_KEY);
if (!context) throw new Error('UiTab must be used inside UiTabs');

const isSelected = computed(() => context.selectedId.value === props.id);

function select(): void {
  if (props.disabled) return;
  context!.select(props.id);
}

function onKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const target = event.currentTarget as HTMLElement;
  const tablist = target.closest('[role="tablist"]');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
    (tab) => !tab.hasAttribute('disabled')
  );
  const currentIndex = tabs.indexOf(target);
  if (currentIndex === -1) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else nextIndex = tabs.length - 1;

  event.preventDefault();
  const next = tabs[nextIndex]!;
  next.focus();
  const nextId = next.dataset.uiTabId;
  if (nextId) context!.select(nextId);
}
</script>

<template>
  <button
    :id="`ui-tab-${id}`"
    type="button"
    role="tab"
    :data-ui-tab-id="id"
    :aria-selected="isSelected ? 'true' : 'false'"
    :aria-controls="`ui-tabpanel-${id}`"
    :tabindex="isSelected ? 0 : -1"
    :disabled="disabled"
    :class="[
      'border-b-2 px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 motion-safe:duration-150',
      isSelected ? 'border-primary text-primary' : 'text-muted hover:text-text border-transparent',
      focusRing,
    ]"
    @click="select"
    @keydown="onKeydown"
  >
    <slot />
  </button>
</template>
