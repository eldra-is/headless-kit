// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ref, type Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { ProductCard, Skeleton } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontSource,
} from '../../../app/storefront/types';
import { createDemoStorefront, PRODUCTS } from '../../../app/storefront/demo';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import { enUS } from '../../../app/i18n/en-US';

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = { heading: mock.heading, variant: 'related' };

function resolvedResult<T>(value: T | null): StorefrontResult<T> {
  return {
    data: ref(value) as Ref<T | null>,
    pending: ref(false),
    error: ref(null),
    refresh: async () => {},
  };
}

/** A `related` catalogue that never resolves — for the loading-state test, which needs a
 *  storefront whose `related` stays pending. */
function pendingResult<T>(): StorefrontResult<T> {
  return {
    data: ref(null) as Ref<T | null>,
    pending: ref(true),
    error: ref(null),
    refresh: async () => {},
  };
}

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

function mountBlock(
  data: Record<string, unknown>,
  options: { editing?: boolean; storefront?: StorefrontSource; attach?: boolean } = {}
) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  if (options.storefront) {
    opts.global.provide[STOREFRONT_KEY] = options.storefront;
  }
  const wrapper = mount(Block, options.attach ? { ...opts, attachTo: document.body } : opts);
  trackedWrappers.push(wrapper);
  return wrapper;
}

/** Overrides just `catalog.related` on a real demo storefront — every other method (history,
 *  cart, other catalogue calls) stays the real demo behaviour. */
function withRelated(
  items: Array<StorefrontProductListItem | undefined>,
  options: { productHandle?: string } = {}
): StorefrontSource {
  const base = createDemoStorefront({ productHandle: options.productHandle });
  const list = items.filter((item): item is StorefrontProductListItem => item !== undefined);
  return {
    ...base,
    catalog: { ...base.catalog, related: () => resolvedResult(list) },
  };
}

