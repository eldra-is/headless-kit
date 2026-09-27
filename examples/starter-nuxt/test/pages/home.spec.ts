// @vitest-environment jsdom
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Link } from '@eldrajs/ui';
import { mountPage, type PageFixture } from '../support/mountPage';
import { mountOptions } from '../support/mountBlock';
import { axe } from '../support/axe';
import { pageBlockComponents } from '../../stories/support/pageBlocks';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../server/utils/tablerIcon';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import fixture from '../../pages/home.page.json';

// `pages/home.page.json` is a plain, literal JSON fixture — its block data is never imported from
// `blocks/*/mock.json`/`preview.json` at runtime, only written out once when the fixture was made,
// so a later block change can never silently alter this page. This cast just gives it
// `PageFixture`'s shape for `mountPage`.
const homeFixture = fixture as PageFixture;

const EXPECTED_APIID_ORDER = [
  'announcement-bar',
  'navigation',
  'hero',
  'trust-strip',
  'product-carousel',
  'split-content',
  'testimonials',
  'newsletter',
  'footer',
];

// The page rule (`02-blocks.md` "Sample pages"): a `Section` marks its own ground on
// `data-section-bg` regardless of colour (`@eldrajs/ui`'s `Section.vue`), and the CSS rule that
// drops a repeated ground's top padding keys off two *adjacent* siblings sharing that same value
// (`packages/ui/src/__tests__/sectionAdjacentBackground.spec.ts`) — so this exact sequence is both
// "which ground each block sits on" and "where the padding collapses" (index 4→5 and 5→6, the only
// repeated neighbours, are Product carousel→Split content and Split content→Testimonials).
//
// `navigation` (the header) is `null`, not `'none'`: it is fixed chrome, not a `Section` (spec
// "Header": it must never take part in the adjacent-background collapse rule, so the Hero right
// after it always keeps its own full top padding — see `blocks/navigation/Block.vue`'s own
// comment on `barRootClasses`). Because it carries no `data-section-bg` at all, it can never match
// the Hero's `'none'` even though both sit on the same visual ground.
const EXPECTED_SECTION_BACKGROUNDS = [
  'primary', // announcement-bar
  null, // navigation (header) — not a Section; never collapses the Hero's top padding
  'none', // hero — keeps its own full top padding after the header
  'surface', // trust-strip
  'none', // product-carousel
  'none', // split-content — same ground as product-carousel: top padding collapses
  'none', // testimonials — same ground as split-content: top padding collapses
  'surface', // newsletter
  'surface-strong', // footer
];

// A focusable element by the same rule the package's own components rely on (no positive
// `tabindex` appears anywhere in this starter — see `global-constraints.md` "Focus" — so DOM order
// among these is tab order).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The skip link is `app/app.vue`'s own markup (Nuxt-only, so it is never rendered by `mountPage`,
 * which only renders the `<main id="main">` a real page's `<NuxtPage />` fills) — copied here,
 * verbatim, the same way `stories/pages/home.stories.ts` copies it for the same reason, so the one
 * "skip link is the first focusable element" assertion sees the real combined landmark structure a
 * visitor tabs through on the actual page.
 */
function mountHomeWithSkipLink() {
  const SkipLinkAndPage = defineComponent({
    name: 'SkipLinkAndHomePage',
    setup() {
      const t = useT();
      return () => [
        h(
          Link,
          {
            href: '#main',
            as: EldraRouterLink,
            variant: 'standalone',
            classes: {
              root: 'bg-primary text-primary-contrast rounded-md sr-only px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50',
            },
          },
          () => t('nav.skipToContent')
        ),
        h(
          'main',
          { id: 'main' },
          homeFixture.blocks.map((block) =>
            h(pageBlockComponents[block.apiId]!, {
              key: block.id,
              entry: { id: block.id, data: block.data },
            })
          )
        ),
      ];
    },
  });

  const { global } = mountOptions({ entry: { id: '', data: {} } });
  const stubIconFetcher: IconFetcher = async (name) => tablerIconSvg(name);
  global.provide[ICON_FETCHER_KEY] = stubIconFetcher;
  return mount(SkipLinkAndPage, { global, attachTo: document.body });
}

