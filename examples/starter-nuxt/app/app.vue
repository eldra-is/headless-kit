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
 * entry the theme owns rather than a CMS document (the seeded `/cart` page carries its `page`-variant
 * entry the same way). The rules behind the three `cart.drawer*` flags this file sets live in one
 * place, on `CartStore` in `app/storefront/cart.ts`; `/cart` stays exactly what it was.
 *
 * `:page-key` is `@eldrajs/theme-nuxt`'s `eldraRouteKey` (auto-imported), not Nuxt's default, and
 * it is load-bearing on a **generated** site: a host that answers `/products/ash-glaze-mug` with a
 * redirect to `/products/ash-glaze-mug/` makes Nuxt re-navigate between the two paths while the
 * page hydrates, and the catch-all route's default key differs between them — so the page, and
 * every block on it, would be destroyed and built again, running each block's `setup` (and the
 * storefront reads in it) twice. Keying by the canonical path makes that move a no-op.
 */
import { computed, watch } from 'vue';
import { Link, Toaster, useToast } from '@eldrajs/ui';
import CartBlock from '../blocks/cart/Block.vue';
import EldraRouterLink from './components/EldraRouterLink.vue';
import { useStorefront } from './composables/useStorefront';
import { useT } from './composables/useT';
import { CART_ADD_TOAST_ID } from './storefront/feedback';

const t = useT();

const cart = useStorefront().cart;
/** Claimed in `setup()`, not from a mount hook: every block on the page is created after this line
 *  runs, in a server render as much as in the browser, which is what makes an authored
 *  `drawer`-variant `cart` block's "defer to the host" decision the same in both
 *  (`app/storefront/cart.ts`). */
cart.drawerHosted.value = true;

/**
 * The drawer is this shell's, so no navigation unmounts it the way a page-level one was unmounted —
 * it has to close itself, or it sits open over wherever the shopper just went, with that page inert
 * and not scrolling behind it (`useDialog` in `@eldrajs/ui`). One rule here covers every destination
 * inside the drawer — each line's product title, Check out, View cart — and back/forward with it,
 * because the router turns a `popstate` into a route change too. `flush: 'pre'` (the default) runs it
 * before the new page renders.
 *
 * `useRoute` is a Nuxt auto-import; this file is Nuxt-only already (`<NuxtPage>`, `eldraRouteKey`),
 * which is exactly why the rule belongs here and not in a block — `blocks/**` may not read the route.
 */
const route = useRoute();
watch(
  () => route.fullPath,
  () => {
    cart.drawerOpen.value = false;
  }
);

/**
 * Once the cart drawer is open, the "Added to cart" toast (`blocks/product-detail/Block.vue`,
 * `CART_ADD_TOAST_ID`) has nothing left to confirm — the shopper is looking at the cart itself,
 * whether they got there through the toast's own "View cart" action, the header bag, or anything
 * else that flips `drawerOpen`. Left alone it would sit behind the drawer until its own timer (or,
 * for the failure toast sharing this id, never) closed it. This belongs in the shell rather than
 * the block that raised the toast because the drawer is the shell's (see above) and a toast can
 * outlive the page that raised it (`route.fullPath` watch above unmounts no toast). Only this one
 * id is dismissed — an unrelated toast (a different cause, a different block) stays exactly where
 * it is.
 */
const toast = useToast();
watch(
  () => cart.drawerOpen.value,
  (open) => {
    if (open) toast.dismiss(CART_ADD_TOAST_ID);
  }
);

/**
 * An `EldraBlockEntry` needs an id. This one is the theme's own, not a CMS entry id, and never
 * reaches the gateway; it is the shell's own, distinct from any cart block on a page, so the two
 * theme-owned cart entries stay tellable apart while debugging — on `/cart` both are mounted. The ids
 * in the rendered markup do not come from here: every one of them is Vue's own `useId()`, derived
 * from the component's position in the tree (`app/composables/useUiId.ts`).
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