describe('product-carousel block', () => {
  describe('accessibility', () => {
    it('renders the full mock.json content with no axe violations', async () => {
      const wrapper = mountBlock(mock);
      await flushPromises();
      expect(wrapper.text()).toContain(mock.heading);
      // The heading is the "view all" link: its visible text is the heading, the label and its
      // context follow visually hidden, and the anchor points at `viewAllHref`.
      const headingLink = wrapper.get('h2 a');
      expect(headingLink.attributes('href')).toBe(mock.viewAllHref);
      expect(headingLink.text()).toBe(mock.heading);
      expect(headingLink.attributes('aria-label')).toBe(`${mock.heading} — View all products`);
      expect(wrapper.get('h2').text()).toBe(mock.heading);
      expect(wrapper.findAll('a').filter((a) => a.text().includes('View all'))).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content with no axe violations', async () => {
      const wrapper = mountBlock(bare);
      await flushPromises();
      expect(wrapper.text()).toContain(bare.heading);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it.each(['related', 'recently-viewed', 'collection'] as const)(
      'renders the %s variant with no axe violations',
      async (variant) => {
        const data =
          variant === 'collection'
            ? { ...mock, variant, sourceHandle: 'winter-knitwear' }
            : { ...mock, variant };
        const wrapper = mountBlock(data);
        await flushPromises();
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );
  });

  it('names the block\u2019s own section and the carousel distinguishably, labels slides "n of N", hides the counter', async () => {
    const wrapper = mountBlock(mock);
    await flushPromises();

    // The block's `<section>` is named by its own `<h2>`, like every other heading-bearing block —
    // without it "You may also like" was the one region on the home and product pages that
    // landmark navigation could not reach by name.
    const section = wrapper.get('section[data-part="root"]');
    const headingId = section.attributes('aria-labelledby')!;
    expect(headingId).toBeTruthy();
    expect(section.get(`#${headingId}`).text()).toBe(mock.heading);

    // The nested carousel region therefore cannot carry the same name (axe `landmark-unique`): it
    // describes what it holds instead.
    const region = wrapper.get('[aria-roledescription="carousel"]');
    expect(region.attributes('aria-label')).toBe(`${mock.heading} products`);
    expect(region.attributes('aria-label')).not.toBe(mock.heading);

    const slides = wrapper.findAll('[aria-roledescription="slide"]');
    expect(slides.length).toBeGreaterThan(1);
    slides.forEach((slide, index) => {
      expect(slide.attributes('aria-label')).toBe(`${index + 1} of ${slides.length}`);
    });

    const counter = wrapper.get('[data-part="counter"]');
    expect(counter.attributes('aria-hidden')).toBe('true');
    expect(counter.text()).toBe(`1 / ${slides.length}`);
  });

  describe('related', () => {
    it('excludes the product being viewed and sold-out items (demo catalogue)', async () => {
      const current = PRODUCTS.find((p) => p.handle === 'fisherman-rib-cardigan')!;
      const soldOut = PRODUCTS.find((p) => p.handle === 'linen-tea-towels-pair')!;
      const keep1 = PRODUCTS.find((p) => p.handle === 'ribbed-lambswool-beanie')!;
      const keep2 = PRODUCTS.find((p) => p.handle === 'speckled-latte-mug')!;
      expect(soldOut.available).toBe(false);

      const storefront = withRelated([current, soldOut, keep1, keep2], {
        productHandle: current.handle,
      });
      const wrapper = mountBlock({ ...mock, variant: 'related' }, { storefront });
      await flushPromises();

      expect(wrapper.text()).toContain(keep1.title);
      expect(wrapper.text()).toContain(keep2.title);
      expect(wrapper.text()).not.toContain(current.title);
      expect(wrapper.text()).not.toContain(soldOut.title);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /**
     * A product's `url` is storefront-derived, not CMS-authored, and used to reach `ProductCard`
     * without passing `safeHref` — the one class of URL in the theme that did. Sanitising now
     * happens once, in `toProductCardEntries` (`app/storefront/toProductCard.ts`): the card's link
     * is required, so an item whose URL does not survive `safeHref` is dropped outright rather than
     * rendered with a link to nowhere. A same-site URL still routes (`link-as` =
     * `EldraRouterLink`); an off-site one stays a plain `<a>`.
     */
    it('drops a product whose url is not a safe href, and only routes same-site ones', async () => {
      const safe = PRODUCTS.find((p) => p.handle === 'ribbed-lambswool-beanie')!;
      const external = { ...PRODUCTS.find((p) => p.handle === 'speckled-latte-mug')! };
      external.url = 'https://elsewhere.example/p/mug';
      const unsafe = { ...PRODUCTS.find((p) => p.handle === 'merino-crew-sweater')! };
      // The exact shape the guard exists for: a scheme `safeHref` rejects.
      unsafe.url = 'javascript:alert(1)';

      const storefront = withRelated([safe, external, unsafe], {
        productHandle: 'not-a-real-product',
      });
      const wrapper = mountBlock({ ...mock, variant: 'related' }, { storefront });
      await flushPromises();

      expect(wrapper.text()).toContain(safe.title);
      expect(wrapper.text()).toContain(external.title);
      expect(wrapper.text()).not.toContain(unsafe.title);

      const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
      expect(hrefs).toContain(safe.url);
      expect(hrefs).toContain(external.url);
      expect(wrapper.html()).not.toContain('javascript:');

      const cards = wrapper.findAllComponents(ProductCard);
      expect(cards).toHaveLength(2);
      expect(cards[0]!.props('linkAs')).toBe(EldraRouterLink);
      expect(cards[1]!.props('linkAs')).toBeUndefined();
    });
  });

  describe('recently-viewed', () => {
    it('renders compact 1x1 cards with no swatches or rating, and "Clear history" instead of View all', async () => {
      const wrapper = mountBlock({ ...mock, variant: 'recently-viewed' });
      await flushPromises();

      const cards = wrapper.findAllComponents(ProductCard);
      expect(cards.length).toBeGreaterThan(1);
      for (const card of cards) {
        expect(card.props('ratio')).toBe('1x1');
        expect(card.props('showSwatches')).toBe(false);
        expect(card.props('showRating')).toBe(false);
        expect(card.props('quickAdd')).toBe(false);
      }

      expect(wrapper.text()).toContain(enUS.productCarousel.clearHistory);
      expect(wrapper.text()).not.toContain('View all');
    });

    it('clearing history removes the recently-viewed products from local state', async () => {
      const storefront = createDemoStorefront();
      const wrapper = mountBlock({ ...mock, variant: 'recently-viewed' }, { storefront });
      await flushPromises();

      await wrapper.get('button').trigger('click');
      expect(storefront.history.recentlyViewed.value).toEqual([]);
    });

    it('renders nothing with an empty history', async () => {
      const storefront = createDemoStorefront({ recentlyViewed: [] });
      const wrapper = mountBlock({ ...mock, variant: 'recently-viewed' }, { storefront });
      await flushPromises();
      expect(wrapper.find('section').exists()).toBe(false);
    });
  });

  it('renders nothing with fewer than two products', async () => {
    const only = PRODUCTS.find((p) => p.handle === 'ribbed-lambswool-beanie')!;
    const storefront = withRelated([only], { productHandle: 'not-a-real-product' });
    const wrapper = mountBlock(mock, { storefront });
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
  });

  it('the loading state renders four skeleton cards', async () => {
    const base = createDemoStorefront();
    const storefront: StorefrontSource = {
      ...base,
      catalog: { ...base.catalog, related: () => pendingResult() },
    };
    const wrapper = mountBlock(mock, { storefront });
    await flushPromises();
    expect(wrapper.findAllComponents(Skeleton)).toHaveLength(4);
    expect(wrapper.findAllComponents(ProductCard)).toHaveLength(0);
  });

  describe('keyboard', () => {
    it('ArrowLeft/ArrowRight move the focused track one slide; arrows disable at the ends', async () => {
      const wrapper = mountBlock(mock, { attach: true });
      await flushPromises();
      const track = wrapper.get('[data-part="track"]');
      expect(track.attributes('tabindex')).toBe('0');

      const prevButton = () => wrapper.get('[data-part="prev"]');
      const nextButton = () => wrapper.get('[data-part="next"]');
      const slideCount = wrapper.findAll('[aria-roledescription="slide"]').length;

      expect(prevButton().attributes('disabled')).toBeDefined();
      expect(nextButton().attributes('disabled')).toBeUndefined();

      for (let step = 0; step < slideCount - 1; step += 1) {
        await track.trigger('keydown', { key: 'ArrowRight' });
      }
      expect(prevButton().attributes('disabled')).toBeUndefined();
      expect(nextButton().attributes('disabled')).toBeDefined();

      await track.trigger('keydown', { key: 'ArrowLeft' });
      expect(nextButton().attributes('disabled')).toBeUndefined();
    });

    it('never leaves focus on a disabled arrow', async () => {
      const wrapper = mountBlock(mock, { attach: true });
      await flushPromises();
      const nextButton = wrapper.get('[data-part="next"]');
      const slideCount = wrapper.findAll('[aria-roledescription="slide"]').length;
      (nextButton.element as HTMLButtonElement).focus();
      expect(document.activeElement).toBe(nextButton.element);

      for (let step = 0; step < slideCount - 1; step += 1) {
        await nextButton.trigger('click');
      }
      expect(document.activeElement).toBe(wrapper.get('[data-part="prev"]').element);
    });

    it('Tab reaches every card once, after the heading link and the arrows', async () => {
      const wrapper = mountBlock(mock, { attach: true });
      await flushPromises();
      const focusables = [
        ...wrapper.element.querySelectorAll<HTMLElement>('a, button, [tabindex]'),
      ];
      const cardLinks = wrapper.findAll('[data-part="link"]');
      expect(cardLinks.length).toBe(wrapper.findAllComponents(ProductCard).length);

      // Heading link, then prev/next arrows, then the focusable track, then one link per card.
      expect(focusables[0]!.tagName).toBe('A');
      expect(focusables[1]!.getAttribute('data-part')).toBe('prev');
      expect(focusables[2]!.getAttribute('data-part')).toBe('next');
      expect(focusables[3]!.getAttribute('data-part')).toBe('track');
      const trailingLinks = focusables.slice(4);
      expect(trailingLinks).toHaveLength(cardLinks.length);
      for (const el of trailingLinks) expect(el.tagName).toBe('A');
    });
  });

  it('hides the arrows and counter only when the products fit the view at every width (the smallest perView step)', async () => {
    // recently-viewed with two products fits its base step of 2.4 everywhere: controls hidden.
    const two = createDemoStorefront({ recentlyViewed: PRODUCTS.slice(0, 2).map((p) => p.handle) });
    const compact = mountBlock({ ...mock, variant: 'recently-viewed' }, { storefront: two });
    await flushPromises();
    expect(compact.get('[data-part="prev"]').classes()).toContain('hidden');
    expect(compact.get('[data-part="next"]').classes()).toContain('hidden');
    expect(compact.get('[data-part="counter"]').classes()).toContain('hidden');

    // recently-viewed's default six products fit the desktop step (6) but not the mobile one:
    // the controls stay, because a narrower container still has cards to scroll to.
    const six = mountBlock({ ...mock, variant: 'recently-viewed' });
    await flushPromises();
    expect(six.get('[data-part="prev"]').classes()).not.toContain('hidden');
    expect(six.get('[data-part="counter"]').classes()).not.toContain('hidden');

    // related's default (6 products) exceeds every step: controls stay.
    const related = mountBlock(mock);
    await flushPromises();
    expect(related.get('[data-part="prev"]').classes()).not.toContain('hidden');
    expect(related.get('[data-part="next"]').classes()).not.toContain('hidden');
    expect(related.get('[data-part="counter"]').classes()).not.toContain('hidden');
  });

  it('never autoplays and never loops (advancing 30s changes nothing)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountBlock(mock);
      await flushPromises();
      const before = wrapper.get('[data-part="counter"]').text();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(wrapper.get('[data-part="counter"]').text()).toBe(before);
      expect(wrapper.find('[data-part="pause"]').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the "add a heading" editor hint when heading is empty in edit mode, and renders nothing on the live site', async () => {
    const editing = mountBlock({ ...mock, heading: '' }, { editing: true });
    await flushPromises();
    expect(editing.text()).toContain(enUS.productCarousel.headingHintLabel);
    expect(editing.find('[aria-roledescription="carousel"]').exists()).toBe(false);

    const live = mountBlock({ ...mock, heading: '' });
    await flushPromises();
    expect(live.find('section').exists()).toBe(false);
  });
});
