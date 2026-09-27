// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { computed, ref, watch, type Ref } from 'vue';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY, type UiMessages } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import Block from '../Block.vue';
import mock from '../mock.json';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import { createDemoStorefront, PRODUCTS } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontCatalog,
  StorefrontFacet,
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontSource,
} from '../../../app/storefront/types';
import { enUS } from '../../../app/i18n/en-US';
import { isIS } from '../../../app/i18n/is-IS';
import { currencyFor, uiEnUS, uiMessagesFor } from '../../../app/i18n/uiMessages';

/** The block draws three Tabler icons (the Filter button's and the empty state's `adjustments`, the
 *  mobile sort trigger's `arrows-sort`, the editor hint's `box`) through `useEldraIcon`, which
 *  outside Nuxt needs an injected fetcher — the pattern `blocks/newsletter`'s spec uses. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

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
  /** Flipped by a test to hold the block in its "while filtering" state. */
  pending: Ref<boolean>;
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
  const requests: Stub['requests'] = [];
  const filteredCount = options.filteredCount ?? 0;
  const catalog: StorefrontCatalog = {
    ...base.catalog,
    collectionProducts(handle, opts) {
      watch(opts, (value) => requests.push({ ...value }), { deep: true });
      const data = computed(() => {
        if (handle.value === null || handle.value === '') return null;
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
        error: ref(null),
        refresh: async () => {},
      } as unknown as StorefrontResult<{
        items: StorefrontProductListItem[];
        total: number;
        facets: StorefrontFacet[];
      }>;
    },
  };
  return { source: { ...base, catalog }, pending, requests };
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
  options: { source?: StorefrontSource; attachTo?: Element } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const wrapper = mount(Block, {
    ...base,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [ICON_FETCHER_KEY]: stubFetcher,
        ...(options.source ? { [STOREFRONT_KEY]: options.source } : {}),
      },
    },
    ...(options.attachTo ? { attachTo: options.attachTo } : {}),
  });
  wrappers.push(wrapper);
  return wrapper;
}

/** The result count — the block's polite status line. */
const countLine = (wrapper: VueWrapper) => wrapper.get('p[role="status"][tabindex="-1"]');
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
      const empty = mountGrid({ ...mock, collectionHandle: '' }, { source });
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

    it('reads "Updating…" while filtering, over the same number of skeleton cards', async () => {
      const stub = createStub();
      const wrapper = mountGrid(mock, { source: stub.source });
      await wrapper.vm.$nextTick();
      const shown = cards(wrapper).length;

      stub.pending.value = true;
      await wrapper.vm.$nextTick();

      expect(countLine(wrapper).text()).toBe(enUS.grid.updating);
      const skeletons = wrapper.get('ul[aria-hidden="true"]');
      expect(skeletons.findAll(':scope > li')).toHaveLength(shown);
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
      const sizes = panelFor(wrapper, enUS.grid.legendSize).panel;
      await sizes.findAll('input[type="checkbox"]')[2]!.setValue(true);

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
            [ICON_FETCHER_KEY]: stubFetcher,
            [ELDRA_KEY]: context,
            [MESSAGES_KEY]: messages,
            [LOCALE_KEY]: () => context.preview.locale ?? undefined,
            [CURRENCY_KEY]: () => currencyFor(context.preview.locale),
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

      expect(removeLabel()).toBe('Remove filter Size: M');
      expect(loadMoreLine()).toContain('Showing 24 of 48');
      expect(countLine(wrapper).text()).toBe('48 products');

      context.preview.locale = 'is-IS';
      await wrapper.vm.$nextTick();

      expect(removeLabel()).toBe('Fjarlægja síuna Size: M');
      expect(loadMoreLine()).toContain('Sýni 24 af 48');
      expect(countLine(wrapper).text()).toBe(isIS.grid.nProducts.replace('{count}', '48'));
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

  describe('the editor', () => {
    it('shows the "Choose a collection" hint when no collection is bound', async () => {
      const source = createDemoStorefront();
      source.route.collectionHandle = null;
      const base = mountOptions({ entry: { id: 'e1', data: { ...mock, collectionHandle: '' } } });
      const wrapper = mount(Block, {
        ...base,
        global: {
          ...base.global,
          provide: {
            ...base.global.provide,
            [ICON_FETCHER_KEY]: stubFetcher,
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
});