describe('home page (pages/home.page.json)', () => {
  it('lists the nine blocks in the spec’s order', () => {
    expect(homeFixture.blocks.map((block) => block.apiId)).toEqual(EXPECTED_APIID_ORDER);
  });

  it('renders every block, in order, as a direct sibling inside <main id="main">', async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');
    const roots = [...main.element.children];
    expect(roots).toHaveLength(9);

    // Each root identified by a stable marker that block already emits itself: the section's own
    // `aria-labelledby`/`aria-label` target text (read off the rendered heading, not re-typed), or
    // the landmark tag for header/footer.
    const [
      announcement,
      header,
      hero,
      trustStrip,
      carousel,
      split,
      testimonials,
      newsletter,
      footer,
    ] = roots;

    expect(announcement.tagName).toBe('SECTION');
    expect(announcement.textContent).toContain('Free shipping on orders over $80');

    expect(header.tagName).toBe('HEADER');
    expect(header.querySelector('nav')).not.toBeNull();

    expect(hero.querySelector('h1')?.textContent).toBe('Made slowly, used daily');

    expect(trustStrip.textContent).toContain('Why shop with Northwind');

    expect(carousel.querySelector('h2')?.textContent).toBe('New this season');

    expect(split.getAttribute('aria-label')).toBe('Our story');

    expect(testimonials.querySelector('h2')?.textContent).toBe('Used every day, reviewed honestly');

    expect(newsletter.querySelector('h2')?.textContent).toBe('Letters from the workshop');

    expect(footer.tagName).toBe('FOOTER');

    // Order, not just presence: every marker above appears in this exact document order.
    expect(roots.map((el) => el.getAttribute('data-section-bg'))).toEqual(
      EXPECTED_SECTION_BACKGROUNDS
    );
  });

  it("keeps the hero's full top padding after the header (header takes no part in the adjacent-background collapse rule)", async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');
    const [, header, hero] = [...main.element.children];

    expect(header!.hasAttribute('data-section-bg')).toBe(false);
    expect(header!.hasAttribute('data-section')).toBe(false);
    expect(hero!.getAttribute('data-section-bg')).toBe('none');
  });

  it('applies the page’s own overrides on top of each block’s merged mock + preview data', async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');
    const roots = [...main.element.children];

    // trust-strip `columns` (not `inline`): the per-item body line only renders in `columns`.
    expect(main.text()).toContain('Delivered in 2–4 business days, carbon-neutral.');

    // product-carousel `collection` sourced from the demo storefront's `the-winter-edit` handle
    // (`app/storefront/demo.ts` only seeds `winter-knitwear`/`the-winter-edit` — a `sourceHandle`
    // the demo catalogue doesn't recognise resolves to no products at all, and the whole block
    // renders nothing live, so the fixture points at a real handle rather than a placeholder one):
    // real product cards render, capped at the `limit: "8"` override, and "View all" points at the
    // override href regardless of which collection actually backs the row.
    const carouselRoot = roots[4];
    expect(carouselRoot.querySelectorAll('h3')).toHaveLength(8);
    const viewAllLink = [...main.element.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('View all')
    );
    expect(viewAllLink?.getAttribute('href')).toBe('/collections/new');

    // split-content `startWith: "image-left"`: row 1's image sits on the left (no reorder class),
    // row 2 alternates to the right (`@tablet:order-2`) — the visual side only `startWith` decides.
    const splitRows = roots[5].querySelectorAll('li');
    expect(splitRows).toHaveLength(2);
    expect(splitRows[0]!.children[0]?.className).not.toContain('order-2');
    expect(splitRows[1]!.children[0]?.className).toContain('order-2');

    // testimonials `grid`, first three items only.
    const names = [...roots[6].querySelectorAll('cite')].map((el) => el.textContent);
    expect(names).toEqual(['Hannah Reeve', 'Marcus Bell', 'Priya Nair']);

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

  it('has exactly one main, one header block and one footer block', async () => {
    // The page harness (like `app/pages/[...slug].vue`) renders every block inside `<main>`, where
    // a `<header>`/`<footer>` is not a banner/contentinfo landmark — so this asserts the page
    // structure (one of each, no duplicates), not landmark roles. Rendering the header and footer
    // blocks outside `<main>` is a route-template concern, not a block concern.
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');

    expect(wrapper.findAll('main#main')).toHaveLength(1);
    expect(main.element.querySelectorAll('header')).toHaveLength(1);
    expect(main.element.querySelectorAll('footer')).toHaveLength(1);
  });

  it('puts the skip link first among the page’s focusable elements', () => {
    const wrapper = mountHomeWithSkipLink();
    const focusable = [...wrapper.element.querySelectorAll(FOCUSABLE_SELECTOR)];
    expect(focusable.length).toBeGreaterThan(1);

    const skipLink = wrapper.get('a').element;
    expect(skipLink.textContent).toBe('Skip to content');
    expect(skipLink.getAttribute('href')).toBe('#main');
    expect(focusable[0]).toBe(skipLink);

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

  it('opens the mobile menu as a dialog from the menu button, and Esc returns focus to it', async () => {
    const wrapper = await mountPage(homeFixture, { attachTo: document.body });
    const main = wrapper.get('main#main');

    const menuButton = main.get('button[aria-haspopup="dialog"][aria-controls]');
    menuButton.element.focus();
    await menuButton.trigger('click');

    const dialog = main.get('dialog');
    expect(dialog.attributes('open')).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise((resolve) => setTimeout(resolve));
    await wrapper.vm.$nextTick();

    expect(main.get('dialog').attributes('open')).toBeUndefined();
    expect(document.activeElement).toBe(menuButton.element);

    wrapper.unmount();
  });

  it('resolves every aria-labelledby / aria-describedby / for target, and every id is unique', async () => {
    const wrapper = await mountPage(homeFixture);
    const main = wrapper.get('main#main');

    const ids = new Map<string, number>();
    main.element.querySelectorAll('[id]').forEach((el) => {
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
      main.element.querySelectorAll(`[${attr}]`).forEach((el) => {
        if (attr === 'aria-controls' && el.getAttribute('aria-expanded') === 'false') return;
        for (const id of el.getAttribute(attr)!.split(/\s+/)) {
          if (id && !main.element.querySelector(`#${CSS.escape(id)}`)) {
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

    expect(text).toContain('Portland');
    expect(text).toContain('$80');
    expect(text).toMatch(/30[- ]day/);
    expect(text).toContain('10%');

    expect(text).not.toContain('Leeds');
    expect(text).not.toContain('Bergen');
  });
});
