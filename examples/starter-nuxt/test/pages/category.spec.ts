// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { axe } from '../support/axe';
import {
  expectPageLandmarks,
  expectSkipLinkLandsAfterTheHeader,
  mountPage,
  mountPageWithSkipLink,
  pageBlockRoots,
  type PageFixture,
} from '../support/mountPage';
import { createDemoStorefront } from '../../app/storefront/demo';
import fixture from '../../pages/category.page.json';

const page = fixture as unknown as PageFixture;

/**
 * The **category sample page** (`pages/category.page.json`) — the seed behind the
 * `/categories/:path*` route template, where a category is addressed by its canonical path (the
 * slugs of its ancestors, root first, then its own).
 *
 * Every block on it reads the route rather than a field: `breadcrumbs` takes the levels above the
 * category from the store (`fromCategory`), `collection-header` in `scope: 'category'` takes the
 * title and the strip of sibling categories from it, and `collection-grid` in `scope: 'category'`
 * lists that category's whole subtree. So the one thing this page needs that no other page spec
 * does is a demo route that *is* a category page — `home/ceramics`, the demo tree's own nested
 * branch (`Homeware › Ceramics`, with `Kitchen` as the sibling the strip never shows and the
 * children the strip would show when a category has any).
 */
const CATEGORY_PATH = 'home/ceramics';
const CATEGORY_TITLE = 'Ceramics';

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    const container = wrapper.element;
    wrapper.unmount();
    container?.remove();
  }
});

function categoryStorefront(categoryPath: string | undefined = CATEGORY_PATH) {
  return createDemoStorefront({ categoryPath });
}

async function mountCategoryPage(categoryPath?: string): Promise<VueWrapper> {
  const wrapper = await mountPage(page, { storefront: categoryStorefront(categoryPath) });
  await flushPromises();
  wrappers.push(wrapper);
  return wrapper;
}

