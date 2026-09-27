<script setup lang="ts">
/**
 * The skip link is the one piece of markup that lives outside
 * `pages/[...slug].vue`'s own `<main id="main">` (see that file), so it
 * reaches every route including the not-found/error shells. It is
 * `@eldrajs/ui`'s `Link` routed through Nuxt's `<NuxtLink>` (`EldraRouterLink`,
 * the one place the theme reaches for it), so the `#main` hash is handled by
 * the router like every other internal destination.
 *
 * `Toaster` is the app's single toast host (`@eldrajs/ui`'s `useToast` is a module-level queue, so
 * whoever raises a toast — the `cart` block's Undo, for one — needs exactly one mounted region to
 * render it, and that region owns every timer and the hand-off into an open modal `<dialog>`). It
 * belongs here rather than in a block: two of them would render every toast twice.
 */
import { Link, Toaster } from '@eldrajs/ui';
import EldraRouterLink from './components/EldraRouterLink.vue';
import { useT } from './composables/useT';

const t = useT();
</script>

<template>
  <Link
    href="#main"
    :as="EldraRouterLink"
    variant="standalone"
    :classes="{
      root: 'bg-primary text-primary-contrast rounded-md sr-only px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50',
    }"
  >
    {{ t('nav.skipToContent') }}
  </Link>
  <NuxtPage />
  <Toaster />
</template>
