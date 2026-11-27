// @vitest-environment jsdom
//
// The product sample page (`pages/product.page.json`): header, breadcrumbs, the product-detail
// buy box for "Merino crew sweater", the related products as a grid on a `surface` band ("Goes well
// with") and the footer, rendered
// together through `mountPage` exactly as `app/pages/[...slug].vue` renders a real page: the
// leading structure block (the header, which carries its own info strip) before `<main id="main">`,
// everything else inside it, the footer after it — see `app/utils/pageStructure.ts`.
//
// Related counts are read off the real demo storefront (`app/storefront/demo.ts`), not assumed:
// `RELATED_HANDLES` lists 7 handles including "merino-crew-sweater" itself; `product-carousel`'s
// `related` variant filters out the product being viewed and any sold-out item (see that block's
// own module doc comment), leaving 6, and the fixture's `limit` of 4 shows the first four — which
// is where `RELATED_COUNT` below comes from. The product's own gallery has 2 images
// (`buildFullProduct`: `[demoImage(index + 1, …), demoImage(index + 7, …)]`), and its `colour`
// option carries one unavailable value ("Moss") used below to reach the back-in-stock dialog.
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from '../support/axe';
import {
  expectPageLandmarks,
  expectSkipLinkLandsAfterTheHeader,
  mountPage,
  mountPageWithSkipLink,
  pageBlockRoots,
  withAuthoredHeaderLink,
} from '../support/mountPage';
import productPage from '../../pages/product.page.json';
import type { PageFixture } from '../support/mountPage';
import { createDemoStorefront } from '../../app/storefront/demo';

const fixture = productPage as unknown as PageFixture;

/** From `app/storefront/demo.ts` — see the module comment above. */
const RELATED_COUNT = 4;

/** The product-detail block's own "no fake urgency" guard (`blocks/product-detail/__tests__/Block.spec.ts`), applied
 *  here over the whole rendered page rather than one block. */
const URGENCY_PATTERN = /\d+ (people|viewing)|only today|hurry/i;

async function mountProductPage() {
  return mountPage(fixture, { attachTo: document.body });
}

/** The same page with one link authored onto its header, for the cases that are about the mobile
 *  drawer — the seeded header has nothing to put in one, so it draws neither the Menu button nor the
 *  drawer (see `withAuthoredHeaderLink`). */
async function mountProductPageWithHeaderLink() {
  return mountPage(withAuthoredHeaderLink(fixture), {
    attachTo: document.body,
  });
}

