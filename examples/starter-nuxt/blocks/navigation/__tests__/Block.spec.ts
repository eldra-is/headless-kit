// @vitest-environment jsdom
import { mount, type DOMWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { Badge } from '@eldrajs/ui';
import { enUS as uiEnUS } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import seed from '../mock.json';
import menuFixture from './fixtures/menu.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { computed, nextTick, ref, type Ref } from 'vue';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type { StorefrontResult, StorefrontSearchResponse } from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';

// `mock.json` is the seed Studio writes when an author inserts the block — media fields
// (`brandLogo`) are absent, and a collection destination is named by handle, because a theme
// cannot know an organisation's catalog ids.
//
// Core rewrites those handles to ids when it seeds the entry, and the site resolves each id to a
// slug and a title before rendering. `resolveTargets` does both here, so a spec can assert the
// hrefs a real page produces; `mock` itself stays the unresolved seed, which is what a header
// looks like the moment it is inserted and nothing has resolved yet.
// The menu and keyboard specs below were written against a five-item bar — Knitwear and Ceramics
// as mega-menus, then Kitchen, Journal and Visit the studio as plain links — and they count
// triggers and walk panels by position. That menu is kept as a fixture (`fixtures/menu.json`, the
// seed's links before the Northwind redesign) so those specs keep measuring `NavMenu`'s behaviour
// rather than whichever demo menu the seed happens to ship; everything else is the real seed, info
// strip included. The redesigned seed's own menu (sections with cards, a badge, a dropdown) has its
// own specs under "the Northwind menu".
const mock = { ...seed, links: menuFixture.links, searchStyle: 'icon' as const };

const COLLECTION_TEMPLATE = {
  id: 'rt-collection',
  data: {
    schemaApiId: 'catalog:collection',
    routePattern: '/collections/:slug',
    slugField: 'slug',
  },
};

interface SeedTarget {
  _type: string;
  slug?: string;
  id?: string;
}
interface SeedSection {
  heading?: string;
  links?: SeedLink[];
  seeAll?: SeedLink;
  headingLink?: SeedLink;
}
interface SeedLink {
  sections?: SeedSection[];
  kind: string;
  target?: SeedTarget;
  url?: string;
  label?: string;
  group?: string;
  children?: SeedLink[];
}

function resolveTargets<T extends Record<string, unknown>>(
  data: T
): {
  data: T;
  links: { templates: (typeof COLLECTION_TEMPLATE)[]; targets: Map<string, unknown> };
} {
  const targets = new Map<string, unknown>();
  const rewrite = (link: SeedLink): SeedLink => {
    const slug = link.target?.slug;
    const nested = {
      ...(link.children ? { children: link.children.map(rewrite) } : {}),
      ...(link.sections
        ? {
            sections: link.sections.map((section) => ({
              ...section,
              ...(section.links ? { links: section.links.map(rewrite) } : {}),
              ...(section.seeAll ? { seeAll: rewrite(section.seeAll) } : {}),
            })),
          }
        : {}),
    };
    if (link.target === undefined || slug === undefined) return { ...link, ...nested };
    const id = `id-${slug}`;
    targets.set(`${link.target._type}:${id}`, { slug, title: link.label });
    return { ...link, target: { _type: link.target._type, id }, ...nested };
  };
  const next = { ...data } as Record<string, unknown>;
  if (Array.isArray(next.links)) next.links = (next.links as SeedLink[]).map(rewrite);
  if (next.cta !== undefined) next.cta = rewrite(next.cta as SeedLink);
  return { data: next as T, links: { templates: [COLLECTION_TEMPLATE], targets } };
}

const resolved = resolveTargets(mock);

/** The injected fetcher still resolves through a promise; flush one microtask/macrotask turn
 *  before asserting on icon markup — the same wait `trust-strip`'s/`team`'s own specs use. */
async function flushIcons(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

/**
 * jsdom implements the `:focus-visible` syntax but never matches it — not even for a real
 * `.focus()` call — so it cannot tell a keyboard focus from a pointer one on its own. The sticky
 * bar's focus specs need that distinction, so they patch `Element.prototype.matches` to answer
 * deterministically for just that selector and restore the original afterwards.
 */
function stubFocusVisible(matches: boolean): () => void {
  const original = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selector: string): boolean {
    return selector === ':focus-visible' ? matches : original.call(this, selector);
  };
  return () => {
    Element.prototype.matches = original;
  };
}

/** The labelled Search tool: named by its visible label, so it carries no `aria-label` to find it by. */
function findSearchTool(wrapper: { findAll: (selector: string) => DOMWrapper<Element>[] }) {
  return wrapper.findAll('button').find((button) => button.text().trim() === 'Search');
}
function searchTool(wrapper: { findAll: (selector: string) => DOMWrapper<Element>[] }) {
  const button = findSearchTool(wrapper);
  if (button === undefined) throw new Error('no Search tool in the bar');
  return button;
}

function mountBlock(data: Record<string, unknown>, opts?: { attachTo?: Element }) {
  const base = mountOptions({ entry: { id: 'e1', data } }, { links: resolved.links });
  return mount(Block, {
    ...base,
    ...opts,
  });
}

/** Overrides the Eldra preview context's `active`/`mode` — the same shape `useEditing.spec.ts`
 *  builds directly, since `mountOptions()` always provides a read-only, inactive preview. */
function mountWithEditing(data: Record<string, unknown>, editing: boolean) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  return mount(Block, {
    ...base,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [ELDRA_KEY]: {
          client: {},
          designTokens: { colors: {} },
          links: resolved.links,
          preview: Object.assign(createEldraPreviewState(), {
            active: editing,
            mode: editing ? 'edit' : 'preview',
          }),
        },
      },
    },
  });
}

/** A demo storefront whose cart reports a fixed `count`, so the three "Cart, …" phrasings and the
 *  99+ ceiling can each be exercised without driving the real cart store through `add()`. */
function mountWithCartCount(data: Record<string, unknown>, count: number) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const storefront = createDemoStorefront();
  const cart = { ...storefront.cart, count: computed(() => count) };
  return mount(Block, {
    ...base,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [STOREFRONT_KEY]: { ...storefront, cart },
      },
    },
  });
}

/** The header as it renders on a live page: a storefront whose drawer is mounted and live, which is
 *  exactly what `blocks/cart/Block.vue` reports from `onMounted` once `app/app.vue` has hosted one. */
function mountWithDrawer(data: Record<string, unknown>, opts: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const storefront = createDemoStorefront();
  storefront.cart.drawerAvailable.value = true;
  const provide: Record<symbol, unknown> = {
    ...base.global.provide,
    [STOREFRONT_KEY]: storefront,
  };
  if (opts.editing === true) {
    provide[ELDRA_KEY] = {
      client: {},
      designTokens: { colors: {} },
      links: resolved.links,
      preview: Object.assign(createEldraPreviewState(), { active: true, mode: 'edit' }),
    };
  }
  const wrapper = mount(Block, { ...base, global: { ...base.global, provide } });
  return { wrapper, storefront };
}

/**
 * The count pill drawn over one control's own corner — the `<Badge>` that is its sibling inside the
 * `relative inline-flex` span the actions row wraps each of them in. `null` when that control has
 * no pill.
 *
 * Scoped to the control rather than found with `wrapper.findComponent(Badge)`, which answers the
 * *first* badge in the tree: there are two pills in the actions row now (the wishlist heart's comes
 * before the bag's), so a global lookup silently asserts the wrong element the moment a spec has
 * something saved as well as something in the cart.
 */
/** The bag, in whichever form it rendered: an `<a href="/cart">` while no drawer is mounted, a
 *  `<button>` once one is. Module level because both the cart and the wishlist specs need it. */
function findCartButtonIn(wrapper: ReturnType<typeof mountBlock>): DOMWrapper<Element> | undefined {
  return wrapper
    .findAll('a, button')
    .find((control) => control.attributes('aria-label')?.startsWith('Cart'));
}

function countPill(control: DOMWrapper<Element>): Element | null {
  const siblings = Array.from(control.element.parentElement?.children ?? []);
  return siblings.find((element) => element !== control.element) ?? null;
}

/** A mouse pointer entering or leaving an element; `NavMenu` ignores touch and pen. */
function mouse(target: Element, type: 'pointerenter' | 'pointerleave'): void {
  target.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse' }));
}

/** `NavMenu`'s root, the Menu button's parent: the element a pointer leaves when it leaves the menu. */
function menuRoot(wrapper: { get: (selector: string) => DOMWrapper<Element> }): Element {
  return wrapper.get('[data-part="toggle"]').element.parentElement!;
}

