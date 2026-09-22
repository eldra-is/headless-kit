<script setup lang="ts">
/**
 * `UiDialog` positioned as a side sheet instead of a centered box — same
 * `open` v-model, focus trap, Escape-closes, backdrop-closes-unless-persistent
 * behaviour, just a different `panelClass` (see `UiDialog.vue`'s note on why
 * that's a prop rather than attrs fallthrough).
 *
 * The slide uses a plain `[open]`-attribute-conditioned transform
 * (`open:translate-x-0`, Tailwind's `open` variant), which needs no JS to
 * drive. Note this only animates the *closing* edge in practice: `<dialog>`
 * goes from `display: none` to visible in the same synchronous tick that
 * `showModal()` sets `[open]`, so there is no "before" frame for the entry
 * transform to transition from — a fully animated entrance needs CSS
 * `@starting-style` (not a Tailwind v4 utility), which is out of scope here.
 */
import { computed } from 'vue';
import UiDialog from './UiDialog.vue';

const SIDE_CLASSES = {
  left: 'inset-y-0 left-0 m-0 h-full max-h-full w-[85vw] max-w-sm rounded-none border-r shadow-theme-md motion-safe:transition-transform motion-safe:duration-200 -translate-x-full open:translate-x-0',
  right:
    'inset-y-0 right-0 m-0 h-full max-h-full w-[85vw] max-w-sm rounded-none border-l shadow-theme-md motion-safe:transition-transform motion-safe:duration-200 translate-x-full open:translate-x-0',
} as const;

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    persistent?: boolean;
    side?: keyof typeof SIDE_CLASSES;
  }>(),
  { persistent: false, side: 'right' }
);

defineEmits<{ 'update:open': [value: boolean] }>();

const panelClass = computed(() => SIDE_CLASSES[props.side]);
</script>

<template>
  <UiDialog
    :open="open"
    :title="title"
    :persistent="persistent"
    :panel-class="panelClass"
    @update:open="$emit('update:open', $event)"
  >
    <slot />
  </UiDialog>
</template>