describe('product sample page', () => {
  it('is composed of exactly the fixture blocks, in the documented order', () => {
    expect(fixture.blocks.map((b) => b.apiId)).toEqual([
      'navigation',
      'breadcrumbs',
      'product-detail',
      'product-carousel',
      'footer',
    ]);
  });

  it('renders every block once, in DOM order, across the page’s three landmark regions', async () => {
    const wrapper = await mountProductPage();
    const children = pageBlockRoots(wrapper);
    expect(children).toHaveLength(fixture.blocks.length);

    // Order, by a stable marker each block already renders (mirrors
    // `test/support/mountPage.spec.ts`'s own html.indexOf pattern).
    const html = wrapper.html();
    const markers = [
      'data-eldra-header-focus', // navigation
      'aria-label="Breadcrumb"', // breadcrumbs
      'aria-label="Product images"', // product-detail (gallery)
      'Goes well with', // product-carousel
      '<footer', // footer
    ];
    const indices = markers.map((marker) => html.indexOf(marker));
    expect(indices.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
    wrapper.unmount();
  });

  it('has exactly one h1 — the product title', async () => {
    const wrapper = await mountProductPage();
    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toBe('Merino crew sweater');
    wrapper.unmount();
  });

  /**
   * One trail, and it is **the store's**: the seed authors no `trail` levels at all (a route template
   * cannot — it renders whatever product its `:slug` matched) and turns `breadcrumbs`' `fromProduct`
   * on instead, so the levels between Home and the product are the product's own categories.
   * `product-detail`'s own `showCategory` stays off, which is what keeps it to one trail.
   */
  it('renders the store’s category trail exactly once (product-detail keeps showCategory off)', async () => {
    const wrapper = await mountProductPage();
    const trails = wrapper.findAll('nav[aria-label="Breadcrumb"]');
    expect(trails).toHaveLength(1);
    const text = trails[0]!.text();
    expect(text).toContain('Home');
    // The demo catalogue puts the merino sweater under `Knitwear`, a root category — so one level,
    // linking to that category's own page.
    expect(text).toContain('Knitwear');
    expect(trails[0]!.get('a[href="/categories/knitwear"]').text()).toBe('Knitwear');
    expect(text).toContain('Merino crew sweater');
    wrapper.unmount();
  });

  it('gallery precedes the information column inside product-detail (tab order)', async () => {
    const wrapper = await mountProductPage();
    const html = wrapper.html();
    const gallery = html.indexOf('aria-label="Product images"');
    const information = html.indexOf('aria-label="Product information"');
    expect(gallery).toBeGreaterThanOrEqual(0);
    expect(information).toBeGreaterThan(gallery);
    wrapper.unmount();
  });

  it('tab order runs header → breadcrumbs → product-detail → related → footer', async () => {
    const wrapper = await mountProductPage();
    const html = wrapper.html();
    // The header's first focusable control. It used to be the Menu button, which the seeded header
    // no longer draws: with no links and no call to action there is nothing to put in the drawer,
    // so the brand wordmark is the first thing the tab order reaches.
    const header = html.indexOf('data-eldra-header-focus');
    const breadcrumb = html.indexOf('aria-label="Breadcrumb"');
    const gallery = html.indexOf('aria-label="Product images"');
    const related = html.indexOf('Goes well with');
    const footer = html.indexOf('<footer');
    const order = [header, breadcrumb, gallery, related, footer];
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeGreaterThan(order[i - 1]!);
    }
    wrapper.unmount();
  });

  /**
   * The design's "Goes well with": every related product at once in a four-across grid (the
   * `grid` layout), never a sideways carousel with arrows, and no FAQ section after it — the design
   * has none on the product page.
   */
  describe('related products ("Goes well with")', () => {
    it(`shows ${RELATED_COUNT} related products as a grid, not a carousel, without the current product`, async () => {
      const wrapper = await mountProductPage();
      const [, , , related] = pageBlockRoots(wrapper);
      expect(related!.querySelector('h2')?.textContent).toContain('Goes well with');
      expect(related!.querySelector('[aria-roledescription="carousel"]')).toBeNull();
      const cards = related!.querySelectorAll('ul[role="list"] > li');
      expect(cards).toHaveLength(RELATED_COUNT);
      for (const card of cards) expect(card.textContent).not.toContain('Merino crew sweater');
      // "Shop all knitwear →" on its own at the right of a plain heading.
      expect(related!.querySelector('h2 a')).toBeNull();
      expect(related!.querySelector('a[data-view-all]')?.textContent?.trim()).toBe(
        'Shop all knitwear'
      );
      wrapper.unmount();
    });

    it('has no FAQ section on the page', async () => {
      const wrapper = await mountProductPage();
      expect(wrapper.text()).not.toContain('Shipping & care');
      expect(wrapper.find('[data-block="faq"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  it('sets the related products on a `surface` band between the product and the footer', async () => {
    const wrapper = await mountProductPage();
    const [, , productDetail, related, footer] = pageBlockRoots(wrapper);
    expect(productDetail!.getAttribute('data-section-bg')).toBe('none');
    expect(related!.getAttribute('data-section-bg')).toBe('surface');
    expect(footer!.getAttribute('data-section-bg')).toBe('primary');
    expect(productDetail!.nextElementSibling).toBe(related);
    wrapper.unmount();
  });

  it('names the maker above the title, as a link to a search for their other products', async () => {
    const wrapper = await mountProductPage();
    const maker = wrapper.get('[data-product-maker] a');
    expect(maker.text()).toBe('Fell & Fleece');
    expect(maker.attributes('href')).toBe('/search?q=Fell%20%26%20Fleece');
    const html = wrapper.html();
    expect(html.indexOf('data-product-maker')).toBeLessThan(html.indexOf('<h1'));
    wrapper.unmount();
  });

  it('draws the Details tab as a definition list of label and value pairs, open', async () => {
    const wrapper = await mountProductPage();
    const details = wrapper.findAll('details').find((d) => d.text().startsWith('Details'))!;
    expect((details.element as HTMLDetailsElement).open).toBe(true);
    const terms = details.findAll('dl > dt').map((dt) => dt.text());
    expect(terms).toEqual(['Material', 'Fit', 'Weight', 'Made in']);
    expect(details.findAll('dl > dd')).toHaveLength(4);
    expect(details.find('ul').exists()).toBe(false);
    wrapper.unmount();
  });

  it('gives Colour and Size page-unique radio group names, with legends still reading the human names', async () => {
    const wrapper = await mountProductPage();
    const radios = wrapper.findAll('input[type="radio"]');
    // 4 colour values + 5 size values (app/storefront/demo.ts MERINO_OPTIONS) — the only radio
    // groups on this page, both scoped to product-detail's own `<form>`.
    expect(radios).toHaveLength(9);
    // `VariantPicker`'s `name` is a `useUiId()`-unique key (`<option.name>-<instanceId>`), not the
    // human label, so this page has exactly two distinct, non-empty group names — never reused by
    // a different radio group elsewhere on the page, since there is no other radio input on the
    // page at all outside these two groups.
    const names = new Set(radios.map((r) => r.attributes('name')));
    expect(names.size).toBe(2);
    for (const name of names) expect(name).not.toBe('');
    // `legend` is what keeps the visible/accessible text reading "Colour"/"Size" regardless.
    const legends = wrapper.findAll('legend').map((l) => l.text());
    expect(legends[0]).toContain('Colour');
    expect(legends[1]).toContain('Size');
    wrapper.unmount();
  });

  it('keeps the sticky buy bar out of the DOM while the main Add to cart button is visible', async () => {
    const wrapper = await mountProductPage();
    const addToCart = wrapper.get('button[type="submit"]');
    expect(addToCart.text()).toContain('Add to cart');
    // `StickyBuyBar` starts `targetVisible: true` and jsdom has no `IntersectionObserver`, so it
    // never flips — the bar is not rendered at all (`v-if`, not merely hidden).
    expect(wrapper.find('[aria-label="Quick add"]').exists()).toBe(false);
    wrapper.unmount();
  });

  describe('modals', () => {
    it('menu drawer: opens under the header and Esc returns focus to the menu button', async () => {
      const wrapper = await mountProductPageWithHeaderLink();
      const menuButton = wrapper.get('button[aria-label="Menu"]');
      menuButton.element.focus();
      await menuButton.trigger('click');
      // The design's inline drawer: a disclosure under the bar, its button now reading Close.
      expect(menuButton.attributes('aria-expanded')).toBe('true');
      expect(menuButton.attributes('aria-label')).toBe('Close');
      expect(wrapper.findAll('dialog[open]')).toHaveLength(0);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await wrapper.vm.$nextTick();

      expect(menuButton.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(menuButton.element);
      wrapper.unmount();
    });

    it('search: opens as a dialog and Esc returns focus to the search button', async () => {
      const wrapper = await mountProductPage();
      // The labelled Search tool, named by its visible label.
      const searchButton = wrapper
        .findAll('button')
        .find((button) => button.text().trim() === 'Search')!;
      searchButton.element.focus();
      await searchButton.trigger('click');
      expect(wrapper.findAll('dialog[open]').length).toBeGreaterThan(0);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll('dialog[open]')).toHaveLength(0);
      expect(document.activeElement).toBe(searchButton.element);
      wrapper.unmount();
    });

    it('lightbox: opens from a mosaic tile and Esc returns focus to that tile', async () => {
      const wrapper = await mountProductPage();
      const zoomButton = wrapper.get('button[aria-haspopup="dialog"][aria-label^="Open image"]');
      zoomButton.element.focus();
      await zoomButton.trigger('click');
      const dialog = wrapper.get('dialog[aria-label="Merino crew sweater, images"]');
      expect(dialog.attributes('open')).toBe('');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await wrapper.vm.$nextTick();

      expect(
        wrapper.find('dialog[aria-label="Merino crew sweater, images"]').attributes('open')
      ).toBeUndefined();
      expect(document.activeElement).toBe(zoomButton.element);
      wrapper.unmount();
    });

    it('back-in-stock dialog: Notify me on an unavailable colour opens a dialog and Esc returns focus', async () => {
      const wrapper = await mountProductPage();
      // "Moss" is the demo catalogue's one unavailable colour value (app/storefront/demo.ts);
      // sold-out options are never disabled (VariantPicker), so selecting it is a real user path.
      const moss = wrapper.get('input[type="radio"][value="moss"]');
      await moss.setValue();
      await flushPromises();

      const notifyButton = wrapper.get('button[type="submit"]');
      expect(notifyButton.text()).toContain('Notify me');
      notifyButton.element.focus();
      await notifyButton.trigger('click');
      await flushPromises();

      const dialog = wrapper.get('dialog[aria-labelledby]');
      expect(dialog.attributes('open')).toBe('');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await flushPromises();

      expect(wrapper.get('dialog[aria-labelledby]').attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(notifyButton.element);
      wrapper.unmount();
    });
  });

  it('never renders a countdown, a viewer count or manufactured urgency anywhere on the page', async () => {
    const wrapper = await mountProductPage();
    expect(wrapper.html()).not.toMatch(URGENCY_PATTERN);
    wrapper.unmount();
  });

  it('carries the shared policy facts (Portland, 2 business days, over $80, 30-day returns)', async () => {
    const wrapper = await mountProductPage();
    const text = wrapper.text();
    expect(text).toContain('Portland');
    expect(text).toContain('2 business days');
    expect(text).toContain('$80');
    expect(text).toContain('30-day returns');
    wrapper.unmount();
  });

  it('exposes exactly one banner, one main and one contentinfo landmark', async () => {
    // The header renders before `<main id="main">` and the footer after it
    // (`app/utils/pageStructure.ts`), which is the only way `<header>`/`<footer>` map to the
    // `banner`/`contentinfo` roles at all.
    const wrapper = await mountProductPage();
    expectPageLandmarks(wrapper);
    wrapper.unmount();
  });

  it('puts the skip link first, landing the visitor after the header', async () => {
    const wrapper = await mountPageWithSkipLink(fixture);
    expectSkipLinkLandsAfterTheHeader(wrapper);
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = await mountProductPage();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  /**
   * **Both category fields on at once, which is now the default pair.** `breadcrumbs`' `fromProduct`
   * is on unless an author turns it off, and so is `product-detail`'s `showCategory` — and a product
   * route template an author builds themselves, or a seeded one whose merchant turned
   * `showCategory` back on, carries both. The two must not be two trails: `breadcrumbs` owns the
   * trail from Home down to the category, `product-detail` names the category as a single label
   * beside the title. Before that split the page had the same levels twice, in two `<nav>`s both
   * named "Breadcrumb".
   *
   * The fixture is reshaped to the two defaults rather than to its own values: `breadcrumbs` loses
   * `fromProduct` (the shape a document seeded before the field carries) and `product-detail` loses
   * both `showCategory: false` and its pinned `productHandle`, so each block falls back to the route
   * — which is what a catalog seed does anyway (`app/templates.ts`). A product two levels deep in
   * the demo tree is what tells a trail from a label.
   */
  it('draws the trail once and the category label once when both fields are on', async () => {
    const bothOn: PageFixture = {
      ...fixture,
      blocks: fixture.blocks.map((block) => {
        if (block.apiId === 'breadcrumbs') {
          const { fromProduct: _fromProduct, ...rest } = block.data as Record<string, unknown>;
          return { ...block, data: rest };
        }
        if (block.apiId === 'product-detail') {
          const {
            showCategory: _showCategory,
            productHandle: _productHandle,
            ...rest
          } = block.data as Record<string, unknown>;
          return { ...block, data: rest };
        }
        return block;
      }),
    };
    const wrapper = await mountPage(bothOn, {
      storefront: createDemoStorefront({ productHandle: 'speckled-latte-mug' }),
    });
    await flushPromises();

    // One breadcrumb landmark on the page, and it carries the whole trail.
    const trails = wrapper.findAll('nav[aria-label="Breadcrumb"]');
    expect(trails).toHaveLength(1);
    expect(trails[0]!.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/',
      '/categories/home',
      '/categories/home/ceramics',
    ]);

    // And exactly one category link outside it: `product-detail`'s leaf label, never a second trail.
    const categoryLinks = wrapper
      .findAll('a')
      .filter((link) => link.attributes('href')?.startsWith('/categories/') === true);
    const outsideTheTrail = categoryLinks.filter(
      (link) => trails[0]!.element.contains(link.element) === false
    );
    expect(outsideTheTrail.map((link) => link.attributes('href'))).toEqual([
      '/categories/home/ceramics',
    ]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
