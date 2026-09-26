// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes when an author inserts the block —
// it never carries a logo (Core's write-side media validator rejects the
// old Storybook-fixture shape; see task-9b-live-report.md, Finding 2).
// `preview.json` is the story/preview-only demo-imagery overlay, merged the
// same way `scripts/generate-stories.mjs`'s `Default` story merges it.
const withLogo = { ...mock, ...preview };

describe('navigation block', () => {
  it('renders the bare mock.json content — the freshly-inserted state, brand as text since there is no logo yet', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain(mock.brand);
    for (const link of mock.links) expect(wrapper.text()).toContain(link.label);
    expect(wrapper.text()).toContain(mock.ctaLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the brand via the logo image once preview.json overlays one', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withLogo } }));
    expect(wrapper.find('img').attributes('alt')).toBe(withLogo.brand);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  /**
   * Fix round 2 ruling 1: the logo is not a CMS-framed image (no `framing`, no `entryId`/
   * `fieldPath`), so it renders as a plain `<img>` rather than through `UiImage` — routing it
   * through `UiImage` put the `h-8 w-auto` height cap on `Image`'s root instead of the `<img>`
   * itself, and with no `aspect`/`fill` the frame had no definite height for it to reach, so a
   * real logo would render at its own scaled height instead of the fixed 2rem brand slot.
   * Asserting the class lands directly on the `<img>`, with no `[data-part]` wrapper around it, is
   * what would have caught that.
   */
  it('renders the logo as a plain <img> with the height cap directly on it, no [data-part] wrapper', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withLogo } }));
    const img = wrapper.get('img');
    expect(img.classes()).toEqual(expect.arrayContaining(['h-8', 'w-auto']));
    expect(img.attributes('loading')).toBe('eager');
    expect(img.attributes('decoding')).toBe('async');
    // Not `Image`'s own media element (which would carry `data-part="media"` and sit inside a
    // `data-part="frame"` wrapper) — `[data-part]` elsewhere in the tree (`Link`'s own root/label)
    // is unrelated and expected.
    expect(img.attributes('data-part')).toBeUndefined();
    expect(wrapper.find('[data-part="frame"]').exists()).toBe(false);
  });

  it('routes the header call to action through the router, not a document navigation', () => {
    // Every same-site destination in this block goes through `EldraRouterLink` -> `NuxtLink`; the
    // CTA is a `Button`, which reaches it through the same `as` prop `Link` uses and hands it the
    // destination as `to`. Asserting the component's prop rather than the rendered `href` is what
    // tells a routed action from an unrouted one — the stub renders an `<a href>` either way.
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    // In order: the brand link, the five header nav links, the header CTA, then the drawer's own
    // copy of the five links and of the CTA. Both CTAs are the ones this closes — they were plain
    // document navigations while every link around them routed.
    const brand = '/';
    const navLinks = ['/', '/shop', '/journal', '/about', '/contact'];
    const cta = '/shop';
    expect(destinations).toEqual([brand, ...navLinks, cta, ...navLinks, cta]);
  });

  it('leaves an off-site call to action a plain document navigation', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, ctaHref: 'https://example.com/shop' } } })
    );
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(destinations).not.toContain('https://example.com/shop');
    expect(wrapper.findAll('a[href="https://example.com/shop"]').length).toBeGreaterThan(0);
  });

  it('opens the mobile drawer from the toggle button and sets aria-expanded', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    const toggle = wrapper.get('button[aria-controls]');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');

    expect(toggle.attributes('aria-expanded')).toBe('true');
    const dialog = wrapper.get('dialog');
    expect(dialog.attributes('open')).toBe('');
    expect(dialog.attributes('id')).toBe(toggle.attributes('aria-controls'));
  });

  it('closes the drawer on Escape', async () => {
    // The dialog polyfill's Escape handler queries `document` for the
    // topmost open `<dialog>` (see test/support/dialog.ts), so the wrapper
    // must actually be attached to the document, not just rendered into a
    // detached fragment — mirrors UiDialog.spec.ts's own Escape test.
    const wrapper = mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: mock } }),
      attachTo: document.body,
    });
    const toggle = wrapper.get('button[aria-controls]');
    await toggle.trigger('click');
    expect(wrapper.get('dialog').attributes('open')).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise((resolve) => setTimeout(resolve));
    await wrapper.vm.$nextTick();

    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('renders each declared variant with a logo', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withLogo, variant } } })
      );
      expect(wrapper.find('img').attributes('alt')).toBe(withLogo.brand);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  });

  it('renders each declared variant from the bare mock.json, no crash and axe-clean (regression net for a freshly-inserted block)', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.find('img').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  });

  it('centered variant pins brand, links and actions to row 1 at md+', () => {
    // Regression for a CSS Grid auto-placement bug: the DOM order is
    // brand -> links -> actions, but the visual column order is links(1) ->
    // brand(2) -> actions(3). A `grid-column` alone (no `grid-row`) lets the
    // sparse auto-placement cursor — which only ever advances forward
    // through DOM order — strand the out-of-order children on a second row.
    // jsdom does not lay out grid, so this asserts the class set that pins
    // every child to `md:row-start-1` instead of a rendered bounding box;
    // the actual single-row rendering is confirmed with a Storybook/Chromium
    // screenshot.
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'centered' } } })
    );
    const headerNav = wrapper.findAll('nav')[0]!; // the header's own <nav>, not the drawer's

    const brandLink = headerNav.find('a');
    expect(brandLink.classes()).toEqual(
      expect.arrayContaining(['md:col-start-2', 'md:row-start-1', 'md:justify-self-center'])
    );

    const desktopList = headerNav.find('ul');
    expect(desktopList.classes()).toEqual(
      expect.arrayContaining(['md:col-start-1', 'md:row-start-1', 'md:justify-self-start'])
    );

    const toggle = wrapper.get('button[aria-controls]');
    const actions = toggle.element.parentElement!;
    expect(Array.from(actions.classList)).toEqual(
      expect.arrayContaining(['md:col-start-3', 'md:row-start-1', 'md:justify-self-end'])
    );
  });

  it('minimal variant hides the desktop links list, keeping only the drawer list and the toggle', () => {
    const withLinks = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(withLinks.findAll('ul')).toHaveLength(2); // desktop nav + drawer

    const minimal = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'minimal' } } })
    );
    expect(minimal.findAll('ul')).toHaveLength(1); // drawer only
    expect(minimal.find('button[aria-controls]').exists()).toBe(true);
  });

  it('has no axe violations with the drawer open', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    await wrapper.get('button[aria-controls]').trigger('click');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
