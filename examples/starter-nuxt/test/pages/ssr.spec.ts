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
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import Cart from '../../blocks/cart/Block.vue';
import Navigation from '../../blocks/navigation/Block.vue';
import navigationMock from '../../blocks/navigation/mock.json';
import ProductDetail from '../../blocks/product-detail/Block.vue';
import productDetailMock from '../../blocks/product-detail/mock.json';
import ProductCarousel from '../../blocks/product-carousel/Block.vue';
import productCarouselMock from '../../blocks/product-carousel/mock.json';
import { enUS } from '../../app/i18n/en-US';
import { renderBlockToString, renderPageToString, renderShellToString } from '../support/renderSsr';
import type { PageFixture } from '../support/mountPage';
import homePage from '../../pages/home.page.json';
import productPage from '../../pages/product.page.json';
import collectionPage from '../../pages/collection.page.json';
import articlePage from '../../pages/article.page.json';

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
   * The shell's own cart drawer, in the HTML a static host serves. Two things have to be true of it:
   * a closed `<dialog>` is `display: none` to the UA, so nothing of it shows on a page nobody opened
   * the cart on; and there is exactly one of them even when an author has also placed a
   * `drawer`-variant `cart` block on the page, because the shell claims `cart.drawerHosted` in its
   * own `setup()` — before any block renders — so that block defers on the server exactly as it does
   * in the browser. Two drawers in the markup would hydrate into two, and the header's bag could
   * only ever open one of them.
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
   * And the bag that opens it stays a real link in that HTML: `cart.drawerAvailable` is raised from
   * the hosted drawer's `onMounted`, which never runs on the server, so a visitor with no JavaScript
   * — or one reading the page before it hydrates — still has `/cart` to go to. The flip to a drawer
   * button happens after hydration, as an ordinary reactive update.
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
