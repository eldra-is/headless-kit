// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { Badge } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { computed, nextTick } from 'vue';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

// `mock.json` is the seed Studio writes when an author inserts the block —
// media fields (`brandLogo`, `links[].features[].image`) are absent.
// `preview.json` (shallow-merged, `links` replaced wholesale) is the
// story/preview-only demo-imagery overlay: same links, Knitwear also gets
// its two feature cards.
const merged = { ...mock, ...preview };

/** Every hand-rolled `<svg>` in this block (menu, chevrons, arrow, search, account, cart) now
 *  resolves through `EldraIcon` (Tabler-by-name), which under Nuxt calls `/api/eldra-icon`;
 *  outside Nuxt that needs an injected `ICON_FETCHER_KEY` (the same pattern `gallery`'s and
 *  `trust-strip`'s own specs use) — `stubFetcher` reads the real SVG synchronously via
 *  `tablerIconSvg`, network-free. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/** The injected fetcher still resolves through a promise; flush one microtask/macrotask turn
 *  before asserting on icon markup — the same wait `trust-strip`'s/`team`'s own specs use. */
async function flushIcons(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

function mountBlock(data: Record<string, unknown>, opts?: { attachTo?: Element }) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  return mount(Block, {
    ...base,
    ...opts,
    global: {
      ...base.global,
      provide: { ...base.global.provide, [ICON_FETCHER_KEY]: stubFetcher },
    },
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
        [ICON_FETCHER_KEY]: stubFetcher,
        [ELDRA_KEY]: {
          client: {},
          designTokens: { colors: {} },
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
        [ICON_FETCHER_KEY]: stubFetcher,
        [STOREFRONT_KEY]: { ...storefront, cart },
      },
    },
  });
}

