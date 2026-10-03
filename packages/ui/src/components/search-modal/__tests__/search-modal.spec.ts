// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `drawer.spec.ts` documents).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { currentDialog } from '../../../composables/dialogStack';
import { enUS } from '../../../messages/en-US';
import { axe } from '../../../test/axe';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';
import { expectClosedModalRendersNothing } from '../../../test/modal';
import { mountNarrow, mountWith } from '../../../test/mount';
import Dialog from '../../dialog/Dialog.vue';
import SearchBar from '../../search-bar/SearchBar.vue';
import type { SearchResults } from '../../search-bar/types';
import SearchModal from '../SearchModal.vue';

/** The same fixtures `search-bar.spec.ts` uses — not exported from there, so redefined here. */
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

const RECENT_KEY = 'eldra-ui:recent-searches';
const RECENT = ['merino scarf', 'espresso cups'];
const POPULAR = ['Gifts under $50', 'Merino', 'Stoneware mugs', 'Linen'];

type Finder = { find: (selector: string) => { element: Element } };

function root(wrapper: Finder): HTMLDialogElement {
  return wrapper.find('[data-part="root"]').element as HTMLDialogElement;
}

function field(wrapper: Finder): HTMLInputElement {
  return wrapper.find('[data-part="field"]').element as HTMLInputElement;
}

const mounted: VueWrapper[] = [];

