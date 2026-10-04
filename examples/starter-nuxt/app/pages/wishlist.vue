<script setup lang="ts">
/**
 * `/wishlist` — the theme's own saved-for-later route.
 *
 * It is the one place a shopper can see what the heart on a product page saved, and the
 * destination both that page's toast and the header's heart name. A **code** route, not a CMS page,
 * for the same reasons `app/pages/cart.vue` and `app/pages/search.vue` are: the list is the
 * shopper's own browser state, there is nothing for an author to compose, and a store must not be
 * able to break the header's heart by deleting a page. Being a concrete route it outranks the
 * catch-all (`app/pages/[...slug].vue`), so the gateway is never asked about `/wishlist`.
 * `nuxt.config.ts` lists it in `nitro.prerender.routes` beside `/cart` and `/search`, which is what
 * writes `wishlist/index.html` into the artifact — a static host answers 404 for a path it has no
 * file for, however the app would render it.
 *
 * **No block behind it.** `/cart` and `/search` each render a block an author can also place on a
 * page, because a merchant may well want a cart or a search panel inside their own layout. A saved
 * list is not that: it has no fields, no variants and nothing to configure — it is one list of
 * products and one empty state — so this page owns its markup rather than earning a block, a
 * `block.json`, a mock entry and a generated preview for a surface nobody would ever compose. The
 * cards themselves are not hand-rolled: they are `@eldrajs/ui`'s `ProductCard` built by
 * `toProductCardEntries()`, the same mapping `collection-grid`, `product-carousel` and `search`
 * build theirs with, so a saved product looks exactly like it does in a grid.
 *
 * **The prerendered file is the empty state, and that is the honest answer.** One
 * `wishlist/index.html` is served to every visitor, and what each of them has saved lives in their
 * own browser — so the markup a build writes cannot be about any one of them. `useWishlist()` keeps
 * `items` empty until `onMounted` (the reasoning is on `createWishlistStore()`), so the server
 * renders "Your wishlist is empty", the browser's first render of that file is identical to it, and
 * the saved products arrive a moment later. It is the same arrangement `/search` has for its query.
 *
 * **One batched read, by handle.** The wishlist stores storefront handles, and
 * `catalog.byHandles()` turns the whole list into a single `filter=slug:in:…` products read
 * (`app/storefront/gateway.ts`) — not one request per saved product. With nothing saved it makes no
 * request at all, which is what the prerender and the first client render both do.
 *
 * **A product the catalogue does not answer about is not rendered, and not forgotten.** A handle
 * saved before the product was deleted simply has no card. The stored list keeps it: a read that
 * failed outright would otherwise quietly empty a shopper's wishlist, and nothing here can tell
 * "this product is gone" from "we could not ask" (`StorefrontResult.error` is the second case, and
 * it keeps the page showing what it has).
 *
 * The route carries no header and no footer, exactly as `/cart` and `/search` do: the runtime
 * resolves those only as part of a CMS page or route template, and a code route is neither.
 */
import { computed, nextTick, ref, type Component } from 'vue';
import {
  Button,
  Container,
  EmptyState,
  ProductCard,
  Section,
  Skeleton,
  VisuallyHidden,
} from '@eldrajs/ui';
import { iconComponent } from '../composables/iconComponent';
import { useRevalidating } from '../composables/useRevalidating';
import { useStorefront } from '../composables/useStorefront';
import { useT } from '../composables/useT';
import { useWishlist } from '../composables/useWishlist';
import EldraIcon from '../components/EldraIcon.vue';
import EldraRouterLink from '../components/EldraRouterLink.vue';
import { useMoney } from '../storefront/money';
import { toProductCardEntries } from '../storefront/toProductCard';
import type { StorefrontProductListItem } from '../storefront/types';

const t = useT();
const storefront = useStorefront();
/** Hydrated in `onMounted`, never before — see the module comment. */
const wishlist = useWishlist();
const money = useMoney();

/** `EmptyState.icon` takes an already-bound icon component, so it goes through the theme's shared
 *  name→component adapter, the way `blocks/cart/Block.vue` binds its own bag. */