describe('category sample page', () => {
  it('renders the five blocks, in order, on their documented grounds', async () => {
    const wrapper = await mountCategoryPage();
    const children = pageBlockRoots(wrapper);
    expect(children).toHaveLength(5);
    const [navEl, breadcrumbsEl, headerEl, gridEl, footerEl] = children;

    expect(navEl!.tagName).toBe('HEADER');
    expect(breadcrumbsEl!.querySelector('nav[aria-label]')).not.toBeNull();
    expect(headerEl!.tagName).toBe('HEADER');
    expect(headerEl!.querySelector('h1')).not.toBeNull();
    expect(gridEl!.tagName).toBe('SECTION');
    expect(footerEl!.tagName).toBe('FOOTER');

    // The header and the breadcrumbs are not `Section`s, so they carry no ground at all and never
    // take part in the adjacent-section padding collapse — the same shape the collection page has.
    expect(children.map((el) => el.getAttribute('data-section-bg'))).toEqual([
      null,
      null,
      'none',
      'none',
      'surface-strong',
    ]);
  });

  it('has exactly one h1 — the category title — and one breadcrumb nav', async () => {
    const wrapper = await mountCategoryPage();
    const h1s = wrapper.findAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe(CATEGORY_TITLE);
    expect(wrapper.findAll('nav[aria-label="Breadcrumb"]')).toHaveLength(1);
  });

  /**
   * **Home → the category's ancestors → the category itself**, each ancestor linking to its own
   * canonical path. The seed authors no `trail` levels — a route template cannot, since it renders
   * whatever category its path matched — so every level between Home and the current page is the
   * store's own tree.
   */
  it('builds the trail from the store’s own tree, each level a canonical path', async () => {
    const wrapper = await mountCategoryPage();
    const trail = wrapper.get('nav[aria-label="Breadcrumb"]');
    expect(trail.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/',
      '/categories/home',
    ]);
    expect(trail.text()).toContain('Homeware');
    expect(trail.text()).toContain(CATEGORY_TITLE);
  });

  /**
   * The strip under the title is the current category's **children**, each linking to its own page —
   * and `Ceramics` is a leaf in the demo tree, so there is no strip at all rather than an empty row.
   * The parent's own page is what shows one.
   */
  it('shows a strip of child categories only where the category has children', async () => {
    const leaf = await mountCategoryPage();
    expect(leaf.find('ul[aria-label="Categories in this one"]').exists()).toBe(false);

    const parent = await mountCategoryPage('home');
    const strip = parent.get('ul[aria-label="Categories in this one"]');
    expect(strip.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/categories/home/ceramics',
      '/categories/home/kitchen',
    ]);
    // Never a `current` chip: the open category is the page's own `h1`, and its children are all
    // somewhere else.
    expect(strip.findAll('[aria-current="page"]')).toHaveLength(0);
  });

  /**
   * **The grid lists the category's whole subtree, and its `category` filter group offers that
   * category's children** — the only values that divide the page, because everything in it is
   * already in the category.
   */
  it('lists the category’s own products and offers its children as the category filter', async () => {
    const wrapper = await mountCategoryPage('home');
    const grid = pageBlockRoots(wrapper)[3]!;
    const cards = grid.querySelectorAll('[data-eldra-product-card], article');
    expect(cards.length).toBeGreaterThan(0);

    // **The scope is the subtree, not the catalogue.** Every card on the page is in `Homeware` or
    // under it, so the demo's knitwear — a root category of its own — is nowhere on it, and the
    // count the grid quotes is the subtree's rather than the store's.
    const gridText = grid.textContent ?? '';
    expect(gridText).not.toContain('Merino crew sweater');
    const wholeStore = await mountPage(page, { storefront: createDemoStorefront({}) });
    await flushPromises();
    wrappers.push(wholeStore);
    const unscopedText = pageBlockRoots(wholeStore)[3]!.textContent ?? '';
    const countOf = (text: string) => Number(/(\d+)\s+products/.exec(text)?.[1] ?? '0');
    expect(countOf(gridText)).toBeGreaterThan(0);
    // The unscoped mount has no category at all, so its grid falls back to nothing rather than to
    // the catalogue — the editor hint's own state. Either way it must not quote the subtree's count.
    expect(countOf(unscopedText)).not.toBe(countOf(gridText));

    const legends = Array.from(grid.querySelectorAll('legend')).map((el) => el.textContent);
    expect(legends).toContain('Category');
    const categoryPanel = Array.from(grid.querySelectorAll('fieldset')).find(
      (set) => set.querySelector('legend')?.textContent === 'Category'
    )!;
    const labels = Array.from(categoryPanel.querySelectorAll('label')).map((el) =>
      (el.textContent ?? '').trim()
    );
    // Its two children, and neither the category itself nor the unrelated root.
    expect(labels.some((label) => label.startsWith('Ceramics'))).toBe(true);
    expect(labels.some((label) => label.startsWith('Kitchen'))).toBe(true);
    expect(labels.some((label) => label.startsWith('Homeware'))).toBe(false);
    expect(labels.some((label) => label.startsWith('Knitwear'))).toBe(false);
  });

  it('declares the three landmark regions and lands the skip link after the header', async () => {
    const wrapper = await mountPageWithSkipLink(page, { storefront: categoryStorefront() });
    await flushPromises();
    wrappers.push(wrapper);
    expectPageLandmarks(wrapper);
    expectSkipLinkLandsAfterTheHeader(wrapper);
  });

  it('is axe-clean as a whole page', async () => {
    const wrapper = await mountCategoryPage('home');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  /** Unique ids across every block instance on the page — the page-level gate every sample page
   *  shares (two blocks minting the same id is an `aria-controls` pointing at the wrong element). */
  it('mints unique ids across block instances', async () => {
    const wrapper = await mountCategoryPage('home');
    const ids = Array.from(wrapper.element.querySelectorAll('[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
