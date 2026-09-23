<script setup lang="ts">
/**
 * The skip link is the one piece of markup that lives outside
 * `pages/[...slug].vue`'s own `<main id="main">` (see that file), so it
 * reaches every route including the not-found/error shells. `UiLink` is the
 * only place allowed to render `NuxtLink` — see its own doc comment — so
 * the internal `#main` hash target goes through it rather than a bare `<a>`.
 */
import UiLink from './components/ui/UiLink.vue';
import { focusRing } from './utils/classes';
import { useT } from './composables/useT';

const t = useT();
</script>

<template>
  <UiLink
    href="#main"
    :class="[
      focusRing,
      'bg-primary text-primary-contrast rounded-theme-md sr-only px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50',
    ]"
  >
    {{ t('nav.skipToContent') }}
  </UiLink>
  <NuxtPage />
</template>