const HeartIcon: Component = iconComponent('heart');

const result = storefront.catalog.byHandles(wishlist.items);

/**
 * The saved products, in the order they were saved (newest first) rather than whatever order the
 * catalogue answered in — the list is the shopper's, so it reads like theirs. Dropping a handle the
 * read did not answer about is the other half of the same loop; see the module comment for why the
 * stored list keeps it anyway.
 */
const products = computed<StorefrontProductListItem[]>(() => {
  const found = new Map((result.data.value ?? []).map((item) => [item.handle, item]));
  return wishlist.items.value.flatMap((handle) => {
    const item = found.get(handle);
    return item === undefined ? [] : [item];
  });
});

/** Both refresh states a card can be in, held at `false` until after mount — `useRevalidating`'s
 *  own doc comment has the reasoning, and it is the same one the gate on the wishlist has. */
const { any: cardsRevalidating, refreshing } = useRevalidating({
  keys: () => result.revalidating.value,
  refreshing: () => result.loading.value && result.data.value !== null,
});

const cards = computed(() =>
  toProductCardEntries(products.value, {
    ratio: '4x5',
    minorUnits: money.minor,
    revalidating: cardsRevalidating.value,
  })
);

/**
 * The three states the list can be in, each gated on there being something saved at all — which is
 * also the mount gate, since `items` is empty until then. That is what makes reading `loading`
 * here safe where a block would have to hold it until after mount (`useRevalidating`): on the
 * server, and in the browser's first render of the file the server wrote, `savedCount` is `0` and
 * none of these three can be true.
 *
 * `loading`, not only `pending`: `pending` is "there is nothing to show yet", and the prerendered
 * page's read has already *answered* — with `[]`, for the empty handle list it was given — so the
 * read that runs a moment after mount with the shopper's real handles is a reload over an answer,
 * never a first load. Skeletons are still the right thing to draw for it: there are saved products
 * and not one of them is on screen.
 */
const savedCount = computed(() => wishlist.count.value);
const hasSaved = computed(() => savedCount.value > 0);
const nothingDrawn = computed(() => hasSaved.value && cards.value.length === 0);
const showError = computed(() => nothingDrawn.value && result.error.value !== null);
const showSkeletons = computed(
  () => nothingDrawn.value && !showError.value && (result.loading.value || result.pending.value)
);

/**
 * The count beside the title is what is actually on screen — except while the skeletons are, where
 * it is the saved count, so the heading does not count up from zero as the read lands. The same
 * shape `/cart`'s own title has, including the "0 items" a prerendered, empty page carries above
 * its empty state.
 */
const countLabel = computed(() => {
  const count = showSkeletons.value ? savedCount.value : cards.value.length;
  return count === 1 ? t('wishlist.itemCountOne') : t('wishlist.itemCountMany', { count });
});

/**
 * Removing a card takes the element the shopper was standing on out of the document, so focus has
 * to be put somewhere deliberate — the same rule `blocks/cart/Block.vue` follows for a removed
 * line: the next card's own remove button, or the last one when the end of the list went, or the
 * empty state's heading when that was the only saved product. A heading is not focusable on its
 * own, so it gets the one `tabindex` it needs at that moment rather than carrying it always.
 *
 * The removal is also announced: the card vanishing is the feedback for anyone who can see it, and
 * nothing else about the page says out loud that it happened. No toast — the product page's heart
 * raises one because *nothing* there changes, and here the list itself does.
 */
const listEl = ref<HTMLElement | null>(null);
const emptyEl = ref<HTMLElement | null>(null);
const announcement = ref('');

async function removeCard(handle: string): Promise<void> {
  const index = cards.value.findIndex((entry) => entry.item.handle === handle);
  wishlist.remove(handle);
  announcement.value = t('wishlist.removed');
  await nextTick();

  const buttons = Array.from(
    listEl.value?.querySelectorAll<HTMLElement>('button[aria-pressed]') ?? []
  );
  if (buttons.length > 0) {
    (buttons[Math.min(index, buttons.length - 1)] ?? buttons[0])?.focus();
    return;
  }
  const heading = emptyEl.value?.querySelector<HTMLElement>('[data-part="title"]');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}

