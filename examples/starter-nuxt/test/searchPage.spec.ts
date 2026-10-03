// @vitest-environment jsdom
//
// `app/pages/search.vue` is the theme's own `/search` route — the destination every search in the
// theme already named and nothing answered. `@eldrajs/ui`'s `SearchBar`/`SearchModal` submit to
// `${action}?q=…` with `action` defaulting to `/search`, and the search block's own chips and
// "View all" links point back at it; with no route for it the catch-all asked the gateway for a CMS
// page called "search", found none, and every shopper who pressed Enter in the header got the
// not-found shell.
//
// Like `test/cartPage.spec.ts`, the page reads `useHead()` as a bare Nuxt auto-import, so it is
// installed with `vi.stubGlobal` before the module is imported. Everything else is the real thing:
// the `search` block, the demo storefront, and the theme's own messages.
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { axe } from './support/axe';
import { mountOptions } from './support/mountBlock';
import { STOREFRONT_KEY } from '../app/storefront/types';
import type { StorefrontSource } from '../app/storefront/types';
import { createDemoStorefront } from '../app/storefront/demo';
import { enUS } from '../app/i18n/en-US';

const heads: Array<Record<string, unknown>> = [];
vi.stubGlobal('useHead', (input: unknown) => {
  heads.push(
    (typeof input === 'function' ? (input as () => Record<string, unknown>)() : input) ?? {}
  );
});

const { default: SearchPage } = await import('../app/pages/search.vue');

/** The page takes no props; it needs only the provides a block does. A storefront can be handed in
 *  to put a `?q=` on the route, which is the only thing that separates the two states. */
function mountSearchPage(storefront?: StorefrontSource) {
  const base = mountOptions({ entry: { id: 'unused', data: {} } });
  return mount(SearchPage, {
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        ...(storefront ? { [STOREFRONT_KEY]: storefront } : {}),
      },
    },
  });
}

describe('app/pages/search.vue', () => {
  it('renders the idle state when no query has been asked', async () => {
    const wrapper = mountSearchPage();
    await nextTick();

    // The heading a prerendered `search/index.html` carries: never "No results for “”", which is
    // what an empty-query answer with `total: 0` used to print into the artifact's own HTML.
    expect(wrapper.get('h1').text()).toBe(enUS.search.idleTitle);
    expect(wrapper.text()).not.toContain('No results');
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
  });

  it('renders the results for the query the route carries', async () => {
    const wrapper = mountSearchPage(createDemoStorefront({ query: 'linen' }));
    await nextTick();

    expect(wrapper.get('h1').text()).toBe('Results for “linen”');
    expect(wrapper.find('input[type="search"]').element.value).toBe('linen');
    // The demo storefront matches "linen" against its catalogue and journal.
    expect(wrapper.text()).toContain(enUS.search.typeProducts);
  });

  it('puts the results page inside the `#main` landmark the skip link targets', () => {
    const wrapper = mountSearchPage();
    const main = wrapper.get('main');
    expect(main.attributes('id')).toBe('main');
    expect(main.find('input[type="search"]').exists()).toBe(true);
  });

  it('titles the document', () => {
    heads.length = 0;
    mountSearchPage();
    expect(heads.at(-1)?.title).toBe(enUS.search.title);
  });

  it('is axe-clean, with and without a query', async () => {
    const idle = mountSearchPage();
    await nextTick();
    expect(await axe(idle.element)).toHaveNoViolations();

    const answered = mountSearchPage(createDemoStorefront({ query: 'linen' }));
    await nextTick();
    expect(await axe(answered.element)).toHaveNoViolations();
  });
});
