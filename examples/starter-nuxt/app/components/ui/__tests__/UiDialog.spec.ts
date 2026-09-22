// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiDialog from '../UiDialog.vue';
import { mountOptions } from '../../../../test/support/mountBlock';

// Only `provide` is needed (for `useT()`'s Eldra context) — see the same
// note in UiRating.spec.ts on why `.global` isn't spread wholesale.
const eldraGlobal = { provide: mountOptions({ entry: { id: 'test', data: {} } }).global.provide };

describe('UiDialog', () => {
  it('is not open (no `open` attribute) when the open prop is false', () => {
    const wrapper = mount(UiDialog, {
      props: { open: false, title: 'Confirm' },
      global: eldraGlobal,
    });
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined();
  });

  it('shows the dialog via showModal when open is true', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      global: eldraGlobal,
    });
    await nextTick();
    expect(wrapper.find('dialog').attributes('open')).toBe('');
  });

  it('labels the dialog with the title via aria-labelledby', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      global: eldraGlobal,
    });
    await nextTick();
    const dialog = wrapper.find('dialog');
    const labelledBy = dialog.attributes('aria-labelledby');
    expect(wrapper.find(`#${labelledBy}`).text()).toBe('Confirm');
  });

  it('emits update:open false and closes when the close button is clicked', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      global: eldraGlobal,
    });
    await nextTick();
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined();
  });

  it('closes on a backdrop click (target is the dialog element itself)', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      global: eldraGlobal,
    });
    await nextTick();
    await wrapper.find('dialog').trigger('click');
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });

  it('does not close on a backdrop click when persistent', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm', persistent: true },
      global: eldraGlobal,
    });
    await nextTick();
    await wrapper.find('dialog').trigger('click');
    expect(wrapper.emitted('update:open')).toBeUndefined();
  });

  it('does not close when a click lands on content inside the dialog', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      slots: { default: '<p>Body</p>' },
      global: eldraGlobal,
    });
    await nextTick();
    await wrapper.find('p').trigger('click');
    expect(wrapper.emitted('update:open')).toBeUndefined();
  });

  it('closes on Escape even when persistent', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm', persistent: true },
      global: eldraGlobal,
      attachTo: document.body,
    });
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('moves focus into the dialog and returns it to the previously focused element on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      slots: { default: '<input aria-label="Name" />' },
      global: eldraGlobal,
      attachTo: document.body,
    });
    await nextTick();
    expect(document.activeElement).not.toBe(trigger);
    expect(wrapper.element.contains(document.activeElement)).toBe(true);

    await wrapper.setProps({ open: false });
    expect(document.activeElement).toBe(trigger);

    wrapper.unmount();
    trigger.remove();
  });

  it('traps Tab within the dialog, wrapping from the last focusable element to the first', async () => {
    // DOM order inside UiDialog is close-button, then the slot content — so
    // the close button is the *first* focusable element and the slotted
    // input is the *last*; jsdom doesn't implement native Tab-key focus
    // advancement, only the wrap-around this component adds explicitly, so
    // this starts on the last element and presses Tab to reach that wrap.
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      slots: { default: '<input aria-label="Name" />' },
      global: eldraGlobal,
      attachTo: document.body,
    });
    await nextTick();
    const closeButton = wrapper.find('button').element as HTMLButtonElement;
    const input = wrapper.find('input').element as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(closeButton);
  });

  it('wraps Shift+Tab from the first focusable element to the last', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      slots: { default: '<input aria-label="Name" />' },
      global: eldraGlobal,
      attachTo: document.body,
    });
    await nextTick();
    const closeButton = wrapper.find('button').element as HTMLButtonElement;
    const input = wrapper.find('input').element as HTMLInputElement;
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    );

    expect(document.activeElement).toBe(input);
  });

  it('locks document scroll while open and restores it on close', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      global: eldraGlobal,
    });
    await nextTick();
    expect(document.documentElement.style.overflow).toBe('hidden');
    await wrapper.setProps({ open: false });
    expect(document.documentElement.style.overflow).not.toBe('hidden');
  });

  it('has no axe violations while open', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Confirm' },
      slots: { default: '<p>Are you sure?</p>' },
      global: eldraGlobal,
    });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
