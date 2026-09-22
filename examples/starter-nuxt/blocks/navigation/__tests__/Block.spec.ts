// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('navigation block', () => {
  it('renders the mock content (brand via logo image, since mock.json sets one)', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.find('img').attributes('alt')).toBe(mock.brand);
    for (const link of mock.links) expect(wrapper.text()).toContain(link.label);
    expect(wrapper.text()).toContain(mock.ctaLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the brand as text when no logo is set', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, logo: undefined } } })
    );
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain(mock.brand);
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

  it('renders each declared variant', async () => {
    for (const variant of ['default', 'centered', 'minimal']) {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.find('img').attributes('alt')).toBe(mock.brand);
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
    // screenshot (see task-6-report.md's Fix round 1 section).
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
