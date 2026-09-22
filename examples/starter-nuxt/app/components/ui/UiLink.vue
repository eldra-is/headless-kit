<script setup lang="ts">
/**
 * The one place in this starter allowed to reach for Nuxt's `<NuxtLink>` —
 * as a bare template tag, not an import (there is no `#components` import
 * outside a real Nuxt build). Nuxt registers it globally at runtime;
 * Storybook (`.storybook/preview.ts`) and unit tests
 * (`test/support/mountBlock.ts`) each register a matching stub, so the same
 * markup renders in every environment. Every other link in a block or
 * primitive must go through this component (see `app/utils/links.ts` /
 * `safeHref`).
 */
import { computed, useAttrs } from 'vue';
import { safeHref } from '../../utils/links';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Destination URL. Run through `safeHref`; an unsafe value renders a plain `span`. */
  href: string;
  /** Force external (`<a>`) rendering even for a `/`- or `#`-prefixed href. */
  external?: boolean;
}>();

const attrs = useAttrs();

const resolvedHref = computed(() => safeHref(props.href));

const isInternal = computed(() => {
  const href = resolvedHref.value;
  return href !== null && props.external !== true && (href.startsWith('/') || href.startsWith('#'));
});

/** `target="_blank"` without `rel="noopener"` lets the opened page's script
 * reach back into `window.opener` — append it whenever a consumer opens a
 * new tab, preserving any `rel` value they already set. */
const rel = computed(() => {
  if (attrs.target !== '_blank') return attrs.rel as string | undefined;
  const existing = typeof attrs.rel === 'string' ? attrs.rel.split(/\s+/).filter(Boolean) : [];
  return existing.includes('noopener') ? existing.join(' ') : [...existing, 'noopener'].join(' ');
});
</script>

<template>
  <span v-if="resolvedHref === null" v-bind="attrs"><slot /></span>
  <NuxtLink v-else-if="isInternal" v-bind="attrs" :to="resolvedHref" :rel="rel"><slot /></NuxtLink>
  <a v-else v-bind="attrs" :href="resolvedHref" :rel="rel"><slot /></a>
</template>
