<script setup lang="ts">
/**
 * `/cart` — the theme's own cart route.
 *
 * The cart a shopper reaches *without* leaving the page they are on is the drawer the theme hosts in
 * `app/app.vue`; this route is the rest of what `/cart` has to be — the drawer's own "View cart"
 * destination, the deep link somebody can bookmark or be sent, and what the header's bag still leads
 * to in the prerendered HTML (`drawerAvailable` in `app/storefront/cart.ts`). Both the bag and the
 * drawer have always named `/cart`; nothing in the theme answered it, so the site's catch-all
 * (`app/pages/[...slug].vue`) asked the gateway for a CMS page with that slug, found none, and landed
 * every shopper on the not-found shell. This is the page they were being sent to.
 *
 * It is a **code** route, not a CMS page: a shopper's cart is their own session, there is nothing
 * for an author to compose, and a site must not be able to lose its cart by deleting a page. Being
 * a concrete route it also outranks the catch-all, so the gateway is never asked about `/cart`.
 * `nuxt.config.ts` lists it in `nitro.prerender.routes`, which is what puts `cart/index.html` in
 * the artifact a static host serves — without that the generated site has no `/cart` file and the
 * host answers 404 whatever this component renders.
 *
 * The cart itself is `blocks/cart/Block.vue` in its `page` variant — one implementation of the
 * line items, the totals and the empty state, shared with the block an author can place on a page.
 * The entry handed to it is the theme's own rather than a CMS entry (a code route has no document):
 * every field is either left to the block's own default or filled from `app/i18n`, so the copy
 * follows the content locale like the rest of the theme. The one destination worth naming is the
 * empty state's — `/` always exists, where `/collections/all` (what `mock.json` seeds an authored
 * cart block with) is a route only some stores have.
 *
 * Author-editable copy for this surface arrives with the storefront settings entry
 * (`docs/starter-kit.md`, "The cart drawer and the `/cart` route"); until then the strings above
 * are the theme's.
 */
import { computed } from 'vue';
import CartBlock from '../../blocks/cart/Block.vue';
import { useT } from '../composables/useT';

const t = useT();

/**
 * An `EldraBlockEntry` needs an id. This one is the theme's own, not a CMS entry id, and never
 * reaches the gateway; `app/app.vue`'s hosted drawer carries its own (`theme-cart-drawer`) so the
 * two theme-owned cart entries stay tellable apart — on this route both are mounted. No id in the
 * rendered markup comes from here: those are Vue's `useId()`, derived from a component's position in
 * the tree (`app/composables/useUiId.ts`).
 */
const ENTRY_ID = 'theme-cart';

const entry = computed(
  () =>
    ({
      id: ENTRY_ID,
      data: {
        variant: 'page',
        emptyLinkLabel: t('cart.continueShopping'),
        emptyLinkHref: '/',
      },
    }) as EldraBlockEntry<'cart'>
);

useHead(() => ({ title: t('cart.title') }));
</script>

<template>
  <!-- `app/app.vue`'s "Skip to content" link targets `#main`, and it reaches every route —
       including this one, which renders no header of its own. -->
  <main id="main">
    <CartBlock :entry="entry" />
  </main>
</template>
