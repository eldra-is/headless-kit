<script setup lang="ts">
/**
 * Max-width and gutters come from the container design tokens
 * (`--eldra-container-<size>-max-width` / `-gutter-<breakpoint>`, see
 * `tokens.json`'s `containers` and `@eldrajs/theme-core`'s
 * `generateDesignTokenCss`), not from Tailwind's own `container` utility —
 * this component only sets `data-size`; the actual sizing rules live once
 * in `app/assets/main.css` under `.eldra-container[data-size]`.
 */
withDefaults(defineProps<{ size?: 'narrow' | 'content' | 'wide' | 'full' }>(), { size: 'content' });
</script>

<template>
  <div class="eldra-container" :data-size="size">
    <slot />
  </div>
</template>