function mount(props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const wrapper = mountWith(SearchModal, { props, ...options });
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

/** `useDialog` moves initial focus a tick after `showModal()`, itself scheduled a tick after
 *  mount's own `onMounted` runs `show()` — the same two-tick wait `dialog.spec.ts` uses. */
async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('SearchModal — element and parts', () => {
  it('is a native dialog with a data-part on every named part', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    expect(root(wrapper).tagName).toBe('DIALOG');
    expect(wrapper.find('[data-part="form"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="field"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="results"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="listbox"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="footer"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="liveRegion"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-part="close"]')).toHaveLength(2);
  });

  it('has no role="dialog" anywhere — the native element carries its own semantics', () => {
    const wrapper = mount({ modelValue: true });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('is aria-labelled "Search" by default, and by ariaLabel when given', () => {
    expect(root(mount({ modelValue: true })).getAttribute('aria-label')).toBe(enUS.search);
    expect(
      root(mount({ modelValue: true, ariaLabel: 'Find anything' })).getAttribute('aria-label')
    ).toBe('Find anything');
  });

  it('names the field from messages.searchTheShop, not a customisable prop', () => {
    const wrapper = mount({ modelValue: true });
    expect(field(wrapper).getAttribute('aria-label')).toBe(enUS.searchTheShop);
    expect(field(wrapper).placeholder).toBe(enUS.searchTheShop);
  });

  it('takes a custom placeholder', () => {
    const wrapper = mount({ modelValue: true, placeholder: 'Try “returns”' });
    expect(field(wrapper).placeholder).toBe('Try “returns”');
  });

  it('is a combobox whose panel is always shown while the dialog is open', () => {
    const wrapper = mount({ modelValue: true });
    const input = field(wrapper);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    // Spec "Search modal" → Accessibility: "aria-expanded stays true while the dialog is open."
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const listbox = wrapper.find('[data-part="listbox"]');
    expect(listbox.attributes('role')).toBe('listbox');
    expect(input.getAttribute('aria-controls')).toBe(listbox.attributes('id'));
    expect(listbox.attributes('aria-label')).toBe(enUS.searchSuggestions);
  });

  it('is a search landmark posting q to the action with GET', () => {
    const wrapper = mount({ modelValue: true, action: '/search' });
    const form = wrapper.find('[data-part="form"]');
    expect(form.element.tagName).toBe('FORM');
    expect(form.attributes('role')).toBe('search');
    expect(form.attributes('method')).toBe('get');
    expect(form.attributes('action')).toBe('/search');
    expect(field(wrapper).name).toBe('q');
  });

  it('shows the clear button only with text', async () => {
    const wrapper = mount({ modelValue: true });
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(false);
    await wrapper.setProps({ query: 'mer' });
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(true);
  });

  it('the foot is aria-hidden and hidden by default only at the viewport-narrow breakpoint class', () => {
    const wrapper = mount({ modelValue: true });
    const footer = wrapper.find('[data-part="footer"]');
    expect(footer.attributes('aria-hidden')).toBe('true');
    expect(footer.classes()).toContain('hidden');
    expect(footer.classes()).toContain('md:flex');
  });
});

describe('SearchModal — open and close (useDialog)', () => {
  it('opens with showModal, reflected as the open attribute', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    expect(root(wrapper).open).toBe(true);
  });

  it('does not open without modelValue', () => {
    const wrapper = mount();
    expect(root(wrapper).open).toBe(false);
  });

  it('focuses the field on open — never the close button', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    expect(document.activeElement).toBe(field(wrapper));
  });

  it('the close icon button closes it, emitting close("button") and update:modelValue(false)', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    await wrapper.findAll('[data-part="close"]')[0]?.trigger('click');
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('the phone Cancel button closes it the same way', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    const cancel = wrapper.findAll('[data-part="close"]')[1];
    expect(cancel?.text()).toBe(enUS.cancel);
    await cancel?.trigger('click');
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
  });

  it('a click on the dialog element itself closes it', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    root(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['backdrop']);
  });

  it('a click inside the results area does not close it', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    wrapper
      .find('[data-part="results"]')
      .element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(true);
  });

  it('opens on top of an already-open Dialog, and vice versa — no refusal, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dialog = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    const modal = mount({ modelValue: true });
    await nextTick();
    expect(currentDialog()).toBe(root(modal));
    expect(root(dialog).open).toBe(true);
    expect(root(modal).open).toBe(true);
    expect(modal.emitted('update:modelValue')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    dialog.unmount();
  });

  /** Fix round 2, the operator's own finding — the same closed-modal-renders-nothing bug the
   *  Drawer `Cart` story surfaced, guarded for every modal root the same way. */
  it('renders nothing while closed — hidden open:flex on the root, not a bare flex', () => {
    const wrapper = mount({ modelValue: false });
    expectClosedModalRendersNothing(root(wrapper));
  });

  it('closing it (modelValue turns false) goes back to hidden open:flex, not a leftover flex', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    await wrapper.setProps({ modelValue: false });
    expectClosedModalRendersNothing(root(wrapper));
  });

  it('returns focus to the opener once the modal closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Search';
    document.body.append(opener);
    opener.focus();

    const wrapper = mount({ modelValue: true });
    await settle();
    expect(document.activeElement).not.toBe(opener);

    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("the exposed close(value) closes with the consumer's own action value", async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    (wrapper.vm as unknown as { close: (v?: string) => void }).close('remove');
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['remove']);
  });

  it('a v-model close after a prior button close reads "programmatic", not the stale "button" (I4)', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    await wrapper.findAll('[data-part="close"]')[0]?.trigger('click');
    await nextTick();
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    // Simulate the real v-model round trip: the parent accepts the emitted `false`, then reopens
    // and closes again from outside (a route with no `returnValue` of its own).
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(wrapper.emitted('close')?.[1]).toEqual(['programmatic']);
  });
});

describe('SearchModal — query reset on close', () => {
  it('clears an uncontrolled query when the dialog closes, by any route', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    await wrapper.find('[data-part="field"]').setValue('mer');
    expect(field(wrapper).value).toBe('mer');

    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(field(wrapper).value).toBe('');

    await wrapper.setProps({ modelValue: true });
    await settle();
    expect(field(wrapper).value).toBe('');
  });

  it('emits update:query("") on close even when the query is controlled', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer' });
    await settle();
    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(wrapper.emitted('update:query')?.at(-1)).toEqual(['']);
  });
});

