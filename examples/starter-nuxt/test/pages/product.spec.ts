// @vitest-environment jsdom
//
// The product sample page (`pages/product.page.json`): announcement bar, header, breadcrumbs,
// the product-detail buy box for "Merino crew sweater", a related-products carousel, an FAQ and
// the footer, rendered together through `mountPage` exactly as `app/pages/[...slug].vue` renders
// a real page: the leading structure blocks (announcement bar + header) before `<main id="main">`,
// everything else inside it, the footer after it — see `app/utils/pageStructure.ts`.
//
// Carousel counts are read off the real demo storefront (`app/storefront/demo.ts`), not assumed:
// `RELATED_HANDLES` lists 7 handles including "merino-crew-sweater" itself; `product-carousel`'s
// `related` variant filters out the product being viewed and any sold-out item (see that block's
// own module doc comment), leaving the other 6 — all in stock in the demo catalogue — which is
// where `RELATED_COUNT` below comes from. The product's own gallery has 2 images
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

const fixture = productPage as unknown as PageFixture;

/** From `app/storefront/demo.ts` — see the module comment above. */
const RELATED_COUNT = 6;

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
  return mountPage(withAuthoredHeaderLink(fixture), { attachTo: document.body });
}

describe('product sample page', () => {
  it('is composed of exactly the fixture blocks, in the documented order', () => {
    expect(fixture.blocks.map((b) => b.apiId)).toEqual([
      'announcement-bar',
      'navigation',
      'breadcrumbs',
      'product-detail',
      'product-carousel',
      'faq',
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
      'Free shipping on orders over $80', // announcement-bar
      'aria-label="Primary navigation"', // navigation
      'aria-label="Breadcrumb"', // breadcrumbs
      'aria-label="Product images"', // product-detail (gallery)
      'You may also like', // product-carousel
      'Shipping &amp; care', // faq
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

  it('renders the breadcrumb trail exactly once (product-detail keeps showCategory off)', async () => {
    const wrapper = await mountProductPage();
    const trails = wrapper.findAll('nav[aria-label="Breadcrumb"]');
    expect(trails).toHaveLength(1);
    const text = trails[0]!.text();
    expect(text).toContain('Knitwear');
    expect(text).toContain('Sweaters');
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

  it('tab order runs header → breadcrumbs → product-detail → carousel → faq → footer', async () => {
    const wrapper = await mountProductPage();
    const html = wrapper.html();
    // The header's first focusable control. It used to be the Menu button, which the seeded header
    // no longer draws: with no links, no call to action and accounts off there is nothing to put in
    // the drawer, so the brand wordmark is the first thing the tab order reaches.
    const header = html.indexOf('data-eldra-header-focus');
    const breadcrumb = html.indexOf('aria-label="Breadcrumb"');
    const gallery = html.indexOf('aria-label="Product images"');
    const carousel = html.indexOf('You may also like');
    const faqHeading = html.indexOf('Shipping &amp; care');
    const footer = html.indexOf('<footer');
    const order = [header, breadcrumb, gallery, carousel, faqHeading, footer];
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeGreaterThan(order[i - 1]!);
    }
    wrapper.unmount();
  });

  describe('related-products carousel', () => {
    it(`excludes the current product and shows the other ${RELATED_COUNT} demo related items`, async () => {
      const wrapper = await mountProductPage();
      const carousel = wrapper.get('section[aria-roledescription="carousel"]');
      const slides = carousel.findAll('[data-part="slide"]');
      expect(slides).toHaveLength(RELATED_COUNT);
      for (const slide of slides) {
        expect(slide.text()).not.toContain('Merino crew sweater');
      }
      wrapper.unmount();
    });

    it(`labels slides "n of ${RELATED_COUNT}" and renders no counter`, async () => {
      const wrapper = await mountProductPage();
      const carousel = wrapper.get('section[aria-roledescription="carousel"]');
      const slides = carousel.findAll('[data-part="slide"]');
      expect(slides[0]!.attributes('aria-label')).toBe(`1 of ${RELATED_COUNT}`);
      expect(slides[RELATED_COUNT - 1]!.attributes('aria-label')).toBe(
        `${RELATED_COUNT} of ${RELATED_COUNT}`
      );
      // A product row shows several cards at once, so no "n / total" counter (spec "Carousel" →
      // Product row); the slides' own labels carry the position for assistive technology.
      expect(carousel.find('[data-part="counter"]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  it('shares the same ground across product-detail, the carousel and the FAQ, with only the footer changing it', async () => {
    const wrapper = await mountProductPage();
    const [, , , productDetail, carousel, faq, footer] = pageBlockRoots(wrapper);
    expect(productDetail!.getAttribute('data-section-bg')).toBe('none');
    expect(carousel!.getAttribute('data-section-bg')).toBe('none');
    expect(faq!.getAttribute('data-section-bg')).toBe('none');
    expect(footer!.getAttribute('data-section-bg')).toBe('surface-strong');
    // Adjacency (not just value) is what the package's CSS rule keys off:
    expect(productDetail!.nextElementSibling).toBe(carousel);
    expect(carousel!.nextElementSibling).toBe(faq);
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
    it('menu drawer: opens as a dialog and Esc returns focus to the menu button', async () => {
      const wrapper = await mountProductPageWithHeaderLink();
      const menuButton = wrapper.get('button[aria-label="Open menu"]');
      menuButton.element.focus();
      await menuButton.trigger('click');
      const dialog = wrapper.get('dialog[open]');
      expect(dialog.attributes('open')).toBe('');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await wrapper.vm.$nextTick();

      expect(wrapper.findAll('dialog[open]')).toHaveLength(0);
      expect(document.activeElement).toBe(menuButton.element);
      wrapper.unmount();
    });

    it('search: opens as a dialog and Esc returns focus to the search button', async () => {
      const wrapper = await mountProductPage();
      const searchButton = wrapper.get('button[aria-label="Search"]');
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

    it('lightbox: opens from zoom and Esc returns focus to the zoom button', async () => {
      const wrapper = await mountProductPage();
      const zoomButton = wrapper.get('button[aria-haspopup="dialog"][aria-label^="Zoom image"]');
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

  it('carries the shared policy facts (Portland, 2 business days, over $80, free US returns, 400°F)', async () => {
    const wrapper = await mountProductPage();
    const text = wrapper.text();
    expect(text).toContain('Portland');
    expect(text).toContain('2 business days');
    expect(text).toContain('$80');
    expect(text).toContain('US returns are free');
    expect(text).toContain('400°F');
    wrapper.unmount();
  });

  it('exposes exactly one banner, one main and one contentinfo landmark', async () => {
    // The announcement bar and header render before `<main id="main">` and the footer after it
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
});
