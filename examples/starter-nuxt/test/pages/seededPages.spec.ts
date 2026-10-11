// @vitest-environment jsdom
//
// The seeded **pages** — `/cart`, `/wishlist`, `/search` and `/products` — three of which used to be
// code routes under `app/pages/` and are now page documents Core seeds and a merchant composes
// (`pages/{cart,wishlist,search,products}.page.json`, `app/templates.ts`'s `starterPages()`).
//
// One spec for all three rather than three near-identical files: they are the same page by design —
// announcement bar, the shared header, breadcrumbs, the one block the page exists for, a
// recently-viewed carousel, the shared footer — and what each of them is *for* is the block in the
// middle. The per-page table below is the whole difference.
//
// What this covers that no block spec can: the landmarks a code route never had (it rendered no
// header and no footer at all, which is why these pages exist), that there is exactly one `h1` once
// the fixed block and the breadcrumbs are on the same page, and that the seed built from each
// fixture is the one Core ingests — the fixed block's node `required`, the two regions placed, no
// stray node id.
import { describe, expect, it } from 'vitest';
import { axe } from '../support/axe';
import {
  expectPageLandmarks,
  expectSkipLinkLandsAfterTheHeader,
  mountPage,
  mountPageWithSkipLink,
  pageBlockRoots,
  type PageFixture,
} from '../support/mountPage';
import cartPage from '../../pages/cart.page.json';
import wishlistPage from '../../pages/wishlist.page.json';
import searchPage from '../../pages/search.page.json';
import productsPage from '../../pages/products.page.json';
import { starterPages } from '../../app/templates';

interface SeededPage {
  /** The fixture, the slug it seeds, and the block the page exists for. */
  fixture: PageFixture;
  slug: string;
  title: string;
  fixed: string;
  /** The `h1` the page renders, and which block renders it (`fixed` unless `headingBlock` says). */
  heading: string;
  /**
   * The block between breadcrumbs and the fixed one, for a page that needs it. `/products` is the one
   * such page: its fixed block is `collection-grid`, whose own heading is a visually hidden `h2`
   * naming the list of cards, so the page's `h1` has to come from a `collection-header` above it —
   * exactly as the collection sample page's does.
   */
  above?: string;
  /** Which `apiId` renders the `h1`. Defaults to `fixed`. */
  headingBlock?: string;
}

const PAGES: SeededPage[] = [
  {
    fixture: cartPage as unknown as PageFixture,
    slug: 'cart',
    title: 'Your cart',
    fixed: 'cart',
    heading: 'Your cart',
  },
  {
    fixture: wishlistPage as unknown as PageFixture,
    slug: 'wishlist',
    title: 'Your wishlist',
    fixed: 'wishlist',
    heading: 'Your wishlist',
  },
  {
    fixture: searchPage as unknown as PageFixture,
    slug: 'search',
    title: 'Search',
    fixed: 'search',
    // The idle heading: one prerendered file answers every `?q=`, so the block shows its own
    // title until the query is read out of the URL after hydration.
    heading: 'What are you looking for?',
  },
  {
    fixture: productsPage as unknown as PageFixture,
    slug: 'products',
    title: 'All products',
    fixed: 'collection-grid',
    above: 'collection-header',
    headingBlock: 'collection-header',
    heading: 'All products',
  },
];

function expectedApiIds(page: SeededPage): string[] {
  return [
    'announcement-bar',
    'navigation',
    'breadcrumbs',
    ...(page.above === undefined ? [] : [page.above]),
    page.fixed,
    'product-carousel',
    'footer',
  ];
}

describe.each(PAGES)('the seeded $slug page', (page) => {
  it('lists its blocks in order, with the shared header and footer around them', () => {
    expect(page.fixture.blocks.map((block) => block.apiId)).toEqual(expectedApiIds(page));
    // The fixture declares a page target rather than a template name — which is what makes
    // `starterPages()` pick it up (`app/templates.ts`).
    expect(page.fixture.page).toEqual({ slug: page.slug });
    expect(page.fixture.title).toBe(page.title);
  });

  it('renders the banner, main and contentinfo landmarks a code route never had', async () => {
    const wrapper = await mountPage(page.fixture);
    expectPageLandmarks(wrapper);

    const roots = pageBlockRoots(wrapper);
    expect(roots).toHaveLength(expectedApiIds(page).length);
    expect(roots[1]!.tagName).toBe('HEADER');
    expect(roots.at(-1)!.tagName).toBe('FOOTER');
    // Breadcrumbs stays inside `<main>`: it renders a `<nav>`, a landmark wherever it sits.
    expect(roots[2]!.querySelector('nav[aria-label]')).not.toBeNull();
  });

  it('has exactly one h1, and it is the block that owns the page’s title', async () => {
    const wrapper = await mountPage(page.fixture);
    const headings = wrapper.findAll('h1');

    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toContain(page.heading);
    const index = expectedApiIds(page).indexOf(page.headingBlock ?? page.fixed);
    expect(pageBlockRoots(wrapper)[index]!.contains(headings[0]!.element)).toBe(true);
  });

  it('puts the skip link first, landing the visitor after the header', async () => {
    const wrapper = await mountPageWithSkipLink(page.fixture);
    expectSkipLinkLandsAfterTheHeader(wrapper);
    wrapper.unmount();
  });

  it('has no axe violations over the whole rendered page', async () => {
    const wrapper = await mountPage(page.fixture);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

/**
 * The seed each fixture becomes. The emitted manifest shape is asserted in
 * `test/starter.spec.ts` (it runs the real scanner); what matters here is the half this directory
 * owns — that the fixture and the seed stay the same page, and that the one block the page exists
 * for is the one that cannot be deleted.
 */
describe('the page seeds built from those fixtures', () => {
  it('seeds one page per fixture, in order, with the regions where the fixture has them', () => {
    const seeds = starterPages();

    expect(seeds.map((seed) => seed.page.slug)).toEqual(['cart', 'wishlist', 'search', 'products']);
    for (const [index, seed] of seeds.entries()) {
      const page = PAGES[index]!;
      expect(seed.title).toBe(page.title);
      // The announcement bar precedes the header, exactly as the fixture has it: a region is a
      // placement in the page's own order, not a frame around it.
      expect(
        seed.blocks.map((entry) => ('role' in entry ? `@${entry.role}` : entry.apiId))
      ).toEqual(
        expectedApiIds(page).map((apiId) =>
          apiId === 'navigation' ? '@header' : apiId === 'footer' ? '@footer' : apiId
        )
      );
    }
  });

  it('marks exactly the fixed block required, and nothing else', () => {
    for (const [index, seed] of starterPages().entries()) {
      const required = seed.blocks.filter(
        (entry) => 'required' in entry && entry.required === true
      );
      expect(required).toHaveLength(1);
      expect(required[0]).toMatchObject({ apiId: PAGES[index]!.fixed, required: true });
    }
  });

  it('carries no node ids and no demo imagery into a seed', () => {
    const seeded = JSON.stringify(starterPages());

    // A page seed declares no layout, so an id would have nothing to be referenced from — and
    // Core's ingest refuses a key it does not know.
    expect(seeded).not.toContain('"id"');
    // The same media rule every seed obeys: a value the CMS would refuse never reaches one, so no
    // demo asset id and none of the keys the Storybook fixtures carry beside it. (A `link` value's
    // own `url` is not media and stays — the wishlist's empty-state link is `{kind: "url"}`.)
    expect(seeded).not.toContain('demo-');
    expect(seeded).not.toContain('altText');
  });
});