describe('SearchModal — the idle view', () => {
  it('shows recent rows then popular chips, grouped and headed as SearchBar’s own', () => {
    const wrapper = mount({ modelValue: true, recent: RECENT, popular: POPULAR });
    const headings = wrapper.findAll('[data-part="sectionHeading"]').map((node) => node.text());
    expect(headings).toEqual([enUS.recentSearches, enUS.popularSearches]);
    const rows = wrapper.findAll('[role="option"]');
    // 2 recent + 1 "Clear recent searches" + 4 popular chips.
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)?.text()).toBe(POPULAR.at(-1));
  });

  it('empties the history from the Clear recent searches row, without closing or navigating', async () => {
    const wrapper = mount({ modelValue: true, recent: RECENT });
    await settle();
    await wrapper.find('[data-part="clearRecent"]').trigger('click');
    expect(wrapper.emitted('clearRecent')).toHaveLength(1);
    expect(wrapper.find('[data-part="recent"]').exists()).toBe(false);
    expect(root(wrapper).open).toBe(true);
    expect(document.activeElement).toBe(field(wrapper));
  });

  it('reads recent searches from browser storage, shared with SearchBar’s own key', async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(['wool jumper']));
    const wrapper = mount({ modelValue: true });
    await nextTick();
    expect(wrapper.find('[role="option"]').text()).toContain('wool jumper');
  });
});

describe('SearchModal — the results view', () => {
  it('groups the rows in the spec’s order, capped at 4, 3 and 3, with See all last', () => {
    const wrapper = mount({ modelValue: true, query: 'mer', results: RESULTS });
    const headings = wrapper.findAll('[data-part="sectionHeading"]').map((node) => node.text());
    expect(headings).toEqual([enUS.searchProducts, enUS.searchCollections, enUS.searchJournal]);
    const rows = wrapper.findAll('[role="option"]');
    expect(rows).toHaveLength(4 + 3 + 3 + 1);
    expect(wrapper.find('[data-part="viewAll"]').text()).toBe(enUS.viewAllResults(12, 'mer'));
  });

  it('hides an empty group', () => {
    const wrapper = mount({
      modelValue: true,
      query: 'mer',
      results: { ...RESULTS, collections: [] },
    });
    const headings = wrapper.findAll('[data-part="sectionHeading"]').map((node) => node.text());
    expect(headings).not.toContain(enUS.searchCollections);
  });

  it('waits for a first response before saying there is nothing', () => {
    const wrapper = mount({ modelValue: true, query: 'mer' });
    expect(wrapper.find('[data-part="empty"]').exists()).toBe(false);
  });
});

describe('SearchModal — the no-results view', () => {
  it('names the query, gives advice and offers the popular chips', () => {
    const wrapper = mount({
      modelValue: true,
      query: 'teapot',
      results: EMPTY,
      popular: POPULAR,
    });
    const empty = wrapper.find('[data-part="empty"]');
    expect(empty.text()).toContain('teapot');
    expect(wrapper.findAll('[data-part="chip"]')).toHaveLength(POPULAR.length);
  });
});

describe('SearchModal — the loading view', () => {
  it('waits 300ms before showing the loading view, keeping the results until then', async () => {
    vi.useFakeTimers();
    const wrapper = mount({ modelValue: true, query: 'wool', results: RESULTS, loading: false });
    await wrapper.setProps({ loading: true });
    expect(wrapper.find('[data-part="loading"]').exists()).toBe(false);
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(wrapper.find('[data-part="loading"]').exists()).toBe(true);
  });
});

describe('SearchModal — the live region', () => {
  it('announces the count after a 400ms pause, once the query actually changes', async () => {
    vi.useFakeTimers();
    const wrapper = mount({ modelValue: true, results: RESULTS });
    await wrapper.find('[data-part="field"]').setValue('mer');
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(wrapper.find('[data-part="liveRegion"]').text()).toBe(enUS.resultsCount(12, 'mer'));
  });

  /** See `SearchBar`'s own version: "No results" is an answer, so it needs one to have arrived. */
  it('announces the loading message while no results have arrived, then the count', async () => {
    vi.useFakeTimers();
    const wrapper = mount({ modelValue: true, results: undefined });
    const region = () => wrapper.find('[data-part="liveRegion"]');
    await wrapper.find('[data-part="field"]').setValue('bowl');

    vi.advanceTimersByTime(400);
    await nextTick();
    expect(region().text()).toBe(enUS.searchLoading);
    expect(region().text()).not.toContain('No results');

    // The answer lands with the rows, not 400ms behind them — see `SearchBar`'s own version.
    await wrapper.setProps({ results: RESULTS });
    await nextTick();
    expect(region().text()).toBe(enUS.resultsCount(RESULTS.total, 'bowl'));
  });

  /**
   * The visible half of the loading state. The modal's panel is always open, so a shopper on a slow
   * connection stared at an almost-empty panel with one line of hidden text and no sign that a
   * request was out.
   */
  it('draws a spinner beside the field and marks the listbox busy while loading', async () => {
    vi.useFakeTimers();
    const wrapper = mount({ modelValue: true, query: 'wool', results: undefined, loading: true });
    expect(wrapper.find('[data-part="busy"]').exists()).toBe(false);

    vi.advanceTimersByTime(300);
    await nextTick();
    expect(wrapper.find('[data-part="busy"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="listbox"]').attributes('aria-busy')).toBe('true');

    await wrapper.setProps({ results: RESULTS, loading: false });
    await nextTick();
    expect(wrapper.find('[data-part="busy"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="listbox"]').attributes('aria-busy')).toBeUndefined();
  });
});

