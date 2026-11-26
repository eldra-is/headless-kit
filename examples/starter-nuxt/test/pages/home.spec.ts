// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  FOCUSABLE_SELECTOR,
  expectPageLandmarks,
  expectSkipLinkLandsAfterTheHeader,
  mountPage,
  mountPageWithSkipLink,
  pageBlockRoots,
  withAuthoredHeaderLink,
  type PageFixture,
} from '../support/mountPage';
import { axe } from '../support/axe';
import fixture from '../../pages/home.page.json';

// `pages/home.page.json` is a plain, literal JSON fixture — its block data is never imported from
// `blocks/*/mock.json`/`preview.json` at runtime, only written out once when the fixture was made,
// so a later block change can never silently alter this page. This cast just gives it
// `PageFixture`'s shape for `mountPage`.
const homeFixture = fixture as PageFixture;

const EXPECTED_APIID_ORDER = [
  'navigation',
  'hero',
  'trust-strip',
  'feature-grid',
  'product-carousel',
  'split-content',
  'article-list',
  'newsletter',
  'footer',
];

// The page rule (`02-blocks.md` "Sample pages"): a `Section` marks its own ground on
// `data-section-bg` regardless of colour (`@eldrajs/ui`'s `Section.vue`), and the CSS rule that
// drops a repeated ground's top padding keys off two *adjacent* siblings sharing that same value
// (`packages/ui/src/__tests__/sectionAdjacentBackground.spec.ts`) — so this exact sequence is both
// "which ground each block sits on" and "where the padding collapses": the hero, the numbered
// promises, the category arches and the new arrivals share the page's own ground, so each one after
// the hero drops its top padding; the makers band on `surface` keeps its own, and the journal and the
// help + newsletter band after it collapse into each other again.
//
// `navigation` (the header) is `null`, not `'none'`: it is fixed chrome, not a `Section` (spec
// "Header": it must never take part in the adjacent-background collapse rule, so the Hero right
// after it always keeps its own full top padding — see `blocks/navigation/Block.vue`'s own
// comment on `barRootClasses`). Because it carries no `data-section-bg` at all, it can never match
// the Hero's `'none'` even though both sit on the same visual ground.
const EXPECTED_SECTION_BACKGROUNDS = [
  null, // navigation (header) — not a Section; never collapses the Hero's top padding
  'none', // hero (card) — keeps its own full top padding after the header
  'none', // trust-strip (numbered)
  'none', // feature-grid (arched categories)
  'none', // product-carousel (new arrivals)
  'surface', // split-content (the makers)
  'none', // article-list (the journal)
  'none', // newsletter (help + sign-up band; the band paints its own panels)
  'primary', // footer
];

