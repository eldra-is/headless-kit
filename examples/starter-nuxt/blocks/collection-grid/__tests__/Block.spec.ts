// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { LOCALE_KEY, MESSAGES_KEY, ProductCard, type UiMessages } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { hydrateBlock, hydrationWarnings, renderBlockHtml } from '../../../test/support/hydrate';
import Block from '../Block.vue';
import mock from '../mock.json';
import { createDemoStorefront, demoCollectionId, PRODUCTS } from '../../../app/storefront/demo';
import { createGatewayStorefront } from '../../../app/storefront/gateway';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  CatalogFacets,
  StorefrontCatalog,
  StorefrontCollectionProducts,
  StorefrontCollectionSelector,
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontSource,
  VolatileKey,
} from '../../../app/storefront/types';
import type { EldraClient } from '@eldrajs/sdk';
import { enUS } from '../../../app/i18n/en-US';
import { isIS } from '../../../app/i18n/is-IS';
import { uiEnUS, uiMessagesFor } from '../../../app/i18n/uiMessages';

/** Only the four required fields: the freshly-inserted seed, exercising every fallback default
 *  (no collection of its own — the route supplies one — no filters, no sort, no empty copy). */
const bare = {
  variant: 'sidebar',
  columns: '3',
  pageSize: '24',
  paginationStyle: 'load-more',
};

/**
 * How a store describes the scope the grid is showing (`CatalogFacets`): the price span the slider
 * works across, the category and collection terms, the availability counts and every variant
 * option value with its own count. `discontinued` counts zero on purpose — the panel offers it
 * disabled rather than hiding it, which is what keeps controls from moving under the pointer.
 */
const FACETS: CatalogFacets = {
  price: { min: 24, max: 180 },
  categories: [
    { id: 'cat-knitwear', slug: 'knitwear', title: 'Knitwear', count: 18 },
    { id: 'cat-ceramics', slug: 'ceramics', title: 'Ceramics', count: 14 },
    { id: 'cat-kitchen', slug: 'kitchen', title: 'Kitchen', count: 16 },
    { id: 'cat-discontinued', slug: 'discontinued', title: 'Discontinued', count: 0 },
  ],
  collections: [
    { id: 'col-the-winter-edit', slug: 'the-winter-edit', title: 'The winter edit', count: 48 },
    { id: 'col-best-sellers', slug: 'best-sellers', title: 'Best sellers', count: 24 },
  ],
  availability: { in_stock: 41, out_of_stock: 7 },
  options: [
    {
      key: 'size',
      name: 'size',
      kind: 'none',
      values: [
        { value: 'xs', label: 'XS', count: 6 },
        { value: 's', label: 'S', count: 10 },
        { value: 'm', label: 'M', count: 14 },
      ],
    },
    {
      key: 'colour',
      name: 'colour',
      kind: 'color',
      values: [
        { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
        { value: 'charcoal', label: 'Charcoal', count: 8, swatch: '#3a3a3a' },
      ],
    },
  ],
};

/** The price facet's title — one string now, used both visibly and as the fieldset's hidden
 *  `<legend>` (`FilterFacet.label`). */
const PRICE_LEGEND = enUS.grid.price;

interface Stub {
  source: StorefrontSource;
  /** Flipped by a test to hold the block in its first-load state — nothing on screen yet. */
  pending: Ref<boolean>;
  /** Flipped by a test to hold the block in its "while filtering" state: a read in flight over
   *  results the visitor can still see. */
  loading: Ref<boolean>;
  /** Flipped by a test to put the grid's cards in the volatile-refresh state. */
  revalidating: Ref<ReadonlySet<VolatileKey>>;
  /** Set by a test to fail the read *after* it has already answered once. */
  error: Ref<string | null>;
  /** Every `collectionProducts` request, newest last — the grid's and the drawer's pending count. */
  requests: Array<{ pageSize: number; sort?: string; filters?: Record<string, string[]> }>;
}

/**
 * A storefront whose catalogue actually answers the request: the twelve Northwind products when
 * nothing is filtered, and nothing at all as soon as any filter is applied. That is what makes
 * "the count reads 12 products, then 0 products", "the empty state names the active filters" and
 * "the drawer changes nothing until Show N products" real assertions rather than restatements of a
 * fixture — the demo source (`app/storefront/demo.ts`) ignores `filters` by design.
 */
function createStub(
  items: StorefrontProductListItem[] = PRODUCTS,
  options: {
    /** How many items a filtered request answers with. `0` (the default) drives the empty state. */
    filteredCount?: number;
    /** The facets a *filtered* request answers with — most backends compute them over the result
     *  set, so a value the shopper has ticked can stop being listed. */
    filteredFacets?: CatalogFacets;
    /** How the store describes its scope at all, for the families it cannot count. */
    facets?: CatalogFacets;
    /** The `filters` keys this scope cannot narrow by, as a storefront declares them. */
    unfilterable?: readonly string[];
    /** The block's own sort ids this scope cannot honour, as a storefront declares them. */
    unsortable?: readonly string[];
  } = {}
): Stub {
  const base = createDemoStorefront();
  const pending = ref(false);
  const loading = ref(false);
  const revalidating = ref<ReadonlySet<VolatileKey>>(new Set());
  const error = ref<string | null>(null);
  const requests: Stub['requests'] = [];
  const filteredCount = options.filteredCount ?? 0;
  const catalog: StorefrontCatalog = {
    ...base.catalog,
    collectionProducts(collection, opts) {
      watch(opts, (value) => requests.push({ ...value }), { deep: true });
      const data = computed(() => {
        if (collection.value === null) return null;
        const filtered = opts.value.filters !== undefined;
        return {
          items: filtered ? items.slice(0, filteredCount) : items.slice(0, opts.value.pageSize),
          total: filtered ? filteredCount : items.length,
          facets: filtered
            ? (options.filteredFacets ?? options.facets ?? FACETS)
            : (options.facets ?? FACETS),
          ...(options.unfilterable === undefined ? {} : { unfilterable: options.unfilterable }),
          ...(options.unsortable === undefined ? {} : { unsortable: options.unsortable }),
        };
      });
      return {
        data,
        pending,
        loading,
        revalidating,
        error,
        refresh: async () => {},
      } as unknown as StorefrontResult<StorefrontCollectionProducts>;
    },
  };
  return { source: { ...base, catalog }, pending, loading, revalidating, error, requests };
}

/** A storefront whose collection read is still on its very first load: `pending`, and no data at
 *  all. The one state the grid is allowed to draw skeletons in. */
function firstLoadSource(): StorefrontSource {
  const base = createDemoStorefront();
  return {
    ...base,
    catalog: {
      ...base.catalog,
      collectionProducts: () =>
        ({
          data: ref(null),
          pending: ref(true),
          loading: ref(true),
          revalidating: ref(new Set()),
          error: ref(null),
          refresh: async () => {},
        }) as unknown as ReturnType<StorefrontCatalog['collectionProducts']>,
    },
  };
}

/** The Eldra context with edit-mode preview on, so `useEditing()` reads true — the same shape
 *  `blocks/navigation`'s spec builds. */
function editingContext() {
  return {
    client: {},
    designTokens: { colors: {} },
    preview: Object.assign(createEldraPreviewState(), { active: true, mode: 'edit' as const }),
  };
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()!.unmount();
});
/** Idempotent on a test that never faked timers in the first place — the one global cleanup for
 *  every test below that opts into `useFilterTimers()` to get past the sidebar's own
 *  `FILTER_DEBOUNCE_MS` (Block.vue), so a failure mid-test never leaks fake timers into the next
 *  one. */
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The sidebar's own filter-request debounce (`FILTER_DEBOUNCE_MS` in Block.vue — 350ms, repeated
 * here rather than imported, since a `<script setup>` constant is not an export). A test that
 * ticks a checkbox or drags a price bound and then reads the *request* this drives (`countLine`,
 * `cards`, `stub.requests`, a chip's facet-matched label) calls `useFilterTimers()` before the
 * interaction and `settleFilterDebounce()` after it; a test that only reads the *visible* state
 * the same interaction writes at once (the checkbox itself, the chip's bare existence, the URL
 * write) needs neither.
 */
const FILTER_DEBOUNCE_MS = 350;

/**
 * **Only `setTimeout`/`clearTimeout` are faked, never the clock.** Vitest's default
 * `useFakeTimers()` takes `Date` and `performance` with it, so `advanceTimersByTime(350)` leaves
 * the faked clock 350ms *ahead* of real time — and Vue's own event invoker stamps every listener
 * with the time it was attached and silently drops an event whose timestamp is older than that
 * (`_vts <= invoker.attached`, the guard that stops a handler bound mid-propagation from firing on
 * the event that bound it). Any element the block renders *after* an advance therefore carries a
 * future `attached`, and the next `trigger('click')` on it — dispatched once the clock is real
 * again — does nothing at all: no error, no handler, no state change. That cost a long hunt
 * through the empty state's own Clear-filters button, which looked for all the world like a
 * product bug. The debounce only needs the two timer functions, so fake only those and the clock
 * stays honest.
 */
function useFilterTimers(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

/**
 * Runs the armed window out and hands the test real timers back — not only in the global
 * `afterEach` above: `axe()` schedules its own work with real timers in mind, and a run started
 * while fake ones were still active left every *later* test's own `axe()` call failing with "Axe
 * is already running" — a stuck module-level flag inside the library, not a timer leak this file's
 * own cleanup could reach. Settle, then call `axe()` (or anything else timer-sensitive) only after.
 */
async function settleFilterDebounce(wrapper: VueWrapper): Promise<void> {
  await wrapper.vm.$nextTick();
  vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
  await wrapper.vm.$nextTick();
  vi.useRealTimers();
}

function mountGrid(
  data: Record<string, unknown>,
  options: { source?: StorefrontSource; attachTo?: Element; editing?: boolean } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const wrapper = mount(Block, {
    ...base,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        ...(options.source ? { [STOREFRONT_KEY]: options.source } : {}),
        ...(options.editing ? { [ELDRA_KEY]: editingContext() } : {}),
      },
    },
    ...(options.attachTo ? { attachTo: options.attachTo } : {}),
  });
  wrappers.push(wrapper);
  return wrapper;
}

/** The result count — the block's polite status line. */
const countLine = (wrapper: VueWrapper) => wrapper.get('p[role="status"][tabindex="-1"]');

/**
 * How many filter groups `mock.json` actually renders: Category, Size, Colour, Price, Availability.
 * Five, from **four** rows — `options` is one row standing for every variant option the store has, so
 * the count is not `mock.filters.length` and the spec says so rather than quietly agreeing.
 */
const SEEDED_GROUPS = 5;
/** The grid's single visually hidden live region for the volatile refresh. The count line above
 *  and `LoadMore`'s own "Showing N of M" are the block's other `role="status"` elements, and both
 *  are visible — this is the only hidden one. */
const liveRegion = (wrapper: VueWrapper) => wrapper.get('p.sr-only[role="status"]');
/** The grid itself: the list of product cards (never the skeleton list, which is aria-hidden). */
const cards = (wrapper: VueWrapper) =>
  wrapper.findAll('ul[aria-labelledby]:not([aria-hidden]) > li');
const gridList = (wrapper: VueWrapper) => wrapper.get('ul[aria-labelledby]:not([aria-hidden])');
/** The sort/columns `Select` triggers, in DOM order — the `<button role="combobox">`, never the
 *  hidden native fallback. */
const comboboxes = (wrapper: VueWrapper) =>
  wrapper.findAll('[role="combobox"]').filter((c) => c.element.tagName === 'BUTTON');
const filterButton = (wrapper: VueWrapper) => wrapper.get('button[aria-haspopup="dialog"]');
/** The filter-group disclosure triggers — a `<button>` inside an `h3`, which is what separates them
 *  from the block's other `aria-expanded` controls (the Filter button and the Selects). */
const groupTriggers = (wrapper: VueWrapper) => wrapper.findAll('h3 > button[aria-expanded]');
/** A group's panel, addressed the way assistive technology does: through `aria-controls`. */
function panelFor(wrapper: VueWrapper, legend: string) {
  const trigger = groupTriggers(wrapper).find(
    (candidate) =>
      wrapper
        .get(`#${candidate.attributes('aria-controls')!}`)
        .get('legend')
        .text() === legend
  )!;
  return { trigger, panel: wrapper.get(`#${trigger.attributes('aria-controls')!}`) };
}