describe('SearchModal — the keyboard', () => {
  it('opens on ArrowDown and walks every row, across groups', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer', results: RESULTS });
    const input = wrapper.find('[data-part="field"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(input.attributes('aria-activedescendant')).toBeTruthy();
    expect(field(wrapper).getAttribute('aria-activedescendant')).toBe(
      wrapper.find('[role="option"]').attributes('id')
    );
  });

  it('follows the active row on Enter, reports it and closes the modal', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer', results: RESULTS });
    await settle();
    const input = wrapper.find('[data-part="field"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ title: 'Merino crew sweater' });
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['select']);
  });

  it('fills the field from an active recent row on Enter, without closing', async () => {
    const wrapper = mount({ modelValue: true, recent: RECENT });
    await settle();
    const input = wrapper.find('[data-part="field"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(field(wrapper).value).toBe(RECENT[0]);
    expect(root(wrapper).open).toBe(true);
  });

  it('submits the form on Enter with no active row', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer' });
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field(wrapper).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    // happy-dom does not implement the browser's own "Enter submits the enclosing form" default
    // action — the same gap `search-bar.spec.ts`'s own equivalent test documents and works around.
    await wrapper.find('[data-part="form"]').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]).toEqual(['mer']);
  });

  it('remembers the search on submit, newest first', async () => {
    const wrapper = mount({ modelValue: true, query: 'merino' });
    await wrapper.find('[data-part="form"]').trigger('submit');
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')).toEqual(['merino']);
  });
});

describe('SearchModal — Esc, in the spec’s three steps', () => {
  it('first clears the active option only, and does not close', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer', results: RESULTS });
    await settle();
    const input = wrapper.find('[data-part="field"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(field(wrapper).getAttribute('aria-activedescendant')).toBeTruthy();

    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();
    expect(field(wrapper).getAttribute('aria-activedescendant')).toBeNull();
    expect(root(wrapper).open).toBe(true);
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('then clears the query, keeping the dialog open, while focus is in the field', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    await wrapper.find('[data-part="field"]').setValue('mer');

    const event = new Event('cancel', { cancelable: true });
    root(wrapper).dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(field(wrapper).value).toBe('');
    expect(root(wrapper).open).toBe(true);
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('finally closes it, firing cancel then close("escape")', async () => {
    const wrapper = mount({ modelValue: true });
    await settle();
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['escape']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  /** Nested modals: this modal's own three-step Esc handler runs before `useDialog`'s own top-of-
   *  stack guard, so it needs the identical check — otherwise a cancel reaching a covered
   *  `SearchModal` would still clear its active option, even though the modal on top of it is the
   *  one `Esc` is actually for. */
  it('does nothing — not even clearing the active option — while covered by another dialog', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer', results: RESULTS });
    await settle();
    const input = wrapper.find('[data-part="field"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(field(wrapper).getAttribute('aria-activedescendant')).toBeTruthy();

    const dialog = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await nextTick();

    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();
    expect(field(wrapper).getAttribute('aria-activedescendant')).toBeTruthy();
    expect(root(wrapper).open).toBe(true);
    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(root(dialog).open).toBe(true);

    dialog.unmount();
  });
});

describe('SearchModal — the / and ⌘K/Ctrl+K shortcuts', () => {
  it('/ opens the modal only while no SearchBar owns the shortcut', async () => {
    const bar = mountWith(SearchBar, { attachTo: document.body });
    const wrapper = mount({});

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(document.activeElement).toBe(bar.find('[data-part="field"]').element);

    bar.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }));
    await settle();
    expect(root(wrapper).open).toBe(true);
  });

  it('is ignored while typing in another field, or with a modifier', async () => {
    const wrapper = mount({});
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    input.remove();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '/', ctrlKey: true, cancelable: true })
    );
    await nextTick();
    expect(root(wrapper).open).toBe(false);
  });

  it('⌘K / Ctrl+K always opens the modal, even while a SearchBar owns the / shortcut', async () => {
    const bar = mountWith(SearchBar, { attachTo: document.body });
    const wrapper = mount({});
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true });
    document.dispatchEvent(event);
    await settle();
    expect(root(wrapper).open).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    bar.unmount();
  });

  it('Ctrl+K opens it too (non-macOS)', async () => {
    const wrapper = mount({});
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true })
    );
    await settle();
    expect(root(wrapper).open).toBe(true);
  });

  it('does nothing when the shortcut is off', async () => {
    const wrapper = mount({ shortcut: false });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
    );
    await nextTick();
    expect(root(wrapper).open).toBe(false);
  });
});

