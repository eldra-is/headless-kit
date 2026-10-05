// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref, watch, type Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontResult,
  StorefrontSearchResponse,
  StorefrontSource,
} from '../../../app/storefront/types';
import { createDemoStorefront, PRODUCTS } from '../../../app/storefront/demo';
import { enUS } from '../../../app/i18n/en-US';
import { uiEnUS } from '../../../app/i18n/uiMessages';

/** The genuinely minimal fixture: only the one required field. Exercises every fallback default
 *  (placeholder, the default products/journal/pages types, `suggestionsPerGroup`, no popular
 *  searches, no no-results collection) at once. */
const bare = { variant: 'results-page' };

/**
 * `pending` and `loading` are the storefront's two in-flight flags and they do not mean the same
 * thing (`app/storefront/types.ts`): `pending` is "nothing to show yet", `loading` is "a read is in
 * flight". The block reads `loading`, so a stub that carried only `pending` could not express the
 * state this spec cares about most — a read in flight *over* a previous answer — and the two are
 * passed separately here for that reason.
 */
function stubResult<T>(
  data: T,
  flags: { pending?: boolean; loading?: boolean } = {}
): StorefrontResult<T> {
  return {
    data: ref(data) as Ref<T | null>,
    pending: ref(flags.pending ?? false),
    loading: ref(flags.loading ?? false),
    revalidating: ref(new Set()),
    error: ref(null),
    refresh: async () => {},
  };
}

/**
 * `app/storefront/demo.ts`'s own `search.run()` ignores the query text entirely and always
 * returns the same fixed "linen" fixture (see `Block.vue`'s own module doc comment), so it can
 * never produce the loading, empty-query or no-results states this spec also needs to cover.
 * These helpers build a storefront whose `search`/`catalog` are swapped for a controllable stub,
 * keeping everything else (cart, history, forms) the real demo.
 */
function withSearch(
  response: StorefrontSearchResponse | null,
  flags: { pending?: boolean; loading?: boolean } = {}
): StorefrontSource {
  // The route carries the query the stubbed response answers. A results page is always reached by a
  // query, and the block only trusts an answer whose own `query` is the one in the field — a stub
  // whose route said nothing would be an answer to a question the page never asked.
  const base = createDemoStorefront(response === null ? {} : { query: response.query });
  return { ...base, search: { run: () => stubResult(response, flags) } };
}

function withNoResults(): StorefrontSource {
  // `route.query` seeds the block's own `searchQuery` (the `{query}` the no-results `h1`
  // interpolates), matching the URL a shopper's zero-result search would actually carry.
  const base = createDemoStorefront({ query: 'linnen napkns' });
  const response: StorefrontSearchResponse = {
    query: 'linnen napkns',
    total: 0,
    products: [],
    articles: [],
    pages: [],
    suggestion: 'linen napkins',
  };
  return {
    ...base,
    search: { run: () => stubResult(response) },
    catalog: {
      ...base.catalog,
      collectionProducts: () => stubResult({ items: PRODUCTS.slice(0, 2), total: 2, facets: [] }),
    },
  };
}

const ARTICLE_A = {
  title: 'How to wash and store linen',
  href: '/journal/how-to-wash-and-store-linen',
  category: 'Care guide',
  readingTime: '4 min read',
};

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function mountSearch(
  data: Record<string, unknown>,
  options: { storefront?: StorefrontSource; attach?: boolean } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const wrapper = mount(Block, {
    ...base,
    ...(options.attach ? { attachTo: document.body } : {}),
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        ...(options.storefront ? { [STOREFRONT_KEY]: options.storefront } : {}),
      },
    },
  });
  trackedWrappers.push(wrapper);
  return wrapper;
}

/** `SearchBar`'s suggestion panel is teleported to `document.body` (`teleport: true`, its own
 *  default), so every query into it starts at `document`, not the wrapper — see that package's
 *  own spec's identical `panel()`/`rows()` helpers. */
function listboxOptions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

