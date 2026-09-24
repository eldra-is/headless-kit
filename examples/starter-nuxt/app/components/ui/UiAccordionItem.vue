<script setup lang="ts">
/**
 * Native `<details>`/`<summary>` — the browser already gives us expand/
 * collapse, keyboard support (Enter/Space on the summary) and the
 * open/closed a11y semantics for free. The chevron rotation is pure CSS
 * (`group-open:rotate-180`, driven by the real `[open]` attribute), so
 * nothing here needs to track open state just for that.
 *
 * `single` mode (siblings close when one opens) is layered on via
 * `ACCORDION_KEY`'s context: this item reports its own open/close through
 * the native `toggle` event, and closes a sibling the same way a user
 * would — by imperatively setting its `detailsRef.open = false` — when a
 * *different* item becomes the open one.
 *
 * `:open="defaultOpen"` is deliberately not a reactive `:open="isOpen"`
 * binding kept in sync from the `toggle` listener: per the HTML spec, a
 * `<details>` click toggles the `open` attribute synchronously but fires
 * the `toggle` event itself via a queued task, one tick later — true in
 * real browsers, not just this starter's jsdom tests (see the async note
 * in `UiAccordion.spec.ts`). A reactive binding driven back from that
 * delayed event would fight the *already-correct* DOM state the click
 * itself set synchronously; `defaultOpen` only reflects a prop that never
 * changes at runtime, so Vue never re-patches `open` after mount, and the
 * native element's own state stays the single source of truth for every
 * subsequent toggle, ours or the user's.
 */
import { computed, inject, ref, watch } from 'vue';
import { useUiId } from '../../composables/useUiId';
import { ACCORDION_KEY } from '../../composables/useAccordion';
import { focusRing } from '../../utils/classes';

const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean }>(), {
  defaultOpen: false,
});

const context = inject(ACCORDION_KEY, undefined);
const generatedId = useUiId();
const itemId = `ui-accordion-item-${generatedId}`;
const panelId = computed(() => `${itemId}-panel`);
const detailsRef = ref<HTMLDetailsElement | null>(null);

if (context?.single && props.defaultOpen) context.setOpen(itemId);

if (context) {
  watch(context.openId, (openId) => {
    if (context.single && openId !== itemId && detailsRef.value?.open) {
      detailsRef.value.open = false;
    }
  });
}

function onToggle(event: Event): void {
  if (!context?.single) return;
  const details = event.target as HTMLDetailsElement;
  if (details.open) context.setOpen(itemId);
  else if (context.openId.value === itemId) context.setOpen(null);
}
</script>

<template>
  <details ref="detailsRef" class="group" :open="defaultOpen" @toggle="onToggle">
    <summary
      :id="itemId"
      :aria-controls="panelId"
      :class="[
        'flex cursor-pointer list-none items-center justify-between gap-2 p-4 font-medium marker:content-none',
        focusRing,
      ]"
    >
      {{ title }}
      <svg
        class="text-muted h-4 w-4 shrink-0 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-150"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </summary>
    <div :id="panelId" class="px-4 pb-4">
      <slot />
    </div>
  </details>
</template>