describe('collection-grid block', () => {
  describe('accessibility', () => {
    it('renders the mock.json content, axe-clean', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      expect(cards(wrapper).length).toBeGreaterThan(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare mock — only the required fields — axe-clean', async () => {
      const wrapper = mountGrid(bare);
      await wrapper.vm.$nextTick();
      // No `filters[]`, so no Filter button, no sidebar and no drawer; the grid takes the width.
      expect(wrapper.find('button[aria-haspopup="dialog"]').exists()).toBe(false);
      expect(wrapper.find('aside').exists()).toBe(false);
      expect(wrapper.find('dialog').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders each declared variant, axe-clean', async () => {
      for (const variant of ['sidebar', 'drawer-only']) {
        const wrapper = mountGrid({ ...mock, variant });
        await wrapper.vm.$nextTick();
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    });

    it('is axe-clean with the filter drawer open', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      await filterButton(wrapper).trigger('click');
      expect(wrapper.get('dialog').attributes('open')).toBe('');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('is axe-clean with zero results', async () => {
      useFilterTimers();
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);
      await settleFilterDebounce(wrapper);
      expect(cards(wrapper)).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('has no h1, and never renders a bound-collection-less block on the live site', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('h1').exists()).toBe(false);

      // Route and field both empty: nothing at all outside the editor.
      const source = createDemoStorefront();
      source.route.collectionHandle = null;
      const empty = mountGrid(mock, { source });
      expect(empty.find('section').exists()).toBe(false);
    });
  });

  describe('structure', () => {
    it('names the section with the collection and puts the grid under a hidden h2 with h3 titles', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();

      const section = wrapper.get('section');
      expect(section.attributes('aria-label')).toBe('Winter knitwear products');

      // Not `wrapper.get('h2')`: the sidebar's own hidden "Filters" h2 (added so the filter
      // group triggers below it have a heading to nest under) precedes this one in DOM order.
      const h2 = wrapper
        .findAll('h2')
        .find((candidate) => candidate.text() === enUS.grid.products)!;
      expect(h2.classes()).toContain('sr-only');

      const titles = wrapper.findAll('h3');
      expect(titles.some((title) => title.text() === 'Merino crew sweater')).toBe(true);
    });

    it('labels the filter sidebar and gives it the sticky header offset', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const aside = wrapper.get('aside');
      expect(aside.attributes('aria-label')).toBe(enUS.grid.filters);
      expect(aside.classes().join(' ')).toContain('var(--eldra-header-height,0px)');
    });

    /**
     * `mock.json` ships four rows for five groups: `options` is one row standing for every variant
     * option the store has, which in the demo catalogue is Size and Colour.
     */
    it('renders one group per filters[] entry, each a fieldset with a hidden legend', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      // Sidebar and drawer render the same five groups, so ten triggers in the DOM.
      expect(groupTriggers(wrapper)).toHaveLength(SEEDED_GROUPS * 2);
      for (const legend of [
        enUS.grid.legendCategory,
        enUS.grid.legendSize,
        enUS.grid.legendColour,
        PRICE_LEGEND,
        enUS.grid.legendAvailability,
      ]) {
        const { trigger, panel } = panelFor(wrapper, legend);
        expect(trigger.attributes('aria-expanded')).toBe('true');
        expect(panel.element.tagName).toBe('FIELDSET');
        expect(panel.get('legend').classes()).toContain('sr-only');
      }
    });

    /**
     * The sidebar's own `FilterPanel` draws its own visible "Filters" `h2` (`show-head`, the
     * default) right before its `h3` group triggers; the drawer's panel draws none
     * (`show-head="false"`), because the `Drawer` itself already supplies one — its own title,
     * "Filter" — immediately before its triggers. Either way, a whole-page axe run's
     * `heading-order` rule sees no skipped level under the page's own `h1`.
     */
    it('gives the sidebar and the drawer a heading before their filter-group triggers, so headings never skip a level', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();

      const triggers = groupTriggers(wrapper);

      const sidebarHeading = wrapper.findAll('h2').find((el) => el.text() === enUS.grid.filters)!;
      expect(
        sidebarHeading.element.compareDocumentPosition(triggers[0]!.element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();

      const drawerHeading = wrapper.get('dialog').find('h2');
      expect(drawerHeading.text()).toBe(enUS.grid.filter);
      expect(
        drawerHeading.element.compareDocumentPosition(triggers[SEEDED_GROUPS]!.element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    /**
     * Facet counts leave their own family's filter out, so a zero means "another filter rules this
     * out" — and a control that disappears the moment a neighbour is ticked moves every control
     * after it under the shopper's pointer. So it stays, disabled (contract §4).
     */
    it('offers a filter value the store counts zero of disabled, not hidden', async () => {
      const wrapper = mountGrid(mock, { source: createStub().source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      const boxes = panel.findAll('input[type="checkbox"]');
      expect(boxes[0]!.attributes('aria-label')).toBe('Knitwear, 18 products');
      expect(boxes.at(-1)!.attributes('aria-label')).toBe(
        'Discontinued, 0 products, none available'
      );
      expect(boxes[0]!.attributes('disabled')).toBeUndefined();
      expect(boxes.at(-1)!.attributes('disabled')).toBeDefined();
    });

    it('drawer-only renders no sidebar at any width', async () => {
      const wrapper = mountGrid({ ...mock, variant: 'drawer-only' });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('aside').exists()).toBe(false);
      expect(wrapper.find('dialog').exists()).toBe(true);
    });
  });

  describe('the filter controls', () => {
    it('a checked colour carries the ring class and a bold name', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      const row = panel.get('label');
      const input = row.get('input[type="checkbox"]');
      const dot = row.get('span');
      const name = row.get('[data-part="rowLabel"]');

      expect(dot.classes()).toContain('border-transparent');
      expect(name.classes()).not.toContain('font-semibold');
      await input.setValue(true);

      expect(dot.classes()).toContain('border-text');
      expect(name.classes()).toContain('font-semibold');
    });

    /**
     * The demo catalogue's size option carries no size-system `group` (a Core follow-up, not sent
     * by any storefront yet — see `facetTypeFor`), so it renders as a plain `list` facet rather
     * than `SizeFacet`'s tiles; the tile styling itself is `@eldrajs/ui`'s own, covered there.
     */
    it('renders Size as a plain list facet until the store sends a size-system group', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendSize);
      const box = panel.get('input[type="checkbox"]');
      expect((box.element as HTMLInputElement).checked).toBe(false);
      await box.setValue(true);
      expect((box.element as HTMLInputElement).checked).toBe(true);
    });

    it('a group with a selection shows a count badge named "1 selected"', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { trigger, panel } = panelFor(wrapper, enUS.grid.legendCategory);
      expect(trigger.find('[data-part="hiddenSuffix"]').exists()).toBe(false);

      await panel.get('input[type="checkbox"]').setValue(true);

      expect(trigger.get('[data-part="hiddenSuffix"]').text()).toBe('1 selected');
      expect(trigger.get('[data-part="label"]').text()).toBe('1');
    });

    it('the Filter button opens a dialog and counts the active filters', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const button = filterButton(wrapper);
      expect(button.attributes('aria-controls')).toBe(wrapper.get('dialog').attributes('id'));
      expect(button.attributes('aria-expanded')).toBe('false');
      expect(button.find('[data-part="hiddenSuffix"]').exists()).toBe(false);

      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);

      expect(button.get('[data-part="hiddenSuffix"]').text()).toBe('1 active');
    });
  });

  describe('the result count', () => {
    it('is a polite status that reads "12 products" and "0 products" after a filter change', async () => {
      useFilterTimers();
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      expect(countLine(wrapper).text()).toBe('12 products');

      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);
      await settleFilterDebounce(wrapper);

      expect(countLine(wrapper).text()).toBe('0 products');
      expect(countLine(wrapper).attributes('tabindex')).toBe('-1');
    });

    /**
     * The prerender contract (`app/storefront/types.ts`): a grid the visitor can already see never
     * goes back to skeletons. Filtering, sorting and paging all read over results that are on
     * screen, so those results stay on screen — pulsing, never replaced and never covered — and
     * the grid is marked busy while the count says so.
     */
    it('keeps the cards, pulsing and busy, while a filter loads over results already on screen', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const shown = cards(wrapper).length;
      expect(shown).toBeGreaterThan(0);

      // `pending` as well as `loading`: the rule is "no data", not "not pending", so a storefront
      // that raised the skeleton flag over results the visitor can see must still not blank them.
      stub.pending.value = true;
      stub.loading.value = true;
      await wrapper.vm.$nextTick();

      expect(countLine(wrapper).text()).toBe(enUS.grid.updating);
      expect(cards(wrapper)).toHaveLength(shown);
      expect(wrapper.find('ul[aria-hidden="true"]').exists()).toBe(false);
      expect(gridList(wrapper).attributes('aria-busy')).toBe('true');
      // `inert` on the grid, not a `pointer-events` class, is what stops a card being clicked
      // mid-update. jsdom has no native `inert` IDL property (a real browser sets the property and
      // reflects the attribute), so Vue's own patch falls back to writing the attribute here —
      // which is why the binding is `updating || undefined` rather than the bare flag: `false`
      // would be written as the *string* `"false"` on the browser's first paint and omitted
      // entirely by the server render, which is a hydration mismatch over nothing at all.
      expect(gridList(wrapper).attributes('inert')).toBe('true');
      // The pulse is the one visible "this is stale" treatment now — a card's own
      // dimmed-value-and-spinner treatment (`revalidating`) is reserved for the volatile price/stock
      // refresh, a different state this is not, so it stays off here.
      expect(
        wrapper.findAllComponents(ProductCard).every((card) => card.props('revalidating') === false)
      ).toBe(true);
      expect(gridList(wrapper).classes()).toContain('animate-eldra-pulse-soft');
      // Nothing is drawn over the cards and nothing is added to the DOM: the treatment is the
      // list's own opacity, so there is no extra element to find and none to hide from assistive
      // technology.
      expect(gridList(wrapper).element.querySelectorAll(':scope > li')).toHaveLength(shown);
      // Chaining is the point: the filter panel is never dimmed or disabled with the grid.
      const aside = wrapper.get('aside');
      expect(aside.attributes('inert')).toBeUndefined();
      expect(aside.classes().join(' ')).not.toContain('pointer-events-none');
      expect(aside.classes().join(' ')).not.toContain('animate-eldra-pulse-soft');
    });

    /**
     * The motion half, asserted as the class pair rather than a computed style — jsdom parses no
     * stylesheet, so `getComputedStyle` would answer nothing either way. `animate-eldra-pulse-soft`
     * is the theme's own utility (`app/assets/main.css`: 0.7 ↔ 0.9, 1.4s, ease-in-out, alternate,
     * infinite); under `prefers-reduced-motion: reduce` the animation is off and the list holds a
     * steady 0.8 instead, which is the `motion-reduce:` pair beside it.
     */
    it('pulses with a reduced-motion fallback that is a steady opacity, not a stopped animation', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      stub.pending.value = true;
      stub.loading.value = true;
      await wrapper.vm.$nextTick();

      const classes = gridList(wrapper).classes();
      expect(classes).toContain('animate-eldra-pulse-soft');
      expect(classes).toContain('motion-reduce:animate-none');
      expect(classes).toContain('motion-reduce:opacity-80');
    });

    it('does not pulse, and leaves the grid operable, while nothing is updating', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();

      expect(gridList(wrapper).attributes('inert')).toBeUndefined();
      expect(gridList(wrapper).classes()).not.toContain('animate-eldra-pulse-soft');
      expect(gridList(wrapper).classes().join(' ')).not.toContain('motion-reduce:');
    });

    /**
     * The pulse is gated behind `useRevalidating`'s mount flag like every other refresh treatment
     * (`app/composables/useRevalidating.ts`), so the server never writes it and the browser's first
     * render is the server's. A hydrating page is precisely the state that would paint it
     * otherwise: `createGatewayResult` raises `loading` synchronously and fills `data` from the
     * payload in the same turn, so `loading && data !== null` — the pulse's own condition — is true
     * during the first client render and was false during the render it has to match. Both halves
     * are asserted: absent before the tick, there after it, with the read still in flight.
     */
    it('draws no pulse in the server render or the browser’s first paint', async () => {
      const entry = { id: 'ssr-grid', data: mock as unknown as Record<string, unknown> };
      const html = await renderBlockHtml(Block, entry, {
        [STOREFRONT_KEY]: createStub().source,
      });
      expect(html).toContain('data-part="stars"'); // the cards really are in the server's markup
      expect(html).not.toContain('animate-eldra-pulse-soft');
      expect(html).not.toContain(enUS.grid.updating);

      const client = createStub();
      client.loading.value = true;
      const run = hydrateBlock(Block, entry, html, { [STOREFRONT_KEY]: client.source });
      try {
        expect(hydrationWarnings(run)).toEqual([]);
        expect(run.firstPaint).not.toContain('animate-eldra-pulse-soft');
        expect(run.firstPaint).not.toContain(enUS.grid.updating);

        await nextTick();

        expect(client.loading.value).toBe(true);
        expect(run.container.innerHTML).toContain('animate-eldra-pulse-soft');
        expect(run.container.innerHTML).toContain(enUS.grid.updating);
      } finally {
        run.unmount();
      }
    });

    it('reads "Updating…" over skeleton cards only while there is nothing to show at all', async () => {
      const wrapper = mountGrid(mock, { source: firstLoadSource() });
      await wrapper.vm.$nextTick();

      expect(countLine(wrapper).text()).toBe(enUS.grid.updating);
      const skeletons = wrapper.get('ul[aria-hidden="true"]');
      expect(skeletons.findAll(':scope > li').length).toBeGreaterThan(0);
      expect(cards(wrapper)).toHaveLength(0);
    });
  });

  /**
   * Chaining a run of sidebar changes sends one request, not one per tick, and the shopper sees
   * the list is about to move from the very first one.
   */
  describe('the sidebar’s own debounce', () => {
    /** Twice the fixture, the copies given handles of their own — the cards are keyed by handle,
     *  and `pageSize` only takes the schema's own 12/24/48, so putting a real Load more on screen
     *  needs more rows rather than a smaller window. */
    const TWO_PAGES: StorefrontProductListItem[] = [
      ...PRODUCTS,
      ...PRODUCTS.map((item) => ({
        ...item,
        handle: `${item.handle}-2`,
        productId: `${item.productId}-2`,
      })),
    ];

    it('three quick toggles send one request, with the final selection, and read "Updating…" the whole time', async () => {
      useFilterTimers();
      // A filtered answer with cards in it, so the grid is still a grid at the end of this and the
      // pulse's own state can be read off it rather than off an empty state.
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const before = stub.requests.length;

      await panelFor(wrapper, enUS.grid.legendCategory)
        .panel.get('input[type="checkbox"]')
        .setValue(true);
      // Armed from the very first tick — the shopper sees the list is about to move before any
      // of the three changes has actually asked for anything.
      expect(countLine(wrapper).text()).toBe(enUS.grid.updating);
      expect(gridList(wrapper).attributes('aria-busy')).toBe('true');
      expect(gridList(wrapper).classes()).toContain('animate-eldra-pulse-soft');

      await panelFor(wrapper, enUS.grid.legendSize)
        .panel.findAll('input[type="checkbox"]')[0]!
        .setValue(true);
      await panelFor(wrapper, enUS.grid.legendColour)
        .panel.get('input[type="checkbox"]')
        .setValue(true);
      // Still nothing sent: each tick restarted the same window (a trailing debounce).
      expect(stub.requests.length).toBe(before);
      expect(countLine(wrapper).text()).toBe(enUS.grid.updating);

      await settleFilterDebounce(wrapper);

      expect(stub.requests.length).toBe(before + 1);
      const sent = stub.requests.at(-1)!.filters!;
      expect(Object.keys(sent).sort()).toEqual(['category', 'option:colour', 'option:size']);
      expect(countLine(wrapper).text()).toBe('4 products');
      expect(gridList(wrapper).attributes('aria-busy')).toBeUndefined();
      expect(gridList(wrapper).attributes('inert')).toBeUndefined();
      expect(gridList(wrapper).classes()).not.toContain('animate-eldra-pulse-soft');
    });

    /**
     * The three ticks above, read from the sidebar's side: every one of them is operable while the
     * grid is pulsing, which is the whole reason the debounce exists. The assertion is the
     * checkboxes' own state rather than a class, because "the panel stays interactive" is about
     * what a shopper can still change, not about what the aside is styled with.
     */
    it('leaves the filter panel fully interactive while the grid is pulsing', async () => {
      useFilterTimers();
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      const category = panelFor(wrapper, enUS.grid.legendCategory).panel.get(
        'input[type="checkbox"]'
      );
      await category.setValue(true);
      expect(gridList(wrapper).classes()).toContain('animate-eldra-pulse-soft');

      const aside = wrapper.get('aside');
      expect(aside.attributes('inert')).toBeUndefined();
      expect(aside.classes().join(' ')).not.toContain('pointer-events-none');
      expect(aside.classes().join(' ')).not.toContain('animate-eldra-pulse-soft');
      // Still operable, and the second change really lands: unticking the first one puts the
      // checkbox back and leaves the sidebar's selection empty.
      const colour = panelFor(wrapper, enUS.grid.legendColour).panel.get('input[type="checkbox"]');
      expect((colour.element as HTMLInputElement).disabled).toBe(false);
      await category.setValue(false);
      expect((category.element as HTMLInputElement).checked).toBe(false);

      await settleFilterDebounce(wrapper);
      expect(stub.requests.at(-1)?.filters).toBeUndefined();
    });

    /** Sort, Columns, Load more and the drawer's own apply all flush the wait immediately — see
     *  each handler's own comment in `Block.vue`. Sort is the one chosen here because it is the
     *  only one of the four that is also itself a request parameter the flushed read has to
     *  carry alongside the filter. */
    it('a sort change during an armed window sends one immediate request carrying both', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();
      // The grid's own reads, told apart from the drawer's pending count by its `pageSize: 1` —
      // that one asks for no items at all, and it follows the sort too (only the filters and the
      // price are debounced), so counting every request would count it as a second grid read.
      const gridReads = (): number => stub.requests.filter((sent) => sent.pageSize !== 1).length;
      const before = gridReads();

      await panelFor(wrapper, enUS.grid.legendCategory)
        .panel.get('input[type="checkbox"]')
        .setValue(true);
      expect(gridReads()).toBe(before);

      // The first ArrowDown opens the listbox on the current value (Featured); the second moves to
      // Best selling, which Enter commits — the same three presses the Select's own keyboard test
      // above uses, and the reason two are needed rather than one.
      const trigger = comboboxes(wrapper)[0]!;
      trigger.element.focus();
      await trigger.trigger('keydown', { key: 'ArrowDown' });
      await trigger.trigger('keydown', { key: 'ArrowDown' });
      await trigger.trigger('keydown', { key: 'Enter' });

      // No fake timers at all here: the sort change applies — and the armed filter flushes with
      // it — synchronously, with nothing to wait out.
      expect(gridReads()).toBe(before + 1);
      const sent = stub.requests.filter((request) => request.pageSize !== 1).at(-1)!;
      expect(sent.sort).toBe('best-selling');
      expect(sent.filters).toEqual({ category: ['knitwear'] });
    });

    /**
     * **Every input of the read is held, not just `filters`.** A sidebar handler's own
     * `publishState()` resets the page window (`pagesLoaded`) in the same turn it changes the
     * selection, and that window is part of what the read asks for. Holding the filters alone let
     * the reset through on its own: after a Load more press, one tick fired an immediate read for
     * the narrowed window carrying the *old* filters — visibly replacing the cards the shopper had
     * loaded — and the debounced one followed 350 ms later. Two requests for one tick, the first
     * thrown away.
     *
     * Twenty-four products at `pageSize: '12'` is what puts a real Load more on screen; the press
     * doubles the window to 24, and the tick after it has to come back as exactly one request, for
     * the reset window of 12, carrying the new filter.
     */
    it('sends one request for a filter ticked after Load more, carrying the reset page window', async () => {
      useFilterTimers();
      const stub = createStub(TWO_PAGES, { filteredCount: 4 });
      const wrapper = mountGrid({ ...mock, pageSize: '12' }, { source: stub.source });
      await wrapper.vm.$nextTick();
      expect(cards(wrapper)).toHaveLength(12);

      const gridReads = (): Stub['requests'] => stub.requests.filter((sent) => sent.pageSize !== 1);
      await wrapper.get('[data-part="button"]').trigger('click');
      await wrapper.vm.$nextTick();
      expect(cards(wrapper)).toHaveLength(24);
      const before = gridReads().length;

      await panelFor(wrapper, enUS.grid.legendCategory)
        .panel.get('input[type="checkbox"]')
        .setValue(true);
      expect(gridReads().length).toBe(before);

      await settleFilterDebounce(wrapper);

      expect(gridReads().length).toBe(before + 1);
      const sent = gridReads().at(-1)!;
      expect(sent.pageSize).toBe(12);
      expect(sent.filters).toEqual({ category: ['knitwear'] });
      expect(cards(wrapper)).toHaveLength(4);
    });

    /**
     * The same gesture pair the other way round, which is the half the ordering above gets wrong:
     * a **Load more press inside an armed window**. The press widens the page window and resolves
     * the wait in one go, so there is one read for it, carrying both — not one for the old window
     * and a second for the new one in the same tick.
     */
    it('sends one request for a Load more pressed inside an armed window, carrying both', async () => {
      useFilterTimers();
      const stub = createStub(TWO_PAGES, { filteredCount: 4 });
      const wrapper = mountGrid({ ...mock, pageSize: '12' }, { source: stub.source });
      await wrapper.vm.$nextTick();
      expect(cards(wrapper)).toHaveLength(12);

      const gridReads = (): Stub['requests'] => stub.requests.filter((sent) => sent.pageSize !== 1);
      const before = gridReads().length;

      await panelFor(wrapper, enUS.grid.legendCategory)
        .panel.get('input[type="checkbox"]')
        .setValue(true);
      expect(gridReads().length).toBe(before);

      // Pressed well inside the 350ms window — nothing has settled, so the filter is still waiting.
      await wrapper.get('[data-part="button"]').trigger('click');
      await wrapper.vm.$nextTick();

      expect(gridReads().length).toBe(before + 1);
      const sent = gridReads().at(-1)!;
      expect(sent.pageSize).toBe(24);
      expect(sent.filters).toEqual({ category: ['knitwear'] });
      await settleFilterDebounce(wrapper);
      // And the window stays resolved: the expired timer has nothing left to send.
      expect(gridReads().length).toBe(before + 1);
    });

    /**
     * Columns is layout, but the state write behind it resets the page window, which *is* a request
     * input — so a Columns change inside an armed window, after a Load more press that widened that
     * window, is the same two-reads-for-one-gesture shape. One read, for the reset window, carrying
     * the filter that was waiting.
     */
    it('sends one request for a Columns change inside an armed window, carrying both', async () => {
      useFilterTimers();
      const stub = createStub(TWO_PAGES, { filteredCount: 4 });
      const wrapper = mountGrid(
        { ...mock, pageSize: '12' },
        { source: stub.source, attachTo: document.body }
      );
      await wrapper.vm.$nextTick();

      const gridReads = (): Stub['requests'] => stub.requests.filter((sent) => sent.pageSize !== 1);
      await wrapper.get('[data-part="button"]').trigger('click');
      await wrapper.vm.$nextTick();
      expect(cards(wrapper)).toHaveLength(24);

      await panelFor(wrapper, enUS.grid.legendCategory)
        .panel.get('input[type="checkbox"]')
        .setValue(true);
      const before = gridReads().length;

      // The Columns select is the third combobox — two sorts (top bar and toolbar), then this one.
      const columns = comboboxes(wrapper)[2]!;
      columns.element.focus();
      await columns.trigger('keydown', { key: 'ArrowDown' });
      await columns.trigger('keydown', { key: 'ArrowDown' });
      await columns.trigger('keydown', { key: 'Enter' });
      await wrapper.vm.$nextTick();

      expect(gridReads().length).toBe(before + 1);
      const sent = gridReads().at(-1)!;
      expect(sent.pageSize).toBe(12);
      expect(sent.filters).toEqual({ category: ['knitwear'] });
    });

    /**
     * The drawer's live "Show N products" count is its own read off `pendingOptions`, and it gets
     * the same window: ticking two boxes inside the drawer asks the store once, not twice. It is
     * the `pageSize: 1` request in the log — the count read asks for no items at all, which is
     * what separates it from the grid's own.
     */
    it('debounces the drawer’s pending-count read the same way', async () => {
      useFilterTimers();
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();

      await filterButton(wrapper).trigger('click');
      await wrapper.vm.$nextTick();
      const drawer = wrapper.get('dialog');
      const countReads = (): number => stub.requests.filter((sent) => sent.pageSize === 1).length;
      const before = countReads();

      const boxes = drawer.findAll('input[type="checkbox"]');
      expect(boxes.length).toBeGreaterThan(1);
      await boxes[0]!.setValue(true);
      await boxes[1]!.setValue(true);
      // Both ticks are visible in the drawer at once, and neither has asked the store anything.
      expect((boxes[0]!.element as HTMLInputElement).checked).toBe(true);
      expect((boxes[1]!.element as HTMLInputElement).checked).toBe(true);
      expect(countReads()).toBe(before);

      await settleFilterDebounce(wrapper);

      expect(countReads()).toBe(before + 1);
      // And the page itself is untouched until "Show N products" is pressed.
      expect(countLine(wrapper).text()).toBe('12 products');
    });
  });

  describe('the active filters', () => {
    it('lists a removable chip per selected value, named with its group', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendSize);
      await panel.findAll('input[type="checkbox"]')[2]!.setValue(true);

      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(list.text()).toContain('M');
      expect(list.get('[data-part="removeButton"]').attributes('aria-label')).toBe(
        'Remove filter Size: M'
      );
    });

    it('removing a chip moves focus to the next chip', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      await sizes.findAll('input[type="checkbox"]')[0]!.setValue(true);
      await sizes.findAll('input[type="checkbox"]')[1]!.setValue(true);

      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(list.findAll('[data-part="removeButton"]')).toHaveLength(2);

      await list.findAll('[data-part="removeButton"]')[0]!.trigger('click');
      await wrapper.vm.$nextTick();

      const remaining = list.findAll('[data-part="removeButton"]');
      expect(remaining).toHaveLength(1);
      expect(document.activeElement).toBe(remaining[0]!.element);
    });

    /**
     * **Clear all** lives in the sidebar panel's own head now, and the panel moves focus to its
     * own title itself (spec → Behaviour) — a sensible place to land right beside the button that
     * was pressed. The count still gets its own focus contract from the empty state's own **Clear
     * filters** button, a block-drawn control (see `onClearAll`).
     */
    it('Clear all empties the selection and focuses the panel’s own title', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      await sizes.findAll('input[type="checkbox"]')[0]!.setValue(true);

      const clearAll = wrapper
        .findAll('button')
        .find((button) => button.text() === enUS.grid.clearAll)!;
      await clearAll.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.get('aside [data-part="title"]').element);
    });

    /**
     * The slider's own typed fields commit on `Enter`. A range contributes no chip of its own
     * (`@eldrajs/ui`'s own `appliedFilters`: "a span has no one value a chip could take off") —
     * removing it is **Clear all**'s job, or the track's own — so a committed range moves the
     * thumbs and the fields and narrows the grid, with nothing in the applied-chips row.
     */
    it('commits a typed price range to the thumbs and the request, with no chip of its own', async () => {
      useFilterTimers();
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, PRICE_LEGEND);

      const min = panel.get('input[data-input="min"]');
      await min.trigger('focus');
      await min.setValue('50');
      await min.trigger('keydown', { key: 'Enter' });
      const max = panel.get('input[data-input="max"]');
      await max.trigger('focus');
      await max.setValue('150');
      await max.trigger('keydown', { key: 'Enter' });
      await settleFilterDebounce(wrapper);

      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      const sent = stub.requests.filter((request) => request.pageSize !== 1).at(-1)!;
      expect(sent.filters).toEqual({ price: ['50-150'] });
      expect(countLine(wrapper).text()).toBe('4 products');
    });

    /** Both thumbs span the collection's own prices, from the storefront's facets — never 0 and a
     *  round number (spec Layout → Price). */
    it('spans the collection’s own price bounds', async () => {
      const wrapper = mountGrid(mock, { source: createStub().source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, PRICE_LEGEND);
      const thumbs = panel.findAll('[role="slider"]');
      expect(thumbs).toHaveLength(2);
      expect(thumbs[0]!.attributes('aria-valuenow')).toBe('24');
      expect(thumbs[1]!.attributes('aria-valuenow')).toBe('180');
      // Spoken as money, in the store's own currency, with no decimals (spec → Behaviour: "no
      // decimals") — `@eldrajs/ui`'s own formatting, not the theme's `money.format`.
      expect(thumbs[0]!.attributes('aria-valuetext')).toBe('$24');
      // `@eldrajs/ui`'s own `minimumOf(facet.label)` — "Minimum " + the facet's own title.
      expect(thumbs[0]!.attributes('aria-label')).toBe(`Minimum ${PRICE_LEGEND}`);
    });

    /** `priceSlider` off: the two typed fields alone, which is what a store whose prices sit in a
     *  few tight clusters sets (spec Fields). */
    it('falls back to the two fields when the author turns the slider off', async () => {
      const wrapper = mountGrid({
        ...mock,
        priceSlider: false,
        filters: [{ source: 'price', label: 'Price' }],
      });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, PRICE_LEGEND);
      expect(panel.findAll('[role="slider"]')).toHaveLength(0);
      const inputs = panel.findAll('input');
      expect(inputs).toHaveLength(2);

      // The two fields are the store's own money fields, so they commit on blur or `Enter` like the
      // slider's — not per keystroke. No chip of its own either way (a range contributes none).
      await inputs[0]!.setValue('50');
      await wrapper.vm.$nextTick();
      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);

      await inputs[0]!.trigger('blur');
      await wrapper.vm.$nextTick();
      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      expect((inputs[0]!.element as HTMLInputElement).value).toBe('$50');
    });
  });

  describe('the empty state', () => {
    it('keeps the chips, names the active filters and clears them from its own button', async () => {
      useFilterTimers();
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      await panel.get('input[type="checkbox"]').setValue(true);
      await settleFilterDebounce(wrapper);

      expect(cards(wrapper)).toHaveLength(0);
      expect(countLine(wrapper).text()).toBe('0 products');
      const chipList = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(chipList.text()).toContain('Oat');
      expect(chipList.get('[data-part="removeButton"]').attributes('aria-label')).toBe(
        'Remove filter Colour: Oat'
      );
      expect(wrapper.text()).toContain(mock.emptyTitle);
      expect(wrapper.text()).toContain(mock.emptyText);
      expect(wrapper.text()).toContain('Nothing in Oat is in stock right now.');

      const clearFilters = wrapper
        .findAll('button')
        .find((button) => button.text() === enUS.grid.clearFilters)!;
      await clearFilters.trigger('click');
      await wrapper.vm.$nextTick();

      expect(cards(wrapper).length).toBeGreaterThan(0);
      expect(countLine(wrapper).text()).toBe('12 products');
    });
  });

  describe('the grid', () => {
    it('columns: "4" shows 2, then 3 from 48rem and 4 only from 64rem', async () => {
      const wrapper = mountGrid({ ...mock, columns: '4' });
      await wrapper.vm.$nextTick();
      const grid = gridList(wrapper).classes().join(' ');
      expect(grid).toContain('grid-cols-2');
      expect(grid).toContain('@tablet:grid-cols-3');
      expect(grid).toContain('@content:grid-cols-4');
    });

    it('columns: "2" stays at two columns at every width', async () => {
      const wrapper = mountGrid({ ...mock, columns: '2' });
      await wrapper.vm.$nextTick();
      const grid = gridList(wrapper).classes().join(' ');
      expect(grid).toContain('grid-cols-2');
      expect(grid).not.toContain('grid-cols-3');
      expect(grid).not.toContain('grid-cols-4');
    });

    it('the Columns select is present only from 64rem, and only when showColumnSelect is on', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const label = wrapper.findAll('label').find((l) => l.text() === enUS.grid.columns)!;
      const toolbarControls = label.element.closest('div.hidden')!;
      expect(toolbarControls.className).toContain('@content:flex');

      const without = mountGrid({ ...mock, showColumnSelect: false });
      await without.vm.$nextTick();
      expect(without.findAll('label').some((l) => l.text() === enUS.grid.columns)).toBe(false);
    });

    it('a sold-out card shows the outline Sold out badge and the faded image', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const soldOut = cards(wrapper).find((card) => card.text().includes('Linen tea towels'))!;
      expect(soldOut.text()).toContain('Sold out');
      expect(soldOut.get('img').classes()).toContain('opacity-60');
    });

    /**
     * A product's `url` is storefront-derived, not CMS-authored, and used to reach `ProductCard`
     * without passing `safeHref` — the one class of URL in the theme that did. It is sanitised once
     * now, in `toProductCardEntries` (`app/storefront/toProductCard.ts`): the card's link is
     * required, so an item whose URL does not survive `safeHref` is dropped outright rather than
     * rendered with a link to nowhere. A same-site URL still routes; an off-site one stays a plain
     * `<a>`.
     */
    it('drops a product whose url is not a safe href, and only routes same-site ones', async () => {
      const safe = PRODUCTS[0]!;
      // The exact shape the guard exists for: a scheme `safeHref` rejects.
      const unsafe = { ...PRODUCTS[1]!, url: 'javascript:alert(1)' };
      const external = { ...PRODUCTS[2]!, url: 'https://elsewhere.example/p/x' };
      const wrapper = mountGrid(mock, {
        source: createStub([safe, unsafe, external]).source,
      });
      await wrapper.vm.$nextTick();

      const rendered = cards(wrapper);
      expect(rendered).toHaveLength(2);
      expect(wrapper.text()).toContain(safe.title);
      expect(wrapper.text()).not.toContain(unsafe.title);
      expect(wrapper.text()).toContain(external.title);
      expect(wrapper.html()).not.toContain('javascript:');

      const products = wrapper.findAllComponents(ProductCard);
      expect(products[0]!.props('linkAs')).toBe(EldraRouterLink);
      expect(products[1]!.props('linkAs')).toBeUndefined();
    });
  });

  describe('paging', () => {
    it('load-more hides its progress bar from assistive technology and keeps focus on the button', async () => {
      // The demo catalogue: 48 products, 12 per step, so there is still more after the first press.
      const wrapper = mountGrid({ ...mock, pageSize: '12' }, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      expect(cards(wrapper)).toHaveLength(12);

      const loadMore = wrapper.get('[data-part="button"]');
      const bar = wrapper
        .findAll('div[aria-hidden="true"]')
        .find((div) => div.classes().includes('rounded-full'))!;
      expect(bar.attributes('aria-hidden')).toBe('true');

      loadMore.element.focus();
      await loadMore.trigger('click');
      await wrapper.vm.$nextTick();

      expect(cards(wrapper)).toHaveLength(24);
      expect(document.activeElement).toBe(loadMore.element);
      // The button stops being busy once the read answers. It has to clear off `loading`, not
      // `pending`: `pending` never rises for a read over cards the grid already has (the prerender
      // contract), so a latch cleared by it would leave the button spinning for the page's life.
      expect(loadMore.attributes('aria-busy')).toBeUndefined();
    });

    it('pages renders a labelled Pagination of routed page links', async () => {
      const wrapper = mountGrid({ ...mock, paginationStyle: 'pages', pageSize: '12' });
      await wrapper.vm.$nextTick();
      const nav = wrapper.get(`nav[aria-label="${enUS.grid.pagination}"]`);
      const links = nav.findAll('a');
      expect(links.length).toBeGreaterThan(0);
      expect(links.some((link) => link.attributes('href') === '/collections/winter-knitwear')).toBe(
        true
      );
      expect(
        links.some((link) => link.attributes('href') === '/collections/winter-knitwear?page=2')
      ).toBe(true);
      expect(nav.find('[aria-current="page"]').exists()).toBe(true);
      expect(wrapper.find('[data-part="button"]').exists()).toBe(false);
    });
  });

  describe('the filter drawer', () => {
    it('opens from the Filter button with focus on its close button, and Esc returns focus', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      const button = filterButton(wrapper);
      button.element.focus();
      await button.trigger('click');

      const dialog = wrapper.get('dialog');
      expect(dialog.attributes('open')).toBe('');
      expect(document.activeElement).toBe(dialog.get('[data-part="close"]').element);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await wrapper.vm.$nextTick();

      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(button.element);
    });

    it('changes nothing in the results until "Show N products" is pressed', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();
      expect(cards(wrapper)).toHaveLength(12);

      await filterButton(wrapper).trigger('click');
      const dialog = wrapper.get('dialog');
      // The drawer's own copy of the groups, in `filters[]` order: [2] is Colour.
      const drawerColour = dialog.findAll('fieldset')[2]!;
      await drawerColour.get('input[type="checkbox"]').setValue(true);
      await wrapper.vm.$nextTick();

      // Nothing on the page has moved: same cards, same count, and the sidebar's own (applied)
      // panel shows no chip — the drawer's own pending copy shows the tick it is still holding,
      // which is exactly the "changes nothing until applied" contract for the page, not the drawer.
      expect(cards(wrapper)).toHaveLength(12);
      expect(countLine(wrapper).text()).toBe('12 products');
      expect(
        wrapper.get('aside').find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()
      ).toBe(false);
      expect(dialog.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain('Oat');

      const apply = dialog
        .findAll('button')
        .find((candidate) => candidate.text().startsWith('Show '))!;
      await apply.trigger('click');
      await wrapper.vm.$nextTick();

      expect(cards(wrapper)).toHaveLength(0);
      expect(countLine(wrapper).text()).toBe('0 products');
      // Both panels now show the same applied selection (the drawer's own pending copy matches it
      // too, since nothing has changed it since), so the sidebar's own chip row is addressed by
      // name rather than by the (now ambiguous) aria-label alone.
      expect(
        wrapper.get('aside').get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()
      ).toContain('Oat');
      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
    });

    it('Clear all inside the drawer clears only the pending selection', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      await sizes.findAll('input[type="checkbox"]')[2]!.setValue(true);
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain('M');

      await filterButton(wrapper).trigger('click');
      const dialog = wrapper.get('dialog');
      const drawerClear = dialog
        .findAll('button')
        .find((button) => button.text() === enUS.grid.clearAll)!;
      await drawerClear.trigger('click');
      await wrapper.vm.$nextTick();

      // The live chip is untouched until the shopper applies the drawer — only the sidebar's own
      // panel has anything to show once the drawer's own pending copy is cleared.
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain('M');
    });

    /**
     * Regression for the foot sitting `position: static` at the end of the scrolling groups (a
     * shopper had to scroll the whole filter list to reach Clear all / Show N products). The foot
     * now lives in the Drawer's own `footer` part — a sibling of the scrolling `body`, not a
     * descendant of it — so it stays on screen while the groups scroll underneath, and the
     * panel's own copy of it is hidden rather than drawn twice.
     */
    it('pins the foot outside the scrolling body, in the Drawer’s own footer', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();

      await filterButton(wrapper).trigger('click');
      const dialog = wrapper.get('dialog');
      const body = dialog.get('[data-part="body"]');
      const footer = dialog.get('[data-part="footer"]');

      // The foot is not inside the scrolling body…
      expect(body.element.contains(footer.element)).toBe(false);
      // …and the panel's own copy of it is hidden rather than removed outright, so no dead code
      // path is needed to suppress it — just not shown or reachable by Tab.
      const panelFoot = dialog.get('[data-part="foot"]');
      expect(panelFoot.classes()).toContain('hidden');

      // The visible foot is the spec's 2-column grid (`auto | 1fr`) with a top rule and a
      // background fill, supplied by the Drawer's own chrome.
      expect(footer.classes()).toContain('grid');
      expect(footer.classes()).toContain('grid-cols-[auto_1fr]');
      expect(footer.classes()).not.toContain('flex');
      expect(footer.classes()).toContain('border-t');
      expect(footer.classes()).toContain('bg-background');

      const footerButtons = footer.findAll('button');
      expect(footerButtons.map((button) => button.text())).toEqual([
        enUS.grid.clearAll,
        expect.stringMatching(/^Show /),
      ]);
    });
  });

  describe('keyboard', () => {
    /**
     * The panel now owns **Clear all** and the applied chips, both inside the sidebar's own head —
     * before its own group triggers, and so before the Filter button and Sort by that follow the
     * `<aside>` in document order. Cards and Load more still follow the toolbar, unchanged.
     */
    it('puts the panel’s own Clear all and chips before its group triggers, then the toolbar, then the cards', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      // Availability → In stock, not Size → M: the demo source honours `filters` now, and 44 of the
      // 48 demo items are in stock, so this leaves more than one page and keeps a real Load more
      // button in the tab order (Size → M leaves 12, i.e. everything already shown).
      const availability = panelFor(wrapper, enUS.grid.legendAvailability).panel;
      await availability.get('[role="switch"]').trigger('click');
      await flushPromises();

      const focusable = Array.from(
        wrapper.element.querySelectorAll<HTMLElement>('a, button, input, [tabindex]')
      ).filter((el) => el.getAttribute('tabindex') !== '-1' && el.closest('dialog') === null);
      const indexOf = (el: Element) => focusable.indexOf(el as HTMLElement);

      const sortTrigger = comboboxes(wrapper)[0]!.element;
      const chipRemove = wrapper.get('[data-part="removeButton"]').element;
      const clearAll = wrapper
        .findAll('button')
        .find((b) => b.text() === enUS.grid.clearAll)!.element;
      const availabilityBox = availability.get('[role="switch"]').element;
      const firstCardLink = cards(wrapper)[0]!.get('a').element;
      const loadMore = wrapper.get('[data-part="button"]').element;

      expect(indexOf(clearAll)).toBeGreaterThan(-1);
      expect(indexOf(clearAll)).toBeLessThan(indexOf(chipRemove));
      expect(indexOf(chipRemove)).toBeLessThan(indexOf(availabilityBox));
      expect(indexOf(availabilityBox)).toBeLessThan(indexOf(filterButton(wrapper).element));
      expect(indexOf(filterButton(wrapper).element)).toBeLessThan(indexOf(sortTrigger));
      expect(indexOf(sortTrigger)).toBeLessThan(indexOf(firstCardLink));
      expect(indexOf(firstCardLink)).toBeLessThan(indexOf(loadMore));
    });

    it('Space and Enter toggle a group trigger and a checkbox', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { trigger, panel } = panelFor(wrapper, enUS.grid.legendCategory);

      // A native <button> activates on both keys; the click is what the browser dispatches.
      await trigger.trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('false');
      await trigger.trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('true');

      const box = panel.get('input[type="checkbox"]');
      expect((box.element as HTMLInputElement).checked).toBe(false);
      await box.setValue(true);
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(true);
    });

    it('the sort Select opens with ArrowDown, commits with Enter and re-sorts, and Esc closes it', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();
      const trigger = comboboxes(wrapper)[0]!;
      expect(trigger.attributes('aria-expanded')).toBe('false');
      trigger.element.focus();

      await trigger.trigger('keydown', { key: 'ArrowDown' });
      expect(trigger.attributes('aria-expanded')).toBe('true');
      expect(document.querySelector('[role="listbox"]')).toBeTruthy();

      await trigger.trigger('keydown', { key: 'ArrowDown' });
      await trigger.trigger('keydown', { key: 'Enter' });
      expect(trigger.attributes('aria-expanded')).toBe('false');
      expect(trigger.text()).toContain('Best selling');
      expect(stub.requests.at(-1)?.filters).toBeUndefined();
      expect(stub.requests.some((request) => request.pageSize === 24)).toBe(true);

      await trigger.trigger('keydown', { key: 'ArrowDown' });
      expect(trigger.attributes('aria-expanded')).toBe('true');
      await trigger.trigger('keydown', { key: 'Escape' });
      expect(trigger.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger.element);
      expect(trigger.text()).toContain('Best selling');
    });
  });

  describe('the storefront route', () => {
    it('writes every piece of state out through route.setQuery, never a router', async () => {
      const source = createDemoStorefront();
      const patches: Array<Record<string, unknown>> = [];
      const route = {
        ...source.route,
        setQuery(patch: Record<string, string | string[] | null>) {
          patches.push(patch);
        },
      };
      const wrapper = mountGrid(mock, { source: { ...source, route } });
      await wrapper.vm.$nextTick();
      expect(patches).toHaveLength(0);

      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);

      expect(patches).toHaveLength(1);
      expect(patches[0]).toMatchObject({ page: null, sort: 'featured', category: ['knitwear'] });
    });

    /**
     * **The patch is where a colliding option key did its damage**, and it is the only place that can
     * see this: `publishState` writes the option keys *after* the four keys it always writes, so a
     * source whose query key belongs to something else lands last and wins.
     *
     * A store with an option keyed `sort` therefore stripped the shopper's sort out of the URL on
     * every state write — any filter toggle, a column change, removing a chip, Clear all — so a shared
     * link fell back to the default sort and the back button lost it. One keyed `category` cleared the
     * category they had just ticked, which `adoptRouteState` then read back as absent, reverting the
     * tick on screen.
     *
     * Refusing the key where it is *read* (the author's row, the URL, the groups) left all of that
     * intact, and a test asserting the absent group passed straight over it — which is why this one
     * asserts the patch.
     */
    it('never writes an option key that belongs to another filter or to the route', async () => {
      const source = createDemoStorefront();
      const patches: Array<Record<string, unknown>> = [];
      const route = {
        ...source.route,
        setQuery(patch: Record<string, string | string[] | null>) {
          patches.push(patch);
        },
      };
      const catalog: StorefrontCatalog = {
        ...source.catalog,
        collectionProducts(collection, opts) {
          const result = source.catalog.collectionProducts(collection, opts);
          // Two option keys the grid and the page already own — `sort` is the route's, `category` is
          // a filter source's — beside one that is really the store's.
          const data = computed(() => {
            const answer = result.data.value;
            if (answer?.facets === undefined) return answer;
            return {
              ...answer,
              facets: {
                ...answer.facets,
                options: [
                  {
                    key: 'sort',
                    name: 'Sort',
                    kind: 'none',
                    values: [{ value: 'y', label: 'Y', count: 2 }],
                  },
                  {
                    key: 'category',
                    name: 'Kind',
                    kind: 'none',
                    values: [{ value: 'z', label: 'Z', count: 2 }],
                  },
                  ...answer.facets.options,
                ],
              },
            };
          });
          return { ...result, data };
        },
      };
      const wrapper = mountGrid(
        { ...mock, filters: [{ source: 'category', label: 'Category' }, { source: 'options' }] },
        { source: { ...source, route, catalog } }
      );
      await wrapper.vm.$nextTick();
      await flushPromises();

      await panelFor(wrapper, enUS.grid.legendCategory)
        .panel.get('input[type="checkbox"]')
        .setValue(true);

      expect(patches).toHaveLength(1);
      // The shopper's sort survives and the category they ticked reaches the URL — neither key was
      // overwritten by an option of the same name.
      expect(patches[0]).toMatchObject({ sort: 'featured', category: ['knitwear'] });
      // And the price range is still the one string the price control writes, never a selection list.
      expect(patches[0]!.price).toBeNull();
    });

    it('reads the current page back from the route for the pages style', async () => {
      const source = createDemoStorefront();
      source.route.page = 3;
      const wrapper = mountGrid({ ...mock, paginationStyle: 'pages', pageSize: '12' }, { source });
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[aria-current="page"]').text()).toBe('3');
    });

    it('restores filters, sort and columns from a seeded route — a shared URL restores the whole grid state', async () => {
      const source = createDemoStorefront();
      source.route.filters = { category: ['knitwear'], size: ['m'] };
      source.route.sort = 'price-asc';
      source.route.columns = '2';
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();

      const chips = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(chips.text()).toContain('Knitwear');
      expect(chips.text()).toContain('M');

      const [topBarSort, toolbarSort, columnsSelect] = comboboxes(wrapper);
      expect(topBarSort!.text()).toContain('Price low to high');
      expect(toolbarSort!.text()).toContain('Price low to high');
      expect(columnsSelect!.text()).toContain('2');
    });

    it('ignores a seeded route sort that is not one of the block’s own sort options', async () => {
      const source = createDemoStorefront();
      source.route.sort = 'not-a-real-option';
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();
      // Falls back to the first configured option, same as no seed at all.
      expect(comboboxes(wrapper)[1]!.text()).toContain('Featured');
    });
  });

  describe('one sort control per width', () => {
    // Container queries are invisible to jsdom, so this is a class assertion — the same shape the
    // Columns one above uses. Both bands render a sort `Select` (they differ in size, placement and
    // whether the label is visible), and exactly one of the two is ever displayed: the top bar's is
    // hidden from 64rem in *both* variants, and the toolbar's only appears from 64rem.
    it.each(['sidebar', 'drawer-only'])(
      'shows the top bar sort below 64rem and the toolbar sort from 64rem, never both (%s)',
      async (variant) => {
        const wrapper = mountGrid({ ...mock, variant });
        await wrapper.vm.$nextTick();

        const sortLabels = wrapper
          .findAll('label')
          .filter((label) => label.text() === enUS.grid.sortBy);
        expect(sortLabels).toHaveLength(2);
        expect(comboboxes(wrapper)).toHaveLength(3); // two sorts, one Columns

        const topBarSort = sortLabels[0]!.element.closest('[data-part="root"]') as HTMLElement;
        expect(topBarSort.className).toContain('@content:hidden');

        const toolbarSort = sortLabels[1]!.element.closest('div.hidden') as HTMLElement;
        expect(toolbarSort.className).toContain('@content:flex');

        // The Filter button's own bar goes from 64rem only where a sidebar takes over.
        const topBar = filterButton(wrapper).element.parentElement!;
        if (variant === 'sidebar') expect(topBar.className).toContain('@content:hidden');
        else expect(topBar.className).not.toContain('@content:hidden');
      }
    );
  });

  describe('package messages', () => {
    /**
     * The app provides `@eldrajs/ui`'s messages as an object of *getters* over `preview.locale`
     * (`app/plugins/eldra-ui-messages.ts`), which is what makes a Studio locale switch reach the
     * package's own strings. The block re-provides that set with `removeTag` replaced, so it has to
     * read through rather than snapshot — a spread would freeze every package string in the block's
     * subtree at the mount-time locale while the block's own `useT()` strings kept switching.
     */
    it('follows a locale switch for both package strings and the block’s own', async () => {
      useFilterTimers();
      const context = {
        client: {},
        designTokens: { colors: {} },
        preview: createEldraPreviewState(),
      };
      context.preview.locale = 'en-US';
      const messages = {} as UiMessages;
      for (const key of Object.keys(uiEnUS) as Array<keyof UiMessages>) {
        Object.defineProperty(messages, key, {
          enumerable: true,
          get: () => uiMessagesFor(context.preview.locale)[key],
        });
      }

      const base = mountOptions({ entry: { id: 'e1', data: mock } });
      const wrapper = mount(Block, {
        ...base,
        global: {
          ...base.global,
          provide: {
            ...base.global.provide,
            [ELDRA_KEY]: context,
            [MESSAGES_KEY]: messages,
            // The store's currency is not re-provided: it does not follow the locale switch this
            // spec is about — it is the platform's, fixed for the life of the page — so
            // `mountOptions`' own provide (spread above) stands.
            [LOCALE_KEY]: () => context.preview.locale ?? undefined,
          },
        },
      });
      wrappers.push(wrapper);
      await wrapper.vm.$nextTick();

      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      await sizes.findAll('input[type="checkbox"]')[2]!.setValue(true);
      await settleFilterDebounce(wrapper);
      // The demo source answers through its own `async load()`, so the window expiring is only
      // half of it: the read it releases still has to resolve before the line below is the
      // filtered one.
      await flushPromises();

      const removeLabel = () =>
        wrapper.get('[data-part="removeButton"]').attributes('aria-label') ?? '';
      // A package string the block never writes itself: `LoadMore`'s own "Showing N of M" line.
      const loadMoreLine = () => wrapper.get('[data-part="status"]').text();

      // 12 of the demo collection's 48 items are made in size M (the three apparel products, each
      // appearing four times — `app/storefront/demo.ts`), and the demo source honours `filters`
      // now, so both the package's "Showing N of M" line and the block's own count read the
      // *filtered* set. Before that, ticking a filter left these at 24 of 48 / 48 products.
      expect(removeLabel()).toBe('Remove filter Size: M');
      expect(loadMoreLine()).toContain('Showing 12 of 12');
      expect(countLine(wrapper).text()).toBe('12 products');

      context.preview.locale = 'is-IS';
      await wrapper.vm.$nextTick();

      // `mock.json`'s `options` row carries no label of its own, so the facet's title is the
      // theme's own string for that option key, fed into `@eldrajs/ui`'s own is-IS
      // `filterPanelRemoveFilter` message (the remove button is the panel's own now, not the
      // block's) — which is exactly what has to follow the switch. (An author who types a label
      // into an explicit `option:size` row gets that label in both locales, since a string a
      // merchant wrote is not the theme's to translate.)
      expect(removeLabel()).toBe(`Fjarlægja síu ${isIS.grid.legendSize}: M`);
      expect(loadMoreLine()).toContain('Sýni 12 af 12');
      expect(countLine(wrapper).text()).toBe(isIS.grid.nProducts.replace('{count}', '12'));
    });
  });

  /**
   * A store whose stock cannot be read answers **no** `availability` facet rather than two zeroes
   * (`CatalogFacets.availability`). The group it feeds is dropped, because the alternative is
   * offering a shopper two counts nobody can stand behind — and a request carrying an availability
   * filter in that state is an error, not an empty page. Every other group still draws.
   */
  describe('a store whose stock cannot be read', () => {
    const noStock: CatalogFacets = { ...FACETS };
    delete noStock.availability;

    it('drops the availability group and keeps the rest of the panel', async () => {
      const stub = createStub(PRODUCTS, { facets: noStock });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      // The sidebar and the drawer draw the same groups, so each legend appears twice.
      const legends = [
        ...new Set(
          groupTriggers(wrapper).map((trigger) =>
            wrapper
              .get(`#${trigger.attributes('aria-controls')!}`)
              .get('legend')
              .text()
          )
        ),
      ];
      expect(legends).not.toContain(enUS.grid.legendAvailability);
      expect(legends).toEqual([
        enUS.grid.legendCategory,
        enUS.grid.legendSize,
        enUS.grid.legendColour,
        PRICE_LEGEND,
      ]);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  /**
   * **A group whose scope cannot narrow by it is not offered**
   * (`StorefrontCollectionProducts.unfilterable`).
   *
   * Counting a family and filtering on it are different capabilities: the platform reports which
   * other collections a collection's products are also in, but has no parameter for the
   * intersection, so the `collection` group would draw real counts and then change the chips, the
   * URL and nothing else. The storefront says which sources its scope cannot honour and the panel
   * drops those groups — the author's `filters[]` row included, because an author cannot know which
   * scope their grid will be read in. A scope that honours the source keeps it.
   */
  /**
   * **A scope the platform could not span leaves `price` out of its facets**, which is a different
   * answer from a span of 0 to 0: the control then falls back to the widest span this block has seen
   * for the collection (`loadedPriceSpan`). Written as a 0–0 span instead, the track is dead and both
   * fields read `$0.00` — and the fallback is wiped at the same time, because it only runs while the
   * facets have no span of their own.
   */
  describe('facets with no price span', () => {
    const noPrice: CatalogFacets = { ...FACETS };
    delete noPrice.price;

    /**
     * The loaded products' own span, which is what the control falls back to — written the way the
     * fields write it: `CurrencyInput` over the theme's whole-unit price grammar, so no fraction
     * digits — unlike the theme's own `formatMoney`, which keeps the currency's and is what the
     * chips and `<Price>` read.
     */
    const amounts = PRODUCTS.map((item) => item.price.amount);
    const loadedSpan = [`$${Math.min(...amounts)}`, `$${Math.max(...amounts)}`];

    it('spans the loaded products rather than nothing at all', async () => {
      const stub = createStub(PRODUCTS, { facets: noPrice });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      const fields = wrapper
        .findAll('input[data-input]')
        .map((input) => (input.element as HTMLInputElement).value);
      // The sidebar's pair, then the drawer's copy of it. The fields are `CurrencyInput`s over the
      // theme's whole-unit price grammar, so they show the amount with no fraction digits — the
      // chips and `<Price>` keep the currency's own fraction digits.
      expect(fields).toEqual([...loadedSpan, ...loadedSpan]);
      expect(fields).not.toContain('$0');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('a filter source the scope cannot narrow by', () => {
    const WITH_COLLECTION = {
      ...mock,
      filters: [
        { source: 'category', label: 'Category' },
        { source: 'collection', label: 'Collection' },
        { source: 'price', label: 'Price' },
      ],
    };

    const legendsOf = (wrapper: VueWrapper) => [
      ...new Set(
        groupTriggers(wrapper).map((trigger) =>
          wrapper
            .get(`#${trigger.attributes('aria-controls')!}`)
            .get('legend')
            .text()
        )
      ),
    ];

    it('keeps the group in a scope that honours it', async () => {
      useFilterTimers();
      const stub = createStub();
      const wrapper = mountGrid(WITH_COLLECTION, { source: stub.source });
      await wrapper.vm.$nextTick();

      expect(legendsOf(wrapper)).toEqual([
        enUS.grid.legendCategory,
        enUS.grid.legendCollection,
        PRICE_LEGEND,
      ]);
      // And it filters: ticking a value reaches the request, once its own debounce settles.
      const { panel } = panelFor(wrapper, enUS.grid.legendCollection);
      await panel.get('input[type="checkbox"]').setValue(true);
      await settleFilterDebounce(wrapper);
      expect(stub.requests.at(-1)?.filters?.collection).toEqual(['the-winter-edit']);
    });

    it('drops the group, and its chip, in a scope that cannot', async () => {
      const stub = createStub(PRODUCTS, { unfilterable: ['collection'] });
      const wrapper = mountGrid(WITH_COLLECTION, { source: stub.source });
      await wrapper.vm.$nextTick();

      expect(legendsOf(wrapper)).toEqual([enUS.grid.legendCategory, PRICE_LEGEND]);
      expect(wrapper.text()).not.toContain('Collection');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /**
     * A shared link can still carry the key — the source is filterable in another scope, so neither
     * the request nor the query string is rewritten — and the chip is what would otherwise promise
     * a filter this scope ignores.
     */
    it('shows no chip for a value a shared link carries for it', async () => {
      const stub = createStub(PRODUCTS, { filteredCount: 4, unfilterable: ['collection'] });
      const source: StorefrontSource = {
        ...stub.source,
        route: { ...stub.source.route, filters: { collection: ['the-winter-edit'] } },
      };
      const wrapper = mountGrid(WITH_COLLECTION, { source });
      await wrapper.vm.$nextTick();

      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      expect(filterButton(wrapper).find('[data-part="hiddenSuffix"]').exists()).toBe(false);
      // Still sent — this stub answers a filtered request with four of the twelve — because the
      // storefront that declared the source unfilterable is the one already ignoring it, and the
      // key is meaningful in a scope that can honour it.
      expect(cards(wrapper)).toHaveLength(4);
    });
  });

  /**
   * **A "Sort by" option the scope cannot honour is dropped the same way** (`StorefrontCollectionProducts.unsortable`).
   * `mock.json` seeds `best-selling` alongside `featured`/`price-asc`/`price-desc`/`newest`; the
   * platform gateway reads no sales data to order by, so a storefront built on it declares the id
   * rather than leaving a control that moves the selected value and the URL and changes nothing in
   * the grid.
   */
  describe('a sort id the scope cannot honour', () => {
    const optionLabels = () =>
      [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent?.trim());

    it('offers it in a scope that honours it (the demo)', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();
      const trigger = comboboxes(wrapper)[0]!;
      trigger.element.focus();
      await trigger.trigger('keydown', { key: 'ArrowDown' });

      expect(optionLabels()).toEqual([
        'Featured',
        'Best selling',
        'Price low to high',
        'Price high to low',
        'Newest',
      ]);
    });

    it('drops it, and the author’s own row for it, in a scope that cannot', async () => {
      const stub = createStub(PRODUCTS, { unsortable: ['best-selling'] });
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();
      const trigger = comboboxes(wrapper)[0]!;
      trigger.element.focus();
      await trigger.trigger('keydown', { key: 'ArrowDown' });

      expect(optionLabels()).toEqual([
        'Featured',
        'Price low to high',
        'Price high to low',
        'Newest',
      ]);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /** The same fallback a `route.sort` this block never configured already takes — see "ignores a
     *  seeded route sort that is not one of the block's own sort options" above. */
    it('falls back to the first remaining option when a shared URL names it', async () => {
      const stub = createStub(PRODUCTS, { unsortable: ['best-selling'] });
      const source: StorefrontSource = {
        ...stub.source,
        route: { ...stub.source.route, sort: 'best-selling' },
      };
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();

      expect(comboboxes(wrapper)[1]!.text()).toContain('Featured');
      expect(stub.requests.some((request) => request.sort === 'best-selling')).toBe(false);
    });

    /**
     * The end of that same fallback: an author whose only configured row is an id this scope
     * declares unsortable leaves nothing to fall back *to*. The control is hidden either way, so
     * the only thing left to get right is the request — it must stop carrying the id the same
     * answer just said cannot be honoured, exactly as the configured-list settling does for an id
     * this block never configured at all.
     */
    it('sends no sort at all when the scope can honour none of the configured options', async () => {
      const stub = createStub(PRODUCTS, { unsortable: ['best-selling'] });
      const wrapper = mountGrid(
        { ...mock, sortOptions: [{ option: 'best-selling', label: 'Best selling' }] },
        { source: stub.source }
      );
      await wrapper.vm.$nextTick();
      await flushPromises();

      // No Sort control is drawn — only the Columns select is left.
      expect(comboboxes(wrapper)).toHaveLength(1);
      // The scope's answer really did reach the request: the read was re-issued *because* the id
      // was dropped, and the re-issued one carries no sort at all. `requests` records changes, not
      // the first value, so an id left in place would leave it empty rather than wrong — which is
      // why the length is asserted beside the value.
      expect(stub.requests.length).toBeGreaterThan(0);
      expect(stub.requests.at(-1)!.sort).toBeUndefined();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  /**
   * **`options`** — one `filters[]` row standing for every variant option the store has, labelled and
   * ordered by the store itself. It exists because a merchant's option keys are theirs, not the
   * theme's: an author cannot list `option:size`/`option:colour` by hand without knowing what the
   * store sells by, and a store that adds `fabric` next season would otherwise need the page edited
   * before shoppers could filter by it.
   */
  describe('the `options` filter source', () => {
    /** Three option keys, one of them not in this theme's own strings and one with nothing in it. */
    const THREE_OPTIONS: CatalogFacets = {
      ...FACETS,
      options: [
        {
          key: 'size',
          name: 'size',
          kind: 'none',
          values: [{ value: 'm', label: 'M', count: 4 }],
        },
        {
          key: 'fabric',
          name: 'Fabric',
          kind: 'custom',
          metadata: 'fabric',
          values: [
            { value: 'linen', label: 'Linen', count: 7 },
            { value: 'wool', label: 'Wool', count: 2 },
          ],
        },
        {
          key: 'colour',
          name: 'colour',
          values: [{ value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' }],
        },
        // A key the store names but has no values for — nothing to offer, so no group.
        { key: 'finish', name: 'Finish', values: [] },
      ],
    };

    const WITH_OPTIONS = {
      ...mock,
      filters: [{ source: 'category', label: 'Category' }, { source: 'options' }],
    };

    /** The group titles in the sidebar, in order. */
    function sidebarLabels(wrapper: VueWrapper): string[] {
      return wrapper
        .get('aside')
        .findAll('h3 button')
        .map((button) => button.find('span').text());
    }

    it('draws one group per option key the facets answer, in their order', async () => {
      const stub = createStub(PRODUCTS, { facets: THREE_OPTIONS });
      const wrapper = mountGrid(WITH_OPTIONS, { source: stub.source });
      await wrapper.vm.$nextTick();
      // Size and Colour by this theme's own strings (the two keys it has words for), `Fabric` by the
      // store's own facet name — the only place a merchant's option name exists.
      expect(sidebarLabels(wrapper)).toEqual([
        'Category',
        enUS.grid.legendSize,
        'Fabric',
        enUS.grid.legendColour,
      ]);
    });

    it('draws no group for an option key with no values', async () => {
      const stub = createStub(PRODUCTS, { facets: THREE_OPTIONS });
      const wrapper = mountGrid(WITH_OPTIONS, { source: stub.source });
      await wrapper.vm.$nextTick();
      expect(sidebarLabels(wrapper)).not.toContain('Finish');
    });

    /** Swatches are a colour the store sent as data, and the dot is the only control that can show
     *  one — so an option carrying them is a colour group whatever it is keyed. */
    it('draws a swatch option as colour dots and the rest as pills', async () => {
      const stub = createStub(PRODUCTS, { facets: THREE_OPTIONS });
      const wrapper = mountGrid(WITH_OPTIONS, { source: stub.source });
      await wrapper.vm.$nextTick();
      const colour = panelFor(wrapper, enUS.grid.legendColour).panel;
      expect(colour.find('[data-part="swatch"]').exists()).toBe(true);
      const fabric = panelFor(wrapper, 'Fabric').panel;
      expect(fabric.find('[data-part="swatch"]').exists()).toBe(false);
      expect(fabric.findAll('input[type="checkbox"]')).toHaveLength(2);
    });

    /**
     * An explicit row **wins** for its key: that is how an author pins one option's position in the
     * panel or renames its group, while `options` still covers everything else the store sells by.
     */
    it('lets an explicit option row override the label and the position', async () => {
      const stub = createStub(PRODUCTS, { facets: THREE_OPTIONS });
      const wrapper = mountGrid(
        {
          ...mock,
          filters: [
            { source: 'option:fabric', label: 'Material' },
            { source: 'category', label: 'Category' },
            { source: 'options' },
          ],
        },
        { source: stub.source }
      );
      await wrapper.vm.$nextTick();
      expect(sidebarLabels(wrapper)).toEqual([
        'Material',
        'Category',
        enUS.grid.legendSize,
        enUS.grid.legendColour,
      ]);
    });

    /** `?colour=oat&size=m` — the same bare-key URL the explicit sources always wrote, both ways. */
    it('round-trips every option key through the query string', async () => {
      const source = createDemoStorefront({ filters: { colour: ['oat'], size: ['m'] } });
      const wrapper = mountGrid(WITH_OPTIONS, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();
      await wrapper.vm.$nextTick();

      const ticked = (legend: string) =>
        panelFor(wrapper, legend)
          .panel.findAll('input[type="checkbox"]')
          .filter((box) => (box.element as HTMLInputElement).checked).length;
      expect(ticked(enUS.grid.legendColour)).toBe(1);
      expect(ticked(enUS.grid.legendSize)).toBe(1);

      // And back out: untick the size and the key is cleared, the colour left alone.
      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      const checked = sizes
        .findAll('input[type="checkbox"]')
        .find((box) => (box.element as HTMLInputElement).checked)!;
      await checked.setValue(false);
      await wrapper.vm.$nextTick();
      expect(source.route.filters.size).toBeUndefined();
      expect(source.route.filters.colour).toEqual(['oat']);
    });

    /**
     * **An option key that would take a query key something else already owns is refused**, with a
     * dev warning naming it. The grid's own filters own `?category=`, `?collection=`, `?price=` and
     * `?availability=`; the storefront route owns `?q=`, `?page=`, `?token=`, `?sort=` and
     * `?columns=` before a block sees them at all (`app/plugins/eldra-storefront.ts`).
     *
     * Both collisions are silent and ugly. A key shadowing a filter source reads the *same* query key
     * as that source, so one `?category=ceramics` would go out as a `categoryId` **and** an
     * `option=category:ceramics`, AND-ed, emptying the grid — and ticking a category would then write
     * that key twice in one patch, un-applying the filter on the next read. A key shadowing a route
     * field (`sort` above all) is never readable from the URL at all, while every state write would
     * clear the shopper's sort out of it.
     *
     * Namespacing the key was the alternative and was not taken: the query key is a shareable,
     * shopper-visible part of the URL, and inventing `?opt_category=` for one store means a link no
     * other spelling of this theme reads. One group fewer, every other filter exactly right.
     */
    it('refuses an option key that collides with a reserved query key', async () => {
      const stub = createStub(PRODUCTS, {
        facets: {
          ...FACETS,
          options: [
            {
              key: 'category',
              name: 'Category',
              kind: 'none',
              values: [{ value: 'x', label: 'X', count: 2 }],
            },
            {
              key: 'sort',
              name: 'Sort',
              kind: 'none',
              values: [{ value: 'y', label: 'Y', count: 2 }],
            },
            {
              key: 'fabric',
              name: 'Fabric',
              kind: 'none',
              values: [{ value: 'linen', label: 'Linen', count: 7 }],
            },
          ],
        },
      });
      const wrapper = mountGrid(WITH_OPTIONS, { source: stub.source });
      await wrapper.vm.$nextTick();
      // `Fabric` is offered; the two colliding keys are not — and `Category` on screen is the grid's
      // own category group, not the store's option of the same name.
      expect(sidebarLabels(wrapper)).toEqual(['Category', 'Fabric']);
      expect(panelFor(wrapper, enUS.grid.legendCategory).panel.findAll('label').length).toBe(
        FACETS.categories.length
      );
    });

    /**
     * An **explicit** `option:<key>` row is refused by the same rule, wherever the author put it —
     * and the store really does have that option here, so the row is dropped by the guard rather than
     * by the ordinary "a group with no values is not a group" rule.
     */
    it('refuses a colliding key an author named explicitly', async () => {
      const stub = createStub(PRODUCTS, {
        facets: {
          ...FACETS,
          options: [
            ...FACETS.options,
            {
              key: 'sort',
              name: 'Sort',
              kind: 'none',
              values: [{ value: 'y', label: 'Y', count: 2 }],
            },
          ],
        },
      });
      const wrapper = mountGrid(
        {
          ...mock,
          filters: [
            { source: 'option:sort', label: 'Sort by fabric' },
            { source: 'category', label: 'Category' },
          ],
        },
        { source: stub.source }
      );
      await wrapper.vm.$nextTick();
      expect(sidebarLabels(wrapper)).toEqual(['Category']);
    });

    /**
     * A query key that is not a filter at all — a campaign tag, an analytics parameter — must not
     * become `option:ref`, draw a chip and go out in the request: a filter nobody set, promised to
     * the shopper in their own URL. Only a key the store actually has an option for is read.
     */
    it('ignores a query key the store has no option for', async () => {
      const source = createDemoStorefront({ filters: { ref: ['newsletter'] } });
      const wrapper = mountGrid(WITH_OPTIONS, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
    });
  });

  /**
   * **The catalogue scope** (`scope: "catalogue"`) — the `/products` page. The same block, reading
   * `catalog.products` instead of `catalog.collectionProducts`: no collection to bind, no
   * "pick a collection" hint, paging links at `/products`, and the Collection group offered because
   * that scope really can narrow by one.
   */
  describe('the catalogue scope', () => {
    const CATALOGUE = {
      ...mock,
      scope: 'catalogue',
      paginationStyle: 'pages',
      pageSize: '12',
      filters: [
        { source: 'category', label: 'Category' },
        { source: 'collection', label: 'Collection' },
      ],
    };

    it('lists the catalogue with no collection bound, axe-clean', async () => {
      const wrapper = mountGrid(CATALOGUE);
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(cards(wrapper).length).toBeGreaterThan(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /** The landmark names the plain noun rather than a collection it is not showing. */
    it('names its section Products rather than a collection', async () => {
      const wrapper = mountGrid(CATALOGUE);
      await wrapper.vm.$nextTick();
      expect(wrapper.get('section[aria-label]').attributes('aria-label')).toBe(enUS.grid.products);
    });

    /** Nothing to bind, so nothing to hint about — the editor hint is for a *collection* grid whose
     *  collection the author has not picked. */
    it('shows no "pick a collection" hint in the editor', async () => {
      const wrapper = mountGrid(CATALOGUE, { editing: true });
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).not.toContain(enUS.grid.noCollectionLabel);
    });

    it('pages at /products rather than at a collection path', async () => {
      const wrapper = mountGrid(CATALOGUE);
      await wrapper.vm.$nextTick();
      await flushPromises();
      const hrefs = wrapper
        .get('nav[aria-label]')
        .findAll('a')
        .map((anchor) => anchor.attributes('href'));
      expect(hrefs).toContain('/products?page=2');
      expect(hrefs.every((href) => href === undefined || !href.startsWith('/collections'))).toBe(
        true
      );
    });

    /**
     * The Collection group is the one that differs between the two scopes: a collection's own product
     * list cannot intersect two collections and declares the source `unfilterable`, while the
     * catalogue-wide list takes a `collectionId` — so here the group is drawn and the filter applies.
     */
    it('offers the Collection group, which really narrows the catalogue', async () => {
      useFilterTimers();
      const source = createDemoStorefront();
      const wrapper = mountGrid(CATALOGUE, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const { panel } = panelFor(wrapper, enUS.grid.legendCollection);
      const before = Number(/^\d+/.exec(countLine(wrapper).text())?.[0] ?? '0');
      await panel.findAll('input[type="checkbox"]').at(-1)!.setValue(true);
      await settleFilterDebounce(wrapper);
      await flushPromises();
      const after = Number(/^\d+/.exec(countLine(wrapper).text())?.[0] ?? '0');
      expect(before).toBeGreaterThan(0);
      expect(after).toBeGreaterThan(0);
      expect(after).toBeLessThan(before);
    });
  });

  describe('a selected value the facets stop listing', () => {
    /**
     * Facets are normally computed over the current result set, so ticking one value can remove
     * another from the response. The chips are derived from the selection, never from the facets,
     * so an applied filter is always visible and always removable — otherwise it would keep
     * narrowing every request with no control left to undo it (and with results still non-empty
     * there is no empty-state "Clear filters" button to fall back on either).
     */
    const withoutColour: CatalogFacets = {
      ...FACETS,
      options: FACETS.options.filter((option) => option.key !== 'colour'),
    };

    it('still renders its chip, and the chip removes it', async () => {
      useFilterTimers();
      const stub = createStub(PRODUCTS, { filteredCount: 4, filteredFacets: withoutColour });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      await panel.get('input[type="checkbox"]').setValue(true);
      await settleFilterDebounce(wrapper);

      // Results are non-empty, so there is no empty state to escape through.
      expect(cards(wrapper)).toHaveLength(4);
      expect(countLine(wrapper).text()).toBe('4 products');

      // The facets no longer describe the value, so it is labelled by its raw value — and it is
      // still a chip, still in the group, and still counted on the Filter button.
      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(list.text()).toContain('oat');
      expect(filterButton(wrapper).get('[data-part="hiddenSuffix"]').text()).toBe('1 active');
      expect(
        panelFor(wrapper, enUS.grid.legendColour).panel.findAll('input[type="checkbox"]')
      ).toHaveLength(1);

      await list.get('[data-part="removeButton"]').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      expect(countLine(wrapper).text()).toBe('12 products');
      expect(stub.requests.at(-1)?.filters).toBeUndefined();
    });

    it('Clear all clears it too', async () => {
      useFilterTimers();
      const stub = createStub(PRODUCTS, { filteredCount: 4, filteredFacets: withoutColour });
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();

      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      await panel.get('input[type="checkbox"]').setValue(true);
      await settleFilterDebounce(wrapper);
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain('oat');

      const clearAll = wrapper
        .findAll('button')
        .find((button) => button.text() === enUS.grid.clearAll)!;
      await clearAll.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      expect(countLine(wrapper).text()).toBe('12 products');
      // Clear all moves focus to the panel's own title (see "focuses the panel's own title" above).
      expect(document.activeElement).toBe(wrapper.get('aside [data-part="title"]').element);
    });
  });

  /**
   * Which collection the grid shows (spec `Starter blocks`): the `collection`
   * `reference` field an author picks in Studio — which stores the collection's
   * **id** — then the collection template's own route segment. The picked
   * collection overrides the route; its resolved `slug` is used when the value
   * carries one, and its bare id otherwise (a page builder draft overlay, a
   * depth-0 read, or an archived collection, all of which read as the bare
   * stub). The `collectionHandle` string field the block shipped with is retired
   * as of version 3 (Core keeps its content as `collectionHandle__v2`) and is
   * not read here even when an entry still carries it.
   */
  describe('the collection source', () => {
    const WINTER = demoCollectionId('winter-knitwear')!;

    /** The collection the grid actually asked the storefront for. */
    function requestedFor(data: Record<string, unknown>, routeHandle: string | null = null) {
      const asked: Array<StorefrontCollectionSelector | null> = [];
      const base = createDemoStorefront();
      base.route.collectionHandle = routeHandle;
      const source: StorefrontSource = {
        ...base,
        catalog: {
          ...base.catalog,
          collectionProducts(collection, opts) {
            asked.push(collection.value);
            return base.catalog.collectionProducts(collection, opts);
          },
        },
      };
      mountGrid(data, { source });
      return asked;
    }

    it('uses the reference’s resolved slug', () => {
      expect(
        requestedFor({
          ...mock,
          collection: { id: WINTER, _type: 'collection', slug: 'best-sellers' },
        })
      ).toContainEqual({ slug: 'best-sellers' });
    });

    it('asks by id for a stub reference', () => {
      expect(
        requestedFor({ ...mock, collection: { id: WINTER, _type: 'collection' } })
      ).toContainEqual({ id: WINTER });
    });

    it('reads a seed reference, which names the collection by slug and carries no id', () => {
      // What `pages/collection.page.json` ships and Core writes when it cannot
      // resolve the slug against the organisation's catalog.
      expect(
        requestedFor({ ...mock, collection: { _type: 'collection', slug: 'best-sellers' } })
      ).toContainEqual({ slug: 'best-sellers' });
    });

    it('falls back to the route when no collection is picked', () => {
      expect(requestedFor({ ...mock, collection: null }, 'the-winter-edit')).toContainEqual({
        slug: 'the-winter-edit',
      });
    });

    it('ignores a retired collectionHandle an entry still carries', () => {
      // The handle field is gone: a value left behind by the old schema must not
      // stand in for a collection nobody can see in Studio any more, and must
      // not shadow the route the template resolved.
      const asked = requestedFor({ ...mock, collectionHandle: 'best-sellers' }, 'the-winter-edit');
      expect(asked).not.toContainEqual({ slug: 'best-sellers' });
      expect(asked).toContainEqual({ slug: 'the-winter-edit' });
    });

    it('lets the picked collection override the route', () => {
      const asked = requestedFor(
        { ...mock, collection: { id: WINTER, _type: 'collection' } },
        'the-winter-edit'
      );
      expect(asked).toContainEqual({ id: WINTER });
      expect(asked).not.toContainEqual({ slug: 'the-winter-edit' });
    });

    it('still renders a collection the storefront can only find by id', async () => {
      const wrapper = mountGrid({ ...mock, collection: { id: WINTER, _type: 'collection' } });
      await flushPromises();
      expect(cards(wrapper).length).toBeGreaterThan(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('the editor', () => {
    /** An id no storefront can resolve: a freshly picked collection before the
     *  page is published, or one that has since been archived. */
    const UNRESOLVABLE = { id: '00000000-0000-4000-8000-000000000000', _type: 'collection' };

    it('shows the publish hint when only an unresolvable collection id is known', async () => {
      const source = createDemoStorefront();
      source.route.collectionHandle = null;
      const wrapper = mountGrid({ ...mock, collection: UNRESOLVABLE }, { source, editing: true });
      await flushPromises();
      expect(wrapper.text()).toContain(enUS.storefront.unresolvedCollectionLabel);
      expect(wrapper.text()).toContain(enUS.storefront.unresolvedCollectionHelp);
      expect(wrapper.text()).not.toContain(enUS.grid.noCollectionLabel);
      expect(wrapper.find('ul').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('never shows that hint to a live visitor — the block renders its own empty grid instead', async () => {
      const source = createDemoStorefront();
      source.route.collectionHandle = null;
      const wrapper = mountGrid({ ...mock, collection: UNRESOLVABLE }, { source });
      await flushPromises();
      expect(wrapper.text()).not.toContain(enUS.storefront.unresolvedCollectionLabel);
      expect(cards(wrapper)).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('shows the "Choose a collection" hint when no collection is bound', async () => {
      const source = createDemoStorefront();
      source.route.collectionHandle = null;
      const base = mountOptions({ entry: { id: 'e1', data: mock } });
      const wrapper = mount(Block, {
        ...base,
        global: {
          ...base.global,
          provide: {
            ...base.global.provide,
            [STOREFRONT_KEY]: source,
            [ELDRA_KEY]: editingContext(),
          },
        },
      });
      wrappers.push(wrapper);
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain(enUS.grid.noCollectionLabel);
      expect(wrapper.text()).toContain(enUS.grid.noCollectionHelp);
      expect(wrapper.find('ul').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  /**
   * The prerendered page's live refresh (`app/storefront/types.ts`, `app/storefront/refresh.ts`):
   * the HTML shipped with real prices and stock lines, and a few hundred milliseconds after mount
   * the storefront swaps in the backend's current ones. The grid never redraws for it — every card
   * keeps its value, dims it and carries a spinner — and the whole grid says so once rather than
   * letting 24 cards hold 48 live regions between them.
   */
  describe('the volatile refresh', () => {
    it('keeps every card, marks its price and stock line busy, and draws no skeleton', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const shown = cards(wrapper).length;
      expect(shown).toBeGreaterThan(0);

      stub.revalidating.value = new Set(['price', 'stock']);
      await wrapper.vm.$nextTick();

      expect(cards(wrapper)).toHaveLength(shown);
      expect(wrapper.find('ul[aria-hidden="true"]').exists()).toBe(false);
      expect(wrapper.text()).toContain(PRODUCTS[0]!.title);

      const busy = wrapper.findAll('[data-part="root"][aria-busy="true"]');
      expect(busy.length).toBeGreaterThanOrEqual(shown);
      expect(wrapper.findAll('[data-part="spinner"]').length).toBeGreaterThanOrEqual(shown);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('announces once for the whole grid, after mount, and never per card', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      // Mounted and empty first: a live region that arrives already holding its message is
      // announced unreliably, which is exactly what a prerendered page would produce if the block
      // read `revalidating` straight through instead of flipping it after mount.
      expect(liveRegion(wrapper).text()).toBe('');

      stub.revalidating.value = new Set(['price']);
      await wrapper.vm.$nextTick();

      expect(liveRegion(wrapper).text()).toBe(enUS.storefront.updatingValues);
      expect(wrapper.findAll('p.sr-only[role="status"]')).toHaveLength(1);
      // `announce: false` on every card — the per-value regions are gone, not merely empty.
      expect(wrapper.findAll('[data-part="srStatus"]')).toHaveLength(0);
      expect(
        wrapper.findAllComponents(ProductCard).every((card) => card.props('announce') === false)
      ).toBe(true);

      stub.revalidating.value = new Set();
      await wrapper.vm.$nextTick();
      expect(liveRegion(wrapper).text()).toBe('');
    });

    it('keeps the cards when the read fails over results the visitor can already see', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const shown = cards(wrapper).length;

      stub.error.value = 'gateway exploded';
      await wrapper.vm.$nextTick();

      expect(cards(wrapper)).toHaveLength(shown);
      expect(wrapper.text()).not.toContain(enUS.storefront.error);
    });
  });

  /**
   * The block over the *real* gateway storefront, not a stub of it.
   *
   * `/collections/the-winter-edit?sort=featured&columns=3&price=50-150` still showed the
   * $48 "Speckled stoneware bowl": the block read the range off the URL and sent it correctly, and
   * `createGatewayStorefront` dropped every facet before its list read, so the grid answered with the
   * unfiltered collection under a URL, chips and an active-filter row that all said otherwise. This
   * is that URL, end to end — the block's own seeding, the `minPrice`/`maxPrice` parameters the
   * gateway now sends, the platform's own `total` and its `facets` — with only the HTTP call faked.
   *
   * The store sells in krónur, which have no minor unit, so the parameters this asserts read as the
   * same numbers the shopper typed; `test/storefront/gateway.spec.ts` is where the conversion itself
   * is pinned.
   */
  describe('over the gateway storefront, with a price range in the URL', () => {
    const CATALOGUE: Array<{ slug: string; title: string; price: number }> = [
      { slug: 'speckled-stoneware-bowl', title: 'Speckled stoneware bowl', price: 48 },
      { slug: 'linen-waffle-throw', title: 'Linen waffle throw', price: 50 },
      { slug: 'merino-crew-sweater', title: 'Merino crew sweater', price: 96 },
      { slug: 'cashmere-wrap', title: 'Cashmere wrap', price: 150 },
      { slug: 'shearling-slippers', title: 'Shearling slippers', price: 151 },
    ];

    /** The gateway's own filtering: the `minPrice`/`maxPrice` parameters, inclusive both ends. */
    function gatewayRows(query: Record<string, unknown>) {
      const min = query.minPrice as number | undefined;
      const max = query.maxPrice as number | undefined;
      return CATALOGUE.filter(
        (row) => (min === undefined || row.price >= min) && (max === undefined || row.price <= max)
      );
    }

    function gatewaySource(filters: Record<string, string[]>): StorefrontSource {
      const client = {
        catalog: {
          listCollectionProducts: async (_slug: string, query: Record<string, unknown>) => {
            const page = (query.page as number | undefined) ?? 1;
            const pageSize = (query.pageSize as number | undefined) ?? 24;
            const matching = gatewayRows(query);
            const start = (page - 1) * pageSize;
            const rows = matching.slice(start, start + pageSize).map((row) => ({
              id: `${row.slug}::default`,
              slug: row.slug,
              title: row.title,
              status: 'ACTIVE',
              minPrice: row.price,
              maxPrice: row.price,
              totalVariants: 1,
            }));
            return {
              data: rows,
              // The platform's own span, counted with every filter *except* price applied — which
              // is why the track still spans the whole collection under a range.
              facets: {
                price: { min: 48, max: 151 },
                categories: [],
                collections: [],
                availability: { in_stock: CATALOGUE.length, out_of_stock: 0 },
                options: [],
              },
              meta: {
                page,
                pageSize,
                total: matching.length,
                totalPages: 1,
                rows: rows.length,
                hasNext: false,
                hasPrev: false,
              },
            };
          },
        },
      } as unknown as EldraClient;
      return createGatewayStorefront(client, {
        commerce: { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 },
        route: {
          productHandle: null,
          collectionHandle: 'the-winter-edit',
          orderToken: null,
          query: null,
          page: 1,
          sort: 'featured',
          columns: '3',
          filters,
          setQuery: () => {},
        },
      });
    }

    it('drops the $48 card and counts only what the range keeps', async () => {
      const wrapper = mountGrid(mock, {
        source: gatewaySource({ price: ['50-150'] }),
      });
      await flushPromises();
      await wrapper.vm.$nextTick();

      const titles = cards(wrapper).map((card) => card.get('a').text());
      expect(titles).toEqual(['Linen waffle throw', 'Merino crew sweater', 'Cashmere wrap']);
      expect(wrapper.text()).not.toContain('Speckled stoneware bowl');
      expect(countLine(wrapper).text()).toBe('3 products');
      expect(wrapper.get('[data-part="status"]').text()).toContain('Showing 3 of 3');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('shows the whole collection again once the range is gone', async () => {
      const wrapper = mountGrid(mock, { source: gatewaySource({}) });
      await flushPromises();
      await wrapper.vm.$nextTick();

      expect(cards(wrapper)).toHaveLength(CATALOGUE.length);
      expect(countLine(wrapper).text()).toBe('5 products');
    });
  });

  /**
   * **The query string a filtered view is linkable by** (contract §4):
   * `?price=1200-4800&category=ceramics&collection=the-winter-edit&colour=oat&availability=in_stock`.
   *
   * One key per group, written through the one writer a block may call (`route.setQuery`) — no
   * router, no Nuxt global in `blocks/**` — and read back out of `route.filters` on the next page
   * load. The prerendered page is always the unfiltered one, so this is the whole of how a
   * filtered view survives being shared.
   */
  describe('the query string a filtered view is linkable by', () => {
    const FILTERED = {
      ...mock,
      filters: [
        { source: 'category', label: 'Category' },
        { source: 'collection', label: 'Collection' },
        { source: 'option:colour', label: 'Colour' },
        { source: 'price', label: 'Price' },
        { source: 'availability', label: 'Availability' },
      ],
    };

    /**
     * The demo route writes a `setQuery` patch straight back into `route.filters`, which is what
     * a real page does by way of the URL. Availability is a `toggle` facet now — a real
     * `<button role="switch">`, not a checkbox — so its own row is clicked rather than ticked; its
     * decorative hidden `<input type="checkbox">` is never the interactive element.
     */
    function tick(wrapper: VueWrapper, legend: string, index = 0) {
      const { panel } = panelFor(wrapper, legend);
      const switches = panel.findAll('[role="switch"]');
      if (switches.length > 0) return switches[index]!.trigger('click');
      return panel.findAll('input[type="checkbox"]')[index]!.setValue(true);
    }

    it('writes one key per group and the price as a single range', async () => {
      const source = createDemoStorefront();
      const wrapper = mountGrid(FILTERED, { source });
      await wrapper.vm.$nextTick();

      // The price first: the facets' span narrows with every other filter applied (it is counted
      // with every filter but price), so a floor typed after them would be clamped into whatever
      // the remaining products cost.
      const min = panelFor(wrapper, PRICE_LEGEND).panel.get('input[data-input="min"]');
      await min.trigger('focus');
      await min.setValue('50');
      await min.trigger('keydown', { key: 'Enter' });
      await wrapper.vm.$nextTick();
      await tick(wrapper, enUS.grid.legendCategory);
      await tick(wrapper, enUS.grid.legendCollection);
      await tick(wrapper, enUS.grid.legendColour);
      await tick(wrapper, enUS.grid.legendAvailability);
      await wrapper.vm.$nextTick();

      expect(source.route.filters).toEqual({
        category: ['knitwear'],
        collection: ['the-winter-edit'],
        colour: ['oat'],
        availability: ['in_stock'],
        price: ['50-'],
      });
    });

    it('clears a key the shopper empties rather than leaving it in the URL', async () => {
      const source = createDemoStorefront();
      const wrapper = mountGrid(FILTERED, { source });
      await wrapper.vm.$nextTick();

      await tick(wrapper, enUS.grid.legendCategory);
      expect(source.route.filters.category).toEqual(['knitwear']);

      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      await list.get('[data-part="removeButton"]').trigger('click');
      await wrapper.vm.$nextTick();

      expect(source.route.filters.category).toBeUndefined();
      expect(source.route.filters).toEqual({});
    });

    /**
     * **A shared `?category=<parent>` link**, end to end, on a source answering public contract
     * 3.8.0's shape: the URL seeds the selection, the parent row is ticked, its children are drawn
     * implied, the request carries the parent and the grid shows the products of its children — which
     * is the whole promise of offering a parent row at all. The demo storefront is that source: it
     * places and rolls up its own category facet *and* expands a ticked parent the way the platform's
     * `categoryId` does (`app/storefront/facets.ts`'s `categoryTermsOf` and `matchesClause`). The
     * pre-3.8.0 shape, where the panel offers no parent row at all, is below.
     */
    it('restores a parent category from the URL and shows its children’s products', async () => {
      const source = createDemoStorefront({ filters: { category: ['home'] } });
      const wrapper = mountGrid(FILTERED, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();
      await wrapper.vm.$nextTick();

      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      const boxes = panel.findAll('input[type="checkbox"]');
      const labelOf = (index: number) => panel.findAll('label')[index]!.text().replace(/\s+/g, ' ');

      // `Home` ticked, and the two categories under it ticked-and-inoperable: the request names the
      // parent, so a child is not a filter the shopper can remove from there.
      const home = boxes.findIndex((_, index) => labelOf(index).startsWith('Home'));
      expect(home).toBeGreaterThanOrEqual(0);
      expect((boxes[home]!.element as HTMLInputElement).checked).toBe(true);
      const implied = panel.findAll('[role="group"] input[type="checkbox"]');
      expect(implied.length).toBeGreaterThan(0);
      for (const box of implied) {
        expect((box.element as HTMLInputElement).checked).toBe(true);
        expect(box.attributes('disabled')).toBeDefined();
      }

      // And the grid is really filtered: the count is the children's products, not the whole
      // collection, which is what a parent row nothing could expand would have shown.
      const unfiltered = mountGrid(FILTERED, { source: createDemoStorefront() });
      await unfiltered.vm.$nextTick();
      await flushPromises();
      const totalOf = (view: VueWrapper) => Number(/^\d+/.exec(countLine(view).text())?.[0] ?? '0');
      expect(totalOf(wrapper)).toBeGreaterThan(0);
      expect(totalOf(wrapper)).toBeLessThan(totalOf(unfiltered));
      expect(cards(wrapper).length).toBeGreaterThan(0);

      // Untick the parent and the URL loses the key altogether — the round trip in both directions.
      await boxes[home]!.setValue(false);
      await wrapper.vm.$nextTick();
      expect(source.route.filters.category).toBeUndefined();
    });

    /**
     * **The same link against a pre-3.8.0 gateway**, where the family is flat — `categoryCounts` is
     * absent, so the facets count assigned categories only and a `categoryId` matches direct
     * membership only.
     *
     * The panel must then offer **no parent row at all**: not indented, not rolled up, nothing
     * implied. A `Tableware` row there is a filter that gateway cannot honour, so ticking it would
     * empty the grid under a chip claiming otherwise — the one defect this whole server-side filter
     * path exists to remove. What the shopper gets instead is the flat family the grid always had,
     * plus a chip for whatever the URL carried, which stays removable.
     */
    it('offers no parent row at all against a source that counts assignments', async () => {
      const stub = createStub(PRODUCTS, {
        filteredCount: 4,
        facets: {
          ...FACETS,
          // Placed terms, but **no** `categoryCounts` — the shape a 3.7.0 gateway answers once the
          // theme has a tree from anywhere. The placement alone must not buy a parent row.
          categories: [
            { id: 'cat-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'cat-tableware' },
            {
              id: 'cat-tableware',
              slug: 'tableware',
              title: 'Tableware',
              count: 0,
              parentId: null,
            },
          ],
        },
      });
      const wrapper = mountGrid(FILTERED, { source: stub.source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      // No nested group, no indent, no implied child — and both values are ordinary checkboxes.
      expect(panel.findAll('[role="group"]')).toHaveLength(0);
      expect(panel.findAll('label').map((label) => label.text().replace(/\s+/g, ' '))).toEqual([
        'Cup6',
        'Tableware0',
      ]);
      expect(
        panel
          .findAll('input[type="checkbox"]')
          .every((box) => !(box.element as HTMLInputElement).checked)
      ).toBe(true);
    });

    /**
     * A link shared before the platform's `in_stock` vocabulary landed. The pass still reads the
     * old spelling, so the grid filters — but the block has to fold it into the current one, or
     * the switch reads off (an untranslated, unmatched value) and the chip quotes the raw word.
     * There is no separate "out of stock" control to offer any more (spec → Variants, `toggle`
     * facet: one switch, never a checkbox pair) — "In stock only" is the whole family now.
     */
    it('folds a legacy availability spelling into the vocabulary the panel offers', async () => {
      const source = createDemoStorefront({ filters: { availability: ['in-stock'] } });
      const wrapper = mountGrid(FILTERED, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const toggle = panelFor(wrapper, enUS.grid.legendAvailability).panel.get('[role="switch"]');
      expect(toggle.attributes('aria-checked')).toBe('true');
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain(
        enUS.grid.availabilityInStock
      );
      expect(wrapper.text()).not.toContain('in-stock');
      // And the request carries the current spelling, so the next write leaves a current URL.
      expect(source.route.filters.availability).toEqual(['in-stock']);
      await toggle.trigger('click');
      await wrapper.vm.$nextTick();
      expect(source.route.filters.availability).toBeUndefined();
    });

    /** The other half of the round trip: the same bag, on a fresh page load, restores the whole
     *  panel — the ticked values, the thumbs and the chips — and filters the first request. */
    it('restores the panel and the request from that query on the next load', async () => {
      const source = createDemoStorefront({
        filters: {
          category: ['knitwear'],
          collection: ['the-winter-edit'],
          colour: ['oat'],
          availability: ['in_stock'],
          price: ['50-150'],
        },
      });
      const wrapper = mountGrid(FILTERED, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const checked = (legend: string) =>
        panelFor(wrapper, legend)
          .panel.findAll('input[type="checkbox"]')
          .filter((box) => (box.element as HTMLInputElement).checked).length;
      expect(checked(enUS.grid.legendCategory)).toBe(1);
      expect(checked(enUS.grid.legendCollection)).toBe(1);
      expect(checked(enUS.grid.legendColour)).toBe(1);
      expect(checked(enUS.grid.legendAvailability)).toBe(1);

      const thumbs = panelFor(wrapper, PRICE_LEGEND).panel.findAll('[role="slider"]');
      expect(thumbs[0]!.attributes('aria-valuenow')).toBe('50');
      expect(thumbs[1]!.attributes('aria-valuenow')).toBe('150');

      // The visible chip text is just the value's own label; the facet name rides in its remove
      // button's aria-label instead (see the dedicated "names each remove button" coverage in
      // `@eldrajs/ui`). A range contributes no chip of its own — the thumbs above are what show
      // the applied price.
      const chips = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text();
      expect(chips).toContain('Knitwear');
      expect(chips).toContain('The winter edit');
      expect(chips).toContain('Oat');
      expect(chips).not.toContain('$50');

      // And the grid itself is filtered — the demo source applies the same pass the gateway does.
      expect(countLine(wrapper).text()).toBe('4 products');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  /**
   * **A price range the shopper applied survives the next nudge of either thumb** — over the real
   * demo storefront, because the bug this pins only exists in the composition.
   *
   * The facets' price span is counted with every filter *except* price (contract §1), so ticking a
   * colour narrows it; the track is then widened back to hold the shopper's own bounds, or their
   * range would read back as the one price the remaining products cost. On
   * `?price=50-150&colour=oat` the track's extent therefore *is* 50–150, both thumbs sit on "an
   * end", and deriving both bounds from the pair read the untouched one as "no bound": one
   * ArrowRight on the minimum wrote `51-` and the ceiling was gone from the URL, the chip and the
   * request while the track still ended at 150.
   */
  describe('an applied price range, with another group narrowing the facets', () => {
    function applied() {
      return createDemoStorefront({ filters: { price: ['50-150'], colour: ['oat'] } });
    }

    function priceThumbs(wrapper: VueWrapper) {
      return panelFor(wrapper, PRICE_LEGEND).panel.findAll('[role="slider"]');
    }

    it('renders the thumbs at the applied values, not at the catalogue’s own ends', async () => {
      const source = applied();
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const thumbs = priceThumbs(wrapper);
      expect(thumbs[0]!.attributes('aria-valuenow')).toBe('50');
      expect(thumbs[1]!.attributes('aria-valuenow')).toBe('150');
      // A range contributes no chip of its own — the thumbs above are what show the applied price.
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).not.toContain('$');
    });

    it('keeps the ceiling when the minimum is nudged', async () => {
      const source = applied();
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const min = priceThumbs(wrapper)[0]!;
      await min.trigger('keydown', { key: 'ArrowRight' });
      await min.trigger('keyup', { key: 'ArrowRight' });
      await wrapper.vm.$nextTick();

      expect(source.route.filters.price).toEqual(['51-150']);
    });

    it('keeps the floor when the maximum is nudged', async () => {
      const source = applied();
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const max = priceThumbs(wrapper)[1]!;
      await max.trigger('keydown', { key: 'ArrowLeft' });
      await max.trigger('keyup', { key: 'ArrowLeft' });
      await wrapper.vm.$nextTick();

      expect(source.route.filters.price).toEqual(['50-149']);
    });

    /** And the bound can still be dropped on purpose: a thumb the shopper takes all the way out is
     *  "no bound", which is the gesture the rule above must not swallow. */
    it('still drops a bound dragged out to the catalogue’s own end', async () => {
      const source = createDemoStorefront({ filters: { price: ['50-150'] } });
      const wrapper = mountGrid(mock, { source });
      await wrapper.vm.$nextTick();
      await flushPromises();

      const min = priceThumbs(wrapper)[0]!;
      await min.trigger('keydown', { key: 'Home' });
      await min.trigger('keyup', { key: 'Home' });
      await wrapper.vm.$nextTick();

      expect(source.route.filters.price).toEqual(['-150']);
    });
  });

  /**
   * The other direction of the URL round-trip: a query the block did not write.
   *
   * Back/Forward, a shared link to the same collection with a different range, and — the one that
   * made the deployed site's filters inert — arriving on a **prerendered** page, where Nuxt hydrates
   * under the payload's query-less path and only restores the real URL once the app has mounted. A
   * block that seeds its filter state once and never looks again shows the unfiltered collection
   * forever, under chips and a URL that say otherwise.
   */
  describe('a query change the block did not make', () => {
    it('adopts it: the request, the count and the price inputs all follow', async () => {
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      expect(countLine(wrapper).text()).toBe('12 products');
      expect(stub.requests.at(-1)?.filters).toBeUndefined();

      stub.source.route.filters = { price: ['50-150'] };
      await wrapper.vm.$nextTick();
      await flushPromises();

      expect(stub.requests.at(-1)?.filters).toEqual({ price: ['50-150'] });
      expect(countLine(wrapper).text()).toBe('4 products');
      // The sidebar's slider fields are the applied state and read the range as money; the
      // drawer's are its pending copy, seeded from the applied state only when it opens, so until
      // then they read the catalogue's own span — which is what "no bound" looks like.
      const priceInputs = wrapper
        .findAll('input[data-input]')
        .map((input) => (input.element as HTMLInputElement).value);
      expect(priceInputs).toEqual(['$50', '$150', '$24', '$180']);
      // A range contributes no chip of its own — the fields above are what show the applied price.
      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
    });

    it('follows a sort and a column count out of the URL too', async () => {
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      stub.source.route.sort = 'price-desc';
      stub.source.route.columns = '4';
      await wrapper.vm.$nextTick();
      await flushPromises();

      expect(stub.requests.at(-1)?.sort).toBe('price-desc');
      expect(gridList(wrapper).classes().join(' ')).toContain('4');
    });

    /** The block's own writes go out through `setQuery`, come back as a route change, and stop. */
    it('does not re-request when the change is the block’s own round-trip', async () => {
      useFilterTimers();
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      const before = stub.requests.length;
      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);
      // The tick's own write comes back as a route change *before* the debounced read goes out, so
      // this is also where `adoptRouteState` gets the chance to flush the window it did not arm —
      // which would send the request early and, worse, a second one once the window expired.
      await settleFilterDebounce(wrapper);
      await flushPromises();
      await wrapper.vm.$nextTick();
      await flushPromises();

      // Exactly one: the shopper's tick. Reading the URL back must not mint a second request for the
      // state the block just wrote — an unguarded re-seed does, on every filter the shopper touches.
      expect(stub.requests.length).toBe(before + 1);
      expect(stub.requests.at(-1)?.filters).toEqual({ category: ['knitwear'] });
    });
  });
});

describe('collection-grid — card width on a phone', () => {
  it('lets the grid track, not the card, decide a card width (two columns fit a phone)', async () => {
    const wrapper = mountGrid(mock);
    await wrapper.vm.$nextTick();
    // The card's own root is the list item's first element; `cards()` answers the items.
    const root = cards(wrapper)[0]!.element.firstElementChild as HTMLElement;
    expect(root.className).toContain('min-w-0');
    expect(root.className).not.toMatch(/\bmin-w-56\b/);
    wrapper.unmount();
  });
});
