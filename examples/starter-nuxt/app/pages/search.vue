<script setup lang="ts">
/**
 * `/search` — the theme's own search results route.
 *
 * Everything in the theme that can submit a search already names this path: `@eldrajs/ui`'s
 * `SearchBar` and `SearchModal` default their `action` to `/search` and build `${action}?q=…` when a
 * shopper presses Enter or follows "See all N results", and `blocks/search/Block.vue`'s own chips,
 * "Did you mean" link and per-section "View all" links point back at it. Nothing in the theme
 * answered it, so the site's catch-all (`app/pages/[...slug].vue`) asked the gateway for a CMS page
 * called "search", found none, and every shopper who pressed Enter in the header landed on the
 * not-found shell. This is the page they were being sent to.
 *
 * It is a **code** route, not a CMS page, for the same reasons `app/pages/cart.vue` is: a search is
 * the shopper's own query, there is nothing for an author to compose, and a store must not be able
 * to break the header's search field by deleting a page. Being a concrete route it also outranks
 * the catch-all, so the gateway is never asked about `/search`. `nuxt.config.ts` lists it in
 * `nitro.prerender.routes`, which is what puts `search/index.html` in the artifact a static host
 * serves — without that the generated site has no `/search` file and the host answers 404 whatever
 * this component renders.
 *
 * **The query is client-side state.** A static host serves one `search/index.html` for `/search`,
 * `/search?q=mug` and every other query, so the prerendered HTML cannot be about any one of them:
 * it is the block's idle state (the heading, the field, the popular searches), and the query is read
 * out of the URL after hydration by `useStorefront().route.query`, which the block already follows.
 * That is also why `blocks/search/Block.vue` prints no "No results for “”" heading without a query —
 * the alternative was an artifact whose every search page claimed, in its HTML, to have found
 * nothing.
 *
 * The results page itself is `blocks/search/Block.vue` in its `results-page` variant — one
 * implementation of the field, the tabs, the result sections and the no-results state, shared with
 * the block an author can place on a page. The entry handed to it is the theme's own rather than a
 * CMS entry (a code route has no document), so every field is either left to the block's own default
 * or filled from `app/i18n` and follows the content locale like the rest of the theme. Two fields
 * are deliberately left absent: `popularSearches` and `noResultsCollection` are a merchant's
 * answers — which searches their shoppers actually make, which collection to fall back on — and a
 * theme that invented them would be putting words in their mouth. An author who wants them places
 * the `search` block on a page of their own.
 *
 * Author-editable copy for this surface arrives with the storefront settings entry
 * (`docs/starter-kit.md`), as it does for the cart route; until then the strings above are the
 * theme's.
 */
import { computed } from 'vue';
import SearchBlock from '../../blocks/search/Block.vue';
import { useT } from '../composables/useT';

const t = useT();

/**
 * An `EldraBlockEntry` needs an id. This one is the theme's own, not a CMS entry id, and never
 * reaches the gateway — the same arrangement `app/pages/cart.vue` describes. No id in the rendered
 * markup comes from here: those are Vue's `useId()` (`app/composables/useUiId.ts`).
 */
const ENTRY_ID = 'theme-search';

const entry = computed(
  () =>
    ({
      id: ENTRY_ID,
      data: {
        variant: 'results-page',
        // Carries the `{query}` placeholder the block interpolates; with no query yet it renders
        // the block's own idle title instead.
        heading: t('search.resultsHeading'),
      },
    }) as EldraBlockEntry<'search'>
);

useHead(() => ({ title: t('search.title') }));
</script>

<template>
  <!-- `app/app.vue`'s "Skip to content" link targets `#main`, and it reaches every route —
       including this one, which renders no header of its own, exactly as `cart.vue` does. -->
  <main id="main">
    <SearchBlock :entry="entry" />
  </main>
</template>
