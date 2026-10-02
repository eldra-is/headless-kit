// @vitest-environment jsdom
import { mount, type DOMWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { Badge } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { computed, nextTick } from 'vue';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';

// `mock.json` is the seed Studio writes when an author inserts the block — media fields
// (`brandLogo`) are absent, and a collection destination is named by handle, because a theme
// cannot know an organisation's catalog ids.
//
// Core rewrites those handles to ids when it seeds the entry, and the site resolves each id to a
// slug and a title before rendering. `resolveTargets` does both here, so a spec can assert the
// hrefs a real page produces; `mock` itself stays the unresolved seed, which is what a header
// looks like the moment it is inserted and nothing has resolved yet.
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
interface SeedLink {
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
    if (link.target === undefined || slug === undefined) {
      return { ...link, ...(link.children ? { children: link.children.map(rewrite) } : {}) };
    }
    const id = `id-${slug}`;
    targets.set(`${link.target._type}:${id}`, { slug, title: link.label });
    return {
      ...link,
      target: { _type: link.target._type, id },
      ...(link.children ? { children: link.children.map(rewrite) } : {}),
    };
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

describe('header block (navigation apiId)', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
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
    const rows = wrapper.findAll('nav ul li');
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
    // Exactly one `<nav>` — the bar's own row. The drawer's copy of the link list is a plain
    // `<div>`/`<ul>` with no `nav` landmark of its own: with no real stylesheet loaded, jsdom/axe
    // cannot tell "hidden below 64rem" from "visible", so a second identically-labelled `nav`
    // would trip axe's `landmark-unique` rule the moment both exist in the same render.
    const wrapper = mountBlock(resolved.data);
    const navs = wrapper.findAll('nav[aria-label="Primary navigation"]');
    expect(navs).toHaveLength(1);
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
    it('Enter/Space toggles the trigger; hover alone never opens it; opening one closes the other', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      // Locate the two mega-menu triggers by their accessible label text.
      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      const ceramics = wrapper.findAll('button').find((b) => b.text().includes('Ceramics'))!;

      expect(knitwear.attributes('aria-expanded')).toBe('false');
      await knitwear.trigger('mouseenter');
      expect(knitwear.attributes('aria-expanded')).toBe('false'); // nothing opens on hover alone (no wait)
      await knitwear.trigger('mouseleave');

      await knitwear.trigger('keydown', { key: 'Enter' });
      expect(knitwear.attributes('aria-expanded')).toBe('true');

      // Opening the other one closes the first.
      await ceramics.trigger('keydown', { key: ' ' });
      expect(ceramics.attributes('aria-expanded')).toBe('true');
      expect(knitwear.attributes('aria-expanded')).toBe('false');

      // Toggling the same trigger again closes it.
      await ceramics.trigger('keydown', { key: 'Enter' });
      expect(ceramics.attributes('aria-expanded')).toBe('false');

      wrapper.unmount();
    });

    it('hover opens a panel after 150ms, leaving it closes it after 150ms, and a click-opened panel stays', async () => {
      vi.useFakeTimers();
      try {
        const wrapper = mountBlock(resolved.data, { attachTo: document.body });
        const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
        const panel = () => wrapper.find(`#${knitwear.attributes('aria-controls')}`);

        await knitwear.trigger('mouseenter');
        vi.advanceTimersByTime(160);
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('true');

        // Crossing from the trigger into the panel keeps it open.
        await knitwear.trigger('mouseleave');
        await panel().trigger('mouseenter');
        vi.advanceTimersByTime(300);
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('true');

        // Leaving the panel closes what hover opened.
        await panel().trigger('mouseleave');
        vi.advanceTimersByTime(160);
        await nextTick();
        expect(knitwear.attributes('aria-expanded')).toBe('false');

        // A panel opened by Enter is not hover-owned: the pointer leaving does not close it.
        await knitwear.trigger('keydown', { key: 'Enter' });
        expect(knitwear.attributes('aria-expanded')).toBe('true');
        await knitwear.trigger('mouseenter');
        await knitwear.trigger('mouseleave');
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
      const reserved = spacer.get('div');
      const bar = wrapper.get('header nav');
      for (const height of ['h-16', '@content:h-[4.5rem]']) {
        expect(bar.classes()).toContain(height);
        expect(reserved.classes()).toContain(height);
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
      await knitwear.trigger('keydown', { key: 'Enter' });
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
        const searchButton = wrapper.get('button[aria-label="Search"]');

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
          await ceramics.trigger('mouseenter');
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

          await knitwear.trigger('mouseenter');
          vi.advanceTimersByTime(160);
          await nextTick();
          expect(knitwear.attributes('aria-expanded')).toBe('true');

          // Focus has arrived inside what hover opened, so the pointer no longer owns it: closing
          // on the way out would strand that focus on a link the panel has just hidden.
          panelLinks(wrapper, knitwear)[0]!.element.focus();
          await knitwear.trigger('mouseleave');
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
      // The first row of the drawer's own list — a disclosure button (Knitwear has a mega-menu).
      const firstRow = wrapper.get('dialog ul li:first-child button, dialog ul li:first-child a');
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
    // href="/cart">` (Button's own link form), not a `<button>` — search both tags.
    function findCartButton(wrapper: ReturnType<typeof mountBlock>) {
      return wrapper
        .findAll('a, button')
        .find((b) => b.attributes('aria-label')?.startsWith('Cart'))!;
    }

    it('reads "Cart, empty" with nothing in the cart, and shows no badge', () => {
      const wrapper = mountBlock(resolved.data); // demo storefront's cart starts empty
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, empty');
      expect(wrapper.findComponent(Badge).exists()).toBe(false);
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
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, 2 items');
      const badge = wrapper.findComponent(Badge);
      expect(badge.attributes('aria-hidden')).toBe('true');
      expect(badge.text()).toBe('2');
      // The pill is a sibling drawn over the bag's corner, and with the count it grows across the
      // middle of the button; a pointer on it must still reach the bag underneath.
      expect(badge.classes()).toContain('pointer-events-none');
    });

    it('reads "99+" above 99', async () => {
      const wrapper = mountWithCartCount(mock, 120);
      await nextTick();
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, 120 items');
      expect(wrapper.findComponent(Badge).text()).toBe('99+');
    });

    // The bag's two forms, and the destination of the link form. With no drawer mounted the bag is
    // an anchor to `/cart`, which is `app/pages/cart.vue` — a theme route, prerendered by
    // `nuxt.config.ts`. It used to be an anchor to a path nothing in the theme answered, so the
    // site's catch-all asked the gateway for a CMS page called "cart", found none, and every
    // shopper who clicked the bag landed on the not-found shell.
    it('links to the cart route when no drawer is mounted, and claims no popup', () => {
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
    // jsdom computes no layout, so the proof that the panel really lands on the brand's left edge
    // and the actions' right edge is the browser case in `test/prerenderRefresh.browser.spec.ts`.
    // What is checkable here is the arrangement that produces it: the panel is pinned to the
    // header's own content box — the `<nav>` — rather than to the item that opened it, and its
    // columns are the container's 12-column grid.
    it('pins the panel to the header container, not to the trigger that opened it', async () => {
      const wrapper = mountBlock(resolved.data, { attachTo: document.body });
      const nav = wrapper.get('nav');
      // The positioning context: the panel's `left-0 right-0` only means "the header container"
      // because this is the nearest positioned ancestor.
      expect(nav.classes()).toContain('relative');
      // …and no row of the bar may reclaim it, or the panel would hang under its own item again.
      for (const row of wrapper.findAll('nav > ul > li')) {
        expect(row.classes()).not.toContain('relative');
      }

      const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
      await knitwear.trigger('click');
      const panel = wrapper.get(`#${knitwear.attributes('aria-controls')}`);
      expect(panel.attributes('data-eldra-mega-panel')).toBe('');
      for (const token of ['absolute', 'top-full', 'left-0', 'right-0']) {
        expect(panel.classes()).toContain(token);
      }
      // A width of its own is exactly what the old panel had, and what made it feel arbitrary.
      expect(panel.classes()).not.toContain('w-screen');
      expect(panel.classes().some((token) => token.startsWith('max-w-'))).toBe(false);
      // The hairline above the panel is the bar's own full-bleed bottom border, so the panel takes
      // no top border of its own; the other three sides are the border token, the bottom corners
      // are rounded, and the shadow falls below.
      for (const token of [
        'border',
        'border-t-0',
        'border-border',
        'rounded-b-lg',
        'shadow-float',
      ]) {
        expect(panel.classes()).toContain(token);
      }

      // The container's grid: 12 columns, 24px gutters, and an inset that keeps every column off
      // the panel's own edges — 24px, 32px once the container passes `wide`. The browser case
      // measures what this produces; here it is only the arrangement.
      for (const token of ['grid', 'grid-cols-12', 'gap-6', 'p-6', '@wide:p-8']) {
        expect(panel.classes()).toContain(token);
      }
      expect(panel.classes()).not.toContain('py-8');
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
      // Right-aligned under a rule that spans the panel's content width, 16px above it.
      for (const token of ['justify-end', 'border-t', 'border-border', 'pt-4', 'col-span-12']) {
        expect([...viewAll.element.parentElement!.classList]).toContain(token);
      }
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
      const panel = wrapper.get(`#${knitwear.attributes('aria-controls')}`);
      expect(panel.attributes('style')).toContain('background: var(--eldra-header-surface)');
      // And no ground token of its own left behind to drift away from the bar's.
      expect(panel.classes()).not.toContain('bg-background');
      wrapper.unmount();
    });

    it('eases the panel in and out, with the rise dropped under reduced motion', async () => {
      // A `<Transition>` applies its from/active classes in the same patch that opens or closes the
      // panel, one frame before the to-classes land, so this is the frame they can be read in.
      // jsdom computes no transition at all, which is also why the leave's own duration is proven in
      // the browser spec instead; what is checkable here is the wiring and the numbers on it.
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
      for (const token of [
        'opacity-0',
        'motion-safe:-translate-y-1',
        'transition-[opacity,transform]',
        'duration-[150ms]',
        'ease-out',
      ]) {
        expect(panel().classes(), 'enter').toContain(token);
      }

      await knitwear.trigger('click');
      // The panel is still there, and still addressable, while it leaves — that is the whole point
      // of a `<Transition>` over a bare `v-show` — but it can no longer be pointed at, so a pointer
      // crossing it on its way out never clears the close timer and pulls it back open.
      expect(knitwear.attributes('aria-expanded')).toBe('false');
      for (const token of [
        'pointer-events-none',
        'transition-[opacity,transform]',
        'duration-[120ms]',
        'ease-in',
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
    const searchButton = wrapper.get('button[aria-label="Search"]');
    expect(searchButton.attributes('aria-haspopup')).toBe('dialog');
    await searchButton.trigger('click');
    const dialogs = wrapper.findAll('dialog');
    expect(dialogs.some((d) => d.attributes('open') === '')).toBe(true);
    wrapper.unmount();
  });

  it('minimal variant keeps links, account and the call to action only in the drawer', () => {
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

  describe('empty / editor state', () => {
    /**
     * The header a fresh store actually starts with, copied from the shape every
     * `pages/*.page.json` seeds: brand, search, cart — no links, no call to action, and accounts
     * off until the store has them. `mock.json` keeps its demo links because it is the state an
     * author sees the moment they *insert* the block, not the state a deploy seeds.
     */
    const SEEDED = {
      variant: 'default',
      brandText: 'Northwind Goods',
      links: [],
      showSearch: true,
      searchStyle: 'icon',
      showAccount: false,
      sticky: true,
      transparentOverHero: false,
    };

    it('renders the seeded header as brand and actions only — no links, no CTA, no account, axe-clean', async () => {
      const wrapper = mountBlock(SEEDED);
      expect(wrapper.text()).toContain('Northwind Goods');
      // The bar's link list is not drawn at all with nothing in it, so no empty `<ul>` is left
      // sitting in the grid.
      expect(wrapper.find('ul.list-none.items-center').exists()).toBe(false);
      expect(wrapper.find('button[aria-label="Search"]').exists()).toBe(true);
      expect(wrapper.find('[aria-label="Cart, empty"]').exists()).toBe(true);
      expect(wrapper.find('[aria-label="Account"]').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('draws no Menu button and no drawer when the drawer would be empty', () => {
      // The drawer holds links, the call to action and the account row. With none of the three
      // there is nothing to open, and a Menu button that opens an empty sheet is a control that
      // does nothing.
      const wrapper = mountBlock(SEEDED);
      expect(wrapper.find('button[aria-label="Open menu"]').exists()).toBe(false);
      // `dialog[aria-label="Menu"]` is the drawer itself; the search overlay's own `<dialog>`
      // renders either way, so the drawer has to be named rather than counted.
      expect(wrapper.find('dialog[aria-label="Menu"]').exists()).toBe(false);
      expect(mountBlock(resolved.data).find('dialog[aria-label="Menu"]').exists()).toBe(true);
    });

    it('keeps the Menu button as soon as the drawer has something to show', () => {
      for (const data of [
        { ...SEEDED, showAccount: true },
        { ...SEEDED, links: [{ kind: 'url', url: '/journal', label: 'Journal' }] },
        { ...SEEDED, ctaLabel: 'Shop', cta: { kind: 'url', url: '/collections/all' } },
      ]) {
        const wrapper = mountBlock(data);
        expect(wrapper.find('button[aria-label="Open menu"]').exists()).toBe(true);
      }
    });

    it('treats an entry with no showAccount value as off, matching the field’s declared default', () => {
      // `block.json` declares `default: false`, so an entry that was written before the field
      // existed — or by anything that omits it — must read as off rather than inheriting the old
      // "on unless turned off" behaviour.
      const { showAccount: _omitted, ...withoutTheField } = SEEDED;
      const wrapper = mountBlock(withoutTheField);
      expect(wrapper.find('[aria-label="Account"]').exists()).toBe(false);
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
      user: 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2',
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