/** `SearchBar` itself renders a `role="status"` live region (`aria-live="polite"`); the block's
 *  own summary line / no-results stack is the other `[role="status"]`, told apart by not being
 *  the live region. */
function pageStatus(wrapper: VueWrapper) {
  return wrapper.findAll('[role="status"]').find((el) => el.attributes('aria-live') === undefined)!;
}

describe('search block', () => {
  describe('accessibility', () => {
    it('renders the full mock.json content with no axe violations', async () => {
      const wrapper = mountSearch(mock, { storefront: createDemoStorefront({ query: 'linen' }) });
      await nextTick();
      expect(wrapper.text()).toContain('Results for “linen”');
      expect(wrapper.find('input[type="search"]').attributes('placeholder')).toBe(mock.placeholder);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content (every fallback default) with no axe violations', async () => {
      // A real, non-empty query — `bare` has no `types`/heading/popular fields of its own, and
      // this is what proves every one of those falls back correctly, which needs actual results
      // on screen (the default demo's own `route.query` is empty, so this seeds one explicitly).
      const wrapper = mountSearch(bare, { storefront: createDemoStorefront({ query: 'linen' }) });
      await nextTick();
      expect(wrapper.find('input[type="search"]').attributes('placeholder')).toBe(
        enUS.search.searchLabel
      );
      expect(wrapper.text()).toContain(enUS.search.typeProducts);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it.each(['results-page', 'field-only'] as const)(
      'renders the %s variant with no axe violations',
      async (variant) => {
        const wrapper = mountSearch({ ...mock, variant });
        await nextTick();
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );

    it('has no axe violations in the no-results state', async () => {
      const wrapper = mountSearch(mock, { storefront: withNoResults() });
      await nextTick();
      expect(pageStatus(wrapper).text()).toContain('linnen napkns');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('the field is a role=search form with a named combobox input', async () => {
    const wrapper = mountSearch(mock);
    await nextTick();
    expect(wrapper.find('form[role="search"]').exists()).toBe(true);
    const input = wrapper.get('input[type="search"]');
    expect(input.attributes('role')).toBe('combobox');
    expect(input.attributes('aria-autocomplete')).toBe('list');
    expect(input.attributes('aria-expanded')).toBeDefined();
    expect(input.attributes('aria-controls')).toBeTruthy();
    expect(input.attributes('aria-label')).toBe(enUS.search.searchLabel);
  });

  describe('keyboard: the combobox', () => {
    it('moves the active option with the arrow keys across groups, stopping at the ends, and never moves focus off the field', async () => {
      const wrapper = mountSearch(mock, { attach: true });
      await nextTick();
      const input = wrapper.get('input[type="search"]');
      expect(document.activeElement).toBe(input.element);

      await input.trigger('keydown', { key: 'ArrowDown' });
      let options = listboxOptions();
      expect(options.length).toBeGreaterThan(1);
      expect(input.attributes('aria-activedescendant')).toBe(options[0]!.id);
      expect(document.activeElement).toBe(input.element);

      for (let i = 0; i < options.length + 3; i += 1) {
        await input.trigger('keydown', { key: 'ArrowDown' });
      }
      options = listboxOptions();
      expect(input.attributes('aria-activedescendant')).toBe(options.at(-1)!.id);
      expect(document.activeElement).toBe(input.element);

      for (let i = 0; i < options.length + 3; i += 1) {
        await input.trigger('keydown', { key: 'ArrowUp' });
      }
      expect(input.attributes('aria-activedescendant')).toBe(options[0]!.id);
      expect(document.activeElement).toBe(input.element);
    });

    it('Enter follows the active option', async () => {
      const wrapper = mountSearch(mock, { attach: true });
      const input = wrapper.get('input[type="search"]');
      // A non-empty query so the active row is a real result (a product link), not an idle-view
      // popular-search chip, which fills the field on Enter instead of following anything.
      await input.setValue('linen');
      await input.trigger('keydown', { key: 'ArrowDown' });
      const activeId = input.attributes('aria-activedescendant');
      expect(activeId).toBeTruthy();
      const active = document.getElementById(activeId!) as HTMLAnchorElement;
      // Stubbed so a real `<a href>` click never asks jsdom to navigate (unimplemented there);
      // the spy proves the row was followed without exercising that unrelated limitation.
      const clickSpy = vi.spyOn(active, 'click').mockImplementation(() => {});
      await input.trigger('keydown', { key: 'Enter' });
      expect(clickSpy).toHaveBeenCalledOnce();
    });

    it('Enter with no active option leaves the native form submit for the browser', async () => {
      const wrapper = mountSearch(mock, { attach: true });
      const input = wrapper.get('input[type="search"]');
      await input.setValue('linen');
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(wrapper.get('form[role="search"]').attributes('action')).toBe('/search');
      expect(input.attributes('name')).toBe('q');
    });

    it('Esc clears the active option, then the query, then closes the panel — focus stays in the field', async () => {
      const wrapper = mountSearch(mock, { attach: true });
      const input = wrapper.get('input[type="search"]');
      await input.setValue('linen');
      await input.trigger('keydown', { key: 'ArrowDown' });
      expect(input.attributes('aria-activedescendant')).toBeTruthy();

      await input.trigger('keydown', { key: 'Escape' });
      expect(input.attributes('aria-activedescendant')).toBeFalsy();
      expect(document.querySelector('[role="listbox"]')).not.toBeNull();

      await input.trigger('keydown', { key: 'Escape' });
      expect((input.element as HTMLInputElement).value).toBe('');

      await input.trigger('keydown', { key: 'Escape' });
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(document.activeElement).toBe(input.element);
    });

    it('Tab closes the panel without being consumed; options are never Tab stops', async () => {
      const wrapper = mountSearch(mock, { attach: true });
      const input = wrapper.get('input[type="search"]');
      await input.trigger('keydown', { key: 'ArrowDown' });
      const options = listboxOptions();
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) expect(option.getAttribute('tabindex')).toBe('-1');

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      input.element.dispatchEvent(event);
      await nextTick();
      expect(event.defaultPrevented).toBe(false);
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    });

    it('sold-out products rank last in the suggestion list', async () => {
      const soldOut = PRODUCTS.find((p) => p.handle === 'linen-tea-towels-pair')!;
      const inStock = PRODUCTS.find((p) => p.handle === 'merino-crew-sweater')!;
      const wrapper = mountSearch(mock, {
        attach: true,
        storefront: withSearch({
          query: 'a',
          total: 2,
          products: [soldOut, inStock],
          articles: [],
          pages: [],
          suggestion: null,
        }),
      });
      const input = wrapper.get('input[type="search"]');
      await input.setValue('a');
      const productLinks = listboxOptions().filter((el) =>
        el.getAttribute('href')?.startsWith('/products/')
      );
      expect(productLinks.map((el) => el.getAttribute('href'))).toEqual([
        '/products/merino-crew-sweater',
        '/products/linen-tea-towels-pair',
      ]);
    });
  });

  it('announces the count politely once typing settles (400ms)', async () => {
    vi.useFakeTimers();
    const wrapper = mountSearch(mock, { attach: true });
    const input = wrapper.get('input[type="search"]');
    const live = () => document.querySelector('[aria-live="polite"]');
    expect(live()?.textContent).toBe('');

    (input.element as HTMLInputElement).value = 'li';
    await input.trigger('input');
    vi.advanceTimersByTime(399);
    await nextTick();
    expect(live()?.textContent).toBe('');

    vi.advanceTimersByTime(1);
    await nextTick();
    // "li" matches 3 products (Linen tea towels/napkins, Stonewashed linen throw) plus 2 journal
    // articles and 2 pages via the real demo's own case-insensitive title/category/snippet match.
    expect(live()?.textContent).toContain('7');
  });

  describe('result tabs', () => {
    it('a type with zero results has no tab', async () => {
      const wrapper = mountSearch(mock, {
        storefront: withSearch({
          query: 'linen',
          total: 3,
          products: PRODUCTS.slice(0, 2),
          articles: [ARTICLE_A],
          pages: [],
          suggestion: null,
        }),
      });
      // The route's query is adopted in `onMounted` (so the prerendered shell and the browser's
      // first render agree — see the block's own comment), so the answered page is a tick away.
      await nextTick();
      const tabs = wrapper.findAll('[role="tab"]');
      const titles = tabs.map((tab) => tab.text());
      expect(titles.some((title) => title.startsWith(enUS.search.typePages))).toBe(false);
      expect(titles.some((title) => title.startsWith(enUS.search.typeProducts))).toBe(true);
      expect(titles.some((title) => title.startsWith(enUS.search.typeJournal))).toBe(true);
    });

    /**
     * Every URL in a search response is storefront-derived: a product's `url`, a journal row's
     * `href`, a page row's `href` all come straight off the gateway. They used to reach
     * `ProductCard`/`ContentCard`/`Link` unchecked (and a result with no `targetUrl` arrived as
     * `'#'`, a link to nowhere). `toProductCardEntries` and `safeHref` now gate all three inside
     * `TypeSection.vue`: a row whose URL does not survive `safeHref` is dropped, and `link-as`
     * follows `isInternalHref` per row instead of being `EldraRouterLink` unconditionally.
     */
    it('drops products, journal rows and page rows whose href is not a safe href', async () => {
      const wrapper = mountSearch(
        { ...mock, resultTypes: ['products', 'journal', 'pages'] },
        {
          storefront: withSearch({
            query: 'linen',
            total: 6,
            products: [
              PRODUCTS[0]!,
              // The exact shape the guard exists for: a scheme `safeHref` rejects.
              { ...PRODUCTS[1]!, url: 'javascript:alert(1)' },
            ],
            articles: [ARTICLE_A, { ...ARTICLE_A, title: 'Unsafe story', href: 'javascript:1' }],
            pages: [
              { title: 'Shipping', href: '/pages/shipping', path: '/pages/shipping', snippet: '' },
              { title: 'Unsafe page', href: 'javascript:2', path: 'javascript:2', snippet: '' },
            ],
            suggestion: null,
          }),
        }
      );
      await nextTick();

      expect(wrapper.text()).toContain(PRODUCTS[0]!.title);
      expect(wrapper.text()).not.toContain(PRODUCTS[1]!.title);
      expect(wrapper.text()).toContain(ARTICLE_A.title);
      expect(wrapper.text()).not.toContain('Unsafe story');
      expect(wrapper.text()).toContain('Shipping');
      expect(wrapper.text()).not.toContain('Unsafe page');
      expect(wrapper.html()).not.toContain('javascript:');
    });

    it('a single result type hides the Tabs widget altogether', async () => {
      const wrapper = mountSearch(mock, {
        storefront: withSearch({
          query: 'linen',
          total: 2,
          products: PRODUCTS.slice(0, 2),
          articles: [],
          pages: [],
          suggestion: null,
        }),
      });
      await nextTick();
      expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
      expect(wrapper.text()).toContain(enUS.search.typeProducts);
    });

    it('←/→ move between tabs, wrapping, and Home/End jump to the ends', async () => {
      // A real, non-empty query — the default demo's own `route.query` is empty, which now (the
      // real demo honours the query text) means no results and no tabs at all.
      const wrapper = mountSearch(mock, {
        attach: true,
        storefront: createDemoStorefront({ query: 'linen' }),
      });
      await nextTick();
      const tabs = wrapper.findAll('[role="tab"]');
      expect(tabs.length).toBeGreaterThan(2);
      (tabs[0]!.element as HTMLElement).focus();

      await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
      expect(document.activeElement).toBe(tabs[1]!.element);
      expect(tabs[1]!.attributes('aria-selected')).toBe('true');

      await tabs[1]!.trigger('keydown', { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(tabs[0]!.element);

      await tabs[0]!.trigger('keydown', { key: 'ArrowLeft' });
      const last = tabs[tabs.length - 1]!;
      expect(document.activeElement).toBe(last.element);
      expect(last.attributes('aria-selected')).toBe('true');

      await last.trigger('keydown', { key: 'Home' });
      expect(document.activeElement).toBe(tabs[0]!.element);

      await tabs[0]!.trigger('keydown', { key: 'End' });
      expect(document.activeElement).toBe(last.element);
    });
  });

  describe('field-only', () => {
    it('renders no h1 and never autofocuses', async () => {
      const wrapper = mountSearch({ ...mock, variant: 'field-only' }, { attach: true });
      await nextTick();
      expect(wrapper.find('h1').exists()).toBe(false);
      expect(document.activeElement).not.toBe(wrapper.get('input[type="search"]').element);
    });
  });

  describe('no results', () => {
    it('shows the h1, the "Did you mean" link, popular chips and up to four product cards, all inside role=status', async () => {
      const wrapper = mountSearch(mock, { storefront: withNoResults() });
      await nextTick();
      const status = pageStatus(wrapper);
      expect(status.text()).toContain('linnen napkns');
      expect(status.text()).toContain('linen napkins');
      for (const label of mock.popularSearches) expect(status.text()).toContain(label.label);
      expect(status.findAll('a[href^="/products/"]').length).toBeGreaterThan(0);
      expect(status.findAll('a[href^="/products/"]').length).toBeLessThanOrEqual(4);
    });

    it('the popular-search chips are links to the results page', async () => {
      const wrapper = mountSearch(mock, { storefront: withNoResults() });
      await nextTick();
      const firstLabel = mock.popularSearches[0]!.label;
      const chips = wrapper.findAll('a').filter((a) => a.text() === firstLabel);
      expect(chips).toHaveLength(1);
      expect(chips[0]!.attributes('href')).toBe(`/search?q=${encodeURIComponent(firstLabel)}`);
    });
  });

  /**
   * The URL arriving late, which is what a **generated** page does.
   *
   * Nuxt hydrates a prerendered route under the payload's path with the query stripped, and restores
   * the address bar's real URL only once the app's `<Suspense>` has resolved — after every component
   * has mounted (`hasDeferredRoute`, in its own router plugin). So on `/search?q=linen` the block is
   * built with an empty `route.query`, renders the build's empty-query page, and must pick the real
   * query up afterwards. `collection-grid` had to grow that (it seeded once and never looked again);
   * this block has always watched the route, and this is the guard that keeps it that way.
   */
  describe('a query the route only carries after mount', () => {
    const RESPONSE: StorefrontSearchResponse = {
      query: 'linen',
      total: 1,
      products: [],
      articles: [ARTICLE_A],
      pages: [],
      suggestion: null,
    };

    /** A storefront whose `search.run` records the query text it is asked for, in order. */
    function recordingSearch(): { source: StorefrontSource; queries: string[] } {
      const base = createDemoStorefront();
      const queries: string[] = [];
      const source: StorefrontSource = {
        ...base,
        search: {
          run: (query) => {
            watch(query, (value) => queries.push(value), { immediate: true });
            return stubResult(RESPONSE);
          },
        },
      };
      return { source, queries };
    }

    it('runs the restored query and puts it in the field and the heading', async () => {
      const { source, queries } = recordingSearch();
      const wrapper = mountSearch(mock, { storefront: source });
      await nextTick();
      // The build's state: no query, so the read that was prerendered is the empty one.
      expect(queries).toEqual(['']);

      // The router restoring the real URL, a tick after the app mounted.
      source.route.query = 'linen';
      await nextTick();

      expect(queries).toEqual(['', 'linen']);
      expect(wrapper.find('input[type="search"]').element.value).toBe('linen');
      expect(wrapper.text()).toContain('linen');
    });

    it('follows every later change too, including one that clears it', async () => {
      const { source, queries } = recordingSearch();
      const wrapper = mountSearch(mock, { storefront: source });
      await nextTick();

      source.route.query = 'linen';
      await nextTick();
      source.route.query = 'wool';
      await nextTick();
      source.route.query = null;
      await nextTick();

      expect(queries).toEqual(['', 'linen', 'wool', '']);
      expect(wrapper.find('input[type="search"]').element.value).toBe('');
    });
  });

  /**
   * `/search` with no `?q=` — what a shopper reaches from a "Search" link, and the only state the
   * prerendered `search/index.html` a static host serves can be in, since one file answers every
   * query (`pages/search.page.json` seeds that page).
   *
   * The empty query is a real `search.run()` answer with `total: 0`, so the page used to head itself
   * "No results for “”" and offer spelling advice for a word nobody typed — baked into the
   * artifact's HTML, which is where a shopper and a crawler both read it first.
   */
  describe('idle: no query asked yet', () => {
    it('heads itself with the idle title, not a no-results answer', async () => {
      const wrapper = mountSearch(mock);
      await nextTick();

      const heading = wrapper.get('h1');
      expect(heading.text()).toBe(enUS.search.idleTitle);
      expect(wrapper.text()).not.toContain('No results');
      // Nor the empty interpolation of the authored heading template.
      expect(wrapper.text()).not.toContain('Results for “”');
      // Nothing to count, so no count line either.
      expect(wrapper.find('[role="status"]:not([aria-live])').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('offers the popular searches as links back into the results page', async () => {
      const wrapper = mountSearch(mock);
      await nextTick();

      const chips = wrapper
        .findAll('a')
        .filter((link) => mock.popularSearches.map((item) => item.label).includes(link.text()));
      expect(chips.map((chip) => chip.attributes('href'))).toEqual([
        '/search?q=Merino',
        '/search?q=Mugs',
        '/search?q=Tea%20towels',
        '/search?q=Gift%20cards',
      ]);
    });

    it('answers the query as soon as the route carries one', async () => {
      const storefront = createDemoStorefront();
      const wrapper = mountSearch(mock, { storefront });
      await nextTick();
      expect(wrapper.get('h1').text()).toBe(enUS.search.idleTitle);

      storefront.route.query = 'linen';
      await nextTick();
      await nextTick();

      expect(wrapper.get('h1').text()).toBe('Results for “linen”');
      expect(wrapper.text()).not.toContain(enUS.search.idleTitle);
    });
  });

  /**
   * The state the deployed header and results page both got wrong: a read for the *new* query is in
   * flight while `data` still holds the answer to the *previous* one. `pending` is false there (there
   * is something on screen), so a page keyed off `pending` showed no loading state at all, and the
   * stale answer — the empty query's `{ total: 0 }`, for a first search — was presented as this
   * query's. "No results for “wool”" is a wrong answer, not an empty one.
   */
  describe('a read in flight over a previous answer', () => {
    const LINEN: StorefrontSearchResponse = {
      query: 'linen',
      total: 1,
      products: [],
      articles: [ARTICLE_A],
      pages: [],
      suggestion: null,
    };

    /** The gateway's own mid-retype shape: the route (and so the field) says `wool`, the answer in
     *  hand is `linen`'s, and `loading` says the read for `wool` has not come back. */
    function retyping(): StorefrontSource {
      const base = createDemoStorefront({ query: 'wool' });
      return { ...base, search: { run: () => stubResult(LINEN, { loading: true }) } };
    }

    it('says it is searching, and shows neither the old answer nor a no-results answer', async () => {
      const wrapper = mountSearch(mock, { storefront: retyping() });
      await nextTick();

      expect(pageStatus(wrapper).text()).toBe(enUS.search.searching);
      expect(wrapper.text()).not.toContain(ARTICLE_A.title);
      expect(wrapper.text()).not.toContain('No results');
      expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it("draws the field's own loading view once the request passes 300ms", async () => {
      vi.useFakeTimers();
      const wrapper = mountSearch(mock, { attach: true, storefront: retyping() });
      const input = wrapper.get('input[type="search"]');
      await input.setValue('wool');

      expect(document.querySelector('[data-part="loading"]')).toBeNull();
      vi.advanceTimersByTime(300);
      await nextTick();

      expect(document.querySelector('[data-part="loading"]')).not.toBeNull();
      // Never the "nothing found" view while the request for it is still out.
      expect(document.body.textContent).not.toContain('No results');

      // The announcement is debounced 400ms, past the loading view's own 300ms, and it has to agree
      // with the panel: a screen-reader user must not hear the search fail and then hear it succeed.
      vi.advanceTimersByTime(100);
      await nextTick();
      expect(document.querySelector('[data-part="liveRegion"]')?.textContent).toBe(
        uiEnUS.searchLoading
      );
    });
  });

  /**
   * A product the storefront could not price (`StorefrontSearchProduct.price === null`: the pricing
   * read failed, or the catalogue did not answer about that id). `ProductCardProduct.price` is
   * required — a commerce card without a price is not a product card — so the results page renders
   * no card for it rather than one reading the store's own "$0.00", and the Products tab counts the
   * cards it can draw rather than the rows it was given.
   */
  describe('a product the storefront could not price', () => {
    function withUnpricedProducts(): StorefrontSource {
      const base = createDemoStorefront({ query: 'linen' });
      const response: StorefrontSearchResponse = {
        query: 'linen',
        total: 3,
        products: [
          { ...PRODUCTS[0]!, price: null },
          { ...PRODUCTS[1]!, price: null },
        ],
        articles: [ARTICLE_A],
        // A second visible type, so the page draws its tabs at all and the Products tab's absence
        // is a real assertion rather than the "only one type" fallback.
        pages: [
          { title: 'Shipping', href: '/pages/shipping', path: '/pages/shipping', snippet: '' },
        ],
        suggestion: null,
      };
      return { ...base, search: { run: () => stubResult(response) } };
    }

    it('renders no card for it, and never a formatted zero', async () => {
      const wrapper = mountSearch(mock, { storefront: withUnpricedProducts() });
      await nextTick();

      expect(wrapper.text()).not.toContain('0.00');
      expect(wrapper.text()).not.toContain(PRODUCTS[0]!.title);
      // The journal result is untouched: only the product cards need a price.
      expect(wrapper.text()).toContain(ARTICLE_A.title);
    });

    it('names no more products in its tabs than the grid can show', async () => {
      const wrapper = mountSearch(mock, { storefront: withUnpricedProducts() });
      await nextTick();

      const titles = wrapper.findAll('[role="tab"]').map((tab) => tab.text());
      expect(titles.some((title) => title.startsWith(enUS.search.typeProducts))).toBe(false);
      expect(titles.some((title) => title.startsWith(enUS.search.typeJournal))).toBe(true);
    });
  });

  /**
   * `/search?q=%20` is somebody's stray space, not a search: `SearchBar` trims its own input and
   * treats it as idle, and the page has to agree rather than heading itself `Results for “ ”`,
   * printing a count line and spending a backend read on it.
   */
  it('treats a whitespace-only query as no query at all', async () => {
    const storefront = createDemoStorefront({ query: '   ' });
    const queries: string[] = [];
    const base = storefront.search.run;
    const wrapper = mountSearch(mock, {
      storefront: {
        ...storefront,
        search: {
          run: (ref_) => {
            watch(ref_, (value) => queries.push(value), { immediate: true });
            return base(ref_);
          },
        },
      },
    });
    await nextTick();

    expect(wrapper.get('h1').text()).toBe(enUS.search.idleTitle);
    expect(wrapper.find('[role="status"]:not([aria-live])').exists()).toBe(false);
    // Never a read for the whitespace itself.
    expect(queries).toEqual(['']);
  });
});
