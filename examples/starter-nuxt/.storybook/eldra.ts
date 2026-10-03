import type { Decorator } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { createEldraClient } from '@eldrajs/theme-core';
import { provideEldra } from '@eldrajs/theme-vue';
import { provideEldraUiCurrency, provideEldraUiLocale, provideEldraUiMessages } from '@eldrajs/ui';
import { uiMessagesFor } from '../app/i18n/uiMessages';
import { uiCurrencyFor } from '../app/storefront/commerce';
import { createDemoStorefront, DEMO_CART_LINES } from '../app/storefront/demo';
import { STOREFRONT_KEY } from '../app/storefront/types';

/**
 * Provides the same `EldraContext` a real page gets from
 * `@eldrajs/theme-nuxt`'s runtime plugin, so a block rendered as a story
 * sees exactly what it sees in production: a client (never called —
 * stories pass `entry` data directly via args, no block here fetches), read
 * mode (`preview.active` stays `false`, its `createEldraPreviewState()`
 * default — there is no Studio bridge in Storybook), and a fixed content
 * locale. `provideEldra` builds the rest of the context
 * (`@eldrajs/theme-vue`'s own `EldraContext`) with its own safe defaults,
 * which is all a block needs: none of the 33 starter blocks read
 * `designTokens` directly, only the CSS custom properties
 * `virtual:eldra/tokens.css` sets (imported once in `preview.ts`).
 *
 * Also provides the Northwind demo storefront (`app/storefront/demo.ts`) under `STOREFRONT_KEY` —
 * the same wiring `app/plugins/eldra-storefront.ts` does on a real page — so a commerce block
 * story (and the Playwright preview screenshot taken from it) renders real-looking catalogue,
 * cart and order data with no gateway, exactly like `test/support/mountBlock.ts` does for specs.
 *
 * `query: 'linen'` seeds `route.query` with the design spec's own example search (spec
 * `02-blocks.md` "Search results page" → "Default content"), so the `search` block's own
 * `results-page` story renders its heading as "Results for “linen”" rather than an empty pair of
 * quotes — the only block that reads `route.query` today, so this is inert for every other one.
 *
 * The cart seed is **not** inert, so unlike the query it is scoped to one block's stories: a cart
 * with items changes the header's bag badge and its accessible name (`blocks/navigation/Block.vue`
 * renders the badge under `v-if="cartCount > 0"`), which would quietly change every other block's
 * story and screenshot. `CART_STORY_TITLE` is the title `scripts/generate-stories.mjs` gives the
 * cart block's generated file, and Storybook hands every decorator the story's own context
 * (`storyContext` — the local `context` below is the Eldra one), so the seed applies there and
 * nowhere else.
 */
const CART_STORY_TITLE = 'Blocks/cart';

export const withEldraContext: Decorator = (story, storyContext) => ({
  components: { story },
  setup() {
    const context = provideEldra({
      client: createEldraClient({ gatewayUrl: 'https://storybook.invalid', orgId: 'storybook' }),
    });
    context.preview.locale = 'en-US';
    // The same wiring `app/plugins/eldra-ui-messages.ts` does on a real page:
    // `@eldrajs/ui`'s own strings and number locale follow the story's content
    // locale, and its store currency comes from the storefront rather than the
    // locale — on a real page the platform publishes it, here the demo source
    // declares it (`DEMO_COMMERCE`, US dollars, the currency every Northwind
    // amount in the fixtures is quoted in).
    provideEldraUiMessages(uiMessagesFor(context.preview.locale));
    provideEldraUiLocale(context.preview.locale);
    // The demo cart starts empty (a real shopper's first visit), which would leave the `cart`
    // block's own stories showing only its empty state — and its `drawer` story showing nothing at
    // all, since a closed `<dialog>` draws nothing. Seeding the spec's own cart content and opening
    // the drawer is what makes both stories (and the screenshots taken from them) show the real
    // thing; every other story keeps the empty cart it had before, badge and all. The demo search
    // query is global by contrast — see the comment above.
    const isCartStory = storyContext.title === CART_STORY_TITLE;
    const storefront = createDemoStorefront({
      query: 'linen',
      cartLines: isCartStory ? DEMO_CART_LINES : undefined,
    });
    if (isCartStory) storefront.cart.drawerOpen.value = true;
    provideEldraUiCurrency(uiCurrencyFor(storefront.commerce?.currency));
    provide(STOREFRONT_KEY, storefront);
    return {};
  },
  template: '<story />',
});