useHead(() => ({ title: t('wishlist.title') }));
</script>

<template>
  <!-- `app/app.vue`'s "Skip to content" link targets `#main`, and it reaches every route —
       including this one, which renders no header of its own, exactly as `cart.vue` does. -->
  <main id="main">
    <Section spacing="none" class="pt-8 pb-[var(--eldra-section-md)]">
      <Container width="wide">
        <div class="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          <h1
            class="font-heading text-text @tablet:text-h2 flex flex-wrap items-baseline gap-3 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
          >
            {{ t('wishlist.title') }}
            <span class="font-body text-muted text-base font-normal tracking-normal">
              {{ countLabel }}
            </span>
          </h1>
        </div>

        <!-- Always mounted and empty until there is something to say: a live region inserted with
             its message already in it is announced unreliably. -->
        <VisuallyHidden as="p" role="status">{{ announcement }}</VisuallyHidden>

        <ul
          v-if="showSkeletons"
          role="list"
          aria-hidden="true"
          class="@tablet:grid-cols-3 @tablet:gap-x-6 @tablet:gap-y-12 @desktop:grid-cols-4 grid grid-cols-2 gap-x-4 gap-y-8"
        >
          <li v-for="index in savedCount" :key="index" class="flex flex-col gap-3">
            <Skeleton variant="media" ratio="4x5" />
            <Skeleton variant="text" :lines="2" />
          </li>
        </ul>

        <ul
          v-else-if="cards.length > 0"
          ref="listEl"
          role="list"
          :aria-label="t('wishlist.items')"
          :aria-busy="refreshing ? 'true' : undefined"
          class="@tablet:grid-cols-3 @tablet:gap-x-6 @tablet:gap-y-12 @desktop:grid-cols-4 grid grid-cols-2 gap-x-4 gap-y-8"
        >
          <li v-for="entry in cards" :key="entry.item.handle" class="relative">
            <!-- No quick add, the same decision `collection-grid` makes: a cart action belongs to
                 the product page, and the one control this card owns is the heart. -->
            <ProductCard
              :product="entry.product"
              ratio="4x5"
              :heading-level="2"
              :quick-add="false"
              :revalidating="entry.revalidating"
              :announce="false"
              :link-as="entry.internal ? EldraRouterLink : undefined"
            />
            <!-- `z-10` over the card's stretched title link, which covers the whole card and
                 carries no `z-index` of its own — the same recipe `ProductCard` uses for its own
                 quick-add control, and what makes pressing the heart never navigate. -->
            <div class="absolute top-3 right-3 z-10">
              <Button
                type="button"
                icon-only
                variant="outline"
                size="sm"
                :pressed="true"
                :label="t('product.removeFromWishlist', { title: entry.product.title })"
                :classes="{ container: 'bg-surface' }"
                @click="removeCard(entry.item.handle)"
              >
                <template #leadingIcon>
                  <EldraIcon name="heart" size="sm" />
                </template>
              </Button>
            </div>
          </li>
        </ul>

        <!-- The read failed and there is nothing on screen to keep. A page that already has cards
             never shows this: a failed refresh keeps what it has (`StorefrontResult`). -->
        <EmptyState
          v-else-if="showError"
          variant="error"
          :heading-level="2"
          :title="t('storefront.error')"
        />

        <!-- Nothing to draw: nothing saved, or saved handles the catalogue answered nothing about
             (a product deleted since). Either way there is one next step, and it is the same. -->
        <div v-else ref="emptyEl">
          <EmptyState
            :icon="HeartIcon"
            :heading-level="2"
            :title="t('wishlist.emptyTitle')"
            :text="t('wishlist.emptyText')"
          >
            <template #actions>
              <!-- `/` always exists, which is what a theme can promise — the same destination the
                   empty cart offers, where `/collections/all` is a route only some stores have. -->
              <Button
                variant="primary"
                href="/"
                :as="EldraRouterLink"
                :label="t('wishlist.continueShopping')"
              />
            </template>
          </EmptyState>
        </div>
      </Container>
    </Section>
  </main>
</template>
