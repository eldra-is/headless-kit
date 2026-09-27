// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { Container } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

/**
 * Spec "Breadcrumbs" → "Default content (Northwind Goods)": "Deep trail: Home › Kitchen › Table &
 * serving › Bowls › Speckled serving bowl, large." Five resolved items at the default
 * `collapseAfter: 1` / `keepLast: 2` collapses exactly two middle levels (Kitchen, Table &
 * serving) behind the "…" button — enough to exercise the collapse/expand keyboard path.
 */
const deepTrailData = {
  showHome: true,
  homeLabel: 'Home',
  trail: [
    { label: 'Kitchen', href: '/kitchen' },
    { label: 'Table & serving', href: '/kitchen/table-serving' },
    { label: 'Bowls', href: '/kitchen/table-serving/bowls' },
  ],
  currentTitle: 'Speckled serving bowl, large',
  showCurrent: true,
  container: 'wide',
};

/** A top-level page: nothing to build a trail from at all. */
const topLevelPageData = {
  showHome: true,
  homeLabel: 'Home',
  trail: [],
  currentTitle: '',
  showCurrent: true,
  container: 'wide',
};

function mountBlock(data: Record<string, unknown>) {
  return mount(Block, mountOptions({ entry: { id: 'e1', data } }));
}

/** Same as `mountBlock`, but with the Studio page-builder's edit mode active — the only state
 *  `EditorPlaceholder` renders in (`useEditing()`). Mirrors `test/useEditing.spec.ts`'s own
 *  `contextWith` helper: `createEldraPreviewState()` is `reactive`, so mutating the fields
 *  `mountOptions` already built is enough — no need to reassemble the whole context by hand. */
function mountEditing(data: Record<string, unknown>) {
  const options = mountOptions({ entry: { id: 'e1', data } });
  const context = options.global.provide[ELDRA_KEY] as {
    preview: { active: boolean; mode: string };
  };
  context.preview.active = true;
  context.preview.mode = 'edit';
  return mount(Block, options);
}

