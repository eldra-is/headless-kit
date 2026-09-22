<script setup lang="ts">
import { computed } from 'vue';
import { buttonBase, buttonSizes, buttonVariants } from '../../utils/classes';
import UiLink from './UiLink.vue';

const props = withDefaults(
  defineProps<{
    variant?: keyof typeof buttonVariants;
    size?: keyof typeof buttonSizes;
    loading?: boolean;
    disabled?: boolean;
    /** Renders a `UiLink` instead of a `<button>` when set. */
    href?: string;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    href: undefined,
    type: 'button',
  }
);

const classes = computed(() => [
  buttonBase,
  buttonVariants[props.variant],
  buttonSizes[props.size],
]);
const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
  <UiLink
    v-if="href"
    :href="href"
    :class="classes"
    :aria-busy="loading ? 'true' : undefined"
    :aria-disabled="isDisabled ? 'true' : undefined"
    :tabindex="isDisabled ? -1 : undefined"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 motion-safe:animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
    <slot />
  </UiLink>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="isDisabled"
    :aria-busy="loading ? 'true' : undefined"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 motion-safe:animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
    <slot />
  </button>
</template>
