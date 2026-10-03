// This file deliberately carries no environment docblock: `vitest.config.ts` defaults to the node
// environment, so it is the one place in the suite where `window` and `document` do not exist —
// exactly the environment `nuxi generate` and every SSR request render a page in. Do not write the
// jsdom environment pragma anywhere in this file, not even inside a comment explaining its absence:
// Vitest scans the file's leading comments for that pragma and would switch the environment, which
// makes every assertion below vacuous (the first `it` guards against exactly that).
//
// Nothing else in the suite server-renders a block. `test/starter.spec.ts` does run `nuxi generate`,
// but without gateway credentials it only ever reaches the not-found shell, so no block is server
// rendered there either. That blind spot is how three `watchEffect`s in `blocks/navigation/Block.vue`
// could call `window.addEventListener` / `document.documentElement` unguarded with every gate green:
// a `flush: 'pre'` effect with no callback runs its body immediately, inside `setup()`, and `setup()`
// runs on the server too — so each server render raised `ReferenceError: window is not defined`,
// which `nitro.prerender.failOnError` turns into a failed build.
import { computed, defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import Cart from '../../blocks/cart/Block.vue';
import Navigation from '../../blocks/navigation/Block.vue';
import navigationMock from '../../blocks/navigation/mock.json';
import ProductDetail from '../../blocks/product-detail/Block.vue';
import productDetailMock from '../../blocks/product-detail/mock.json';
import ProductCarousel from '../../blocks/product-carousel/Block.vue';
import productCarouselMock from '../../blocks/product-carousel/mock.json';
import Search from '../../blocks/search/Block.vue';
import searchMock from '../../blocks/search/mock.json';
import { CURRENCY_KEY, LOCALE_KEY } from '@eldrajs/ui';
import { enUS } from '../../app/i18n/en-US';
import { formatMoney } from '../../app/storefront/money';
import { STOREFRONT_KEY } from '../../app/storefront/types';
import { createDemoStorefront } from '../../app/storefront/demo';
import { renderBlockToString, renderPageToString, renderShellToString } from '../support/renderSsr';
import type { PageFixture } from '../support/mountPage';
import homePage from '../../pages/home.page.json';
import productPage from '../../pages/product.page.json';
import collectionPage from '../../pages/collection.page.json';
import articlePage from '../../pages/article.page.json';

// `app/app.vue` reads `useRoute()` as a bare Nuxt auto-import (it is the shell: that is where closing
// the cart drawer on a route change belongs). A server render only ever calls it, never navigates.
vi.stubGlobal('useRoute', () => ({ fullPath: '/' }));

const FIXTURES: Array<[string, PageFixture]> = [
  ['home', homePage as unknown as PageFixture],
  ['product', productPage as unknown as PageFixture],
  ['collection', collectionPage as unknown as PageFixture],
  ['article', articlePage as unknown as PageFixture],
];

describe('server rendering', () => {
  it('runs in an environment with no window and no document', () => {
    // If this ever fails, every other assertion in this file is vacuous.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('server-renders the header block without touching window or document', async () => {
    const html = await renderBlockToString(Navigation, {
      id: 'ssr-header',
      data: navigationMock,
    });

    expect(html).toContain('<header');
    expect(html).toContain('Primary navigation');
  });

  /**
   * The `/search` route is prerendered **once** and that one file answers every query: a static host
   * serves the same `search/index.html` for `/search` and for `/search?q=linen`
   * (`app/pages/search.vue`). So the markup can only honestly be the idle state — and it has to stay
   * that way even when the storefront's route already carries a query, because the server render
   * that produced the file and the browser's first render of it have to be the same markup
   * (`test/pages/hydration.spec.ts` is the other half).
   */
  it('server-renders the search block as idle, even when the route carries a query', async () => {
    const html = await renderBlockToString(
      Search,
      { id: 'ssr-search', data: searchMock as unknown as Record<string, unknown> },
      { [STOREFRONT_KEY]: createDemoStorefront({ query: 'linen' }) }
    );

    expect(html).toContain(enUS.search.idleTitle);
    expect(html).toContain('type="search"');
    // Neither an answer to the query nor an answer to the empty one.
    expect(html).not.toContain('Results for');
    expect(html).not.toContain('No results for');
  });

  /**
   * The shell's own cart drawer, in the HTML a static host serves: closed (a `<dialog>` without `open`
   * is `display: none`, so nothing of it shows on a page nobody opened the cart on), and exactly one
   * of them even with an authored `drawer`-variant `cart` block on the same page — two in the markup
   * would hydrate into two, and the bag could only ever open one. The rule that makes the authored
   * block defer on the server as well as in the browser is documented on `CartStore`
   * (`app/storefront/cart.ts`).
   */
  it('server-renders the app shell with one closed cart drawer, authored block or not', async () => {
    const AuthoredCartPage = defineComponent({
      name: 'AuthoredCartPage',
      setup: () => () =>
        h('main', { id: 'main' }, [
          h(Cart, { entry: { id: 'authored-cart', data: { variant: 'drawer' } } } as never),
        ]),
    });

    const html = await renderShellToString(AuthoredCartPage);

    expect(html).toContain(enUS.cart.title);
    expect(html.match(/<dialog/g) ?? []).toHaveLength(1);
    // The attribute, not the `open:flex` utility in its class list.
    expect(html).not.toMatch(/<dialog[^>]*\sopen[=\s>]/);
  });

  /**
   * And the bag that opens it stays a real link in that HTML, which is what a visitor with no
   * JavaScript — or one reading the page before it hydrates — has. Why it does, and why the swap to a
   * button afterwards is not a hydration correction: `drawerAvailable` in `app/storefront/cart.ts`.
   */
  it('leaves the header bag an anchor to /cart in the prerendered HTML', async () => {
    const html = await renderShellToString(
      defineComponent({
        name: 'HeaderPage',
        setup: () => () =>
          h(Navigation, { entry: { id: 'ssr-header', data: navigationMock } } as never),
      })
    );

    expect(html).toContain('href="/cart"');
    expect(html).not.toMatch(/<button[^>]*aria-label="Cart/);
  });

  /**
   * The count is the shopper's own, restored in their browser after the page is up, so the server
   * never has it — and the client's first render must not have it either, or every reload that
   * restores a cart hydrates a bag the server wrote as empty against one already carrying a pill.
   * The block reads the count only once mounted; `onMounted` never runs here, so a storefront that
   * already knows about two items still renders the empty bag.
   */
  it('prerenders the bag as empty even when the storefront already holds a cart', async () => {
    const storefront = createDemoStorefront();
    const cart = { ...storefront.cart, count: computed(() => 2) };
    const html = await renderBlockToString(
      Navigation,
      { id: 'ssr-header-count', data: navigationMock },
      { [STOREFRONT_KEY]: { ...storefront, cart } }
    );

    expect(html).toContain('aria-label="Cart, empty"');
    expect(html).not.toContain('Cart, 2 items');
  });

  it.each(FIXTURES)(
    'server-renders the %s sample page with its banner, main and contentinfo in order',
    async (_name, fixture) => {
      const html = await renderPageToString(fixture);

      const header = html.indexOf('<header');
      const main = html.indexOf('<main id="main"');
      const mainEnd = html.indexOf('</main>');
      const footer = html.lastIndexOf('<footer');

      expect(header).toBeGreaterThanOrEqual(0);
      expect(main).toBeGreaterThan(header);
      expect(footer).toBeGreaterThan(mainEnd);
    }
  );

  /**
   * The prerender contract (`app/storefront/types.ts`): a commerce block's server render is the
   * page a visitor sees, so it has to carry the real price and the real stock line — not a
   * skeleton the client fills in afterwards — and it has to be the *same* markup the client's first
   * render produces, or hydration mismatches and repaints the block.
   *
   * The refresh state is the trap on that second half: the page hydrates with the storefront about
   * to revalidate, so a block that read `revalidating` straight through would paint spinners and
   * `aria-busy` on the client that the server never wrote. `useRevalidating`
   * (`app/composables/useRevalidating.ts`) is what holds the flag at `false` until after mount, and
   * the absence of both below is what proves it — `onMounted` never runs here.
   */
  describe('the prerendered commerce blocks', () => {
    it('server-renders product-detail with its price and stock line, and no skeleton', async () => {
      const html = await renderBlockToString(ProductDetail, {
        id: 'ssr-product-detail',
        data: productDetailMock as unknown as Record<string, unknown>,
      });

      expect(html).toContain('Merino crew sweater');
      expect(html).toContain('$96.00');
      expect(html).toContain('In stock, ready to ship');
      expect(html).not.toContain(enUS.storefront.loading);
      expect(html).not.toContain(enUS.storefront.notFound);
      expect(html).not.toContain('eldra-skeleton');
      // `eldra-revalidating` is the dim utility `Price`/`StockBadge` apply to a value being
      // refreshed, and nothing else in the package uses it — its absence is the refresh state's
      // absence. (`aria-busy` on its own is not a usable signal here: the demo cart store starts a
      // read of its own, so the Add to cart button is legitimately busy in this render.)
      expect(html).not.toContain('eldra-revalidating');
    });

    /**
     * The whole point of reading the store's currency at **build** time: a prerendered page is
     * already formatted in it. A store selling in krónur gets krónur in the HTML a static host
     * serves — not a dollar sign the browser corrects a tick later, and not a bare number.
     *
     * The dollar amounts are listed one by one rather than caught with a `/\$\d/` sweep: this page
     * also carries a `$` the shopper's currency does not decide — an authored FAQ sentence about a
     * $4 gift card. That is content; these are prices. (The footer's own currency text now follows
     * the same store currency as everything else — `ISK kr.` here, not a separate `$`.)
     */
    it('server-renders the product page in the store’s own currency', async () => {
      const commerce = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };
      const html = await renderPageToString(productPage as unknown as PageFixture, {
        [CURRENCY_KEY]: commerce.currency,
        [LOCALE_KEY]: 'is-IS',
        [STOREFRONT_KEY]: createDemoStorefront({ commerce }),
      });

      // The demo product is 96, was 128 (`app/storefront/demo.ts`).
      expect(html).toContain(formatMoney(96, 'ISK', 'is-IS'));
      expect(html).toContain(formatMoney(128, 'ISK', 'is-IS'));
      expect(html).toContain('kr.');
      for (const dollars of ['$96', '$128', '$164', '$28']) {
        expect(html).not.toContain(dollars);
      }
      expect(html).not.toContain('96.00');
    });

    it('server-renders product-carousel with real cards, and no skeleton', async () => {
      const html = await renderBlockToString(ProductCarousel, {
        id: 'ssr-product-carousel',
        data: productCarouselMock as unknown as Record<string, unknown>,
      });

      expect(html).toContain('Fisherman rib cardigan');
      expect(html).toContain('$164.00');
      expect(html).toContain('In stock, ships in 1–2 days');
      expect(html).not.toContain('eldra-skeleton');
      expect(html).not.toContain('eldra-revalidating');
      expect(html).not.toContain('aria-busy="true"');
      expect(html).not.toContain('data-part="spinner"');
    });
  });
});