describe('breadcrumbs block', () => {
  it('renders the mock content with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.text()).toContain(mock.homeLabel);
    for (const level of mock.trail) expect(wrapper.text()).toContain(level.label);
    expect(wrapper.text()).toContain(mock.currentTitle);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['wide', 'content'] as const)(
    'renders the %s container option with no axe violations',
    async (container) => {
      const wrapper = mountBlock({ ...mock, container });
      const wideOrContent =
        container === 'wide' ? 'eldra-container-wide' : 'eldra-container-content';
      expect(wrapper.getComponent(Container).classes()).toContain(wideOrContent);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('is a nav landmark named "Breadcrumb" wrapping an ordered list', () => {
    const wrapper = mountBlock(mock);
    const nav = wrapper.get('nav');
    expect(nav.attributes('aria-label')).toBe('Breadcrumb');
    expect(nav.get('ol').exists()).toBe(true);
  });

  it('marks the current page as a span[aria-current=page], never a link', () => {
    const wrapper = mountBlock(mock);
    const current = wrapper.get('[data-part="current"]');
    expect(current.element.tagName).toBe('SPAN');
    expect(current.attributes('aria-current')).toBe('page');
    expect(current.text()).toBe(mock.currentTitle);
    // Mutation check (manual): removing `aria-current="page"` from `currentClass`'s target — i.e.
    // asserting on a plain span with no attribute — would still pass a bare `tagName` check, so
    // the `aria-current` assertion is the one that actually guards this behaviour; confirmed by
    // temporarily asserting `toBeUndefined()` here, which fails against the real render.
    expect(wrapper.findAll('a').some((a) => a.text() === mock.currentTitle)).toBe(false);
  });

  it('ends the trail at the parent when showCurrent is false', () => {
    const wrapper = mountBlock({ ...mock, showCurrent: false });
    expect(wrapper.text()).not.toContain(mock.currentTitle);
    const current = wrapper.get('[data-part="current"]');
    expect(current.text()).toBe('Sweaters');
  });

  it('renders nothing live on a top-level page, and the editor hint only in the editor', () => {
    const live = mountBlock(topLevelPageData);
    expect(live.find('nav').exists()).toBe(false);
    expect(live.text()).toBe('');

    const editing = mountEditing(topLevelPageData);
    expect(editing.find('nav').exists()).toBe(false);
    expect(editing.text()).toContain('Breadcrumbs fill in automatically.');
    expect(editing.text()).toContain('They appear once this page sits under a parent page.');
  });

  it('passes axe with no violations for the empty-trail editor hint', async () => {
    const editing = mountEditing(topLevelPageData);
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('keeps a 64-character currentTitle fully in the DOM and in the title attribute', async () => {
    const longTitle = 'How to wash dry and store merino so it lasts ten winters or more!'.slice(
      0,
      64
    );
    expect(longTitle).toHaveLength(64);
    const wrapper = mountBlock({ ...mock, currentTitle: longTitle });
    await nextTick();
    expect(wrapper.text()).toContain(longTitle);
    const current = wrapper.get('[data-part="current"]');
    expect(current.text()).toBe(longTitle);
    expect(current.attributes('title')).toBe(longTitle);
  });

  describe('collapse / expand keyboard path', () => {
    it('collapses the middle two levels behind a "…" button naming the hidden count', () => {
      const wrapper = mountBlock(deepTrailData);
      const ellipsis = wrapper.get('[data-part="ellipsis"]');
      expect(ellipsis.attributes('aria-label')).toBe('Show 2 more levels');

      const hiddenLevels = wrapper
        .findAll('[data-part="item"]')
        .filter((item) => item.classes().includes('@max-tablet:hidden'));
      expect(hiddenLevels.map((item) => item.text())).toEqual(['Kitchen', 'Table & serving']);
    });

    it('reaches Home, then the "…" button, then the parent, in that order', () => {
      // The collapsed middle levels carry `@max-tablet:hidden` (a container-query class jsdom does
      // not evaluate — there is no real layout — so "reaches" is asserted the same way the
      // package's own Breadcrumb.spec.ts does: by document order over the levels that are *not*
      // collapse-hidden, which below the 48rem collapse threshold is exactly the operable Tab path
      // a real browser gives (a `display:none` element is never a Tab stop).
      const wrapper = mountBlock(deepTrailData);
      const visibleFocusable = wrapper
        .findAll('[data-part="item"]')
        .filter((item) => !item.classes().includes('@max-tablet:hidden'))
        .map((item) => {
          const link = item.find('[data-part="link"]');
          if (link.exists()) return link.text();
          const button = item.find('[data-part="ellipsis"]');
          if (button.exists()) return 'ellipsis';
          return item.get('[data-part="current"]').text();
        });
      expect(visibleFocusable).toEqual([
        'Home',
        'ellipsis',
        'Bowls',
        'Speckled serving bowl, large',
      ]);
    });

    it('activating "…" reveals every level and moves focus to the first revealed link', async () => {
      const wrapper = mount(Block, {
        ...mountOptions({ entry: { id: 'e1', data: deepTrailData } }),
        attachTo: document.body,
      });
      const ellipsis = wrapper.get('[data-part="ellipsis"]');

      // A native `<button type="button">` guarantees Enter/Space activation dispatches `click` on
      // every real browser and screen reader (the HTML platform's own default activation
      // behaviour) — jsdom does not implement that default action for keyboard events (verified:
      // dispatching a raw `keydown` at a bare `<button>` with no explicit handler never fires
      // `click` under jsdom), so the operable path is exercised the same way the package's own
      // `Breadcrumb.spec.ts` "reveals every level..." test does: activate via `click`, the event a
      // real Enter/Space keypress on this exact element resolves to.
      await ellipsis.trigger('click');
      await nextTick();
      await nextTick();

      expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
      for (const item of wrapper.findAll('[data-part="item"]')) {
        expect(item.classes()).not.toContain('@max-tablet:hidden');
      }

      const links = wrapper.findAll('[data-part="link"]');
      expect(links.map((link) => link.text())).toEqual([
        'Home',
        'Kitchen',
        'Table & serving',
        'Bowls',
      ]);

      const firstRevealed = links[1]!; // Kitchen — the first item middleItems reveals.
      expect(document.activeElement).toBe(firstRevealed.element);
      wrapper.unmount();
    });
  });

  it('routes the trail through the router (every level is same-site)', () => {
    const wrapper = mountBlock(mock);
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    // Home (/) + the two mock trail levels — three links; the current page is never one.
    expect(destinations).toEqual(['/', '/collections/knitwear', '/collections/mens-sweaters']);
  });

  it('falls back to a plain document navigation when a trail level is off-site', () => {
    const wrapper = mountBlock({
      ...mock,
      trail: [{ label: 'Partner shop', href: 'https://example.com/shop' }],
    });
    expect(wrapper.findAllComponents({ name: 'NuxtLink' })).toHaveLength(0);
    expect(wrapper.get('a[href="https://example.com/shop"]').text()).toBe('Partner shop');
  });

  it('drops a trail level with an unsafe href instead of rendering a broken link', () => {
    const wrapper = mountBlock({
      ...mock,
      trail: [{ label: 'Bad', href: 'javascript:alert(1)' }, ...mock.trail],
    });
    expect(wrapper.text()).not.toContain('Bad');
    expect(wrapper.text()).toContain('Knitwear');
  });
});