describe('header block (navigation apiId)', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
    // The wishlist heart reads `localStorage`, which jsdom keeps for the whole file. Hygiene only:
    // every pill assertion is scoped to its own control (`countPill`), so a list left behind can no
    // longer be mistaken for the bag's count.
    localStorage.clear();
  });

  it('renders the bare mock.json content — the freshly-inserted state, no images, axe-clean', async () => {
    // Nothing is resolved yet: every label shows, and every catalog destination is still a handle
    // the site has not turned into a path, so the rows are plain text and the call to action —
    // which is a button or nothing, never a button to nowhere — is not drawn at all.
    const wrapper = mountBlock(mock);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain(mock.brandText);
    for (const link of mock.links) expect(wrapper.text()).toContain(link.label);
    expect(wrapper.text()).not.toContain(mock.ctaLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('draws the call to action once its destination resolves', async () => {
    const wrapper = mountBlock(resolved.data);
    const cta = wrapper.findAll('a').find((a) => a.text() === mock.ctaLabel)!;
    expect(cta.attributes('href')).toBe('/collections/gifts');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders a resolved collection row as /collections/<slug>, axe-clean', async () => {
    const wrapper = mountBlock(resolved.data, { attachTo: document.body });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    const kitchen = wrapper.findAll('a').find((a) => a.text() === 'Kitchen')!;
    expect(kitchen.attributes('href')).toBe('/collections/kitchen');
    // A row with no catalog target at all still renders its own URL.
    const journal = wrapper.findAll('a').find((a) => a.text() === 'Journal')!;
    expect(journal.attributes('href')).toBe('/journal');
    wrapper.unmount();
  });

  it('renders a row whose target no longer exists as plain text, never a dead anchor', async () => {
    // The site resolved nothing for this target — deleted, unpublished, or a kind the theme has no
    // route for. The label is still worth showing; an anchor to nowhere is not.
    const wrapper = mountBlock({
      ...resolved.data,
      links: [
        { kind: 'collection', target: { _type: 'collection', id: 'id-gone' }, label: 'Gone' },
      ],
    });
    expect(wrapper.text()).toContain('Gone');
    expect(wrapper.findAll('a').some((a) => a.text() === 'Gone')).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders nothing at all for a row with no label', async () => {
    const wrapper = mountBlock({
      ...resolved.data,
      links: [
        { kind: 'url', url: '/journal' },
        { kind: 'url', url: '/pages/visit', label: 'Visit' },
      ],
    });
    const rows = wrapper.findAll('[data-part="item"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toBe('Visit');
  });

  it('renders a row with children as a mega-menu disclosure', async () => {
    const wrapper = mountBlock(resolved.data, { attachTo: document.body });
    const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
    expect(knitwear.attributes('aria-expanded')).toBe('false');
    await knitwear.trigger('click');
    const panel = wrapper.get(`#${knitwear.attributes('aria-controls')}`);
    expect(panel.text()).toContain('Women');
    const sweaters = panel.findAll('a').find((a) => a.text() === 'Sweaters')!;
    expect(sweaters.attributes('href')).toBe('/collections/womens-sweaters');
    wrapper.unmount();
  });

  it('draws a menu card with its picture at the declared aspect, its title and its price, axe-clean', async () => {
    const targets = new Map(resolved.links.targets);
    targets.set('product:p-1', {
      slug: 'ash-mug',
      title: 'Ash glaze mug',
      image: 'https://media.test/mug-md.jpg',
      price: 28,
    });
    targets.set('collection:c-1', {
      slug: 'winter-knits',
      title: 'Winter knits',
      image: 'https://media.test/winter-md.jpg',
    });
    const wrapper = mount(Block, {
      ...mountOptions(
        {
          entry: {
            id: 'e1',
            data: {
              ...resolved.data,
              links: [
                {
                  kind: 'none',
                  label: 'Shop',
                  sections: [
                    {
                      heading: 'Featured',
                      display: 'card',
                      links: [
                        { kind: 'product', target: { _type: 'product', id: 'p-1' } },
                        { kind: 'collection', target: { _type: 'collection', id: 'c-1' } },
                      ],
                    },
                    {
                      heading: 'Care',
                      links: [{ kind: 'url', url: '/care', label: 'Care guides' }],
                    },
                  ],
                },
              ],
            },
          },
        },
        { links: { ...resolved.links, targets } }
      ),
      attachTo: document.body,
    });
    const trigger = wrapper.findAll('button').find((b) => b.text().includes('Shop'))!;
    await trigger.trigger('click');
    const panel = wrapper.get(`#${trigger.attributes('aria-controls')}`);
    const cards = panel.findAll('[data-part="card"]');
    expect(cards).toHaveLength(2);
    const image = cards[0]!.get('img');
    expect(image.attributes('src')).toBe('https://media.test/mug-md.jpg');
    expect((image.element as HTMLImageElement).style.aspectRatio).toBe('4 / 5');
    expect(cards[0]!.get('[data-part="cardTitle"]').text()).toBe('Ash glaze mug');
    expect(cards[0]!.get('[data-part="cardPrice"]').text()).toMatch(/28/);
    expect(cards[1]!.get('img').attributes('src')).toBe('https://media.test/winter-md.jpg');
    expect(cards[1]!.find('[data-part="cardPrice"]').exists()).toBe(false);
    // The cards column is the wide one; the link column is one track.
    const columns = panel.findAll('[data-part="group"]');
    expect(columns[0]!.attributes('data-cards')).toBeDefined();
    expect(columns[0]!.classes()).toContain('[[data-cards]>&[data-cards]]:col-span-2');
    expect(columns[1]!.attributes('data-cards')).toBeUndefined();
    // A plain link beside the cards is still a link.
    expect(panel.findAll('a').some((a) => a.text() === 'Care guides')).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders a heading-only mega-menu parent as a disclosure with no destination', async () => {
    // `kind: "none"`: the trigger has a label and children and goes nowhere,
    // which is what a mega-menu parent without its own page is.
    const wrapper = mountBlock(
      {
        ...resolved.data,
        links: [
          {
            kind: 'none',
            label: 'Workshop',
            children: [{ kind: 'url', url: '/journal', label: 'Journal' }],
          },
        ],
      },
      { attachTo: document.body }
    );
    const trigger = wrapper.findAll('button').find((b) => b.text().includes('Workshop'))!;
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('a').some((a) => a.text() === 'Workshop')).toBe(false);
    await trigger.trigger('click');
    const panel = wrapper.get(`#${trigger.attributes('aria-controls')}`);
    expect(
      panel
        .findAll('a')
        .find((a) => a.text() === 'Journal')!
        .attributes('href')
    ).toBe('/journal');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders each declared variant with the resolved content, axe-clean', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mountBlock({ ...resolved.data, variant });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  });

  it('has no h1 anywhere in the header (block headings are never h1)', () => {
    const wrapper = mountBlock(resolved.data);
    expect(wrapper.find('h1').exists()).toBe(false);
  });

  it('labels the primary navigation landmark', () => {
    // One landmark in the bar; the drawer's copy stays out of the page inside the closed `<dialog>`.
    const wrapper = mountBlock(resolved.data);
    const navs = wrapper.findAll('nav[aria-label="Primary navigation"]');
    expect(navs.filter((nav) => nav.element.closest('dialog') === null)).toHaveLength(1);
    for (const nav of navs.filter((nav) => nav.element.closest('dialog') !== null)) {
      expect((nav.element.closest('dialog') as HTMLDialogElement).open).toBe(false);
    }
  });

  it('establishes its own @container context on the root, so @tablet:/@content: classes measure the block’s own width', () => {
    // The block root — a plain `<header>`, not `@eldrajs/ui`'s `Section` (see `barRootClasses`'s
    // own comment: the header must never emit `data-section-bg` and take part in the
    // adjacent-background padding-collapse rule) — carries `@container` itself. `Container` does
    // not establish one of its own. Losing this silently strands every `@tablet:`/`@content:` class
    // at its mobile value regardless of the block's real width (the footer review's own
    // regression: it shipped its mobile layout at 1280px).
    const wrapper = mountBlock(resolved.data);
    expect(wrapper.get('header').classes()).toContain('@container');
  });

  it('never emits data-section/data-section-bg (it is not a Section, so a following Hero keeps its own top padding)', () => {
    const wrapper = mountBlock(resolved.data);
    const header = wrapper.get('header').element;
    expect(header.hasAttribute('data-section')).toBe(false);
    expect(header.hasAttribute('data-section-bg')).toBe(false);
  });

  it('marks the brand link as the header’s announced focus target for announcement-bar dismissal', () => {
    // Cross-block contract (the announcement-bar block): after dismissing itself, it moves focus to
    // `[data-eldra-header-focus]` in the header, falling back to `#main`. The brand link is the
    // first focusable element in DOM order ahead of the primary links list.
    const wrapper = mountBlock(resolved.data);
    const marked = wrapper.get('[data-eldra-header-focus]');
    expect(marked.element.tagName).toBe('A');
    expect(marked.attributes('href')).toBe('/');
    // It's the brand — ahead of every nav link in DOM order.
    const allFocusTargets = wrapper.findAll('a, button');
    expect(allFocusTargets.findIndex((el) => el.element === marked.element)).toBeLessThan(
      allFocusTargets.findIndex((el) => el.text() === mock.links[0]!.label)
    );
  });

  describe('mega-menu keyboard', () => {
    // Enter/Space are a native button's click, which jsdom never synthesises; `@eldrajs/ui`'s browser spec presses them.
    it('a trigger toggles on activation; hover alone never opens it; opening one closes the other', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      // Locate the two mega-menu triggers by their accessible label text.
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      const ceramics = wrapper.findAll('button').find((b) => b.text().includes('Ceramics'))!;

      expect(knitwear.attributes('aria-expanded')).toBe('false');
      mouse(knitwear.element, 'pointerenter');
      await nextTick();
      expect(knitwear.attributes('aria-expanded')).toBe('false'); // nothing opens on hover alone (no wait)
      mouse(knitwear.element, 'pointerleave');

      await knitwear.trigger('click');
      expect(knitwear.attributes('aria-expanded')).toBe('true');

      // Opening the other one closes the first.
      await ceramics.trigger('click');
      expect(ceramics.attributes('aria-expanded')).toBe('true');
      expect(knitwear.attributes('aria-expanded')).toBe('false');

      // Toggling the same trigger again closes it.
      await ceramics.trigger('click');
      expect(ceramics.attributes('aria-expanded')).toBe('false');

      wrapper.unmount();
    });

    it('hover opens a panel after 150ms, leaving it closes it after 150ms, and a click-opened panel stays', async () => {
      vi.useFakeTimers();
      try {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
        const panel = () => wrapper.find(`#${knitwear.attributes('aria-controls')}`);

        mouse(knitwear.element, 'pointerenter');
        vi.advanceTimersByTime(160);
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('true');

        // Trigger to panel never leaves the menu; straying out and back within the grace keeps it open.
        mouse(knitwear.element, 'pointerleave');
        mouse(menuRoot(wrapper), 'pointerleave');
        vi.advanceTimersByTime(100);
        mouse(menuRoot(wrapper), 'pointerenter');
        vi.advanceTimersByTime(300);
        await nextTick();
        expect(panel().isVisible()).toBe(true);
        expect(knitwear.attributes('aria-expanded')).toBe('true');

        // Leaving the menu closes what hover opened.
        mouse(menuRoot(wrapper), 'pointerleave');
        vi.advanceTimersByTime(160);
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('false');

        // A panel opened by a click is not hover-owned: the pointer leaving does not close it.
        await knitwear.trigger('click');
        expect(knitwear.attributes('aria-expanded')).toBe('true');
        mouse(knitwear.element, 'pointerenter');
        mouse(menuRoot(wrapper), 'pointerleave');
        vi.advanceTimersByTime(300);
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('true');

        wrapper.unmount();
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * The bar travels against the viewport, not against the box it is rendered in. A `sticky` bar
     * is clamped to its containing block, and a block's containing block is the single-block
     * wrapper the block zone (or a layout node) renders around it — a box exactly the bar's own
     * height, which leaves a sticky bar nowhere to go: it sits at the top of the page, scrolls out
     * of view with it and never comes back, however this state machine sets its classes. So the bar
     * is `fixed`, and the spacer below it holds the flow the bar left.
     */
    it('positions the sticky bar against the viewport and reserves its height in the flow', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const header = wrapper.get('header');
      expect(header.classes()).toContain('fixed');
      expect(header.classes()).toContain('inset-x-0');
      expect(header.classes()).toContain('top-0');
      expect(header.classes()).not.toContain('sticky');

      const spacer = wrapper.get('[data-eldra-header-spacer]');
      expect(spacer.attributes('aria-hidden')).toBe('true');
      expect(spacer.text()).toBe('');
      // The bar's own height, and the 1px its bottom hairline adds, reserved to the pixel: the
      // spacer mirrors the bar's own two boxes, the hairline and the `@container` on the outer one
      // (as on the `<header>`) and the height on the inner (as on the `<nav>`).
      expect(spacer.classes()).toContain('@container');
      expect(spacer.classes()).toContain('border-b');
      expect(spacer.classes()).toContain('border-transparent');
      // The info strip's box first (the seed has one), then the bar's. The strip mirrors its own
      // two boxes too: the hairline on the outer, the height on the inner, so the border adds to
      // the height (36px + 1px) rather than eating into it (`border-box`).
      const [strip, reserved] = spacer.findAll(':scope > div');
      const info = wrapper.get('[data-eldra-header-info]');
      expect(info.classes()).toContain('border-b');
      expect(strip!.classes()).toContain('border-b');
      expect(strip!.classes()).not.toContain('min-h-9');
      expect(info.get(':scope > div').classes()).toContain('min-h-9');
      expect(strip!.get(':scope > div').classes()).toContain('min-h-9');
      const bar = wrapper.get('[data-eldra-header-bar]');
      for (const height of ['min-h-[4.5rem]', '@max-[47.5625rem]:min-h-[3.75rem]']) {
        expect(bar.classes()).toContain(height);
        expect(reserved!.classes()).toContain(height);
      }

      wrapper.unmount();
    });

    it('reserves nothing for a non-sticky bar: it occupies its own space in the flow', () => {
      const wrapper = mountBlock({ ...resolved.data, sticky: false }, { attachTo: document.body });
      expect(wrapper.find('[data-eldra-header-spacer]').exists()).toBe(false);
      expect(wrapper.get('header').classes()).not.toContain('fixed');
      wrapper.unmount();
    });

    it('a sticky bar hides on scroll-down, returns on scroll-up or at the top, and never hides while in use', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const header = wrapper.get('header');
      Object.defineProperty(header.element, 'offsetHeight', { value: 72, configurable: true });
      const scrollTo = async (y: number) => {
        Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
        window.dispatchEvent(new Event('scroll'));
        await nextTick();
      };

      expect(header.classes()).not.toContain('-translate-y-full');
      await scrollTo(40); // still within the bar's own height: never hides
      expect(header.classes()).not.toContain('-translate-y-full');
      await scrollTo(300); // down past the bar: hides
      expect(header.classes()).toContain('-translate-y-full');
      expect(header.classes()).toContain('shadow-float');
      await scrollTo(302); // a 2px jitter changes nothing
      expect(header.classes()).toContain('-translate-y-full');
      await scrollTo(250); // up: returns
      expect(header.classes()).not.toContain('-translate-y-full');
      await scrollTo(600);
      expect(header.classes()).toContain('-translate-y-full');
      await scrollTo(0); // at the top: shown, no shadow
      expect(header.classes()).not.toContain('-translate-y-full');
      expect(header.classes()).not.toContain('shadow-float');

      // In use: an open mega-menu keeps the bar on screen through a scroll-down …
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      await scrollTo(900);
      expect(header.classes()).not.toContain('-translate-y-full');
      await knitwear.trigger('keydown', { key: 'Escape' });
      await nextTick();
      // Keyboard focus inside the bar keeps it shown too — the dedicated `:focus-visible` specs
      // below cover that (and the mouse-click case that must *not* pin it open).

      await scrollTo(0);
      wrapper.unmount();
    });

    it('a mouse click that focuses the bag does not pin a scrolled-away bar open', async () => {
      // A plain click focuses the clicked control, but never matches `:focus-visible` — the
      // distinction `focusWithinBar` now keys off so the header can hide again after the cart
      // drawer (or search dialog) returns focus to the button that opened it. jsdom's own
      // `:focus-visible` already evaluates to `false` here even for a real `.focus()` call, so
      // this stub only makes that assumption explicit rather than relying on an engine quirk.
      const restore = stubFocusVisible(false);
      try {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const header = wrapper.get('header');
        Object.defineProperty(header.element, 'offsetHeight', { value: 72, configurable: true });
        const scrollTo = async (y: number) => {
          Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
          window.dispatchEvent(new Event('scroll'));
          await nextTick();
        };
        const bag = wrapper
          .findAll('a, button')
          .find((el) => el.attributes('aria-label')?.startsWith('Cart'))!;

        await bag.trigger('focusin');
        await scrollTo(300);
        expect(header.classes()).toContain('-translate-y-full');

        await scrollTo(0);
        wrapper.unmount();
      } finally {
        restore();
      }
    });

    it('keyboard focus-visible on a bar control keeps a scrolled-away bar on screen', async () => {
      // jsdom never matches `:focus-visible`, even right after a real `.focus()` call, so it
      // cannot tell this case apart from the click above on its own; stub it to prove the keyboard
      // side of the same rule.
      const restore = stubFocusVisible(true);
      try {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const header = wrapper.get('header');
        Object.defineProperty(header.element, 'offsetHeight', { value: 72, configurable: true });
        const scrollTo = async (y: number) => {
          Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
          window.dispatchEvent(new Event('scroll'));
          await nextTick();
        };
        const searchButton = searchTool(wrapper);

        await searchButton.trigger('focusin');
        await scrollTo(300);
        expect(header.classes()).not.toContain('-translate-y-full');

        await searchButton.trigger('focusout', { relatedTarget: document.body });
        await scrollTo(600);
        expect(header.classes()).toContain('-translate-y-full');

        await scrollTo(0);
        wrapper.unmount();
      } finally {
        restore();
      }
    });

    it('a non-sticky bar scrolls away with the page and never hides itself', async () => {
      const wrapper = mountBlock({ ...resolved.data, sticky: false }, { attachTo: document.body });
      const header = wrapper.get('header');
      Object.defineProperty(window, 'scrollY', { value: 800, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      await nextTick();
      expect(header.classes()).not.toContain('sticky');
      expect(header.classes()).not.toContain('fixed');
      expect(header.classes()).not.toContain('-translate-y-full');
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      wrapper.unmount();
    });

    it('Esc on the trigger closes the panel and returns focus to the trigger', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      expect(knitwear.attributes('aria-expanded')).toBe('true');

      knitwear.element.focus();
      await knitwear.trigger('keydown', { key: 'Escape' });
      await wrapper.vm.$nextTick();

      expect(knitwear.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(knitwear.element);
      wrapper.unmount();
    });

    it('Esc from inside the panel closes it and returns focus to the trigger', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      const panelId = knitwear.attributes('aria-controls')!;
      const panel = wrapper.get(`#${panelId}`);
      const firstLinkInPanel = panel.findAll('a')[0]!;

      firstLinkInPanel.element.focus();
      await firstLinkInPanel.trigger('keydown', { key: 'Escape' });
      await wrapper.vm.$nextTick();

      expect(knitwear.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(knitwear.element);
      wrapper.unmount();
    });

    /**
     * The WAI-ARIA APG "Disclosure Navigation Menu" pattern with its arrow-key extension. There is
     * no `role="menu"` and no `aria-activedescendant`: focus is real focus on the real links, so
     * every assertion here reads `document.activeElement` — which is only meaningful with the
     * wrapper attached to the document, as every spec in this describe does.
     *
     * The mock's bar is Knitwear (mega-menu), Ceramics (mega-menu), Kitchen, Journal and Visit the
     * studio (plain links), which is exactly the mix the keys have to cope with.
     */
    describe('arrow keys', () => {
      type Wrapper = ReturnType<typeof mountBlock>;
      const triggerFor = (wrapper: Wrapper, label: string): DOMWrapper<HTMLElement> =>
        wrapper
          .findAll('button')
          .find((button) => button.text().includes(label))! as DOMWrapper<HTMLElement>;
      const panelFor = (wrapper: Wrapper, trigger: DOMWrapper<HTMLElement>): DOMWrapper<Element> =>
        wrapper.get(`#${trigger.attributes('aria-controls')}`);
      const panelLinks = (wrapper: Wrapper, trigger: DOMWrapper<HTMLElement>) =>
        panelFor(wrapper, trigger).findAll('a');
      /** The bar's own top-level items, in bar order: the first element of each `<li>`. */
      const topLevel = (trigger: DOMWrapper<HTMLElement>): Element[] =>
        Array.from(trigger.element.closest('ul')!.children).map((li) => li.firstElementChild!);

      it('ArrowDown on a trigger opens its panel and moves focus to the first link', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        knitwear.element.focus();

        await knitwear.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();

        expect(knitwear.attributes('aria-expanded')).toBe('true');
        const links = panelLinks(wrapper, knitwear);
        expect(document.activeElement).toBe(links[0]!.element);
        // A panel a visitor has arrowed into is still a clean one.
        expect(await axe(wrapper.element)).toHaveNoViolations();
        wrapper.unmount();
      });

      it('ArrowUp on a trigger opens its panel and moves focus to the last link', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        knitwear.element.focus();

        await knitwear.trigger('keydown', { key: 'ArrowUp' });
        await nextTick();

        expect(knitwear.attributes('aria-expanded')).toBe('true');
        const links = panelLinks(wrapper, knitwear);
        // The panel's own reading order ends on the "View all" row.
        expect(links[links.length - 1]!.attributes('data-eldra-mega-view-all')).toBe('');
        expect(document.activeElement).toBe(links[links.length - 1]!.element);
        wrapper.unmount();
      });

      it('ArrowDown and ArrowUp walk the panel in reading order and clamp at both ends', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        await knitwear.trigger('click');
        const links = panelLinks(wrapper, knitwear);
        expect(links.length).toBeGreaterThan(2);

        links[0]!.element.focus();
        await links[0]!.trigger('keydown', { key: 'ArrowDown' });
        expect(document.activeElement).toBe(links[1]!.element);

        await links[1]!.trigger('keydown', { key: 'ArrowUp' });
        expect(document.activeElement).toBe(links[0]!.element);

        // Clamped, never wrapped: the first link keeps focus instead of jumping to the last.
        await links[0]!.trigger('keydown', { key: 'ArrowUp' });
        expect(document.activeElement).toBe(links[0]!.element);

        const last = links[links.length - 1]!;
        last.element.focus();
        await last.trigger('keydown', { key: 'ArrowDown' });
        expect(document.activeElement).toBe(last.element);
        expect(knitwear.attributes('aria-expanded')).toBe('true');
        wrapper.unmount();
      });

      it('ArrowUp with focus not on a panel link enters at the last link, mirroring ArrowDown', async () => {
        // Nothing in a panel but its links is focusable today, so this is the deliberate shape of an
        // edge rather than a path a visitor can walk: Down enters at the first row, so Up enters at
        // the last instead of clamping to the first.
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        await knitwear.trigger('click');
        const links = panelLinks(wrapper, knitwear);
        wrapper.get('a[data-eldra-header-focus]').element.focus();

        await panelFor(wrapper, knitwear).trigger('keydown', { key: 'ArrowUp' });
        await nextTick();
        expect(document.activeElement).toBe(links[links.length - 1]!.element);
        wrapper.unmount();
      });

      it('Home and End inside a panel jump to its first and last link', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        await knitwear.trigger('click');
        const links = panelLinks(wrapper, knitwear);

        links[2]!.element.focus();
        await links[2]!.trigger('keydown', { key: 'End' });
        await nextTick();
        expect(document.activeElement).toBe(links[links.length - 1]!.element);

        await links[links.length - 1]!.trigger('keydown', { key: 'Home' });
        await nextTick();
        expect(document.activeElement).toBe(links[0]!.element);
        wrapper.unmount();
      });

      it('Home and End on a trigger move to the first and last top-level item', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const ceramics = triggerFor(wrapper, 'Ceramics');
        const items = topLevel(ceramics);
        expect(items).toHaveLength(5);
        expect(items[items.length - 1]!.textContent).toContain('Visit the studio');

        ceramics.element.focus();
        await ceramics.trigger('keydown', { key: 'End' });
        await nextTick();
        expect(document.activeElement).toBe(items[items.length - 1]);

        await wrapper
          .findAll('a')
          .find((link) => link.element === items[items.length - 1])!
          .trigger('keydown', { key: 'Home' });
        await nextTick();
        expect(document.activeElement).toBe(items[0]);
        wrapper.unmount();
      });

      it('ArrowRight along the bar carries an open panel onto the next trigger', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        const ceramics = triggerFor(wrapper, 'Ceramics');
        await knitwear.trigger('click');
        knitwear.element.focus();

        await knitwear.trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(document.activeElement).toBe(ceramics.element);
        expect(ceramics.attributes('aria-expanded')).toBe('true');
        expect(knitwear.attributes('aria-expanded')).toBe('false');

        // With nothing open, the same key is a plain focus move: no panel opens behind it.
        await ceramics.trigger('keydown', { key: 'Escape' });
        await nextTick();
        await ceramics.trigger('keydown', { key: 'ArrowLeft' });
        await nextTick();
        expect(document.activeElement).toBe(knitwear.element);
        expect(knitwear.attributes('aria-expanded')).toBe('false');
        wrapper.unmount();
      });

      it('ArrowRight from inside a panel lands on the next item itself, panel open', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        const ceramics = triggerFor(wrapper, 'Ceramics');
        const items = topLevel(knitwear);
        await knitwear.trigger('click');
        const first = panelLinks(wrapper, knitwear)[0]!;
        first.element.focus();

        // "Moves focus to the next button and expands its dropdown": the trigger itself takes
        // focus, not a row inside the panel that just opened — ArrowDown is what enters that.
        await first.trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('false');
        expect(ceramics.attributes('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(ceramics.element);

        await ceramics.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        expect(document.activeElement).toBe(panelLinks(wrapper, ceramics)[0]!.element);

        // Kitchen has no groups, so it is an ordinary link: it takes focus and the panel closes
        // behind it rather than one opening that does not exist.
        await panelLinks(wrapper, ceramics)[0]!.trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(ceramics.attributes('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(items[2]);

        // And the travel keys work on from a plain link, so the row is never a one-way street.
        await wrapper
          .findAll('a')
          .find((link) => link.element === items[2])!
          .trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(document.activeElement).toBe(items[3]);
        wrapper.unmount();
      });

      it('lands on the trigger of a panel with no focusable row rather than losing focus', async () => {
        // Every child of this heading points at something the site cannot resolve, so its panel
        // renders plain text and no "View all" (the parent is a `kind: "none"` heading): zero
        // focusable rows. Crossing onto it must still leave focus somewhere operable.
        const wrapper = mountBlock(
          {
            ...resolved.data,
            links: [
              resolved.data.links[0],
              {
                kind: 'none',
                label: 'Workshop',
                children: [
                  {
                    kind: 'collection',
                    target: { _type: 'collection', id: 'id-gone' },
                    label: 'Gone',
                  },
                ],
              },
            ],
          },
          { attachTo: document.body }
        );
        const knitwear = triggerFor(wrapper, 'Knitwear');
        const workshop = triggerFor(wrapper, 'Workshop');
        await knitwear.trigger('click');
        const first = panelLinks(wrapper, knitwear)[0]!;
        first.element.focus();

        await first.trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(panelLinks(wrapper, workshop)).toHaveLength(0);
        expect(workshop.attributes('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(workshop.element);

        // ArrowDown finds nothing to enter, and leaves focus on the trigger rather than nowhere.
        await workshop.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        expect(document.activeElement).toBe(workshop.element);
        wrapper.unmount();
      });

      it('clamps at the end of the bar instead of wrapping', async () => {
        // A bar whose last item *is* a mega-menu trigger, so both the trigger and the panel sit at
        // the end: the mock's own last item is a plain link.
        const wrapper = mountBlock(
          { ...resolved.data, links: resolved.data.links.slice(0, 2) },
          { attachTo: document.body }
        );
        const ceramics = triggerFor(wrapper, 'Ceramics');
        ceramics.element.focus();
        await ceramics.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        const links = panelLinks(wrapper, ceramics);
        expect(document.activeElement).toBe(links[0]!.element);

        await links[0]!.trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(ceramics.attributes('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(links[0]!.element);

        ceramics.element.focus();
        await ceramics.trigger('keydown', { key: 'ArrowRight' });
        await nextTick();
        expect(document.activeElement).toBe(ceramics.element);
        expect(ceramics.attributes('aria-expanded')).toBe('true');
        wrapper.unmount();
      });

      it('closes the panel once focus leaves the item, and keeps it while focus moves inside', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        await knitwear.trigger('click');
        const links = panelLinks(wrapper, knitwear);

        links[0]!.element.focus();
        links[1]!.element.focus();
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('true');

        // Leaving the trigger-and-panel pair — what Tab past the last link, Shift+Tab before the
        // trigger and a click elsewhere all amount to. The panel closes; focus is left alone.
        const brand = wrapper.get('a[data-eldra-header-focus]');
        brand.element.focus();
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(brand.element);
        wrapper.unmount();
      });

      /**
       * Dispatched by hand rather than through `trigger()`, which does not hand back the event, and
       * `defaultPrevented` is the whole assertion here.
       */
      const press = (el: Element, key: string): boolean => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      };

      /**
       * The panel is `v-show`n: it is in the DOM with `display: none` until the open state flushes,
       * and a browser will not focus a hidden element. jsdom focuses one happily, so the outcome
       * cannot be asserted — the ordering can: focus must not be attempted while the panel is still
       * hidden, only on the tick after Vue has shown it.
       */
      it('focuses into the panel only after it has been shown, never in the same tick', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        const first = panelLinks(wrapper, knitwear)[0]!.element;
        const focusSpy = vi.spyOn(first, 'focus');

        knitwear.element.focus();
        expect(press(knitwear.element, 'ArrowDown')).toBe(true);
        // Nothing has flushed yet: the panel is still hidden, so nothing may have been focused.
        expect(knitwear.attributes('aria-expanded')).toBe('false');
        expect(focusSpy).not.toHaveBeenCalled();

        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('true');
        expect(focusSpy).toHaveBeenCalled();
        expect(document.activeElement).toBe(first);
        focusSpy.mockRestore();
        wrapper.unmount();
      });

      it('takes only the keys it handles, and leaves every other one to the page', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        const kitchen = topLevel(knitwear)[2]!;

        // A trigger and a plain bar link both pass unhandled keys straight through, so the header's
        // own `/` and `⌘K` shortcuts and the page's scrolling are untouched.
        for (const key of ['PageDown', 'a', 'Tab']) {
          expect(press(knitwear.element, key)).toBe(false);
          expect(press(kitchen, key)).toBe(false);
        }
        expect(press(knitwear.element, 'ArrowDown')).toBe(true);
        await nextTick();

        const first = panelLinks(wrapper, knitwear)[0]!.element;
        for (const key of ['PageDown', 'a', 'Tab']) expect(press(first, key)).toBe(false);
        expect(press(first, 'ArrowDown')).toBe(true);
        wrapper.unmount();
      });

      it('leaves Down and Up alone on a plain bar link, which has no panel to open', async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const kitchen = topLevel(triggerFor(wrapper, 'Knitwear'))[2]!;
        kitchen.focus();

        expect(press(kitchen, 'ArrowDown')).toBe(false);
        expect(press(kitchen, 'ArrowUp')).toBe(false);
        expect(document.activeElement).toBe(kitchen);
        // The travel keys it does take still work.
        expect(press(kitchen, 'ArrowRight')).toBe(true);
        wrapper.unmount();
      });

      it('drops a pending hover-open when focus leaves the menus', async () => {
        vi.useFakeTimers();
        try {
          const wrapper = mountBlock(resolved.data, { attachTo: document.body });
          const knitwear = triggerFor(wrapper, 'Knitwear');
          const ceramics = triggerFor(wrapper, 'Ceramics');
          await knitwear.trigger('click');
          panelLinks(wrapper, knitwear)[0]!.element.focus();

          // The pointer has come to rest on the next trigger: its 150ms open is armed, not fired.
          mouse(ceramics.element, 'pointerenter');
          // Focus leaves the header's menus, which closes the open panel…
          wrapper.get('a[data-eldra-header-focus]').element.focus();
          await nextTick();
          expect(knitwear.attributes('aria-expanded')).toBe('false');

          // …and takes the pending hover-open with it, so nothing springs open behind the keyboard.
          vi.advanceTimersByTime(300);
          await nextTick();
          expect(ceramics.attributes('aria-expanded')).toBe('false');
          wrapper.unmount();
        } finally {
          vi.useRealTimers();
        }
      });

      it('hands a hover-opened panel over to the keyboard once focus is inside it', async () => {
        vi.useFakeTimers();
        try {
          const wrapper = mountBlock(resolved.data, { attachTo: document.body });
          const knitwear = triggerFor(wrapper, 'Knitwear');

          mouse(knitwear.element, 'pointerenter');
          vi.advanceTimersByTime(160);
          await nextTick();
          expect(knitwear.attributes('aria-expanded')).toBe('true');

          // Focus has arrived inside what hover opened, so the pointer no longer owns it: closing
          // on the way out would strand that focus on a link the panel has just hidden.
          panelLinks(wrapper, knitwear)[0]!.element.focus();
          mouse(menuRoot(wrapper), 'pointerleave');
          vi.advanceTimersByTime(300);
          await nextTick();
          expect(knitwear.attributes('aria-expanded')).toBe('true');

          // Focus leaving is what closes it now.
          wrapper.get('a[data-eldra-header-focus]').element.focus();
          await nextTick();
          expect(knitwear.attributes('aria-expanded')).toBe('false');
          wrapper.unmount();
        } finally {
          vi.useRealTimers();
        }
      });

      it("keeps the panel's links in the tab sequence, in DOM order right after the trigger", async () => {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = triggerFor(wrapper, 'Knitwear');
        await knitwear.trigger('click');
        const links = panelLinks(wrapper, knitwear);

        // No roving tabindex: this is a disclosure, not a menu.
        for (const link of links) expect(link.attributes('tabindex')).toBeUndefined();
        const order = wrapper.findAll('a, button').map((el) => el.element);
        const at = order.indexOf(knitwear.element);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(order.slice(at + 1, at + 1 + links.length)).toEqual(links.map((l) => l.element));
        wrapper.unmount();
      });
    });
  });

  describe('drawer keyboard', () => {
    it('opens as a dialog with the first focusable row focused', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const menuButton = wrapper.get('button[aria-haspopup="dialog"][aria-controls]');
      await menuButton.trigger('click');

      const dialog = wrapper.get('dialog');
      expect(dialog.attributes('open')).toBe('');
      // The first row of the drawer's own list — an accordion row (Knitwear has a mega-menu).
      const firstRow = wrapper.get(
        'dialog ul li:first-child summary, dialog ul li:first-child button, dialog ul li:first-child a'
      );
      expect(document.activeElement).toBe(firstRow.element);
      wrapper.unmount();
    });

    it('Esc closes the drawer and returns focus to the menu button', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const menuButton = wrapper.get('button[aria-haspopup="dialog"][aria-controls]');
      // A real click focuses the button before it fires; `trigger('click')` only dispatches the
      // event, so the opener has to be focused explicitly for `useDialog`'s "return focus to
      // whatever had it before the dialog opened" to have anything correct to return it to.
      menuButton.element.focus();
      await menuButton.trigger('click');
      expect(wrapper.get('dialog').attributes('open')).toBe('');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await wrapper.vm.$nextTick();

      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(menuButton.element);
      wrapper.unmount();
    });
  });

  describe('cart button', () => {
    // The demo storefront's `drawerAvailable` is off, so the cart control renders as an `<a
    // href="/cart">` (Button's own link form), not a `<button>` — `findCartButtonIn` searches both
    // tags. Every assertion here is about a header that has a bag, so the non-null is the point.
    function findCartButton(wrapper: ReturnType<typeof mountBlock>): DOMWrapper<Element> {
      return findCartButtonIn(wrapper)!;
    }

    it('reads "Cart, empty" with nothing in the cart, and shows no badge', () => {
      const wrapper = mountBlock(resolved.data); // demo storefront's cart starts empty
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, empty');
      expect(countPill(findCartButton(wrapper))).toBeNull();
    });

    // The count is read only once the block has mounted (the server never knows it), so each of
    // these waits one tick for that update before looking at the bag.
    it('reads "Cart, 1 item" for a single item', async () => {
      const wrapper = mountWithCartCount(mock, 1);
      await nextTick();
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, 1 item');
    });

    it('reads "Cart, {n} items" for more than one, with an aria-hidden badge carrying the count', async () => {
      const wrapper = mountWithCartCount(mock, 2);
      await nextTick();
      const bag = findCartButton(wrapper);
      expect(bag.attributes('aria-label')).toBe('Cart, 2 items');
      const badge = countPill(bag)!;
      expect(badge.getAttribute('aria-hidden')).toBe('true');
      expect(badge.textContent?.trim()).toBe('2');
      // The pill is a sibling drawn over the bag's corner, and with the count it grows across the
      // middle of the button; a pointer on it must still reach the bag underneath.
      expect(badge.classList.contains('pointer-events-none')).toBe(true);
    });

    it('reads "99+" above 99', async () => {
      const wrapper = mountWithCartCount(mock, 120);
      await nextTick();
      const bag = findCartButton(wrapper);
      expect(bag.attributes('aria-label')).toBe('Cart, 120 items');
      expect(countPill(bag)?.textContent?.trim()).toBe('99+');
    });

    /**
     * The Northwind design's corner badge on a labelled tool: 1.125rem tall, `0.6875rem` bold
     * figures, at the tool's top-right (`top-0.5 right-1.5`, `right-0.5` on a phone), no ring (a ring
     * separates a pill from what sits *beside* it; this one sits deliberately *on* the icon's
     * corner). `Badge`'s own `min-h-6`/`text-badge` must not survive the merge — that overshoot
     * (1.5rem tall, the wrong type scale) was the original defect. The real-browser measurement is
     * `test/countPill.browser.spec.ts`.
     */
    it('sizes and positions the pill as a corner badge, with none of Badge’s own oversized defaults left behind', async () => {
      const wrapper = mountWithCartCount(mock, 2);
      await nextTick();
      const badge = countPill(findCartButton(wrapper))!;
      for (const token of [
        'min-h-[1.125rem]',
        'min-w-[1.125rem]',
        'h-[1.125rem]',
        'px-1',
        'text-[0.6875rem]',
        'font-bold',
        'tabular-nums',
        'leading-none',
        'top-0.5',
        'right-1.5',
        '@max-[47.5625rem]:right-0.5',
      ]) {
        expect([...badge.classList]).toContain(token);
      }
      for (const stale of [
        'min-h-6',
        'text-badge',
        '-top-0.5',
        '-right-0.5',
        'ring-2',
        'ring-background',
        'min-h-5',
        'min-w-5',
        'h-5',
        'right-0',
      ]) {
        expect([...badge.classList]).not.toContain(stale);
      }
    });

    // The bag's two forms, and the destination of the link form. With no drawer mounted the bag is
    // an anchor to `/cart`, which is the site's own cart page: the theme seeds it
    // (`pages/cart.page.json`), the catch-all serves it, and `@eldrajs/theme-nuxt`'s
    // `prerender:routes` hook writes its file from the page document — nothing names the path in
    // `nuxt.config.ts`. It used to be an anchor to a path nothing in the theme answered at all, so
    // the catch-all asked the gateway for a page called "cart", found none, and every shopper who
    // clicked the bag landed on the not-found shell.
    it('links to the cart page when no drawer is mounted, and claims no popup', () => {
      const wrapper = mountBlock(resolved.data); // the demo storefront claims no drawer
      const bag = findCartButton(wrapper);
      expect(bag.element.tagName).toBe('A');
      expect(bag.attributes('href')).toBe('/cart');
      // A link to a page pops nothing up; only the button form is a dialog trigger.
      expect(bag.attributes('aria-haspopup')).toBeUndefined();
    });

    it('is a button that opens the drawer when one is mounted, and navigates nowhere', async () => {
      const { wrapper, storefront } = mountWithDrawer(resolved.data);

      const bag = findCartButton(wrapper);
      expect(bag.element.tagName).toBe('BUTTON');
      expect(bag.attributes('href')).toBeUndefined();
      // Spec "Cart": "It opens from the header bag button (`aria-haspopup=\"dialog\"`)" — the same
      // annotation the Menu and search triggers carry.
      expect(bag.attributes('aria-haspopup')).toBe('dialog');

      expect(storefront.cart.drawerOpen.value).toBe(false);
      await bag.trigger('click');
      expect(storefront.cart.drawerOpen.value).toBe(true);
    });

    /**
     * In Studio's editor the bag does nothing. The preview overlay cancels a click that carries an
     * `href` (that is how it keeps an author from navigating away while editing), but a button's click
     * is not an `href` click and reaches this handler — and a modal `<dialog>` over the canvas makes
     * the rest of the page inert and unscrollable until the author finds Escape. An author inspecting
     * the header is not shopping.
     */
    it('does nothing when the bag is clicked in the editor', async () => {
      const { wrapper, storefront } = mountWithDrawer(resolved.data, { editing: true });

      const bag = findCartButton(wrapper);
      expect(bag.element.tagName).toBe('BUTTON');
      await bag.trigger('click');
      expect(storefront.cart.drawerOpen.value).toBe(false);
    });
  });

  /**
   * The entry point to `/wishlist`. One rule decides whether it is in the DOM at all — the
   * variant — because a way into the list belongs in the bar whether or not this visitor has used
   * it. What a prerendered file must not carry is the *count*, and that is the badge's rule, not
   * the heart's: `test/pages/ssr.spec.ts` and `test/pages/hydration.spec.ts` hold the halves of it
   * that only a server render and a real hydration can see.
   */
  describe('wishlist heart', () => {
    /** The demo storefront claims no cart drawer, so every action here is `Button`'s link form. */
    function findHeart(wrapper: ReturnType<typeof mountBlock>) {
      return wrapper
        .findAll('a, button')
        .find((control) => control.attributes('aria-label')?.startsWith('Saved'));
    }

    function saveInBrowser(...handles: string[]): void {
      localStorage.setItem('eldra.storefront.wishlist', JSON.stringify(handles));
    }

    it('is there with nothing saved, named without a count and carrying no pill', () => {
      const wrapper = mountBlock(resolved.data);
      const heart = findHeart(wrapper)!;
      // No number in the name, so the prerendered header reads the same for every visitor — and
      // the destination is there from the first paint, not grown later.
      expect(heart.attributes('aria-label')).toBe('Saved');
      expect(heart.attributes('href')).toBe('/wishlist');
      expect(countPill(heart)).toBeNull();
      // The bag's own pill is absent too (an empty cart), so this is the whole actions row: two
      // icons, no badges.
      expect(wrapper.findAllComponents(Badge)).toHaveLength(0);
    });

    /**
     * Spec "Header" -> Variants, `minimal`: "Brand left; search, cart and a 'Menu' button on the
     * right at every width. Links … and call to action live only in the drawer." A third icon there
     * would be the theme deciding that variant means something else — and the drawer has no
     * wishlist row either, so it would be inconsistent in both directions. The call to action
     * carries the same guard.
     */
    it('is absent in the minimal variant, saved list or not', async () => {
      saveInBrowser('merino-crew-sweater');
      const wrapper = mountBlock({ ...resolved.data, variant: 'minimal' });
      await nextTick();

      expect(findHeart(wrapper)).toBeUndefined();
      // The bag is still there, which is what makes this about the heart and not about the row.
      expect(findCartButtonIn(wrapper)).toBeDefined();
    });

    it('takes its count after mount once something is saved, linking to the wishlist route', async () => {
      saveInBrowser('merino-crew-sweater');
      const wrapper = mountBlock(resolved.data);
      await nextTick();

      const heart = findHeart(wrapper)!;
      expect(heart.attributes('aria-label')).toBe('Saved, 1 item');
      expect(heart.element.tagName).toBe('A');
      expect(heart.attributes('href')).toBe('/wishlist');
      // It is a link to a page, so it claims no popup — the same rule the bag's link form follows.
      expect(heart.attributes('aria-haspopup')).toBeUndefined();
    });

    it('carries an aria-hidden count pill that cannot swallow the click', async () => {
      saveInBrowser('merino-crew-sweater', 'speckled-latte-mug');
      const wrapper = mountBlock(resolved.data);
      await nextTick();

      const heart = findHeart(wrapper)!;
      expect(heart.attributes('aria-label')).toBe('Saved, 2 items');
      const badge = countPill(heart)!;
      expect(badge.getAttribute('aria-hidden')).toBe('true');
      expect(badge.textContent?.trim()).toBe('2');
      expect(badge.classList.contains('pointer-events-none')).toBe(true);
    });

    it('reads "99+" above 99, like the bag', async () => {
      saveInBrowser(...Array.from({ length: 120 }, (_, index) => `product-${index}`));
      const wrapper = mountBlock(resolved.data);
      await nextTick();

      const heart = findHeart(wrapper)!;
      expect(heart.attributes('aria-label')).toBe('Saved, 120 items');
      expect(countPill(heart)?.textContent?.trim()).toBe('99+');
    });

    /** Two pills in one row, each carrying its own control's count — the asymmetry a global badge
     *  lookup used to hide. */
    it('keeps its own count apart from the bag’s', async () => {
      saveInBrowser('merino-crew-sweater', 'speckled-latte-mug');
      const wrapper = mountWithCartCount(mock, 5);
      await nextTick();

      expect(countPill(findHeart(wrapper)!)?.textContent?.trim()).toBe('2');
      expect(countPill(findCartButtonIn(wrapper)!)?.textContent?.trim()).toBe('5');
    });

    /** Same override, not two copies that could drift apart (`COUNT_PILL_CLASSES` in the block). */
    it('shares its pill’s classes with the bag’s, byte for byte', async () => {
      saveInBrowser('merino-crew-sweater');
      const wrapper = mountWithCartCount(mock, 3);
      await nextTick();

      const heartPill = countPill(findHeart(wrapper)!)!;
      const cartPill = countPill(findCartButtonIn(wrapper)!)!;
      expect(heartPill.className).toBe(cartPill.className);
      // And the corner-badge classes are actually on it, not just shared with an equally-wrong
      // sibling.
      for (const token of [
        'min-h-[1.125rem]',
        'min-w-[1.125rem]',
        'h-[1.125rem]',
        'top-0.5',
        'right-1.5',
      ]) {
        expect([...heartPill.classList]).toContain(token);
      }
    });

    it('is axe-clean with the heart and its pill in the actions row', async () => {
      saveInBrowser('merino-crew-sweater', 'speckled-latte-mug');
      const wrapper = mountBlock(resolved.data);
      await nextTick();

      expect(findHeart(wrapper)).toBeDefined();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /** And with no count on it either — an icon-only link whose whole accessible name is the
     *  control's own, which is the state every prerendered page is served in. */
    it('is axe-clean with nothing saved, where the heart carries no pill', async () => {
      const wrapper = mountBlock(resolved.data);
      expect(findHeart(wrapper)!.attributes('aria-label')).toBe('Saved');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('marks the current link with aria-current="page"', async () => {
    window.history.pushState({}, '', '/collections/kitchen');
    const wrapper = mountBlock(resolved.data);
    const current = wrapper
      .findAll('a')
      .find((a) => a.attributes('href') === '/collections/kitchen')!;
    expect(current.attributes('aria-current')).toBe('page');
    const other = wrapper.findAll('a').find((a) => a.attributes('href') === '/journal')!;
    expect(other.attributes('aria-current')).toBeUndefined();
  });

  it("marks the current bar link with the pill alone, turning off the package's underline", () => {
    window.history.pushState({}, '', '/collections/kitchen');
    const wrapper = mountBlock(resolved.data);
    const current = wrapper
      .findAll('a')
      .find((a) => a.attributes('href') === '/collections/kitchen')!;
    expect(current.classes()).toContain('aria-[current=page]:bg-surface-strong');
    expect(current.classes()).toContain('aria-[current=page]:no-underline');
  });

  it('marks a current page inside a mega-menu on its link and on the trigger that holds it', async () => {
    window.history.pushState({}, '', '/collections/womens-sweaters');
    const wrapper = mountBlock(resolved.data, { attachTo: document.body });
    const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
    expect(knitwear.attributes('data-current')).toBe('');
    const panel = wrapper.get(`#${knitwear.attributes('aria-controls')}`);
    const current = panel.findAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.attributes('href')).toBe('/collections/womens-sweaters');
    wrapper.unmount();
  });

  it('routes a same-site row and leaves an external one a plain anchor, opening a new tab when asked', () => {
    const wrapper = mountBlock({
      ...resolved.data,
      links: [
        { kind: 'url', url: '/journal', label: 'Journal' },
        {
          kind: 'url',
          url: 'https://example.com/stockists',
          label: 'Stockists',
          openInNewTab: true,
        },
      ],
    });
    const routed = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to') as string);
    expect(routed).toContain('/journal');
    expect(routed).not.toContain('https://example.com/stockists');
    const external = wrapper.get('[data-part="link"][href="https://example.com/stockists"]');
    expect(external.attributes('target')).toBe('_blank');
    expect(external.attributes('rel')).toBe('noopener noreferrer');
  });

  it('takes no room for the View all row under a heading that goes nowhere', async () => {
    const wrapper = mountBlock({
      ...resolved.data,
      links: [
        {
          kind: 'none',
          label: 'Workshop',
          children: [{ kind: 'url', url: '/journal', label: 'Journal' }],
        },
      ],
    });
    const trigger = wrapper.findAll('button').find((b) => b.text().includes('Workshop'))!;
    // Ungrouped children still make a sheet across the header, not a dropdown under the trigger.
    expect(wrapper.get(`#${trigger.attributes('aria-controls')}`).classes()).toContain(
      'eldra:inset-x-0'
    );
    const footer = wrapper.get(`#${trigger.attributes('aria-controls')} [data-part="footer"]`);
    // `:empty` as a browser reads it (jsdom counts Vue's empty anchors; `@eldrajs/ui`'s browser spec proves it).
    expect(footer.element.children).toHaveLength(0);
    expect(footer.element.textContent).toBe('');
    expect(footer.classes()).toContain('eldra:empty:hidden');
  });

  it('is axe-clean in every variant with the drawer open, and with a mega-menu open where the bar has one', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mountBlock({ ...resolved.data, variant }, { attachTo: document.body });
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'));
      if (variant !== 'minimal') {
        await knitwear!.trigger('click');
        expect(knitwear!.attributes('aria-expanded'), variant).toBe('true');
        expect(await axe(wrapper.element), variant).toHaveNoViolations();
        await knitwear!.trigger('click');
      }
      await wrapper.get('[data-part="toggle"]').trigger('click');
      const dialog = wrapper.get('dialog[open]');
      expect(dialog.attributes('aria-label'), variant).toBe('Menu');
      // The open drawer is modal: everything behind it is inert, so the dialog is what is checked.
      expect(await axe(dialog.element), variant).toHaveNoViolations();
      wrapper.unmount();
    }
  });

  it('minimal variant shows the Menu button, word and all, at every width and no bar of links', () => {
    const wrapper = mountBlock({ ...resolved.data, variant: 'minimal' });
    expect(wrapper.find('[data-part="nav"]').exists()).toBe(false);
    const toggle = wrapper.get('[data-part="toggle"]');
    expect(toggle.text()).toBe('Menu');
    expect(toggle.classes().some((token) => token.endsWith(':hidden'))).toBe(false);
    // The default variant hides it once the bar has room for its links.
    const bar = mountBlock(resolved.data).get('[data-part="toggle"]');
    expect(bar.classes()).toContain('eldra:@content:hidden');
  });

  it('renders 8 links with no overflow markup errors', async () => {
    const eightLinks = [
      ...resolved.data.links,
      { kind: 'url', url: '/collections/sale', label: 'Sale' },
      { kind: 'url', url: '/collections/gifts', label: 'Gifts' },
      { kind: 'url', url: '/pages/about', label: 'About' },
    ];
    const wrapper = mountBlock({ ...resolved.data, links: eightLinks });
    expect(wrapper.findAll('nav ul li, ul.list-none > li').length).toBeGreaterThan(0);
    for (const link of eightLinks) expect(wrapper.text()).toContain(link.label);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('spreads mega-menu groups across the full width', async () => {
    const wrapper = mountBlock(resolved.data, { attachTo: document.body });
    const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
    await knitwear.trigger('click');
    const panelId = knitwear.attributes('aria-controls')!;
    const panel = wrapper.get(`#${panelId}`);
    expect(panel.find('img').exists()).toBe(false);
    expect(panel.text()).toContain('Women');
    expect(panel.text()).toContain('Merino essentials');
    wrapper.unmount();
  });

  describe('mega-menu panel geometry', () => {
    // jsdom computes no layout; what is checkable here is the arrangement. The Northwind panel is a
    // full-bleed sheet: pinned to the whole `<header>` (fixed when sticky, `relative` when not) rather
    // than to the item that opened it or to the bar's grid, with its columns held inside the same
    // wide container the bar uses.
    it('pins the panel to the header container, not to the trigger that opened it', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      // The header is the panel's positioning box; the bar's grid and the menu's own root take none.
      expect(wrapper.get('header').classes()).toContain('fixed');
      expect(wrapper.get('[data-eldra-header-bar]').classes()).not.toContain('relative');
      const root = [...menuRoot(wrapper).classList];
      expect(root).toContain('static');
      expect(root).toContain('contents');
      // …and no row of the bar may reclaim it, or the panel would hang under its own item again.
      for (const row of wrapper.findAll('[data-part="item"]')) {
        expect(row.classes()).not.toContain('eldra:relative');
      }

      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      const panel = wrapper.get(`#${knitwear.attributes('aria-controls')}`);
      // Flush under the bar: no offset of its own.
      for (const token of ['eldra:absolute', 'eldra:top-full', 'eldra:inset-x-0', 'pt-0']) {
        expect(panel.classes()).toContain(token);
      }
      // A width of its own is exactly what the old panel had, and what made it feel arbitrary.
      const panelTokens = panel.classes().map((token) => token.replace(/^eldra:/, ''));
      expect(panelTokens).not.toContain('w-screen');
      expect(panelTokens.some((token) => token.startsWith('max-w-'))).toBe(false);
      // The bar's own bottom border is the sheet's top edge; the sheet draws only a bottom rule and
      // the float shadow, square-cornered, 2rem above and below, the page's own gutters at the sides.
      const sheet = panel.get('[data-part="content"]').classes();
      for (const token of [
        'rounded-none',
        'border-0',
        'border-b',
        'border-border',
        'shadow-(--eldra-shadow-float)',
        'py-8',
        'px-(--eldra-gutter-mobile)',
        '@tablet:px-(--eldra-gutter-tablet)',
        '@content:px-(--eldra-gutter-desktop)',
      ]) {
        expect(sheet).toContain(token);
      }

      // The columns: inside the wide container, 12 tracks with 2rem gutters.
      const columns = panel.get('[data-part="columns"]').classes();
      for (const token of [
        'eldra:grid',
        'grid-cols-12',
        'gap-8',
        'mx-auto',
        'max-w-[calc(var(--eldra-container-wide)-2*var(--eldra-gutter-desktop))]',
      ]) {
        expect(columns).toContain(token);
      }
      wrapper.unmount();
    });

    it('lays three-column groups out left-aligned instead of stretching them to fill', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const ceramics = wrapper.findAll('button').find((b) => b.text().includes('Ceramics'))!;
      await ceramics.trigger('click');
      const panel = wrapper.get(`#${ceramics.attributes('aria-controls')}`);
      // Ceramics has a single group; Knitwear has three. Both get the same column width — a lone
      // group sits at a quarter of the container rather than stretching across all twelve.
      const columns = panel
        .findAll('ul[aria-labelledby]')
        .map((list) => list.element.parentElement!);
      expect(columns).toHaveLength(1);
      for (const column of columns) expect([...column.classList]).toContain('col-span-3');
      wrapper.unmount();
    });

    it("offers the parent's own destination as a View all row, and a heading none", async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      const panel = wrapper.get(`#${knitwear.attributes('aria-controls')}`);
      const viewAll = panel.get('[data-eldra-mega-view-all]');
      // The trigger gave the destination up when it became a disclosure; the panel offers it.
      expect(viewAll.attributes('href')).toBe('/collections/knitwear');
      expect(viewAll.text()).toBe('View all');
      // Self-descriptive out of context (2.4.4), opening with the visible text (2.5.3).
      expect(viewAll.attributes('aria-label')).toBe('View all Knitwear');
      // Right-aligned under a rule across the content width: it follows the columns, outside their grid.
      const row = viewAll.element.parentElement!;
      for (const token of ['justify-end', 'eldra:border-t', 'eldra:border-border', 'eldra:pt-4']) {
        expect([...row.classList]).toContain(token);
      }
      expect(row.previousElementSibling?.getAttribute('data-part')).toBe('columns');
      // The trailing arrow the theme's other "view all" links carry, drawn outside the label so
      // the underline runs under the words only.
      expect(viewAll.find('[data-part="arrow"]').exists()).toBe(true);
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    });

    it('takes its ground from the bar instead of naming one, and the bar publishes it', async () => {
      // Two `bg-background` utilities read the same today and drift the moment either side's ground
      // changes. The bar publishes the colour it paints and the panel reads it, so there is one
      // surface rather than two that happen to agree. The colours themselves are a browser matter
      // (a token variable resolves to nothing in jsdom) — `test/prerenderRefresh.browser.spec.ts`
      // compares the two computed grounds, with the bar solid and with `transparentOverHero` on.
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      expect(wrapper.get('header').attributes('style')).toContain(
        '--eldra-header-surface: var(--color-background)'
      );

      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      const sheet = wrapper.get(`#${knitwear.attributes('aria-controls')} [data-part="content"]`);
      expect(sheet.classes()).toContain('bg-(--eldra-header-surface)');
      wrapper.unmount();
    });

    it('eases the panel in and fades it out, both on the motion tokens', async () => {
      // Leave classes land in the patch that closes the panel; the browser spec proves the fade itself.
      //
      // `stubs: { transition: false }` is the one thing this test needs that no other does:
      // `@vue/test-utils` stubs `<Transition>` by default, and a stub applies no classes at all.
      const base = mountOptions(
        { entry: { id: 'e1', data: resolved.data } },
        {
          links: resolved.links,
        }
      );
      const wrapper = mount(Block, {
        ...base,
        attachTo: document.body,
        global: { ...base.global, stubs: { ...base.global.stubs, transition: false } },
      });
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      const panel = (): DOMWrapper<Element> =>
        wrapper.get(`#${knitwear.attributes('aria-controls')}`);

      await knitwear.trigger('click');
      expect(knitwear.attributes('aria-expanded')).toBe('true');
      expect(panel().get('[data-part="content"]').classes(), 'enter').toContain(
        'eldra:animate-eldra-popover-in'
      );

      await knitwear.trigger('click');
      // The panel is still there, and still addressable, while it leaves — that is the whole point
      // of a `<Transition>` over a bare `v-show` — but a click on the fading sheet goes through it.
      expect(knitwear.attributes('aria-expanded')).toBe('false');
      for (const token of [
        'eldra:pointer-events-none',
        'eldra:transition-opacity',
        'eldra:duration-fast',
        'eldra:ease-in',
      ]) {
        expect(panel().classes(), 'leave').toContain(token);
      }
      wrapper.unmount();
    });

    it('renders no View all row for a kind: "none" heading', async () => {
      const wrapper = mountBlock(
        {
          ...resolved.data,
          links: [
            {
              kind: 'none',
              label: 'Workshop',
              children: [{ kind: 'url', url: '/journal', label: 'Journal' }],
            },
          ],
        },
        { attachTo: document.body }
      );
      const trigger = wrapper.findAll('button').find((b) => b.text().includes('Workshop'))!;
      await trigger.trigger('click');
      const panel = wrapper.get(`#${trigger.attributes('aria-controls')}`);
      expect(panel.find('[data-eldra-mega-view-all]').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  it('the search control has aria-haspopup="dialog" and opens SearchModal', async () => {
    const wrapper = mountBlock(resolved.data, { attachTo: document.body });
    const searchButton = searchTool(wrapper);
    expect(searchButton.attributes('aria-haspopup')).toBe('dialog');
    await searchButton.trigger('click');
    const dialogs = wrapper.findAll('dialog');
    expect(dialogs.some((d) => d.attributes('open') === '')).toBe(true);
    wrapper.unmount();
  });

  /**
   * The header's search overlay. Two defects lived here, both in what the block hands `SearchModal`
   * rather than in the modal itself:
   *
   * - **`pending` is not "a read is in flight."** It is the skeleton flag — "a read in flight with
   *   *nothing to show*" (`app/storefront/types.ts`) — so it is false for every search after the
   *   first, and the modal never reached its loading view.
   * - **`data` holds the *previous* answer while the next read runs.** The very first thing
   *   `search.run()` answers is the empty query's own `{ total: 0 }`, and a `results` object with a
   *   zero total is the modal's *"nothing found"* view. So the whole time the request for "bowl" was
   *   in flight, the overlay read "No results for “bowl”" — then popped the results in.
   */
  describe('the search overlay', () => {
    const ANSWER: StorefrontSearchResponse = {
      query: 'bowl',
      total: 1,
      products: [
        {
          handle: 'speckled-latte-mug',
          title: 'Speckled latte mug',
          url: '/products/speckled-latte-mug',
          featuredImage: null,
          price: { amount: 28, compareAt: null },
          stock: 'in',
          available: true,
          productId: 'speckled-latte-mug',
        },
      ],
      articles: [],
      pages: [],
      suggestion: null,
    };
    /** The empty query's own answer — what `search.run()` has in `data` before any real search, and
     *  the value that was being presented as the answer to the query in flight. */
    const EMPTY: StorefrontSearchResponse = {
      query: '',
      total: 0,
      products: [],
      articles: [],
      pages: [],
      suggestion: null,
    };

    /** A storefront whose search answers `answer` with `loading` as given, however the field is
     *  retyped — the gateway's own mid-read shape, held still so it can be asserted. */
    function mountWithSearch(answer: StorefrontSearchResponse, loading: boolean) {
      const base = mountOptions(
        { entry: { id: 'e1', data: resolved.data } },
        {
          links: resolved.links,
        }
      );
      const storefront = createDemoStorefront();
      const result: StorefrontResult<StorefrontSearchResponse> = {
        data: ref(answer) as Ref<StorefrontSearchResponse | null>,
        // False on purpose: there is an answer on screen, which is exactly when `pending` is false
        // and the overlay used to show no loading state at all.
        pending: ref(false),
        loading: ref(loading),
        revalidating: ref(new Set()),
        error: ref(null),
        refresh: async () => {},
      };
      return mount(Block, {
        attachTo: document.body,
        ...base,
        global: {
          ...base.global,
          provide: {
            ...base.global.provide,
            [STOREFRONT_KEY]: { ...storefront, search: { run: () => result } },
          },
        },
      });
    }

    async function openOverlay(wrapper: ReturnType<typeof mountWithSearch>) {
      await searchTool(wrapper).trigger('click');
      return wrapper.get('dialog[open] input[type="search"]');
    }

    it('shows the loading view while the read for the typed query is in flight', async () => {
      vi.useFakeTimers();
      const wrapper = mountWithSearch(EMPTY, true);
      try {
        const input = await openOverlay(wrapper);
        await input.setValue('bowl');
        await nextTick();

        // Before the loading view's own 300ms, and the heart of the defect: the block hands the
        // modal no `results` at all for a query it has no answer for, so the panel stays empty
        // instead of answering with the previous read's zero total.
        expect(document.body.textContent).not.toContain('No results');

        vi.advanceTimersByTime(300);
        await nextTick();

        expect(document.querySelector('[data-part="loading"]')).not.toBeNull();
        expect(document.body.textContent).not.toContain('No results');

        // The announcement is the half a screen-reader user gets, and it is debounced 400ms — past
        // the loading view's own 300ms. It has to agree with the panel: "Searching…", never
        // "No results for “bowl”" for a read that has not come back.
        vi.advanceTimersByTime(100);
        await nextTick();
        const live = document.querySelector('[data-part="liveRegion"]');
        expect(live?.textContent).toBe(uiEnUS.searchLoading);
      } finally {
        vi.useRealTimers();
        wrapper.unmount();
      }
    });

    it('shows the results once the read for that query has answered', async () => {
      vi.useFakeTimers();
      const wrapper = mountWithSearch(ANSWER, false);
      try {
        const input = await openOverlay(wrapper);
        await input.setValue('bowl');
        await nextTick();

        expect(document.querySelector('[data-part="loading"]')).toBeNull();
        expect(document.body.textContent).not.toContain('No results');
        const rows = [...document.querySelectorAll('[role="option"]')];
        expect(rows.some((row) => row.textContent?.includes('Speckled latte mug'))).toBe(true);
        // The product's real price, from the catalogue read behind `search.run()`.
        expect(rows.some((row) => row.textContent?.includes('$28.00'))).toBe(true);

        vi.advanceTimersByTime(400);
        await nextTick();
        expect(document.querySelector('[data-part="liveRegion"]')?.textContent).toBe(
          uiEnUS.resultsCount(1, 'bowl')
        );
      } finally {
        vi.useRealTimers();
        wrapper.unmount();
      }
    });

    /**
     * A product the storefront could not price (`StorefrontSearchProduct.price === null`: the
     * pricing read failed, or the catalogue did not answer about this id). `SearchResultItem.price`
     * is optional, so the row keeps the product and drops the price — never the store's own
     * "$0.00", which is a real price and the wrong one.
     */
    it('renders a row with no price at all for a product it could not price', async () => {
      const unpriced: StorefrontSearchResponse = {
        ...ANSWER,
        products: [{ ...ANSWER.products[0]!, price: null }],
      };
      const wrapper = mountWithSearch(unpriced, false);
      try {
        const input = await openOverlay(wrapper);
        await input.setValue('bowl');
        await nextTick();

        const row = [...document.querySelectorAll('[role="option"]')].find((node) =>
          node.textContent?.includes('Speckled latte mug')
        );
        expect(row).toBeDefined();
        expect(row?.textContent).not.toContain('0.00');
        expect(row?.textContent).not.toContain('$');
      } finally {
        wrapper.unmount();
      }
    });

    /**
     * Enter with no active option submits the modal's own `method="get"` form, and "See all N
     * results" is the same destination as a row. Both are `${action}?q=…`, and `action` defaults to
     * `/search` — the page the theme seeds (`pages/search.page.json`). Until it existed, every one of these
     * landed the shopper on the not-found shell.
     */
    it('submits to /search?q=… — the route the theme serves', async () => {
      const wrapper = mountWithSearch(ANSWER, false);
      try {
        const input = await openOverlay(wrapper);
        const form = document.querySelector('dialog[open] form[role="search"]')!;
        expect(form.getAttribute('method')).toBe('get');
        expect(form.getAttribute('action')).toBe('/search');
        expect(input.attributes('name')).toBe('q');

        await input.setValue('bowl');
        await nextTick();
        // The last row of the panel: the modal's own "See … results" row, whose destination is the
        // same `${action}?q=…` the form submits to.
        const rows = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
        const viewAll = rows[rows.length - 1];
        expect(viewAll?.textContent).toContain('result');
        expect(viewAll?.getAttribute('href')).toBe('/search?q=bowl');
      } finally {
        wrapper.unmount();
      }
    });
  });

  it('minimal variant keeps the links and the call to action only in the drawer', () => {
    const wrapper = mountBlock({ ...resolved.data, variant: 'minimal' });
    expect(wrapper.find('ul.list-none.items-center').exists()).toBe(false);
    expect(wrapper.findAll('button').some((b) => b.text() === 'Menu')).toBe(true);
    // The bar itself shows no call to action in `minimal` — only the drawer's own copy of it,
    // inside the (closed, but always-rendered) dialog.
    expect(wrapper.findAll('a, button').filter((el) => el.text() === mock.ctaLabel)).toHaveLength(
      1
    );
    // The drawer's own list still carries every link (rendered regardless of `open`).
    for (const link of mock.links) expect(wrapper.text()).toContain(link.label);
  });

  describe('actions row spacing', () => {
    // Below 68.8125rem the brand is centred by symmetry alone: Menu and Search on one side, Saved
    // and Cart on the other, all one fixed width, with the grid's gap equal to the actions row's own
    // — so the two sides measure the same. A larger gap on either breaks the centring.
    it('puts the same 0.125rem gap in the bar’s grid and in the actions row, so the brand stays centred', () => {
      const wrapper = mountBlock(resolved.data);
      const bar = wrapper.get('[data-eldra-header-bar]');
      expect(bar.classes()).toContain('gap-x-0.5');
      expect(bar.classes()).toContain(
        'grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)_auto]'
      );
      const actions = wrapper.get('[data-eldra-header-actions]');
      expect(actions.classes()).toContain('gap-0.5');
      // Every tool on either side is the same fixed width.
      const menu = wrapper.get('button[aria-label="Menu"]');
      const saved = wrapper.get('[aria-label^="Saved"]');
      const tools = [menu, searchTool(wrapper), saved, findCartButtonIn(wrapper)!];
      for (const tool of tools) {
        expect(tool.classes()).toEqual(
          expect.arrayContaining(['w-14', '@max-[47.5625rem]:w-11', '@max-[22.5rem]:w-10'])
        );
      }
    });

    it('gives the call to action its own 0.75rem from the cart, not only the row’s 0.25rem gap', () => {
      const wrapper = mountBlock(resolved.data);
      const actions = wrapper.get('[data-eldra-header-actions]');
      const cta = actions.findAll('a, button').find((el) => el.text() === mock.ctaLabel)!;
      // 0.625rem of margin on top of the row's own 0.125rem gap: the call to action "sits 0.75rem
      // after the cart".
      expect(cta.classes()).toContain('ml-2.5');
      // And the row's only hidden/visible pair lands on the button's own root — the flex item the
      // row's `gap-1` actually counts — not on a wrapper around it. A wrapper carrying `hidden`
      // while the button inside it carries the visible class would still occupy a gap slot: the
      // parent check is what rules that out, not just the classes existing somewhere in the tree.
      expect(cta.classes()).toEqual(
        expect.arrayContaining(['hidden', '@min-[68.8125rem]:inline-flex'])
      );
      expect(cta.element.parentElement).toBe(actions.element);
    });
  });

  describe('empty / editor state', () => {
    /**
     * The header a fresh store actually starts with, copied from the shape every
     * `pages/*.page.json` seeds: brand, search, cart — no links and no call to action.
     * `mock.json` keeps its demo links because it is the state an author sees the moment they
     * *insert* the block, not the state a deploy seeds.
     */
    const SEEDED = {
      variant: 'default',
      brandText: 'Northwind Goods',
      links: [],
      showSearch: true,
      searchStyle: 'icon',
      sticky: true,
      transparentOverHero: false,
    };

    it('renders the seeded header as brand and actions only — no links, no CTA, axe-clean', async () => {
      const wrapper = mountBlock(SEEDED);
      expect(wrapper.text()).toContain('Northwind Goods');
      // The bar's link list is not drawn at all with nothing in it, so no empty `<ul>` is left
      // sitting in the grid.
      expect(wrapper.find('ul.list-none.items-center').exists()).toBe(false);
      expect(findSearchTool(wrapper)).toBeDefined();
      expect(wrapper.find('[aria-label="Cart, empty"]').exists()).toBe(true);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('draws no Menu button and no drawer when the drawer would be empty', () => {
      // The drawer holds the links and the call to action. With neither there is nothing to open,
      // and a Menu button that opens an empty sheet is a control that does nothing.
      const wrapper = mountBlock(SEEDED);
      expect(wrapper.find('button[aria-label="Menu"]').exists()).toBe(false);
      // `dialog[aria-label="Menu"]` is the drawer itself; the search overlay's own `<dialog>`
      // renders either way, so the drawer has to be named rather than counted.
      expect(wrapper.find('dialog[aria-label="Menu"]').exists()).toBe(false);
      expect(mountBlock(resolved.data).find('dialog[aria-label="Menu"]').exists()).toBe(true);
    });

    it('keeps the Menu button as soon as the drawer has something to show', () => {
      for (const data of [
        { ...SEEDED, links: [{ kind: 'url', url: '/journal', label: 'Journal' }] },
        { ...SEEDED, ctaLabel: 'Shop', cta: { kind: 'url', url: '/collections/all' } },
      ]) {
        const wrapper = mountBlock(data);
        expect(wrapper.find('button[aria-label="Menu"]').exists()).toBe(true);
      }
    });

    /**
     * `showAccount` is retired as of `block.json` version 4 — the platform has no customer login,
     * so an account icon in the bar leads nowhere — and Core keeps whatever an entry held as
     * `showAccount__v3`. Nothing in the block reads either id, which is the point: a header
     * configured while the field existed renders exactly the header a fresh one does, and the
     * stashed value cannot bring a Menu button back for a drawer row that no longer exists.
     */
    it('ignores a retired showAccount an entry still carries, under either id', () => {
      for (const stored of [{ showAccount: true }, { showAccount__v3: true }]) {
        const wrapper = mountBlock({ ...SEEDED, ...stored });
        expect(
          wrapper.findAll('a, button').some((control) => control.attributes('href') === '/account')
        ).toBe(false);
        expect(wrapper.text()).not.toContain('Account');
        expect(wrapper.find('button[aria-label="Menu"]').exists()).toBe(false);
        expect(wrapper.find('dialog[aria-label="Menu"]').exists()).toBe(false);
      }
    });

    it('shows the "Add a link" editor hint only while editing, with no links', () => {
      const empty = { ...resolved.data, links: [] };
      const editing = mountWithEditing(empty, true);
      expect(editing.text()).toContain('Add a link');

      const live = mountWithEditing(empty, false);
      expect(live.text()).not.toContain('Add a link');
    });
  });

  describe('transparentOverHero', () => {
    it('field off renders solid, with no data-eldra-transparent attribute', () => {
      const wrapper = mountBlock({ ...resolved.data, transparentOverHero: false });
      expect(wrapper.find('header').attributes('data-eldra-transparent')).toBeUndefined();
    });

    it('field on sets the transparent attribute (the block only reads its own field)', () => {
      const wrapper = mountBlock({ ...resolved.data, transparentOverHero: true });
      expect(wrapper.find('header').attributes('data-eldra-transparent')).toBe('true');
    });
  });

  describe('icons', () => {
    /** `EldraIcon` strips the fetched SVG's own outer `<svg>` tag (see that component's own doc
     *  comment) and keeps only its inner markup, so a resolved icon is identified by a path `d`
     *  unique to it, not by a wrapper class name. Each string below is copied from the real Tabler
     *  outline SVG (`node_modules/@tabler/icons/icons/outline/<name>.svg`). */
    const PATHS = {
      'menu-2': 'M4 6l16 0',
      'chevron-down': 'M6 9l6 6l6 -6',
      search: 'M21 21l-6 -6',
      heart: 'M19.5 12.572l-7.5 7.428l-7.5 -7.428',
      'shopping-bag': 'M9 11v-5a3 3 0 0 1 6 0v5',
    };

    it('replaces every hand-rolled <svg> with EldraIcon, resolving each Tabler icon by name', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      await flushIcons();
      await nextTick();
      const html = wrapper.html();
      for (const [name, path] of Object.entries(PATHS)) {
        expect(
          html,
          `expected the resolved "${name}" icon's own path in the rendered markup`
        ).toContain(path);
      }
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    });
  });

  describe('--eldra-header-height', () => {
    /** Mirrors `trust-strip`'s own `ResizeObserver` stub: jsdom has none at all, so this replaces
     *  `globalThis.ResizeObserver` with a fake that only captures the callback the block passes,
     *  letting a test call `trigger()` after changing the header's measured height. */
    function stubResizeObserver(): { trigger: () => void; restore: () => void } {
      let captured: ResizeObserverCallback | null = null;
      class FakeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          captured = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      const original = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
      return {
        trigger: () => captured?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver),
        restore: () => {
          (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = original;
        },
      };
    }

    function stubHeaderHeight(el: HTMLElement, height: number): void {
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({
          height,
          width: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON() {},
        }),
        configurable: true,
      });
    }

    afterEach(() => {
      document.documentElement.style.removeProperty('--eldra-header-height');
    });

    it('publishes the sticky header’s rendered height on document.documentElement, tracks a resize, and clears it on unmount', async () => {
      const stub = stubResizeObserver();
      try {
        const wrapper = mountBlock({ ...resolved.data, sticky: true }, { attachTo: document.body });
        const header = wrapper.get('header').element as HTMLElement;
        stubHeaderHeight(header, 64);
        await nextTick();
        expect(document.documentElement.style.getPropertyValue('--eldra-header-height')).toBe(
          '64px'
        );

        // A real resize (breakpoint change, search style switching in) — the observer's own
        // callback re-reads the header's height and republishes it.
        stubHeaderHeight(header, 96);
        stub.trigger();
        expect(document.documentElement.style.getPropertyValue('--eldra-header-height')).toBe(
          '96px'
        );

        wrapper.unmount();
        expect(document.documentElement.style.getPropertyValue('--eldra-header-height')).toBe('');
      } finally {
        stub.restore();
      }
    });

    it('hands the same measurement to the spacer, so the flow it reserves is the bar’s own height', async () => {
      const stub = stubResizeObserver();
      try {
        const wrapper = mountBlock({ ...resolved.data, sticky: true }, { attachTo: document.body });
        const header = wrapper.get('header').element as HTMLElement;
        stubHeaderHeight(header, 64);
        await nextTick();
        expect(wrapper.get('[data-eldra-header-spacer]').attributes('style')).toBe('height: 64px;');

        stubHeaderHeight(header, 96);
        stub.trigger();
        await nextTick();
        expect(wrapper.get('[data-eldra-header-spacer]').attributes('style')).toBe('height: 96px;');

        wrapper.unmount();
      } finally {
        stub.restore();
      }
    });

    it('never publishes the variable for a non-sticky header', async () => {
      const stub = stubResizeObserver();
      try {
        const wrapper = mountBlock(
          { ...resolved.data, sticky: false },
          { attachTo: document.body }
        );
        await nextTick();
        expect(document.documentElement.style.getPropertyValue('--eldra-header-height')).toBe('');
        wrapper.unmount();
      } finally {
        stub.restore();
      }
    });
  });
});

/**
 * The redesigned seed: an info strip, labelled tools, a scalable brand, and a menu of sections with
 * cards, a badge and a dropdown — the Northwind design's header boards.
 */
describe('the Northwind menu (the seed’s own)', () => {
  const PRODUCT_TEMPLATE = {
    id: 'rt-product',
    data: { schemaApiId: 'catalog:product', routePattern: '/products/:slug', slugField: 'slug' },
  };
  const PRODUCT_TARGETS: Record<string, { image: string; price: number }> = {
    'speckled-latte-mug': { image: '/images/mug.webp', price: 28 },
    'merino-crew-sweater': { image: '/images/sweater.webp', price: 96 },
    'hand-thrown-serving-bowl': { image: '/images/bowl.webp', price: 64 },
  };
  const northwind = resolveTargets(seed);
  const links = {
    templates: [COLLECTION_TEMPLATE, PRODUCT_TEMPLATE] as (typeof COLLECTION_TEMPLATE)[],
    targets: new Map(
      [...northwind.links.targets].map(([key, info]) => {
        const slug = (info as { slug: string }).slug;
        const extra = key.startsWith('product:') ? PRODUCT_TARGETS[slug] : undefined;
        return [key, { ...(info as object), ...extra }];
      })
    ),
  };
  function mountSeed(data: Record<string, unknown> = {}) {
    return mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: { ...northwind.data, ...data } } }, { links }),
      attachTo: document.body,
    });
  }
  type Wrapper = ReturnType<typeof mountSeed>;
  const trigger = (wrapper: Wrapper, label: string) =>
    wrapper.findAll('button').find((button) => button.text().includes(label))!;
  const panel = (wrapper: Wrapper, label: string) =>
    wrapper.get(`#${trigger(wrapper, label).attributes('aria-controls')}`);

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the seed axe-clean in every variant', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mountSeed({ variant });
      expect(await axe(wrapper.element), variant).toHaveNoViolations();
      wrapper.unmount();
    }
  });

  describe('info strip', () => {
    it('is a named region: the start items with icons, the end items as links', async () => {
      const wrapper = mountSeed();
      const strip = wrapper.get('[data-eldra-header-info]');
      expect(strip.attributes('role')).toBe('region');
      expect(strip.attributes('aria-label')).toBe('Store information');
      const [start, end] = strip.findAll('ul');
      expect(start!.findAll('li').map((li) => li.text())).toEqual([
        'Free delivery over $80',
        '30-day returns',
        'Shop open today 10–18',
      ]);
      const phone = end!.findAll('a').find((a) => a.text() === '(555) 014-2290')!;
      expect(phone.attributes('href')).toBe('tel:+15550142290');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('keeps only the first item on a phone, and moves the end of the strip into the drawer', () => {
      const wrapper = mountSeed();
      const [start, end] = wrapper.get('[data-eldra-header-info]').findAll('ul');
      const items = start!.findAll('li');
      expect(items[0]!.classes()).not.toContain('@max-[47.5625rem]:hidden');
      for (const item of items.slice(1))
        expect(item.classes()).toContain('@max-[47.5625rem]:hidden');
      expect(end!.classes()).toContain('@max-[68.8125rem]:hidden');
      // The drawer's footer repeats the end links the strip hides there.
      const drawerLinks = wrapper.get('[data-eldra-header-drawer-links]');
      expect(drawerLinks.text()).toContain('Order status');
      expect(drawerLinks.text()).toContain('(555) 014-2290');
      expect(drawerLinks.text()).toContain('Saved items');
    });

    it('is not drawn with no items, and drops a javascript: link to plain text', () => {
      const empty = mountSeed({ infoItems: [] });
      expect(empty.find('[data-eldra-header-info]').exists()).toBe(false);
      empty.unmount();
      const wrapper = mountSeed({
        infoItems: [{ text: 'Call us', href: 'javascript:alert(1)' }],
      });
      const strip = wrapper.get('[data-eldra-header-info]');
      expect(strip.find('a').exists()).toBe(false);
      expect(strip.text()).toBe('Call us');
    });
  });

  describe('labelled tools', () => {
    it('names every tool with its visible label first (WCAG 2.5.3)', async () => {
      const wrapper = mountSeed();
      const menu = wrapper.get('button[aria-label="Menu"]');
      expect(menu.text()).toBe('Menu');
      const search = wrapper
        .findAll('button')
        .filter((button) => button.text().trim() === 'Search');
      expect(search).toHaveLength(1);
      expect(search[0]!.attributes('aria-label')).toBeUndefined();
      // The design's pill field, from 80rem; the Search tool below it.
      const pill = wrapper.findAll('button').find((b) => b.text().trim() === 'Search the shop')!;
      expect(pill.classes()).toEqual(expect.arrayContaining(['hidden', '@wide:inline-flex']));
      expect(search[0]!.classes()).toContain('@wide:hidden');
      for (const tool of [
        wrapper.get('[aria-label^="Saved"]'),
        wrapper.get('[aria-label^="Cart"]'),
      ]) {
        const label = tool.get('[data-part="label"]').text().trim();
        expect(tool.attributes('aria-label')!.startsWith(label)).toBe(true);
      }
    });

    it('shows Account only when it is linked, as a tool and in the drawer', async () => {
      const bare = mountSeed();
      expect(bare.text()).not.toContain('Account');
      bare.unmount();
      const wrapper = mountSeed({ account: { kind: 'url', url: '/account' } });
      const tools = wrapper
        .get('[data-eldra-header-actions]')
        .findAll('a')
        .filter((a) => a.text().trim() === 'Account');
      expect(tools).toHaveLength(1);
      expect(tools[0]!.attributes('href')).toBe('/account');
      expect(tools[0]!.classes()).toContain('@max-[68.8125rem]:hidden');
      expect(wrapper.get('[data-eldra-header-drawer-links]').text()).toContain('Account');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('brand', () => {
    const logo = (width: number, height: number) => ({
      assetId: 'logo',
      url: '/logo.svg',
      altText: 'Northwind Goods',
      width,
      height,
    });
    const mark = { assetId: 'mark', url: '/mark.svg', altText: '', width: 64, height: 64 };
    const brand = (wrapper: Wrapper) => wrapper.get('[data-eldra-header-brand]');

    it('names the link once, so whichever picture a width shows, it reads the same', async () => {
      const wrapper = mountSeed({ brandMark: mark, brandLogo: logo(300, 100) });
      expect(brand(wrapper).attributes('aria-label')).toBe('Northwind Goods, home');
      for (const img of brand(wrapper).findAll('img')) expect(img.attributes('alt')).toBe('');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('draws a mark beside the wordmark, and the mark alone below 400px', () => {
      const wrapper = mountSeed({ brandMark: mark });
      const [img] = brand(wrapper).findAll('img');
      expect(img!.classes()).not.toContain('hidden');
      expect(brand(wrapper).get('span span').classes()).toContain('@max-[25.0625rem]:hidden');
    });

    it('swaps a logo for its mark below 400px', () => {
      const wrapper = mountSeed({ brandMark: mark, brandLogo: logo(300, 100) });
      const [markImg, logoImg] = brand(wrapper).findAll('img');
      expect(markImg!.classes()).toEqual(
        expect.arrayContaining(['hidden', '@max-[25.0625rem]:block'])
      );
      expect(logoImg!.classes()).toContain('@max-[25.0625rem]:hidden');
      expect(brand(wrapper).text()).toBe('');
    });

    it('prints the store name below 400px for a logo wider than 4:1 with no mark', () => {
      const wrapper = mountSeed({ brandLogo: logo(1000, 100) });
      const [logoImg] = brand(wrapper).findAll('img');
      expect(logoImg!.classes()).toContain('@max-[25.0625rem]:hidden');
      const name = brand(wrapper).get('span span');
      expect(name.text()).toBe('Northwind Goods');
      expect(name.classes()).toEqual(expect.arrayContaining(['hidden', '@max-[25.0625rem]:block']));
    });

    it('keeps a logo of 4:1 or narrower at every width, sized by height', () => {
      const wrapper = mountSeed({ brandLogo: logo(400, 100) });
      const [logoImg] = brand(wrapper).findAll('img');
      expect(logoImg!.classes()).toEqual(
        expect.arrayContaining(['h-9', 'w-auto', 'max-w-60', '@max-[47.5625rem]:max-h-8'])
      );
      expect(logoImg!.classes()).not.toContain('@max-[25.0625rem]:hidden');
      expect(brand(wrapper).text()).toBe('');
    });

    it('wraps a text-only wordmark onto two centred lines below 360px', () => {
      const wrapper = mountSeed();
      const name = brand(wrapper).get('span span');
      expect(name.classes()).toEqual(
        expect.arrayContaining([
          '@max-[22.5rem]:whitespace-normal',
          '@max-[22.5rem]:text-center',
          '@max-[22.5rem]:max-w-[5.75rem]',
        ])
      );
    });
  });

  describe('panels', () => {
    it('draws column headings, linked or plain, a badge and a see-all link', async () => {
      const wrapper = mountSeed();
      await trigger(wrapper, 'Ceramics').trigger('click');
      const ceramics = panel(wrapper, 'Ceramics');
      const headings = ceramics.findAll('[data-part="groupHeading"]');
      expect(headings.map((heading) => heading.text())).toEqual([
        'By type',
        'By glaze',
        'Makers',
        'Best sellers',
      ]);
      expect(headings[0]!.find('a').exists()).toBe(true);
      expect(headings[1]!.find('a').exists()).toBe(false);
      const vases = ceramics.findAll('a').find((a) => a.text().startsWith('Vases'))!;
      expect(vases.get('[data-part="label"]').text()).toBe('New');
      const seeAll = ceramics.get('[data-see-all]');
      expect(seeAll.text()).toBe('All ceramics');
      expect(seeAll.attributes('href')).toBe('/categories/home/ceramics');
      // A column's own see-all link stands in for the panel's "View all" row.
      expect(ceramics.find('[data-eldra-mega-view-all]').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('draws product cards with their picture, title and price', async () => {
      const wrapper = mountSeed();
      await trigger(wrapper, 'Shop').trigger('click');
      const cards = panel(wrapper, 'Shop').findAll('[data-part="card"]');
      expect(cards).toHaveLength(2);
      expect(cards[0]!.get('img').attributes('src')).toBe('/images/mug.webp');
      expect(cards[0]!.get('[data-part="cardTitle"]').text()).toBe('Speckled latte mug');
      expect(cards[0]!.find('[data-part="cardPrice"]').exists()).toBe(true);
      expect(cards[0]!.element.closest('a')!.getAttribute('href')).toBe(
        '/products/speckled-latte-mug'
      );
    });

    it('hangs a one-column panel with no heading under its trigger, descriptions under the links', async () => {
      const wrapper = mountSeed();
      await trigger(wrapper, 'Journal').trigger('click');
      const journal = panel(wrapper, 'Journal');
      expect(journal.get('[data-part="content"]').classes()).toContain(
        'eldra:eldra-nav-menu-dropdown'
      );
      expect(journal.findAll('[data-part="description"]').map((d) => d.text())).toEqual([
        'Washing linen, seasoning boards, storing wool',
        'Mornings with the people who make our goods',
        'Small rituals and slow mornings',
      ]);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('opens the dropdown from the keyboard and walks its links', async () => {
      const wrapper = mountSeed();
      const journal = trigger(wrapper, 'Journal');
      (journal.element as HTMLElement).focus();
      await journal.trigger('keydown', { key: 'ArrowDown' });
      await nextTick();
      expect(journal.attributes('aria-expanded')).toBe('true');
      const rows = panel(wrapper, 'Journal').findAll('a');
      expect(document.activeElement).toBe(rows[0]!.element);
      await rows[0]!.trigger('keydown', { key: 'ArrowDown' });
      expect(document.activeElement).toBe(rows[1]!.element);
      await rows[1]!.trigger('keydown', { key: 'Escape' });
      await nextTick();
      expect(journal.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(journal.element);
    });

    it('lays the drawer out as an accordion by default, and as open sections on request', async () => {
      const accordion = mountSeed();
      expect(accordion.find('[data-part="drawerSectionHeading"]').exists()).toBe(false);
      accordion.unmount();
      const sections = mountSeed({ drawerLayout: 'sections' });
      const headings = sections.findAll('[data-part="drawerSectionHeading"]');
      expect(headings.map((heading) => heading.text())).toEqual(['Shop', 'Ceramics', 'Journal']);
      expect(await axe(sections.element)).toHaveNoViolations();
    });
  });

  it('pads the fixed bar by the scrollbar width an open overlay takes away', () => {
    expect(mountSeed().get('header').classes()).toContain('pr-(--eldra-scrollbar-width,0px)');
    expect(mountSeed({ sticky: false }).get('header').classes()).not.toContain(
      'pr-(--eldra-scrollbar-width,0px)'
    );
  });
});
