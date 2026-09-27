// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref, type Ref } from 'vue';
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
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

/** `EldraIcon` (the "Customers love these" search icon on chips) resolves through
 *  `useEldraIcon`, which under Nuxt calls `/api/eldra-icon`; outside Nuxt this needs an injected
 *  `ICON_FETCHER_KEY` — reads the real SVGs synchronously, network-free (see `newsletter`'s own
 *  spec for the identical pattern). */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/** The genuinely minimal fixture: only the one required field. Exercises every fallback default
 *  (placeholder, the default products/journal/pages types, `suggestionsPerGroup`, no popular
 *  searches, no no-results collection) at once. */
const bare = { variant: 'results-page' };

function stubResult<T>(data: T, pending = false): StorefrontResult<T> {
  return {
    data: ref(data) as Ref<T | null>,
    pending: ref(pending),
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
function withSearch(response: StorefrontSearchResponse | null, pending = false): StorefrontSource {
  const base = createDemoStorefront();
  return { ...base, search: { run: () => stubResult(response, pending) } };
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
        [ICON_FETCHER_KEY]: stubFetcher,
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
      const wrapper = mountSearch(mock);
      await nextTick();
      expect(wrapper.text()).toContain('Results for');
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
    it('a type with zero results has no tab', () => {
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
      const tabs = wrapper.findAll('[role="tab"]');
      const titles = tabs.map((tab) => tab.text());
      expect(titles.some((title) => title.startsWith(enUS.search.typePages))).toBe(false);
      expect(titles.some((title) => title.startsWith(enUS.search.typeProducts))).toBe(true);
      expect(titles.some((title) => title.startsWith(enUS.search.typeJournal))).toBe(true);
    });

    it('a single result type hides the Tabs widget altogether', () => {
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
});
