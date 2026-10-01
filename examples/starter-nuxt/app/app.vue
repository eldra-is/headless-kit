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
 *
 * The **cart drawer** is here for the same "exactly one host" reason, and for one more: a shopper
 * must be able to open their cart from the header on every route, so it cannot be something an
 * author places on a page — `blocks/cart/Block.vue` in its `drawer` variant, mounted once, with the
 * entry the theme owns rather than a CMS document (`app/pages/cart.vue` builds its `page`-variant
 * entry the same way). `cart.drawerHosted` is declared below, in this shell's own `setup()`, so a
 * `drawer`-variant `cart` block an author did place knows to draw no second `<dialog>` — it reads
 * the flag while it renders, on the server as well as in the browser, so the prerendered HTML and
 * the hydrated page agree. The `/cart` route stays what it was: the drawer's own "View cart"
 * destination, the deep link, and what the header's bag still points at in the generated HTML until
 * the drawer is live (see that block's `onMounted`).
 *
 * `:page-key` is `@eldrajs/theme-nuxt`'s `eldraRouteKey` (auto-imported), not Nuxt's default, and
 * it is load-bearing on a **generated** site: a host that answers `/products/ash-glaze-mug` with a
 * redirect to `/products/ash-glaze-mug/` makes Nuxt re-navigate between the two paths while the
 * page hydrates, and the catch-all route's default key differs between them — so the page, and
 * every block on it, would be destroyed and built again, running each block's `setup` (and the
 * storefront reads in it) twice. Keying by the canonical path makes that move a no-op.
 */
import { computed } from 'vue';
import { Link, Toaster } from '@eldrajs/ui';
import CartBlock from '../blocks/cart/Block.vue';
import EldraRouterLink from './components/EldraRouterLink.vue';
import { useStorefront } from './composables/useStorefront';
import { useT } from './composables/useT';

const t = useT();

const cart = useStorefront().cart;
/** Claimed in `setup()`, not from a mount hook: every block on the page is created after this line
 *  runs, in a server render as much as in the browser, which is what makes an authored
 *  `drawer`-variant `cart` block's "defer to the host" decision the same in both. */
cart.drawerHosted.value = true;

/**
 * Stable, so the drawer's `useUiId()`-derived ids are the same in the prerendered HTML and after
 * hydration, and distinct from `app/pages/cart.vue`'s `theme-cart` — on `/cart` both exist at once.
 * It is not a CMS entry id and never reaches the gateway.
 */
const DRAWER_ENTRY_ID = 'theme-cart-drawer';

/**
 * Every field is left to the block's own default except the empty state's destination: `/` always
 * exists, where `/collections/all` (what `mock.json` seeds an authored cart block with) is a route
 * only some stores have. Author-editable copy for this surface arrives with the storefront settings
 * entry (`docs/starter-kit.md`, "The cart drawer and the `/cart` route").
 */
const drawerEntry = computed(
  () =>
    ({
      id: DRAWER_ENTRY_ID,
      data: {
        variant: 'drawer',
        emptyLinkLabel: t('cart.continueShopping'),
        emptyLinkHref: '/',
      },
    }) as EldraBlockEntry<'cart'>
);
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
  <NuxtPage :page-key="eldraRouteKey" />
  <CartBlock :entry="drawerEntry" host />
  <Toaster />
</template>