describe('header block (navigation apiId)', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the bare mock.json content — the freshly-inserted state, no images, axe-clean', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain(mock.brandText);
    for (const link of mock.links) expect(wrapper.text()).toContain(link.label);
    expect(wrapper.text()).toContain(mock.ctaLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the merged preview.json content with the Knitwear feature cards, axe-clean', async () => {
    const wrapper = mountBlock(merged, { attachTo: document.body });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
    await knitwear.trigger('click');
    const panelId = knitwear.attributes('aria-controls')!;
    const panel = wrapper.get(`#${panelId}`);
    expect(panel.findAll('img')).toHaveLength(2);
    expect(panel.text()).toContain('New season knitwear');
    wrapper.unmount();
  });

  it('renders each declared variant with the merged content, axe-clean', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mountBlock({ ...merged, variant });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  });

  it('has no h1 anywhere in the header (block headings are never h1)', () => {
    const wrapper = mountBlock(merged);
    expect(wrapper.find('h1').exists()).toBe(false);
  });

  it('labels the primary navigation landmark', () => {
    // Exactly one `<nav>` — the bar's own row. The drawer's copy of the link list is a plain
    // `<div>`/`<ul>` with no `nav` landmark of its own: with no real stylesheet loaded, jsdom/axe
    // cannot tell "hidden below 64rem" from "visible", so a second identically-labelled `nav`
    // would trip axe's `landmark-unique` rule the moment both exist in the same render.
    const wrapper = mountBlock(mock);
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
    const wrapper = mountBlock(mock);
    expect(wrapper.get('header').classes()).toContain('@container');
  });

  it('never emits data-section/data-section-bg (it is not a Section, so a following Hero keeps its own top padding)', () => {
    const wrapper = mountBlock(mock);
    const header = wrapper.get('header').element;
    expect(header.hasAttribute('data-section')).toBe(false);
    expect(header.hasAttribute('data-section-bg')).toBe(false);
  });

  it('marks the brand link as the header’s announced focus target for announcement-bar dismissal', () => {
    // Cross-block contract (the announcement-bar block): after dismissing itself, it moves focus to
    // `[data-eldra-header-focus]` in the header, falling back to `#main`. The brand link is the
    // first focusable element in DOM order ahead of the primary links list.
    const wrapper = mountBlock(mock);
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
      const wrapper = mountBlock(mock, { attachTo: document.body });
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
        const wrapper = mountBlock(mock, { attachTo: document.body });
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

    it('a sticky bar hides on scroll-down, returns on scroll-up or at the top, and never hides while in use', async () => {
      const wrapper = mountBlock(mock, { attachTo: document.body });
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
      // … and so does keyboard focus inside the bar.
      await header.trigger('focusin');
      await scrollTo(1200);
      expect(header.classes()).not.toContain('-translate-y-full');
      await header.trigger('focusout', { relatedTarget: document.body });
      await scrollTo(1500);
      expect(header.classes()).toContain('-translate-y-full');

      await scrollTo(0);
      wrapper.unmount();
    });

    it('a non-sticky bar scrolls away with the page and never hides itself', async () => {
      const wrapper = mountBlock({ ...mock, sticky: false }, { attachTo: document.body });
      const header = wrapper.get('header');
      Object.defineProperty(window, 'scrollY', { value: 800, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      await nextTick();
      expect(header.classes()).not.toContain('sticky');
      expect(header.classes()).not.toContain('-translate-y-full');
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      wrapper.unmount();
    });

    it('Esc on the trigger closes the panel and returns focus to the trigger', async () => {
      const wrapper = mountBlock(mock, { attachTo: document.body });
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
      const wrapper = mountBlock(mock, { attachTo: document.body });
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
  });

  describe('drawer keyboard', () => {
    it('opens as a dialog with the first focusable row focused', async () => {
      const wrapper = mountBlock(mock, { attachTo: document.body });
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
      const wrapper = mountBlock(mock, { attachTo: document.body });
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
      const wrapper = mountBlock(mock); // demo storefront's cart starts empty
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, empty');
      expect(wrapper.findComponent(Badge).exists()).toBe(false);
    });

    it('reads "Cart, 1 item" for a single item', () => {
      const wrapper = mountWithCartCount(mock, 1);
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, 1 item');
    });

    it('reads "Cart, {n} items" for more than one, with an aria-hidden badge carrying the count', () => {
      const wrapper = mountWithCartCount(mock, 2);
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, 2 items');
      const badge = wrapper.findComponent(Badge);
      expect(badge.attributes('aria-hidden')).toBe('true');
      expect(badge.text()).toBe('2');
    });

    it('reads "99+" above 99', () => {
      const wrapper = mountWithCartCount(mock, 120);
      expect(findCartButton(wrapper).attributes('aria-label')).toBe('Cart, 120 items');
      expect(wrapper.findComponent(Badge).text()).toBe('99+');
    });
  });

  it('marks the current link with aria-current="page"', async () => {
    window.history.pushState({}, '', '/collections/kitchen');
    const wrapper = mountBlock(mock);
    const current = wrapper
      .findAll('a')
      .find((a) => a.attributes('href') === '/collections/kitchen')!;
    expect(current.attributes('aria-current')).toBe('page');
    const other = wrapper.findAll('a').find((a) => a.attributes('href') === '/journal')!;
    expect(other.attributes('aria-current')).toBeUndefined();
  });

  it('renders 8 links with no overflow markup errors', async () => {
    const eightLinks = [
      ...mock.links,
      { label: 'Sale', href: '/collections/sale' },
      { label: 'Gifts', href: '/collections/gifts' },
      { label: 'About', href: '/pages/about' },
    ];
    const wrapper = mountBlock({ ...mock, links: eightLinks });
    expect(wrapper.findAll('nav ul li, ul.list-none > li').length).toBeGreaterThan(0);
    for (const link of eightLinks) expect(wrapper.text()).toContain(link.label);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('bare mock (no features) spreads mega-menu groups across the full width', async () => {
    const wrapper = mountBlock(mock, { attachTo: document.body });
    const knitwear = wrapper.findAll('button').find((b) => b.text().includes('Knitwear'))!;
    await knitwear.trigger('click');
    const panelId = knitwear.attributes('aria-controls')!;
    const panel = wrapper.get(`#${panelId}`);
    expect(panel.find('img').exists()).toBe(false);
    expect(panel.text()).toContain('Women');
    expect(panel.text()).toContain('Merino essentials');
    wrapper.unmount();
  });

  it('the search control has aria-haspopup="dialog" and opens SearchModal', async () => {
    const wrapper = mountBlock(mock, { attachTo: document.body });
    const searchButton = wrapper.get('button[aria-label="Search"]');
    expect(searchButton.attributes('aria-haspopup')).toBe('dialog');
    await searchButton.trigger('click');
    const dialogs = wrapper.findAll('dialog');
    expect(dialogs.some((d) => d.attributes('open') === '')).toBe(true);
    wrapper.unmount();
  });

  it('minimal variant keeps links, account and the call to action only in the drawer', () => {
    const wrapper = mountBlock({ ...mock, variant: 'minimal' });
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
    it('shows the "Add a link" editor hint only while editing, with no links', () => {
      const empty = { ...mock, links: [] };
      const editing = mountWithEditing(empty, true);
      expect(editing.text()).toContain('Add a link');

      const live = mountWithEditing(empty, false);
      expect(live.text()).not.toContain('Add a link');
    });
  });

  describe('transparentOverHero', () => {
    it('field off renders solid, with no data-eldra-transparent attribute', () => {
      const wrapper = mountBlock({ ...mock, transparentOverHero: false });
      expect(wrapper.find('header').attributes('data-eldra-transparent')).toBeUndefined();
    });

    it('field on sets the transparent attribute (the block only reads its own field)', () => {
      const wrapper = mountBlock({ ...mock, transparentOverHero: true });
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
      'arrow-right': 'M13 6l6 6',
      search: 'M21 21l-6 -6',
      user: 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2',
      'shopping-bag': 'M9 11v-5a3 3 0 0 1 6 0v5',
    };

    it('replaces every hand-rolled <svg> with EldraIcon, resolving each Tabler icon by name', async () => {
      const wrapper = mountBlock(merged, { attachTo: document.body });
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
        const wrapper = mountBlock({ ...mock, sticky: true }, { attachTo: document.body });
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

    it('never publishes the variable for a non-sticky header', async () => {
      const stub = stubResizeObserver();
      try {
        const wrapper = mountBlock({ ...mock, sticky: false }, { attachTo: document.body });
        await nextTick();
        expect(document.documentElement.style.getPropertyValue('--eldra-header-height')).toBe('');
        wrapper.unmount();
      } finally {
        stub.restore();
      }
    });
  });
});
