import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { enUS } from '../../../messages/en-US';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import SearchBar from '../SearchBar.vue';
import type { SearchResults } from '../types';

/** The spec's own example response for the query "mer". */
const RESULTS: SearchResults = {
  products: [
    { id: 'p1', title: 'Merino crew sweater', href: '/p/merino-crew', price: '$96.00' },
    { id: 'p2', title: 'Merino rib beanie', href: '/p/merino-beanie', price: '$38.00' },
    { id: 'p3', title: 'Chunky merino cardigan', href: '/p/merino-cardigan', price: '$148.00' },
    { id: 'p4', title: 'Merino throw', href: '/p/merino-throw', price: '$120.00' },
    { id: 'p5', title: 'Merino socks', href: '/p/merino-socks', price: '$18.00' },
  ],
  collections: [
    { id: 'c1', title: 'Knitwear', href: '/collections/knitwear' },
    { id: 'c2', title: 'Merino', href: '/collections/merino' },
    { id: 'c3', title: 'Winter', href: '/collections/winter' },
    { id: 'c4', title: 'Gifts', href: '/collections/gifts' },
  ],
  articles: [
    { id: 'a1', title: 'Caring for merino: a short guide', href: '/journal/merino-care' },
    { id: 'a2', title: 'Meet the makers', href: '/journal/makers' },
  ],
  pages: [
    { id: 'g1', title: 'Care guides', href: '/pages/care' },
    { id: 'g2', title: 'Shipping', href: '/pages/shipping' },
  ],
  total: 12,
};

const EMPTY: SearchResults = {
  products: [],
  collections: [],
  articles: [],
  pages: [],
  total: 0,
};

const RECENT = ['merino scarf', 'espresso cups'];
const POPULAR = ['Gifts under $50', 'Merino', 'Stoneware mugs', 'Linen'];

const mounted: VueWrapper[] = [];

function mount(props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const wrapper = mountWith(SearchBar, { props, ...options });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
  try {
    localStorage.clear();
  } catch {
    /* a storage stub may refuse; nothing to clear then */
  }
});

const field = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-part="field"]').element as HTMLInputElement;
const panel = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-part="panel"]');
const rows = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[role="option"]');
const headings = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[data-part="sectionHeading"]').map((node) => node.text());

/** floating-ui settles on a promise of its own; the panel's own effects want a tick too. */
async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Focus the field the way a user does, which is what opens the panel. */
async function focusField(wrapper: ReturnType<typeof mount>): Promise<void> {
  field(wrapper).focus();
  await wrapper.find('[data-part="field"]').trigger('focus');
  await flush();
}

async function type(wrapper: ReturnType<typeof mount>, value: string): Promise<void> {
  const input = wrapper.find('[data-part="field"]');
  (input.element as HTMLInputElement).value = value;
  await input.trigger('input');
  await flush();
}

const key = (wrapper: ReturnType<typeof mount>, options: Record<string, unknown>) =>
  wrapper.find('[data-part="field"]').trigger('keydown', options);