describe('SearchModal — styling hooks', () => {
  it('takes per-part classes, including the reused panel’s own parts', () => {
    const wrapper = mount({
      modelValue: true,
      query: 'mer',
      results: RESULTS,
      classes: { root: 'rounded-none', item: 'italic' },
    });
    expect(root(wrapper).className).toContain('rounded-none');
    expect(wrapper.find('[data-part="item"]').classes()).toContain('italic');
  });

  it('takes message overrides', () => {
    const wrapper = mount({ modelValue: true, messages: { search: 'Buscar' } });
    expect(root(wrapper).getAttribute('aria-label')).toBe('Buscar');
  });
});

describe('SearchModal — accessibility', () => {
  it('has no axe violations closed', async () => {
    const wrapper = mount();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations in the idle view', async () => {
    const wrapper = mount({ modelValue: true, recent: RECENT, popular: POPULAR });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations in the results view', async () => {
    const wrapper = mount({ modelValue: true, query: 'mer', results: RESULTS });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations in the no-results view', async () => {
    const wrapper = mount({
      modelValue: true,
      query: 'teapot',
      results: EMPTY,
      popular: POPULAR,
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations in the loading view', async () => {
    vi.useFakeTimers();
    const wrapper = mount({ modelValue: true, query: 'wool', results: EMPTY, loading: true });
    vi.advanceTimersByTime(300);
    await nextTick();
    vi.useRealTimers();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders in a narrow container', async () => {
    const wrapper = mountNarrow(SearchModal, {
      props: { modelValue: true, query: 'mer', results: RESULTS },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await settle();
    expect(wrapper.find('[data-part="itemTitle"]').classes()).toContain('truncate');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('SearchModal — built CSS', () => {
  const distDir = fileURLToPath(new NodeURL('../../../../dist/', import.meta.url));
  const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

  it.runIf(built)(
    'the width, max-height and position utilities go full-screen below a 48rem viewport',
    async () => {
      const { compile } = await import('@tailwindcss/node');
      const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
        base: distDir,
        onDependency() {},
      });
      const css = compiler.build([
        'eldra-search-modal-width',
        'eldra-search-modal-max-height',
        'eldra-search-modal-position',
      ]);

      expect(css).toContain('.eldra-search-modal-width {');
      expect(css).toContain(
        'width: min(var(--eldra-search-modal-width, 40rem), calc(100vw - 2rem));'
      );
      expect(css).toContain(
        'max-height: min(var(--eldra-search-modal-max-height, 40rem), calc(100vh - 6rem));'
      );
      expect(css).toContain('margin: 8vh auto auto;');
      // A plain @media query on the viewport, never a @container query — the design spec's own
      // exception for Drawer/Lightbox/Search modal.
      expect(css).not.toContain('@container');

      const mediaBlocks = [...css.matchAll(/@media \(width < 48rem\) \{([^{}]*)\}/g)];
      expect(mediaBlocks.length).toBeGreaterThanOrEqual(3);
      const bodies = mediaBlocks.map((match) => match[1]).join('\n');
      expect(bodies).toContain('width: 100vw;');
      expect(bodies).toContain('max-height: 100vh;');
      expect(bodies).toContain('margin: 0;');
    }
  );

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
