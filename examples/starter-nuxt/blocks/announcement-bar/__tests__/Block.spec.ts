// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import Block from '../Block.vue';
import mock from '../mock.json';

function mountAnnouncement(
  data: Record<string, unknown>,
  options: { editing?: boolean; attachTo?: Element } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
    attachTo: options.attachTo,
  };
  if (options.editing === true) {
    const context = opts.global.provide[ELDRA_KEY] as EldraContext;
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

describe('announcement-bar block', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the mock content (merged data — this block has no preview.json)', async () => {
    const wrapper = mountAnnouncement({ ...mock });
    await flushPromises();
    expect(wrapper.text()).toContain(mock.message);
    // `linkHref` ships empty in the seed (no dead demo link) — `linkLabel` only renders inside
    // the link itself (see the "shows only the message with no link" test below), so it is not
    // expected in the bare-mock text either.
    expect(wrapper.text()).not.toContain(mock.linkLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders no anchor when linkHref is empty even though linkLabel is set', async () => {
    const wrapper = mountAnnouncement({ ...mock, linkHref: '' });
    await flushPromises();
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).not.toContain(mock.linkLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the link when both linkLabel and linkHref are set', async () => {
    const wrapper = mountAnnouncement({ ...mock, linkHref: '/pages/shipping' });
    await flushPromises();
    expect(wrapper.text()).toContain(mock.linkLabel);
    const link = wrapper.get('a');
    expect(link.attributes('href')).toBe('/pages/shipping');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json content and passes axe', async () => {
    const wrapper = mountAnnouncement(mock);
    await flushPromises();
    expect(wrapper.text()).toContain(mock.message);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['primary', 'accent', 'subtle'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mountAnnouncement({ ...mock, variant });
      await flushPromises();
      expect(wrapper.text()).toContain(mock.message);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('is a region named "Announcement"', () => {
    const wrapper = mountAnnouncement(mock);
    expect(wrapper.element.tagName).toBe('SECTION');
    expect(wrapper.attributes('aria-label')).toBe('Announcement');
  });

  it('has exactly two tab stops, in order: the link, then the dismiss button', async () => {
    const wrapper = mountAnnouncement({ ...mock, linkHref: '/pages/shipping' });
    await flushPromises();
    const focusable = wrapper.element.querySelectorAll('a[href], button');
    expect(focusable).toHaveLength(2);
    expect(focusable[0]!.tagName).toBe('A');
    expect(focusable[0]!.textContent).toContain(mock.linkLabel);
    expect(focusable[1]!.tagName).toBe('BUTTON');
    expect(focusable[1]!.getAttribute('aria-label')).toBe('Dismiss announcement');
  });

  it("the dismiss button is a real <button>, so Enter and Space are the platform's to activate", async () => {
    const wrapper = mountAnnouncement(mock, { attachTo: document.body });
    await flushPromises();
    const button = wrapper.get('button[aria-label="Dismiss announcement"]')
      .element as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('tabindex')).toBeNull();
    button.focus();
    expect(document.activeElement).toBe(button);
    // Nothing in the component cancels these keys, so the browser's own button-activation
    // behaviour (Enter/Space -> click) still runs — the same contract check
    // `packages/ui/src/components/button/__tests__/button.spec.ts` uses for every button.
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    wrapper.unmount();
  });

  it('dismissing hides the whole block and moves focus to the header focus marker when one exists', async () => {
    const header = document.createElement('a');
    header.href = '#main';
    header.textContent = 'Skip to content';
    header.setAttribute('data-eldra-header-focus', '');
    document.body.appendChild(header);
    const wrapper = mountAnnouncement(mock, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('button[aria-label="Dismiss announcement"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
    expect(document.activeElement).toBe(header);
    wrapper.unmount();
    header.remove();
  });

  it('dismissing falls back to focusing #main when there is no header focus marker', async () => {
    const main = document.createElement('main');
    main.id = 'main';
    document.body.appendChild(main);
    const wrapper = mountAnnouncement(mock, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('button[aria-label="Dismiss announcement"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');
    wrapper.unmount();
    main.remove();
  });

  it('persists the dismissal across a fresh mount for the same message, and clears when the message changes', async () => {
    const first = mountAnnouncement(mock);
    await flushPromises();
    await first.get('button[aria-label="Dismiss announcement"]').trigger('click');
    first.unmount();

    // A fresh mount is a fresh `createDemoStorefront()` (a new page load), backed by the same
    // jsdom `localStorage` — exactly how a real dismissal survives a page reload.
    const second = mountAnnouncement(mock);
    await flushPromises();
    expect(second.find('section').exists()).toBe(false);
    second.unmount();

    const changed = mountAnnouncement({ ...mock, message: 'A brand new announcement' });
    await flushPromises();
    expect(changed.find('section').exists()).toBe(true);
    expect(changed.text()).toContain('A brand new announcement');
  });

  it('shows only the message with no link (minimal content)', async () => {
    const wrapper = mountAnnouncement({
      variant: 'primary',
      message: 'New: hand-thrown mugs in four seasonal glazes',
      dismissable: true,
    });
    await flushPromises();
    expect(wrapper.find('a').exists()).toBe(false);
    const focusable = wrapper.element.querySelectorAll('a[href], button');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]!.tagName).toBe('BUTTON');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('shows only the link with no dismiss button when not dismissable', async () => {
    const wrapper = mountAnnouncement({ ...mock, dismissable: false, linkHref: '/pages/shipping' });
    await flushPromises();
    expect(wrapper.find('button').exists()).toBe(false);
    const focusable = wrapper.element.querySelectorAll('a[href], button');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]!.tagName).toBe('A');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('the link is identifiable by its underline, not colour alone', () => {
    const wrapper = mountAnnouncement({ ...mock, linkHref: '/pages/shipping' });
    const link = wrapper.get('a');
    expect(link.classes()).toContain('underline');
  });

  it('renders no editor placeholder (or anything else) for an empty message outside the editor', () => {
    const wrapper = mountAnnouncement({ ...mock, message: '' });
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('renders nothing, without throwing, for an entry with no message field at all', () => {
    // An entry written against an earlier block version may lack the field entirely (not just
    // hold an empty string); server rendering of the page must not crash on it.
    const { message: _omitted, ...withoutMessage } = mock;
    const wrapper = mountAnnouncement(withoutMessage);
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('renders the editor placeholder for an empty message only inside the editor', async () => {
    const wrapper = mountAnnouncement({ ...mock, message: '' }, { editing: true });
    expect(wrapper.text()).toContain('Add a short message');
    expect(wrapper.text()).toContain('For example, a shipping offer or a store update.');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('keeps showing the live block in the editor even after a visitor dismissal, so it stays editable', async () => {
    const wrapper = mountAnnouncement(mock);
    await flushPromises();
    await wrapper.get('button[aria-label="Dismiss announcement"]').trigger('click');
    wrapper.unmount();

    const editingWrapper = mountAnnouncement(mock, { editing: true });
    await flushPromises();
    expect(editingWrapper.find('section').exists()).toBe(true);
    expect(editingWrapper.text()).toContain(mock.message);
  });
});
