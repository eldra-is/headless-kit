// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '@tailwindcss/node';
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
  StorefrontCollectionSelector,
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontSource,
  VolatileKey,
} from '../../../app/storefront/types';
import { createDemoStorefront, demoCollectionId, PRODUCTS } from '../../../app/storefront/demo';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import enUS from '../../../i18n/en-US.json';

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = { heading: mock.heading, variant: 'related' };

function resolvedResult<T>(
  value: T | null,
  overrides: Partial<
    Pick<StorefrontResult<T>, 'pending' | 'loading' | 'error' | 'revalidating'>
  > = {}
): StorefrontResult<T> {
  return {
    data: ref(value) as Ref<T | null>,
    pending: ref(false),
    loading: ref(false),
    error: ref(null),
    revalidating: ref(new Set()) as Ref<ReadonlySet<VolatileKey>>,
    refresh: async () => {},
    ...overrides,
  };
}

/** A `related` catalogue that never resolves — for the loading-state test, which needs a
 *  storefront whose `related` stays pending with nothing to show. */
function pendingResult<T>(): StorefrontResult<T> {
  return resolvedResult<T>(null, { pending: ref(true), loading: ref(true) });
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
      const viewAllHref = '/collections/knitwear';
      const wrapper = mountBlock({ ...mock, viewAllHref });
      await flushPromises();
      expect(wrapper.text()).toContain(mock.heading);
      // The heading is the "view all" link: its visible text is the heading, the label and its
      // context follow visually hidden, and the anchor points at `viewAllHref`.
      const headingLink = wrapper.get('h2 a');
      expect(headingLink.attributes('href')).toBe(viewAllHref);
      expect(headingLink.text()).toBe(mock.heading);
      expect(headingLink.attributes('aria-label')).toBe(`${mock.heading} — View all products`);
      expect(wrapper.get('h2').text()).toBe(mock.heading);
      expect(wrapper.findAll('a').filter((a) => a.text().includes('View all'))).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the heading as plain text (no link) when viewAllHref is empty — the seeded state', async () => {
      const wrapper = mountBlock(mock);
      await flushPromises();
      expect(wrapper.find('h2 a').exists()).toBe(false);
      expect(wrapper.get('h2').text()).toBe(mock.heading);
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
            ? {
                ...mock,
                variant,
                sourceCollection: { _type: 'collection', slug: 'winter-knitwear' },
              }
            : { ...mock, variant };
        const wrapper = mountBlock(data);
        await flushPromises();
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );
  });

  it('names the block\u2019s own section and the carousel distinguishably, labels slides "n of N", renders no counter', async () => {
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

    // A product row shows several cards at once, so it renders no "n / total" counter (spec
    // "Carousel" → Product row: no dots and no counter).
    expect(wrapper.find('[data-part="counter"]').exists()).toBe(false);
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

  /**
   * The prerender contract's "final sources at setup time" half (`app/storefront/types.ts`). Three
   * results exist whatever the variant, so what keeps the two it is not showing from reading the
   * storefront is that their sources are empty — and `recentlyViewed` is the one that matters:
   * it is `localStorage`, so an ungated `byHandles` is prerendered over an empty history and
   * re-keyed over a full one in the browser, which is a products read on every product page for a
   * row nobody is looking at (`test/prerenderRefresh.browser.spec.ts` catches it end to end).
   */
  describe('reads only the source its variant shows', () => {
    function recording(options: { productHandle?: string } = {}): {
      storefront: StorefrontSource;
      sources: {
        related?: Ref<string | null>;
        handles?: Ref<string[]>;
        collection?: Ref<StorefrontCollectionSelector | null>;
      };
    } {
      const base = createDemoStorefront(options);
      const sources: {
        related?: Ref<string | null>;
        handles?: Ref<string[]>;
        collection?: Ref<StorefrontCollectionSelector | null>;
      } = {};
      return {
        sources,
        storefront: {
          ...base,
          catalog: {
            ...base.catalog,
            related: (handle, limit) => {
              sources.related = handle;
              return base.catalog.related(handle, limit);
            },
            byHandles: (handles) => {
              sources.handles = handles;
              return base.catalog.byHandles(handles);
            },
            collectionProducts: (collection, opts) => {
              sources.collection = collection;
              return base.catalog.collectionProducts(collection, opts);
            },
          },
        },
      };
    }

    it('asks about no history and no collection while it is showing related products', async () => {
      const { storefront, sources } = recording({ productHandle: 'merino-crew-sweater' });
      // What a product page looks like by the time this block's setup runs: `product-detail` has
      // recorded the product being viewed, so the demo history is anything but empty.
      expect(storefront.history.recentlyViewed.value.length).toBeGreaterThan(0);

      mountBlock({ ...mock, variant: 'related' }, { storefront });
      await flushPromises();

      expect(sources.related?.value).toBe('merino-crew-sweater');
      expect(sources.handles?.value).toEqual([]);
      expect(sources.collection?.value).toBeNull();
    });

    it('asks about no product and no collection while it is showing recently viewed', async () => {
      const { storefront, sources } = recording({ productHandle: 'merino-crew-sweater' });
      mountBlock({ ...mock, variant: 'recently-viewed' }, { storefront });
      await flushPromises();

      expect(sources.handles?.value).toEqual(storefront.history.recentlyViewed.value);
      expect(sources.related?.value).toBeNull();
      expect(sources.collection?.value).toBeNull();
    });

    it('asks about no product and no history while it is showing a collection', async () => {
      const { storefront, sources } = recording({ productHandle: 'merino-crew-sweater' });
      mountBlock(
        {
          ...mock,
          variant: 'collection',
          sourceCollection: { _type: 'collection', slug: 'winter-knitwear' },
        },
        { storefront }
      );
      await flushPromises();

      expect(sources.collection?.value).toEqual({ slug: 'winter-knitwear' });
      expect(sources.related?.value).toBeNull();
      expect(sources.handles?.value).toEqual([]);
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
    /**
     * The row is a composite widget: one tab stop, arrow keys inside (`@eldrajs/ui`'s `Carousel`,
     * and the spec's own Keyboard rule). The track is not a stop of its own, so the arrows are
     * driven the way a shopper really drives them — from the card's own link, with focus already
     * on it. `test/carouselKeyboard.spec.ts` holds the whole rule across all four blocks that
     * render a `Carousel`; this is the product row's share of it.
     */
    it('ArrowRight/ArrowLeft move between cards from inside one; arrows disable at the ends', async () => {
      const wrapper = mountBlock(mock, { attach: true });
      await flushPromises();
      const track = wrapper.get('[data-part="track"]');
      expect(track.attributes('tabindex')).toBeUndefined();

      const prevButton = () => wrapper.get('[data-part="prev"]');
      const nextButton = () => wrapper.get('[data-part="next"]');
      const cards = () => Array.from(track.element.children) as HTMLElement[];
      const cardLink = (index: number) =>
        cards()[index]!.querySelector<HTMLElement>('[data-part="link"]')!;
      const slideCount = cards().length;
      const pressOnFocused = async (key: string) => {
        (document.activeElement as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true })
        );
        await flushPromises();
      };

      cardLink(0).focus();
      expect(prevButton().attributes('disabled')).toBeDefined();
      expect(nextButton().attributes('disabled')).toBeUndefined();

      for (let step = 0; step < slideCount - 1; step += 1) {
        await pressOnFocused('ArrowRight');
      }
      expect(document.activeElement).toBe(cardLink(slideCount - 1));
      expect(prevButton().attributes('disabled')).toBeUndefined();
      expect(nextButton().attributes('disabled')).toBeDefined();

      await pressOnFocused('ArrowLeft');
      expect(document.activeElement).toBe(cardLink(slideCount - 2));
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

    /**
     * `Tab` stops **once** for the whole row, however many products are in it, and that stop is on
     * the active card's own entry point. Tabbing used to stop once for the track and then once per
     * card — seven presses to get past a six-card row, which is what the one-tab-stop rule exists
     * to stop. The arrow keys are how the other cards are reached (the spec above).
     */
    it('takes one tab stop on the active card, and Tab from it leaves the carousel', async () => {
      const wrapper = mountBlock(
        { ...mock, viewAllHref: '/collections/knitwear' },
        { attach: true }
      );
      await flushPromises();
      const cardLinks = wrapper.findAll('[data-part="link"]');
      expect(cardLinks.length).toBe(wrapper.findAllComponents(ProductCard).length);

      const track = wrapper.get('[data-part="track"]').element as HTMLElement;
      const cards = Array.from(track.children) as HTMLElement[];
      const tabbable = (root: HTMLElement) =>
        [...root.querySelectorAll<HTMLElement>('a, button:not([disabled]), [tabindex]')].filter(
          (el) => el.getAttribute('tabindex') !== '-1'
        );

      // Everything `Tab` stops on in the whole block, in document order: the heading link, the
      // enabled arrow (previous is disabled at the start, so it is not a stop), and then the first
      // card's own controls — nothing else inside the track at all, so the next `Tab` after the
      // last of them leaves the carousel for the page below, and `Shift+Tab` from the first goes
      // back to the arrow rather than into another card.
      const stops = tabbable(wrapper.element as HTMLElement);
      const inside = tabbable(track);
      expect(stops[0]!.tagName).toBe('A');
      expect(stops[0]!.getAttribute('href')).toBe('/collections/knitwear');
      expect(stops[1]!.getAttribute('data-part')).toBe('next');
      expect(stops.slice(2)).toEqual(inside);
      expect(inside[0]).toBe(cardLinks[0]!.element);
      for (const el of inside) expect(cards[0]!.contains(el)).toBe(true);

      // ArrowRight hands that one stop to the next card, and takes it off the first.
      (cardLinks[0]!.element as HTMLElement).focus();
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
      await flushPromises();
      expect(document.activeElement).toBe(cardLinks[1]!.element);
      expect(tabbable(cards[0]!)).toHaveLength(0);
      for (const el of tabbable(track)) expect(cards[1]!.contains(el)).toBe(true);
    });
  });

  it('hides the arrows only when the products fit the view at every width (the smallest perView step)', async () => {
    // recently-viewed with two products fits its base step of 2.4 everywhere: controls hidden.
    const two = createDemoStorefront({ recentlyViewed: PRODUCTS.slice(0, 2).map((p) => p.handle) });
    const compact = mountBlock({ ...mock, variant: 'recently-viewed' }, { storefront: two });
    await flushPromises();
    expect(compact.get('[data-part="prev"]').classes()).toContain('hidden');
    expect(compact.get('[data-part="next"]').classes()).toContain('hidden');

    // recently-viewed's default six products fit the desktop step (6) but not the mobile one:
    // the controls stay, because a narrower container still has cards to scroll to.
    const six = mountBlock({ ...mock, variant: 'recently-viewed' });
    await flushPromises();
    expect(six.get('[data-part="prev"]').classes()).not.toContain('hidden');

    // related's default (6 products) exceeds every step: controls stay.
    const related = mountBlock(mock);
    await flushPromises();
    expect(related.get('[data-part="prev"]').classes()).not.toContain('hidden');
    expect(related.get('[data-part="next"]').classes()).not.toContain('hidden');
  });

  it('never autoplays and never loops (advancing 30s changes nothing)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountBlock(mock);
      await flushPromises();
      // At rest on the first slide, Previous is disabled; 30 s later it still is.
      expect(wrapper.get('[data-part="prev"]').attributes('disabled')).toBeDefined();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(wrapper.get('[data-part="prev"]').attributes('disabled')).toBeDefined();
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

  /**
   * The `collection` variant's source (spec `Starter blocks`): `sourceCollection`
   * is the `reference` field an author picks in Studio, and since version 3 it is
   * the block's **only** source — the `sourceHandle` string field it shipped with
   * is retired (Core keeps its content as `sourceHandle__v2`) and is not read
   * here even when an entry still carries it. The reference's resolved `slug` is
   * used when the value carries one, and its bare id otherwise (a page builder
   * draft overlay, or a depth-0 read); a theme's own seed carries the slug with
   * no id at all.
   */
  describe('the collection variant\u2019s source', () => {
    const WINTER = demoCollectionId('winter-knitwear')!;
    const BEST_SELLERS = demoCollectionId('best-sellers')!;

    function titles(wrapper: VueWrapper): string[] {
      return wrapper
        .findAllComponents(ProductCard)
        .map((card) => (card.props('product') as { title: string }).title);
    }

    async function mountCollection(data: Record<string, unknown>, editing = false) {
      const wrapper = mountBlock(
        { ...mock, variant: 'collection', limit: '4', ...data },
        { editing }
      );
      await flushPromises();
      return wrapper;
    }

    it('uses the reference\u2019s resolved slug', async () => {
      const wrapper = await mountCollection({
        sourceCollection: { id: BEST_SELLERS, _type: 'collection', slug: 'best-sellers' },
      });
      expect(titles(wrapper)).toEqual([
        'Merino crew sweater',
        'Speckled latte mug',
        'Walnut serving board',
        'Hand-thrown serving bowl',
      ]);
    });

    it('resolves a stub reference through the storefront by id', async () => {
      const wrapper = await mountCollection({
        sourceCollection: { id: BEST_SELLERS, _type: 'collection' },
      });
      expect(titles(wrapper).slice(0, 2)).toEqual(['Merino crew sweater', 'Speckled latte mug']);
    });

    it('reads a seed reference, which names the collection by slug and carries no id', async () => {
      // What `pages/home.page.json` ships and Core writes when it cannot resolve
      // the slug against the organisation's catalog.
      const wrapper = await mountCollection({
        sourceCollection: { _type: 'collection', slug: 'best-sellers' },
      });
      expect(titles(wrapper).slice(0, 2)).toEqual(['Merino crew sweater', 'Speckled latte mug']);
    });

    it('ignores a retired sourceHandle an entry still carries', async () => {
      // The handle field is gone: a value left behind by the old schema must not
      // stand in for the collection an author never picked, or the block would
      // keep showing a collection nobody can see in Studio any more.
      const wrapper = await mountCollection({ sourceHandle: 'best-sellers' });
      expect(wrapper.findAllComponents(ProductCard)).toHaveLength(0);
      expect(wrapper.find('section').exists()).toBe(false);
    });

    it('lets the picked collection win over a retired handle beside it', async () => {
      const wrapper = await mountCollection({
        sourceCollection: { id: WINTER, _type: 'collection', slug: 'winter-knitwear' },
        sourceHandle: 'best-sellers',
      });
      // winter-knitwear's second product, not best-sellers' — the reference won.
      expect(titles(wrapper).slice(0, 2)).toEqual([
        'Merino crew sweater',
        'Fisherman rib cardigan',
      ]);
    });

    it('renders nothing with no collection picked', async () => {
      const wrapper = await mountCollection({});
      expect(wrapper.find('section').exists()).toBe(false);
    });

    /** An id no storefront can resolve — what a freshly picked collection looks
     *  like in the page builder before the page is published. */
    const UNRESOLVABLE = { id: '00000000-0000-4000-8000-000000000000', _type: 'collection' };

    it('shows the publish hint in the editor when only an unresolvable id is known', async () => {
      const wrapper = await mountCollection({ sourceCollection: UNRESOLVABLE }, true);
      expect(wrapper.text()).toContain(enUS.storefront.unresolvedCollectionLabel);
      expect(wrapper.findAllComponents(ProductCard)).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders nothing at all for a live visitor in that state — never an error', async () => {
      const wrapper = await mountCollection({ sourceCollection: UNRESOLVABLE });
      expect(wrapper.find('section').exists()).toBe(false);
      expect(wrapper.text()).not.toContain(enUS.storefront.unresolvedCollectionLabel);
    });

    it('keeps the hint out of the way while the request is still pending', async () => {
      const base = createDemoStorefront();
      const wrapper = mountBlock(
        {
          ...mock,
          variant: 'collection',
          limit: '4',
          sourceCollection: UNRESOLVABLE,
        },
        {
          editing: true,
          storefront: {
            ...base,
            catalog: { ...base.catalog, collectionProducts: () => pendingResult() },
          },
        }
      );
      await flushPromises();
      expect(wrapper.text()).not.toContain(enUS.storefront.unresolvedCollectionLabel);
      expect(wrapper.findAllComponents(Skeleton).length).toBeGreaterThan(0);
    });
  });

  /**
   * The "view all" link, per variant (spec `Starter blocks`, and the `showWhen`
   * conditions in `block.json`):
   *
   * - `collection` derives the destination from the collection an author picked
   *   — `/collections/<slug>` — and never reads `viewAllHref`, which Studio does
   *   not even offer in this variant. A collection known only by id (a page
   *   builder draft overlay, a depth-0 read) has no slug to link to, so the
   *   heading stays plain text rather than pointing at `/collections/undefined`.
   * - `related` keeps the authored `viewAllHref`: its row is recommendations,
   *   which no single collection page corresponds to.
   * - `recently-viewed` never links at all — the shopper's own history has no
   *   page.
   */
  describe('the view-all link', () => {
    const BEST_SELLERS_ID = demoCollectionId('best-sellers')!;

    async function mountVariant(data: Record<string, unknown>) {
      const wrapper = mountBlock({ ...mock, limit: '4', ...data });
      await flushPromises();
      return wrapper;
    }

    it('derives the collection variant\u2019s link from the picked collection, ignoring viewAllHref', async () => {
      const wrapper = await mountVariant({
        variant: 'collection',
        sourceCollection: { id: BEST_SELLERS_ID, _type: 'collection', slug: 'best-sellers' },
        viewAllHref: '/authored-somewhere-else',
      });
      expect(wrapper.get('h2 a').attributes('href')).toBe('/collections/best-sellers');
    });

    it('derives it from a seed reference’s slug as readily as from a resolved one', async () => {
      const wrapper = await mountVariant({
        variant: 'collection',
        sourceCollection: { _type: 'collection', slug: 'best-sellers' },
        viewAllHref: '/authored-somewhere-else',
      });
      expect(wrapper.get('h2 a').attributes('href')).toBe('/collections/best-sellers');
    });

    it('renders the heading unlinked when the collection is known only by id', async () => {
      const wrapper = await mountVariant({
        variant: 'collection',
        sourceCollection: { id: BEST_SELLERS_ID, _type: 'collection' },
        viewAllHref: '/authored-somewhere-else',
      });
      expect(wrapper.findAllComponents(ProductCard).length).toBeGreaterThan(1);
      expect(wrapper.find('h2 a').exists()).toBe(false);
      expect(wrapper.get('h2').text()).toBe(mock.heading);
    });

    it('keeps the authored href in the related variant', async () => {
      const wrapper = await mountVariant({ variant: 'related', viewAllHref: '/collections/all' });
      expect(wrapper.get('h2 a').attributes('href')).toBe('/collections/all');
    });

    it('renders no link at all in recently-viewed', async () => {
      const wrapper = await mountVariant({ variant: 'recently-viewed' });
      expect(wrapper.find('h2 a').exists()).toBe(false);
    });
  });

  /**
   * The prerendered page's live refresh (`app/storefront/types.ts`): the row's cards are in the
   * HTML from the first paint, and a few hundred milliseconds after mount the storefront swaps in
   * the backend's current prices and stock lines. The row never redraws for it, and it announces
   * the refresh once rather than letting every card speak for itself.
   */
  describe('the volatile refresh', () => {
    /** A `related` catalogue whose result a test can move through its states after mounting. */
    function refreshableSource(): {
      storefront: StorefrontSource;
      revalidating: Ref<ReadonlySet<VolatileKey>>;
      loading: Ref<boolean>;
      pending: Ref<boolean>;
    } {
      const base = createDemoStorefront({ productHandle: 'not-a-real-product' });
      const revalidating = ref<ReadonlySet<VolatileKey>>(new Set());
      const loading = ref(false);
      const pending = ref(false);
      const result = resolvedResult(PRODUCTS.slice(0, 4), { revalidating, loading, pending });
      return {
        storefront: { ...base, catalog: { ...base.catalog, related: () => result } },
        revalidating,
        loading,
        pending,
      };
    }

    it('keeps every card, marks its price and stock line busy, and draws no skeleton', async () => {
      const { storefront, revalidating } = refreshableSource();
      const wrapper = mountBlock(mock, { storefront });
      await flushPromises();
      const shown = wrapper.findAllComponents(ProductCard).length;
      expect(shown).toBe(4);

      revalidating.value = new Set(['price', 'stock']);
      await flushPromises();

      expect(wrapper.findAllComponents(ProductCard)).toHaveLength(shown);
      expect(wrapper.findAllComponents(Skeleton)).toHaveLength(0);
      expect(wrapper.findAll('[data-part="root"][aria-busy="true"]').length).toBeGreaterThanOrEqual(
        shown
      );
      expect(wrapper.findAll('[data-part="spinner"]').length).toBeGreaterThanOrEqual(shown);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('announces once for the whole row, after mount, and never per card', async () => {
      const { storefront, revalidating } = refreshableSource();
      const wrapper = mountBlock(mock, { storefront });
      await flushPromises();
      const region = () => wrapper.get('p.sr-only[role="status"]');

      // Mounted and empty first: a live region that arrives already holding its message is
      // announced unreliably, which is what a prerendered page would produce if the block read
      // `revalidating` straight through instead of flipping it after mount.
      expect(region().text()).toBe('');

      revalidating.value = new Set(['stock']);
      await flushPromises();

      expect(region().text()).toBe(enUS.storefront.updatingValues);
      expect(wrapper.findAll('p.sr-only[role="status"]')).toHaveLength(1);
      // `announce: false` on every card — the per-value regions are gone, not merely empty.
      expect(wrapper.findAll('[data-part="srStatus"]')).toHaveLength(0);
      expect(
        wrapper.findAllComponents(ProductCard).every((card) => card.props('announce') === false)
      ).toBe(true);
    });

    /**
     * The hydration case, and the reason `useRevalidating` exists
     * (`app/composables/useRevalidating.ts`). A prerendered page's client-side storefront can
     * already be revalidating by the time the block's first render runs, and that first render has
     * to be byte-identical to the server's or Vue repaints the block — and a live region that
     * arrives already holding its message is announced unreliably. Both are the same fix: the flag
     * is false until after mount.
     */
    it('paints the server’s markup first, even when the storefront is already revalidating', async () => {
      const { storefront, revalidating } = refreshableSource();
      revalidating.value = new Set(['price', 'stock']);

      const wrapper = mountBlock(mock, { storefront });

      expect(wrapper.find('[data-part="spinner"]').exists()).toBe(false);
      expect(wrapper.get('p.sr-only[role="status"]').text()).toBe('');

      await flushPromises();

      expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
      expect(wrapper.get('p.sr-only[role="status"]').text()).toBe(enUS.storefront.updatingValues);
    });

    it('never draws a skeleton over cards the visitor can already see', async () => {
      const { storefront, pending, loading } = refreshableSource();
      const wrapper = mountBlock(mock, { storefront });
      await flushPromises();

      // Both halves of the rule at once: a storefront that raised `pending` over data the row has
      // must not blank it, and a reload keeps the cards and marks the row busy instead.
      pending.value = true;
      loading.value = true;
      await flushPromises();

      expect(wrapper.findAllComponents(Skeleton)).toHaveLength(0);
      expect(wrapper.findAllComponents(ProductCard)).toHaveLength(4);
      expect(wrapper.get('section').attributes('aria-busy')).toBe('true');
      expect(
        wrapper.findAllComponents(ProductCard).every((card) => card.props('revalidating') === true)
      ).toBe(true);
    });
  });

  /**
   * **The first card's focus ring, both axes (fix, 2026-10-04).** `Carousel` reserves the ring's
   * reach as padding on its track, because `overflow-x-auto` forces `overflow-y: auto` too and the
   * track then clips every slide's ring at its own padding box. This block bleeds that track to the
   * screen edge below 48rem, and the way it used to do that — `px-[gutter] … @tablet:px-0` through
   * `classes.track` — took the inline half of the reservation away: `px-*` and `p-*` are different
   * `tailwind-merge` groups, so both classes survived the merge, and `padding-inline` then won in
   * the cascade because Tailwind emits every `padding-inline` rule after every `padding` one. On the
   * deployed site that measured `padding-top: 6px`, `padding-left: 0px` at 1440px, and the first
   * card's ring was cut off flat down its left edge.
   *
   * So this compiles the theme's real stylesheet (the way `test/mainCss.spec.ts` does) over the
   * **resolved class list of a mounted track** and asks what each axis actually computes to at each
   * container breakpoint — the question neither a class-list assertion nor jsdom can answer, since
   * jsdom applies no stylesheet and resolves no container query. Proven by mutation: restoring the
   * old `-mx-/px-/scroll-px-` bleed trio here fails it on the inline axis at every breakpoint.
   */
  describe('the track’s focus-ring reservation', () => {
    const RING_REACH = 'calc(var(--eldra-focus-offset) + var(--eldra-focus-width))';
    // `import.meta.dirname`, not `new URL(..., import.meta.url)`: under jsdom Vite's dev
    // transform rewrites that idiom into a dev-server URL, which no Node read can open —
    // `test/richTextTypography.spec.ts` carries the same note for the same reason.
    const assetsDir = `${join(import.meta.dirname, '../../../app/assets')}/`;

    /**
     * Every utility rule the build emits, in source order, with the container query it sits under.
     * Only `@layer utilities`: the same stylesheet carries a preflight `padding: 0` and the
     * rich-text `padding-left` of a blockquote, and neither is on this element.
     */
    type Rule = { condition: string; declarations: Array<[string, string]> };

    function flatten(css: string, condition: string, layer: string, out: Rule[]): void {
      let i = 0;
      while (i < css.length) {
        const open = css.indexOf('{', i);
        if (open === -1) return;
        let depth = 1;
        let j = open + 1;
        while (j < css.length && depth > 0) {
          if (css[j] === '{') depth += 1;
          else if (css[j] === '}') depth -= 1;
          j += 1;
        }
        const head = css.slice(i, open).trim();
        const body = css.slice(open + 1, j - 1);
        const namedLayer = /@layer\s+([\w-]+)\s*$/.exec(head);
        if (head.startsWith('@') || namedLayer) {
          flatten(
            body,
            /@container[^{]*$/.test(head) ? head.slice(head.lastIndexOf('@container')) : condition,
            namedLayer ? namedLayer[1]! : layer,
            out
          );
        } else if (layer === 'utilities') {
          out.push({
            condition,
            declarations: body
              .split(';')
              .map((part) => part.trim())
              .filter((part) => part.includes(':') && !part.includes('{'))
              .map((part) => {
                const at = part.indexOf(':');
                return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as [string, string];
              }),
          });
        }
        i = j;
      }
    }

    /** The last value to win for `properties`, among the rules that apply at `width`. */
    function resolved(rules: Rule[], width: number, properties: string[]): string | undefined {
      let value: string | undefined;
      for (const rule of rules) {
        const match = /width >= ([\d.]+)rem/.exec(rule.condition);
        if (match && width < Number(match[1]) * 16) continue;
        for (const [property, declared] of rule.declarations) {
          if (properties.includes(property)) value = declared;
        }
      }
      return value;
    }

    async function trackRules(): Promise<Rule[]> {
      const wrapper = mountBlock(mock);
      await flushPromises();
      const classes = wrapper.get('[data-part="track"]').element.className.split(/\s+/);
      const compiler = await compile(readFileSync(`${assetsDir}main.css`, 'utf8'), {
        base: assetsDir,
        onDependency() {},
      });
      const rules: Rule[] = [];
      flatten(compiler.build(classes), '', '', rules);
      return rules;
    }

    /** `max(bleed, reach)` can only be at least the reach; the bare reach is exactly it. */
    function reservesTheRing(value: string | undefined): boolean {
      return (
        value === RING_REACH || (value?.startsWith('max(') === true && value.includes(RING_REACH))
      );
    }

    // 375px: the bled width, where the gutter is the inline reservation. 768px and 1440px: the two
    // container steps above it, where the bleed is off and only the ring's own reach is left.
    for (const width of [375, 768, 1440]) {
      it(`reserves the ring on both axes at ${width}px`, async () => {
        const rules = await trackRules();
        expect(resolved(rules, width, ['padding', 'padding-block', 'padding-top'])).toBe(
          RING_REACH
        );
        const inline = resolved(rules, width, ['padding', 'padding-inline', 'padding-left']);
        expect(reservesTheRing(inline)).toBe(true);
        // Scroll padding has to match the inline padding exactly, or `scroll-snap-align: start`
        // lands on the padding in front of the first slide instead of the slide's own edge — which
        // scrolls that padding past the start and clips the ring all over again.
        expect(resolved(rules, width, ['scroll-padding-inline', 'scroll-padding-left'])).toBe(
          inline
        );
        // And the negative margin that cancels it, so the track's footprint is unchanged.
        expect(resolved(rules, width, ['margin-inline', 'margin-left'])).toBe(
          `calc(${inline} * -1)`
        );
      });
    }

    it('bleeds to the gutter below 48rem and sits inside the container above it', async () => {
      const rules = await trackRules();
      expect(resolved(rules, 375, ['--eldra-carousel-bleed'])).toBe('var(--eldra-gutter-mobile)');
      expect(resolved(rules, 768, ['--eldra-carousel-bleed'])).toBe('0px');
    });
  });
});