describe('home page (pages/home.page.json)', () => {
  it('lists the nine blocks in the spec’s order', () => {
    expect(homeFixture.blocks.map((block) => block.apiId)).toEqual(EXPECTED_APIID_ORDER);
  });

  it('renders every block, in order, across the page’s three landmark regions', async () => {
    const wrapper = await mountPage(homeFixture);
    const roots = pageBlockRoots(wrapper);
    expect(roots).toHaveLength(9);

    // Each root identified by a stable marker that block already emits itself: the section's own
    // `aria-labelledby`/`aria-label` target text (read off the rendered heading, not re-typed), or
    // the landmark tag for header/footer.
    const [header, hero, trustStrip, categories, carousel, split, journal, newsletter, footer] =
      roots;

    expect(header.tagName).toBe('HEADER');
    expect(header.querySelector('[data-eldra-header-focus]')).not.toBeNull();

    expect(hero.querySelector('h1')?.textContent).toBe('Made slowly, used daily');

    expect(trustStrip.textContent).toContain('Why shop with Northwind');

    expect(categories.querySelector('h2')?.textContent).toBe('Shop by category');

    expect(carousel.querySelector('h2')?.textContent).toBe('New arrivals');

    expect(split.getAttribute('aria-label')).toBe('Our story');

    expect(journal.querySelector('h2')?.textContent).toBe('From the journal');

    // The band's two panels: help on the left, the sign-up on the right.
    expect([...newsletter.querySelectorAll('h2')].map((el) => el.textContent)).toEqual([
      'Questions before you buy?',
      'Letters from the workshop',
    ]);

    expect(footer.tagName).toBe('FOOTER');

    // Order, not just presence: every marker above appears in this exact document order.
    expect(roots.map((el) => el.getAttribute('data-section-bg'))).toEqual(
      EXPECTED_SECTION_BACKGROUNDS
    );
  });

  it("keeps the hero's full top padding after the header (header takes no part in the adjacent-background collapse rule)", async () => {
    const wrapper = await mountPage(homeFixture);
    const [header, hero] = pageBlockRoots(wrapper);

    expect(header!.hasAttribute('data-section-bg')).toBe(false);
    expect(header!.hasAttribute('data-section')).toBe(false);
    expect(hero!.getAttribute('data-section-bg')).toBe('none');
  });

  it('applies the page’s own overrides on top of each block’s merged mock + preview data', async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');
    const roots = pageBlockRoots(wrapper);

    // trust-strip `numbered`: each promise's body line renders under its number.
    expect(main.text()).toContain('Every piece comes from one of nine workshops.');

    // product-carousel `collection`, sourced through the seed form of a reference:
    // `sourceCollection: { _type: "collection", slug: "the-winter-edit" }`, the only form a theme
    // can ship (Core resolves the slug against the organisation's own catalog on deploy). The
    // demo storefront resolves a reference by slug as readily as by id, so the fixture renders
    // exactly what a seeded site does. `app/storefront/demo.ts` only seeds
    // `winter-knitwear`/`the-winter-edit` — a slug the demo catalogue doesn't recognise resolves
    // to no products at all and the whole block renders nothing live, so the fixture names a real
    // collection rather than a placeholder. Real product cards render, capped at the `limit: "8"`
    // override.
    const carouselRoot = roots[4];
    expect(carouselRoot.querySelectorAll('h3')).toHaveLength(8);
    // "Just in / New arrivals" is a plain heading with the filter chips beside it, as the design
    // draws it: the fixture sets no `viewAllLabel`, so the heading is not a "view all" link.
    const carouselHeading = carouselRoot.querySelector('h2')!;
    expect(carouselHeading.textContent).toBe('New arrivals');
    expect(carouselHeading.querySelector('a')).toBeNull();
    expect(carouselRoot.querySelector('[aria-pressed]')).not.toBeNull();
    // The slug came out of the reference, not out of a handle field: the fixture carries no
    // `sourceHandle`, and there is no field left that could have supplied it.
    const carouselData = homeFixture.blocks.find((block) => block.apiId === 'product-carousel')!
      .data as Record<string, unknown>;
    expect(carouselData.sourceCollection).toEqual({ _type: 'collection', slug: 'the-winter-edit' });
    expect(Object.hasOwn(carouselData, 'sourceHandle')).toBe(false);

    // split-content: one makers row, its image on the left (`startWith: "image-left"`, no reorder
    // class), and the block-level `list` of three makers under the row's text.
    const splitRows = roots[5].querySelectorAll(':scope ol > li');
    expect(splitRows).toHaveLength(1);
    expect(splitRows[0]!.children[0]?.className).not.toContain('order-2');
    expect(roots[5].textContent).toContain('Harbour Pottery');

    // article-list: the three journal stories the fixture names, each with its "category · reading
    // time" line above the title and no date under it (the stories carry no `publishedAt`).
    expect(roots[6].querySelectorAll('h3')).toHaveLength(3);
    expect(roots[6].textContent).toContain('At home · 4 min read');
    expect(roots[6].querySelector('time')).toBeNull();

    // trust-strip: the three promises are plain titles, none of them a link.
    expect(roots[2].querySelectorAll('a')).toHaveLength(0);

    // footer `showNewsletter: false`: its own newsletter copy never renders.
    expect(roots[8].textContent).not.toContain('New pieces, maker stories');
  });

  it('has exactly one h1, and no heading level is skipped', async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');

    const h1s = main.findAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe('Made slowly, used daily');

    const levels = [...main.element.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el) =>
      Number(el.tagName.slice(1))
    );
    expect(levels[0]).toBe(1);
    let deepestSeen = levels[0]!;
    for (const level of levels.slice(1)) {
      if (level > deepestSeen) {
        expect(level - deepestSeen).toBe(1);
      }
      deepestSeen = Math.max(deepestSeen, level);
    }
  });

  it('exposes exactly one banner, one main and one contentinfo landmark', async () => {
    // `app/pages/[...slug].vue` renders the leading structure blocks before `<main>` and the
    // trailing `footer` after it (`app/utils/pageStructure.ts`), so `navigation`'s `<header>` and
    // `footer`'s `<footer>` are siblings of `<main>` and therefore really are the `banner` and
    // `contentinfo` landmarks — inside `<main>` they would carry no landmark role at all.
    const wrapper = await mountPage(homeFixture);
    expectPageLandmarks(wrapper);
  });

  it('puts the skip link first among the page’s focusable elements, landing after the header', async () => {
    const wrapper = await mountPageWithSkipLink(homeFixture);
    expectSkipLinkLandsAfterTheHeader(wrapper);

    // Concretely, for this page: the header's menu/search/cart controls all come before `#main`.
    const focusable = [...wrapper.element.querySelectorAll(FOCUSABLE_SELECTOR)];
    expect(focusable[0]!.getAttribute('href')).toBe('#main');

    wrapper.unmount();
  });

  it('renders exactly one newsletter sign-up form (the footer’s own is off)', async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');

    // The header's always-rendered (closed) search dialog also has a `<form role="search">` — not
    // a newsletter form, so it is excluded here rather than mistaken for a second sign-up.
    const newsletterForms = main
      .findAll('form')
      .filter((form) => form.attributes('role') !== 'search');
    expect(newsletterForms).toHaveLength(1);
  });

  it('opens the mobile menu under the header from the menu button, and Esc returns focus to it', async () => {
    // `withAuthoredHeaderLink`: the seeded header ships no links and no call to action, so it
    // draws no Menu button and no drawer — see that helper's own comment. The mobile
    // menu is what a header a merchant *has* filled in offers, which is the state under test here.
    const wrapper = await mountPage(withAuthoredHeaderLink(homeFixture), {
      attachTo: document.body,
    });
    // The menu button lives in the header, which is a sibling of `<main>` now — so this reads off
    // the whole page rather than `main`.
    // The menu is the design's inline drawer: a disclosure under the bar, not a dialog.
    const menuButton = wrapper.get('[data-part="toggle"]');
    menuButton.element.focus();
    await menuButton.trigger('click');

    const drawer = wrapper.get(`#${menuButton.attributes('aria-controls')}`);
    expect(menuButton.attributes('aria-expanded')).toBe('true');
    expect((drawer.element as HTMLElement).style.display).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise((resolve) => setTimeout(resolve));
    await wrapper.vm.$nextTick();

    expect(menuButton.attributes('aria-expanded')).toBe('false');
    expect((drawer.element as HTMLElement).style.display).toBe('none');
    expect(document.activeElement).toBe(menuButton.element);

    wrapper.unmount();
  });

  it('resolves every aria-labelledby / aria-describedby / for target, and every id is unique', async () => {
    const wrapper = await mountPage(homeFixture);
    // The whole page, not just `<main>`: the header and footer are siblings of it now, and a
    // duplicate id between the header's search field and a block's own is exactly the kind of
    // collision this guards.
    const page = wrapper.element;

    const ids = new Map<string, number>();
    page.querySelectorAll('[id]').forEach((el) => {
      ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    });
    const duplicates = [...ids.entries()].filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);

    // `aria-controls` on a collapsed disclosure (`aria-expanded="false"`) legitimately names a
    // panel that is not in the DOM yet — `@eldrajs/ui`'s `Select` teleports its listbox only once
    // open (`packages/ui/src/components/select/Select.vue`), which is why axe itself does not
    // require `aria-controls` targets to resolve; every other reference type always must.
    const dangling: string[] = [];
    for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby', 'for']) {
      page.querySelectorAll(`[${attr}]`).forEach((el) => {
        if (attr === 'aria-controls' && el.getAttribute('aria-expanded') === 'false') return;
        for (const id of el.getAttribute(attr)!.split(/\s+/)) {
          if (id && !page.querySelector(`#${CSS.escape(id)}`)) {
            dangling.push(`${attr}="${id}" on <${el.tagName.toLowerCase()}>`);
          }
        }
      });
    }
    expect(dangling).toEqual([]);
  });

  it('has no axe violations over the whole page', async () => {
    const wrapper = await mountPage(homeFixture);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('matches the shared page facts, and only those', async () => {
    const wrapper = await mountPage(homeFixture);
    const text = wrapper.text();

    // The design's home page names the delivery threshold and the returns window; the studio's
    // city and the welcome discount live on other pages (the footer carries no description here).
    expect(text).toContain('$80');
    expect(text).toMatch(/30[- ]day/);

    expect(text).not.toContain('Leeds');
    expect(text).not.toContain('Bergen');
  });
});
