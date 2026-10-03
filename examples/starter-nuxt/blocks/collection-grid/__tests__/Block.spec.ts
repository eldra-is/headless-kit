// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { computed, ref, watch, type Ref } from 'vue';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { LOCALE_KEY, MESSAGES_KEY, ProductCard, type UiMessages } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import Block from '../Block.vue';
import mock from '../mock.json';
import { createDemoStorefront, demoCollectionId, PRODUCTS } from '../../../app/storefront/demo';
import { createGatewayStorefront } from '../../../app/storefront/gateway';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontCatalog,
  StorefrontCollectionSelector,
  StorefrontFacet,
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

const FACETS: StorefrontFacet[] = [
  {
    source: 'category',
    label: 'Category',
    values: [
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'ceramics', label: 'Ceramics', count: 14 },
      { value: 'kitchen', label: 'Kitchen', count: 16 },
      { value: 'discontinued', label: 'Discontinued', count: 0 },
    ],
  },
  {
    source: 'size',
    label: 'Size',
    values: [
      { value: 'xs', label: 'XS', count: 6 },
      { value: 's', label: 'S', count: 10 },
      { value: 'm', label: 'M', count: 14 },
    ],
  },
  {
    source: 'colour',
    label: 'Colour',
    values: [
      { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
      { value: 'charcoal', label: 'Charcoal', count: 8, swatch: '#3a3a3a' },
    ],
  },
  {
    source: 'availability',
    label: 'Availability',
    values: [
      { value: 'in-stock', label: 'In stock', count: 41 },
      { value: 'backorder', label: 'Include back-order', count: 7 },
    ],
  },
];

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
  requests: Array<{ pageSize: number; filters?: Record<string, string[]> }>;
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
    filteredFacets?: StorefrontFacet[];
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
          facets: filtered ? (options.filteredFacets ?? FACETS) : FACETS,
        };
      });
      return {
        data,
        pending,
        loading,
        revalidating,
        error,
        refresh: async () => {},
      } as unknown as StorefrontResult<{
        items: StorefrontProductListItem[];
        total: number;
        facets: StorefrontFacet[];
      }>;
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
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);
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

    it('renders one group per filters[] entry, each a fieldset with a hidden legend', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      // Sidebar and drawer render the same five groups, so ten triggers in the DOM.
      expect(groupTriggers(wrapper)).toHaveLength(mock.filters.length * 2);
      for (const legend of [
        enUS.grid.legendCategory,
        enUS.grid.legendSize,
        enUS.grid.legendColour,
        enUS.grid.legendPrice,
        enUS.grid.legendAvailability,
      ]) {
        const { trigger, panel } = panelFor(wrapper, legend);
        expect(trigger.attributes('aria-expanded')).toBe('true');
        expect(panel.element.tagName).toBe('FIELDSET');
        expect(panel.get('legend').classes()).toContain('sr-only');
      }
    });

    it('gives the sidebar and the drawer a heading before their filter-group triggers, so headings never skip a level', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();

      const headings = wrapper.findAll('h2').filter((el) => el.text() === enUS.grid.filters);
      // One in the sidebar `<aside>`, one in the drawer.
      expect(headings).toHaveLength(2);

      const triggers = groupTriggers(wrapper);
      for (const [heading, trigger] of [
        [headings[0]!, triggers[0]!],
        [headings[1]!, triggers[mock.filters.length]!], // the drawer's own first trigger
      ] as const) {
        const relation = heading.element.compareDocumentPosition(trigger.element);
        expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    it('hides a filter value the store counts zero of', async () => {
      const wrapper = mountGrid(mock, { source: createStub().source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      expect(panel.text()).toContain('Knitwear (18)');
      expect(panel.text()).not.toContain('Discontinued');
    });

    it('drawer-only renders no sidebar at any width', async () => {
      const wrapper = mountGrid({ ...mock, variant: 'drawer-only' });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('aside').exists()).toBe(false);
      expect(wrapper.find('dialog').exists()).toBe(true);
    });
  });

  describe('the filter controls', () => {
    it('a checked colour carries the ring class and a bold, underlined name', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      const row = panel.get('label');
      const input = row.get('input[type="checkbox"]');
      const dot = row.get('span');

      expect(dot.classes()).toContain('border-transparent');
      await input.setValue(true);

      expect(dot.classes()).toContain('border-text');
      const name = row.findAll('span').at(-1)!;
      expect(name.classes()).toContain('font-semibold');
      expect(name.classes()).toContain('underline');
    });

    it('a checked size pill carries the fill class and weight 600', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendSize);
      const pill = panel.get('label');
      const box = pill.get('[data-part="box"]');
      const label = pill.get('[data-part="label"]');

      expect(box.classes()).not.toContain('bg-primary');
      await pill.get('input[type="checkbox"]').setValue(true);

      expect(box.classes()).toContain('bg-primary');
      expect(label.classes()).toContain('text-primary-contrast');
      expect(label.classes()).toContain('font-semibold');
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
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      expect(countLine(wrapper).text()).toBe('12 products');

      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);

      expect(countLine(wrapper).text()).toBe('0 products');
      expect(countLine(wrapper).attributes('tabindex')).toBe('-1');
    });

    /**
     * The prerender contract (`app/storefront/types.ts`): a grid the visitor can already see never
     * goes back to skeletons. Filtering, sorting and paging all read over results that are on
     * screen, so those results stay on screen — dimmed, each card's price and stock line carrying
     * its own spinner — and the grid is marked busy while the count says so.
     */
    it('keeps the cards, dimmed and busy, while a filter loads over results already on screen', async () => {
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
      expect(
        wrapper.findAllComponents(ProductCard).every((card) => card.props('revalidating') === true)
      ).toBe(true);
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

  describe('the active filters', () => {
    it('lists a removable chip per selected value, named with its group', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendSize);
      await panel.findAll('input[type="checkbox"]')[2]!.setValue(true);

      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(list.text()).toContain('Size: M');
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

    it('Clear all empties the selection and focuses the count', async () => {
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
      expect(document.activeElement).toBe(countLine(wrapper).element);
    });

    it('the price range is one removable chip reading both bounds', async () => {
      const wrapper = mountGrid(mock);
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendPrice);
      const inputs = panel.findAll('input');
      await inputs[0]!.setValue('0');
      await inputs[1]!.setValue('180');

      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(list.text()).toContain('Price: $0 to $180');
    });
  });

  describe('the empty state', () => {
    it('keeps the chips, names the active filters and clears them from its own button', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      await panel.get('input[type="checkbox"]').setValue(true);

      expect(cards(wrapper)).toHaveLength(0);
      expect(countLine(wrapper).text()).toBe('0 products');
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain(
        'Colour: Oat'
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

      // Nothing on the page has moved: same cards, same count, no chips.
      expect(cards(wrapper)).toHaveLength(12);
      expect(countLine(wrapper).text()).toBe('12 products');
      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);

      const apply = dialog
        .findAll('button')
        .find((candidate) => candidate.text().startsWith('Show '))!;
      await apply.trigger('click');
      await wrapper.vm.$nextTick();

      expect(cards(wrapper)).toHaveLength(0);
      expect(countLine(wrapper).text()).toBe('0 products');
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain(
        'Colour: Oat'
      );
      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
    });

    it('Clear all inside the drawer clears only the pending selection', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      await sizes.findAll('input[type="checkbox"]')[2]!.setValue(true);
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain(
        'Size: M'
      );

      await filterButton(wrapper).trigger('click');
      const dialog = wrapper.get('dialog');
      const drawerClear = dialog
        .findAll('button')
        .find((button) => button.text() === enUS.grid.clearAll)!;
      await drawerClear.trigger('click');
      await wrapper.vm.$nextTick();

      // The live chip is untouched until the shopper applies the drawer.
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain(
        'Size: M'
      );
    });
  });

  describe('keyboard', () => {
    it('follows the spec tab order: filters, sort, chips, Clear all, cards, Load more', async () => {
      const wrapper = mountGrid(mock, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      // Availability → In stock, not Size → M: the demo source honours `filters` now, and 44 of the
      // 48 demo items are in stock, so this leaves more than one page and keeps a real Load more
      // button in the tab order (Size → M leaves 12, i.e. everything already shown).
      const availability = panelFor(wrapper, enUS.grid.legendAvailability).panel;
      await availability.findAll('input[type="checkbox"]')[0]!.setValue(true);
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
      const firstCardLink = cards(wrapper)[0]!.get('a').element;
      const loadMore = wrapper.get('[data-part="button"]').element;

      expect(indexOf(filterButton(wrapper).element)).toBeGreaterThan(-1);
      expect(indexOf(filterButton(wrapper).element)).toBeLessThan(indexOf(sortTrigger));
      expect(indexOf(sortTrigger)).toBeLessThan(indexOf(chipRemove));
      expect(indexOf(chipRemove)).toBeLessThan(indexOf(clearAll));
      expect(indexOf(clearAll)).toBeLessThan(indexOf(firstCardLink));
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
      expect(chips.text()).toContain('Category: Knitwear');
      expect(chips.text()).toContain('Size: M');

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

      expect(removeLabel()).toBe('Fjarlægja síuna Size: M');
      expect(loadMoreLine()).toContain('Sýni 12 af 12');
      expect(countLine(wrapper).text()).toBe(isIS.grid.nProducts.replace('{count}', '12'));
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
    const withoutColour = FACETS.filter((facet) => facet.source !== 'colour');

    it('still renders its chip, and the chip removes it', async () => {
      const stub = createStub(PRODUCTS, { filteredCount: 4, filteredFacets: withoutColour });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      await panel.get('input[type="checkbox"]').setValue(true);

      // Results are non-empty, so there is no empty state to escape through.
      expect(cards(wrapper)).toHaveLength(4);
      expect(countLine(wrapper).text()).toBe('4 products');

      // The facets no longer describe the value, so it is labelled by its raw value — and it is
      // still a chip, still in the group, and still counted on the Filter button.
      const list = wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`);
      expect(list.text()).toContain('Colour: oat');
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
      const stub = createStub(PRODUCTS, { filteredCount: 4, filteredFacets: withoutColour });
      const wrapper = mountGrid(mock, { source: stub.source, attachTo: document.body });
      await wrapper.vm.$nextTick();

      const { panel } = panelFor(wrapper, enUS.grid.legendColour);
      await panel.get('input[type="checkbox"]').setValue(true);
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain(
        'Colour: oat'
      );

      const clearAll = wrapper
        .findAll('button')
        .find((button) => button.text() === enUS.grid.clearAll)!;
      await clearAll.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find(`ul[aria-label="${enUS.grid.activeFilters}"]`).exists()).toBe(false);
      expect(countLine(wrapper).text()).toBe('12 products');
      expect(document.activeElement).toBe(countLine(wrapper).element);
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
   * `/collections/the-winter-edit?sort=featured&columns=3&minPrice=50&maxPrice=150` still showed the
   * $48 "Speckled stoneware bowl": the block read the range off the URL and sent it correctly, and
   * `createGatewayStorefront` dropped every facet before its list read, so the grid answered with the
   * unfiltered collection under a URL, chips and an active-filter row that all said otherwise. This
   * is that URL, end to end — the block's own seeding, the gateway's request, the facet pass, the
   * count line — with only the HTTP call faked.
   */
  describe('over the gateway storefront, with a price range in the URL', () => {
    const CATALOGUE: Array<{ slug: string; title: string; price: number }> = [
      { slug: 'speckled-stoneware-bowl', title: 'Speckled stoneware bowl', price: 48 },
      { slug: 'linen-waffle-throw', title: 'Linen waffle throw', price: 50 },
      { slug: 'merino-crew-sweater', title: 'Merino crew sweater', price: 96 },
      { slug: 'cashmere-wrap', title: 'Cashmere wrap', price: 150 },
      { slug: 'shearling-slippers', title: 'Shearling slippers', price: 151 },
    ];

    function gatewaySource(filters: Record<string, string[]>): StorefrontSource {
      const client = {
        catalog: {
          listCollectionProducts: async (_slug: string, query: Record<string, unknown>) => {
            const page = (query.page as number | undefined) ?? 1;
            const pageSize = (query.pageSize as number | undefined) ?? 24;
            const start = (page - 1) * pageSize;
            const rows = CATALOGUE.slice(start, start + pageSize).map((row) => ({
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
              meta: {
                page,
                pageSize,
                total: CATALOGUE.length,
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
        source: gatewaySource({ minPrice: ['50'], maxPrice: ['150'] }),
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

      stub.source.route.filters = { minPrice: ['50'], maxPrice: ['150'] };
      await wrapper.vm.$nextTick();
      await flushPromises();

      expect(stub.requests.at(-1)?.filters).toEqual({ price: ['50-150'] });
      expect(countLine(wrapper).text()).toBe('4 products');
      // The sidebar's inputs are the applied state and show the range; the drawer's are its pending
      // copy, which is seeded from the applied state when it opens, so they stay empty until then.
      const priceInputs = wrapper
        .findAll('input[inputmode="numeric"]')
        .map((input) => (input.element as HTMLInputElement).value);
      expect(priceInputs).toEqual(['50', '150', '', '']);
      expect(wrapper.get(`ul[aria-label="${enUS.grid.activeFilters}"]`).text()).toContain('$50');
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
      const stub = createStub(PRODUCTS, { filteredCount: 4 });
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();

      const before = stub.requests.length;
      const { panel } = panelFor(wrapper, enUS.grid.legendCategory);
      await panel.get('input[type="checkbox"]').setValue(true);
      await wrapper.vm.$nextTick();
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