describe('SearchBar', () => {
  describe('the form and the field', () => {
    it('is a search landmark posting q to the action with GET', () => {
      const wrapper = mount({ action: '/search' });
      const form = wrapper.find('[data-part="form"]');
      expect(form.element.tagName).toBe('FORM');
      expect(form.attributes('role')).toBe('search');
      expect(form.attributes('method')).toBe('get');
      expect(form.attributes('action')).toBe('/search');
      expect(field(wrapper).name).toBe('q');
      expect(field(wrapper).type).toBe('search');
    });

    it('defaults the action to the spec’s /search', () => {
      expect(mount().find('[data-part="form"]').attributes('action')).toBe('/search');
    });

    it('names the field, and uses the label as the placeholder when none is given', () => {
      const wrapper = mount();
      expect(field(wrapper).getAttribute('aria-label')).toBe(enUS.searchTheShop);
      expect(field(wrapper).placeholder).toBe(enUS.searchTheShop);
      const named = mount({ label: 'Search help', placeholder: 'Try “returns”' });
      expect(field(named).getAttribute('aria-label')).toBe('Search help');
      expect(field(named).placeholder).toBe('Try “returns”');
    });

    it('is a combobox with a listbox popup', async () => {
      const wrapper = mount({ popular: POPULAR });
      const input = field(wrapper);
      expect(input.getAttribute('role')).toBe('combobox');
      expect(input.getAttribute('aria-autocomplete')).toBe('list');
      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(input.getAttribute('autocomplete')).toBe('off');
      expect(input.getAttribute('spellcheck')).toBe('false');
      expect(input.getAttribute('aria-activedescendant')).toBeNull();

      await focusField(wrapper);
      expect(input.getAttribute('aria-expanded')).toBe('true');
      const listbox = wrapper.find('[data-part="listbox"]');
      expect(listbox.attributes('role')).toBe('listbox');
      expect(input.getAttribute('aria-controls')).toBe(listbox.attributes('id'));
      expect(listbox.attributes('aria-label')).toBe(enUS.searchSuggestions);
    });

    it('is never a dialog', async () => {
      const wrapper = mount({ popular: POPULAR });
      await focusField(wrapper);
      expect(wrapper.find('dialog').exists()).toBe(false);
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('updates modelValue as the query changes', async () => {
      const wrapper = mount();
      await type(wrapper, 'mer');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['mer']);
    });

    it('shows the clear button only with text, and clearing returns focus to the field', async () => {
      const wrapper = mount({ modelValue: 'mer' });
      const clear = wrapper.find('[data-part="clearButton"]');
      expect(clear.exists()).toBe(true);
      expect(clear.attributes('aria-label')).toBe(enUS.clear);
      await clear.trigger('click');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
      await wrapper.setProps({ modelValue: '' });
      expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
      expect(document.activeElement).toBe(field(wrapper));
    });

    it('shows the / hint only while the field is empty and the shortcut is on', async () => {
      const wrapper = mount();
      expect(wrapper.find('[data-part="shortcutHint"]').text()).toBe('/');
      expect(wrapper.find('[data-part="shortcutHint"]').attributes('aria-hidden')).toBe('true');
      await wrapper.setProps({ modelValue: 'mer' });
      expect(wrapper.find('[data-part="shortcutHint"]').exists()).toBe(false);
      const without = mount({ shortcut: false });
      expect(without.find('[data-part="shortcutHint"]').exists()).toBe(false);
    });

    it('autofocuses only when asked', async () => {
      const plain = mount();
      await flush();
      expect(document.activeElement).not.toBe(field(plain));
      const focused = mount({ autofocus: true, popular: POPULAR });
      await flush();
      expect(document.activeElement).toBe(field(focused));
    });
  });

  describe('the idle view', () => {
    it('opens on focus with the recent rows and the popular chips', async () => {
      const wrapper = mount({ recent: RECENT, popular: POPULAR });
      expect(panel(wrapper).exists()).toBe(false);
      await focusField(wrapper);
      expect(panel(wrapper).exists()).toBe(true);
      expect(headings(wrapper)).toEqual([enUS.recentSearches, enUS.popularSearches]);
      expect(wrapper.findAll('[data-part="recent"] [role="option"]').map((n) => n.text())).toEqual([
        ...RECENT,
        enUS.clearRecent,
      ]);
      expect(wrapper.findAll('[data-part="chip"]').map((n) => n.text())).toEqual(POPULAR);
    });

    it('never opens on hover', async () => {
      const wrapper = mount({ recent: RECENT });
      await wrapper.find('[data-part="field"]').trigger('mouseenter');
      await flush();
      expect(panel(wrapper).exists()).toBe(false);
    });

    it('hides the recent list with showRecent: false, and each list when it is empty', async () => {
      const wrapper = mount({ recent: RECENT, popular: POPULAR, showRecent: false });
      await focusField(wrapper);
      expect(headings(wrapper)).toEqual([enUS.popularSearches]);

      const onlyRecent = mount({ recent: RECENT });
      await focusField(onlyRecent);
      expect(headings(onlyRecent)).toEqual([enUS.recentSearches]);
    });

    it('shows no panel at all when there is nothing to put in it', async () => {
      const wrapper = mount();
      await focusField(wrapper);
      expect(panel(wrapper).exists()).toBe(false);
      expect(field(wrapper).getAttribute('aria-expanded')).toBe('false');
    });

    it('fills the field from a recent row without navigating', async () => {
      const wrapper = mount({ recent: RECENT, popular: POPULAR });
      await focusField(wrapper);
      const row = wrapper.findAll('[data-part="recent"] [role="option"]')[0];
      expect(row?.attributes('href')).toBeUndefined();
      await row?.trigger('click');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([RECENT[0]]);
      expect(wrapper.emitted('select')).toBeUndefined();
      expect(document.activeElement).toBe(field(wrapper));
    });

    it('fills the field from a popular chip without navigating', async () => {
      const wrapper = mount({ popular: POPULAR });
      await focusField(wrapper);
      const chip = wrapper.findAll('[data-part="chip"]')[1];
      await chip?.trigger('click');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([POPULAR[1]]);
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('stops a non-navigating row from doing anything else with the click', async () => {
      const wrapper = mount({ recent: RECENT, popular: POPULAR });
      await focusField(wrapper);
      for (const selector of ['[data-part="recent"] [role="option"]', '[data-part="chip"]']) {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        wrapper.find(selector).element.dispatchEvent(event);
        expect(event.defaultPrevented, selector).toBe(true);
      }
    });

    it('empties the history from the Clear recent searches row', async () => {
      const wrapper = mount({ recent: RECENT, popular: POPULAR });
      await focusField(wrapper);
      await wrapper.find('[data-part="clearRecent"]').trigger('click');
      await flush();
      expect(wrapper.emitted('clearRecent')).toHaveLength(1);
      expect(headings(wrapper)).toEqual([enUS.popularSearches]);
      expect(document.activeElement).toBe(field(wrapper));
    });
  });

  describe('recent searches from browser storage', () => {
    it('reads them when the prop is not given, newest first and capped at five', async () => {
      localStorage.setItem(
        'eldra-ui:recent-searches',
        JSON.stringify(['one', 'two', 'three', 'four', 'five', 'six'])
      );
      const wrapper = mount();
      await focusField(wrapper);
      expect(wrapper.findAll('[data-part="recent"] [role="option"]').map((n) => n.text())).toEqual([
        'one',
        'two',
        'three',
        'four',
        'five',
        enUS.clearRecent,
      ]);
    });

    it('prefers the prop over storage', async () => {
      localStorage.setItem('eldra-ui:recent-searches', JSON.stringify(['stored']));
      const wrapper = mount({ recent: RECENT });
      await focusField(wrapper);
      expect(wrapper.findAll('[data-part="recent"] [role="option"]')[0]?.text()).toBe(RECENT[0]);
    });

    it('survives a storage that throws, and one holding nonsense', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      const wrapper = mount({ popular: POPULAR });
      await focusField(wrapper);
      expect(headings(wrapper)).toEqual([enUS.popularSearches]);
      getItem.mockRestore();

      localStorage.setItem('eldra-ui:recent-searches', '{not json');
      const broken = mount({ popular: POPULAR });
      await focusField(broken);
      expect(headings(broken)).toEqual([enUS.popularSearches]);
    });

    it('removes the stored history when the Clear row is chosen', async () => {
      localStorage.setItem('eldra-ui:recent-searches', JSON.stringify(['one']));
      const wrapper = mount();
      await focusField(wrapper);
      await wrapper.find('[data-part="clearRecent"]').trigger('click');
      expect(localStorage.getItem('eldra-ui:recent-searches')).toBeNull();
    });
  });

  describe('the results view', () => {
    it('groups the rows in the spec’s order, capped at 4, 3 and 3, with See all last', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      expect(headings(wrapper)).toEqual([
        enUS.searchProducts,
        enUS.searchCollections,
        enUS.searchJournal,
      ]);
      const sections = wrapper.findAll('[data-part="section"]');
      expect(sections[0]?.findAll('[role="option"]')).toHaveLength(4);
      expect(sections[1]?.findAll('[role="option"]')).toHaveLength(3);
      // Articles and pages share one group, three rows between them.
      expect(sections[2]?.findAll('[role="option"]').map((n) => n.text())).toEqual([
        'Caring for merino: a short guide',
        'Meet the makers',
        'Care guides',
      ]);
      const last = rows(wrapper).at(-1);
      expect(last?.attributes('data-part')).toBe('viewAll');
      expect(last?.text()).toBe(enUS.viewAllResults(RESULTS.total));
      expect(last?.attributes('href')).toBe('/search?q=mer');
    });

    it('shows only the groups resultTypes asks for', async () => {
      const wrapper = mount({
        modelValue: 'mer',
        results: RESULTS,
        resultTypes: ['collections', 'pages'],
      });
      await focusField(wrapper);
      expect(headings(wrapper)).toEqual([enUS.searchCollections, enUS.searchJournal]);
      expect(wrapper.text()).not.toContain('Merino crew sweater');
      expect(wrapper.text()).toContain('Care guides');
      expect(wrapper.text()).not.toContain('Meet the makers');
    });

    it('hides an empty group', async () => {
      const wrapper = mount({
        modelValue: 'mer',
        results: { ...RESULTS, collections: [], articles: [], pages: [] },
      });
      await focusField(wrapper);
      expect(headings(wrapper)).toEqual([enUS.searchProducts]);
    });

    it('draws a product row with its thumbnail, marked match and price', async () => {
      const wrapper = mount({
        modelValue: 'mer',
        results: {
          ...EMPTY,
          total: 1,
          products: [
            {
              id: 'p1',
              title: 'Merino crew sweater',
              href: '/p/merino-crew',
              price: '$96.00',
              image: 'https://example.test/merino.jpg',
              imageAlt: 'Merino crew sweater',
            },
          ],
        },
      });
      await focusField(wrapper);
      const row = wrapper.find('[data-part="item"]');
      expect(row.element.tagName).toBe('A');
      expect(row.attributes('href')).toBe('/p/merino-crew');
      expect(row.attributes('role')).toBe('option');
      expect(row.attributes('aria-selected')).toBe('false');
      expect(row.find('img').attributes('src')).toBe('https://example.test/merino.jpg');
      expect(row.find('[data-part="itemMeta"]').text()).toBe('$96.00');
      // The match is marked by weight and underline, not colour: a <mark> with our own class.
      expect(row.find('mark').text()).toBe('Mer');
      expect(row.find('mark').classes()).toContain('eldra-select-match');
    });

    it('marks a match that differs by case and accent', async () => {
      const wrapper = mount({
        modelValue: 'linen',
        results: {
          ...EMPTY,
          total: 1,
          collections: [{ id: 'c1', title: 'Línen napkins', href: '/c/linen' }],
        },
      });
      await focusField(wrapper);
      expect(wrapper.find('mark').text()).toBe('Línen');
    });

    it('gives every row a unique id inside a named group', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      const ids = rows(wrapper).map((node) => node.attributes('id'));
      expect(new Set(ids).size).toBe(ids.length);
      const section = wrapper.find('[data-part="section"]');
      expect(section.attributes('role')).toBe('group');
      expect(section.attributes('aria-labelledby')).toBe(
        section.find('[data-part="sectionHeading"]').attributes('id')
      );
    });
  });

  describe('the no-results view', () => {
    it('names the query, gives advice and offers the popular chips', async () => {
      const wrapper = mount({ modelValue: 'teapot', results: EMPTY, popular: POPULAR });
      await focusField(wrapper);
      const empty = wrapper.find('[data-part="empty"]');
      expect(empty.text()).toContain(enUS.noResultsFor('teapot'));
      expect(empty.text()).toContain(enUS.searchAdvice);
      expect(wrapper.findAll('[data-part="chip"]').map((n) => n.text())).toEqual(POPULAR);
      expect(wrapper.find('[data-part="viewAll"]').exists()).toBe(false);
    });

    it('renders the empty slot instead when there is one', async () => {
      const wrapper = mount(
        { modelValue: 'teapot', results: EMPTY },
        { slots: { empty: '<p>Nothing here</p>' } }
      );
      await focusField(wrapper);
      expect(wrapper.find('[data-part="empty"]').text()).toBe('Nothing here');
    });
  });

  describe('the loading view', () => {
    it('waits 300ms before it replaces the panel, and keeps the results until then', async () => {
      vi.useFakeTimers();
      const wrapper = mount({ modelValue: 'wool', results: RESULTS, loading: false });
      field(wrapper).focus();
      await wrapper.find('[data-part="field"]').trigger('focus');
      await nextTick();
      await wrapper.setProps({ loading: true });
      await nextTick();
      expect(wrapper.find('[data-part="loading"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('Merino crew sweater');

      vi.advanceTimersByTime(299);
      await nextTick();
      expect(wrapper.find('[data-part="loading"]').exists()).toBe(false);

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(wrapper.find('[data-part="loading"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('Merino crew sweater');
      expect(wrapper.findAll('[data-part="loading"] [aria-hidden="true"]').length).toBeGreaterThan(
        0
      );

      await wrapper.setProps({ loading: false });
      await nextTick();
      expect(wrapper.find('[data-part="loading"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('Merino crew sweater');
    });

    it('forgets a pending delay when the request finishes inside it', async () => {
      vi.useFakeTimers();
      const wrapper = mount({ modelValue: 'wool', results: RESULTS, loading: true });
      field(wrapper).focus();
      await wrapper.find('[data-part="field"]').trigger('focus');
      await nextTick();
      await wrapper.setProps({ loading: false });
      vi.advanceTimersByTime(600);
      await nextTick();
      expect(wrapper.find('[data-part="loading"]').exists()).toBe(false);
    });
  });

  describe('the live region', () => {
    it('announces the count after a 400ms pause, not on every keystroke', async () => {
      vi.useFakeTimers();
      const wrapper = mount({ results: RESULTS });
      const region = () => wrapper.find('[data-part="liveRegion"]');
      expect(region().attributes('aria-live')).toBe('polite');
      expect(region().text()).toBe('');

      const input = wrapper.find('[data-part="field"]');
      (input.element as HTMLInputElement).value = 'me';
      await input.trigger('input');
      vi.advanceTimersByTime(399);
      await nextTick();
      expect(region().text()).toBe('');

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(region().text()).toBe(enUS.resultsCount(RESULTS.total));
    });

    it('announces no results by name, and clears on an empty query', async () => {
      vi.useFakeTimers();
      const wrapper = mount({ results: EMPTY });
      const input = wrapper.find('[data-part="field"]');
      (input.element as HTMLInputElement).value = 'teapot!';
      await input.trigger('input');
      vi.advanceTimersByTime(400);
      await nextTick();
      expect(wrapper.find('[data-part="liveRegion"]').text()).toBe(enUS.noResultsFor('teapot!'));

      (input.element as HTMLInputElement).value = '';
      await input.trigger('input');
      await nextTick();
      expect(wrapper.find('[data-part="liveRegion"]').text()).toBe('');
    });
  });

  describe('the keyboard', () => {
    it('opens on ArrowDown and walks every row, across groups, without wrapping', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await key(wrapper, { key: 'ArrowDown' });
      await flush();
      expect(panel(wrapper).exists()).toBe(true);
      const ids = rows(wrapper).map((node) => node.attributes('id'));
      expect(field(wrapper).getAttribute('aria-activedescendant')).toBe(ids[0]);

      await key(wrapper, { key: 'ArrowDown' });
      expect(field(wrapper).getAttribute('aria-activedescendant')).toBe(ids[1]);

      for (let index = 0; index < ids.length + 3; index += 1)
        await key(wrapper, { key: 'ArrowDown' });
      expect(field(wrapper).getAttribute('aria-activedescendant')).toBe(ids.at(-1));

      for (let index = 0; index < ids.length + 3; index += 1)
        await key(wrapper, { key: 'ArrowUp' });
      expect(field(wrapper).getAttribute('aria-activedescendant')).toBe(ids[0]);
    });

    it('marks only the active row, and never moves focus off the field', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      await key(wrapper, { key: 'ArrowDown' });
      await key(wrapper, { key: 'ArrowDown' });
      const items = wrapper.findAll('[data-part="item"]');
      const active = items[1];
      expect(active?.attributes('id')).toBe(field(wrapper).getAttribute('aria-activedescendant'));
      // A fill *and* an arrow, plus the active-descendant above: never colour alone.
      expect(active?.classes()).toContain('bg-surface-strong');
      expect(active?.find('[data-part="itemArrow"]').exists()).toBe(true);
      expect(items[0]?.classes()).not.toContain('bg-surface-strong');
      expect(items[0]?.find('[data-part="itemArrow"]').exists()).toBe(false);
      expect(document.activeElement).toBe(field(wrapper));
    });

    it('scrolls the active row into view', async () => {
      const scrollIntoView = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const wrapper = mount({ modelValue: 'mer', results: RESULTS });
        await focusField(wrapper);
        await key(wrapper, { key: 'ArrowDown' });
        await flush();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
        const active = wrapper.findAll('[data-part="item"]')[0];
        expect(scrollIntoView.mock.instances.at(-1)).toBe(active?.element);
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it('follows the active row on Enter and reports it', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      await key(wrapper, { key: 'ArrowDown' });
      await key(wrapper, { key: 'Enter' });
      expect(wrapper.emitted('select')?.[0]).toEqual([RESULTS.products[0], 'products']);
      expect(wrapper.emitted('submit')).toBeUndefined();
    });

    it('reports the See all row as a selection too', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      await key(wrapper, { key: 'ArrowUp' });
      await key(wrapper, { key: 'Enter' });
      expect(wrapper.emitted('select')?.[0]?.[1]).toBe('viewAll');
    });

    it('fills the field from an active recent row on Enter', async () => {
      const wrapper = mount({ recent: RECENT });
      await focusField(wrapper);
      await key(wrapper, { key: 'ArrowDown' });
      await key(wrapper, { key: 'Enter' });
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([RECENT[0]]);
      expect(wrapper.emitted('submit')).toBeUndefined();
    });

    it('submits the form on Enter with no active row', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      field(wrapper).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);

      await wrapper.find('[data-part="form"]').trigger('submit');
      expect(wrapper.emitted('submit')?.[0]).toEqual(['mer']);
      await flush();
      expect(panel(wrapper).exists()).toBe(false);
    });

    it('takes Escape in steps: the active row, the query, then the panel', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      await key(wrapper, { key: 'ArrowDown' });
      expect(field(wrapper).getAttribute('aria-activedescendant')).not.toBeNull();

      await key(wrapper, { key: 'Escape' });
      expect(field(wrapper).getAttribute('aria-activedescendant')).toBeNull();
      expect(panel(wrapper).exists()).toBe(true);

      await key(wrapper, { key: 'Escape' });
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
      await wrapper.setProps({ modelValue: '', recent: RECENT });
      await flush();
      expect(panel(wrapper).exists()).toBe(true);

      await key(wrapper, { key: 'Escape' });
      await flush();
      expect(panel(wrapper).exists()).toBe(false);
      expect(document.activeElement).toBe(field(wrapper));
    });

    it('closes on Tab without consuming it', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      field(wrapper).dispatchEvent(event);
      await flush();
      expect(event.defaultPrevented).toBe(false);
      expect(panel(wrapper).exists()).toBe(false);
    });

    it('leaves Home and End to the caret', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
      field(wrapper).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(field(wrapper).getAttribute('aria-activedescendant')).toBeNull();
    });

    it('keeps the caret in the field when a press lands inside the panel', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      // `mousedown`'s default action is what moves focus, so preventing it is what keeps the
      // caret where it is while the click still lands on the row.
      for (const selector of ['[data-part="item"]', '[data-part="panel"]']) {
        const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        wrapper.find(selector).element.dispatchEvent(event);
        expect(event.defaultPrevented, selector).toBe(true);
      }
      expect(document.activeElement).toBe(field(wrapper));
    });

    it('closes when a pointer press lands outside', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      expect(panel(wrapper).exists()).toBe(true);
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await flush();
      expect(panel(wrapper).exists()).toBe(false);
    });
  });

  describe('the / shortcut', () => {
    it('focuses the field from anywhere on the page', async () => {
      const wrapper = mount({ popular: POPULAR });
      const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      await flush();
      expect(document.activeElement).toBe(field(wrapper));
      expect(event.defaultPrevented).toBe(true);
    });

    it('is ignored while typing in another field, or with a modifier', async () => {
      const wrapper = mount();
      const other = document.createElement('input');
      document.body.append(other);
      other.focus();
      other.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
      await flush();
      expect(document.activeElement).toBe(other);

      other.blur();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: '/', bubbles: true, metaKey: true })
      );
      await flush();
      expect(document.activeElement).not.toBe(field(wrapper));
      other.remove();
    });

    it('is ignored while typing in a rich-text area', async () => {
      const wrapper = mount();
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      editable.tabIndex = 0;
      document.body.append(editable);
      editable.focus();
      editable.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
      await flush();
      expect(document.activeElement).not.toBe(field(wrapper));
      editable.remove();
    });

    it('does nothing when the shortcut is off', async () => {
      const wrapper = mount({ shortcut: false });
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
      await flush();
      expect(document.activeElement).not.toBe(field(wrapper));
    });
  });

  describe('styling hooks', () => {
    it('takes per-part classes and messages', async () => {
      const wrapper = mount({
        modelValue: 'mer',
        results: RESULTS,
        classes: { field: 'border-danger', panel: 'max-h-64', item: 'gap-6' },
        messages: { searchProducts: 'Wares' },
      });
      await focusField(wrapper);
      expect(field(wrapper).className).toContain('border-danger');
      expect(panel(wrapper).classes()).toContain('max-h-64');
      expect(wrapper.find('[data-part="item"]').classes()).toContain('gap-6');
      expect(headings(wrapper)[0]).toBe('Wares');
    });

    it('renders the item slot in place of a row’s own content', async () => {
      const wrapper = mount(
        { modelValue: 'mer', results: RESULTS },
        { slots: { item: '<span class="mine">{{ params.type }}:{{ params.item.title }}</span>' } }
      );
      await focusField(wrapper);
      expect(wrapper.find('.mine').text()).toBe('products:Merino crew sweater');
    });

    it('grows the field and rounds it fully in the lg and pill variants', () => {
      expect(field(mount()).className).toContain('control-h');
      const large = mount({ size: 'lg' });
      expect(field(large).className).toContain('control-h-lg');
      const pill = mount({ pill: true });
      expect(field(pill).className).toContain('rounded-full');
    });
  });

  describe('accessibility', () => {
    it('has no axe violations while closed', async () => {
      const wrapper = mount({ modelValue: 'mer' });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('has no axe violations in the idle view', async () => {
      const wrapper = mount({ recent: RECENT, popular: POPULAR });
      await focusField(wrapper);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('has no axe violations in the results view', async () => {
      const wrapper = mount({ modelValue: 'mer', results: RESULTS });
      await focusField(wrapper);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('has no axe violations in the no-results view', async () => {
      const wrapper = mount({ modelValue: 'teapot', results: EMPTY, popular: POPULAR });
      await focusField(wrapper);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('has no axe violations in the loading view', async () => {
      vi.useFakeTimers();
      const wrapper = mount({ modelValue: 'wool', results: RESULTS, loading: true });
      field(wrapper).focus();
      await wrapper.find('[data-part="field"]').trigger('focus');
      await nextTick();
      vi.advanceTimersByTime(300);
      await nextTick();
      vi.useRealTimers();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders in a narrow container', async () => {
      const wrapper = mountNarrow(SearchBar, {
        props: { modelValue: 'mer', results: RESULTS },
      });
      mounted.push(wrapper as unknown as VueWrapper);
      const input = wrapper.find('[data-part="field"]');
      (input.element as HTMLInputElement).focus();
      await input.trigger('focus');
      await flush();
      expect(wrapper.find('[data-part="panel"]').exists()).toBe(true);
      expect(wrapper.find('[data-part="itemTitle"]').classes()).toContain('truncate');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });
});
