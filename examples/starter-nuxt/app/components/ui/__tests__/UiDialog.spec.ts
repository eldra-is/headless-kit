// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { Select } from '@eldrajs/ui';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiDialog from '../UiDialog.vue';
import { mountOptions } from '../../../../test/support/mountBlock';

// Only the `provide` half of `mountOptions()`'s `global` is needed here (for
// `useT()`'s Eldra context) — its `stubs` is typed loosely
// (`Record<string, unknown>`) for block mounts and isn't assignable to
// `@vue/test-utils`'s own `Stubs` type, which this component doesn't need.
const eldraGlobal = { provide: mountOptions({ entry: { id: 'test', data: {} } }).global.provide };

describe('UiDialog', () => {
  it('is not open (no `open` attribute) when the open prop is false', () => {
    const wrapper = mount(UiDialog, {
      props: { open: false, title: 'Confirm' },
      global: eldraGlobal,
    });
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined();
  });

  // `bg-black/50` used to draw this scrim and silently stopped compiling when
  // the theme moved onto `@eldrajs/ui`'s Tailwind entry, which resets
  // `--color-*` — the dialog then opened over a fully transparent page.
  // `test/mainCss.spec.ts` proves the rule is emitted; this proves the class
  // is on the element.
  it('draws its backdrop from the overlay token', () => {
    const wrapper = mount(UiDialog, {
      props: { open: false, title: 'Confirm' },
      global: eldraGlobal,
    });
    const classes = wrapper.find('dialog').classes();
    expect(classes).toContain('backdrop:bg-overlay');
    expect(classes.some((name) => name.includes('bg-black'))).toBe(false);
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

  /**
   * `@eldrajs/ui`'s popup panels are teleported out of their control, and a modal `<dialog>` is
   * the one place `document.body` is the **wrong** target: a dialog opened with `showModal()`
   * renders in the browser's top layer, above every `z-index` on the page, so a panel on the body
   * would be drawn behind the dialog that opened it and nothing could raise it. The kit resolves
   * `closest('dialog[open]')` and teleports into the dialog instead — which is the case this
   * starter actually hits, since a Select in a filters or address dialog is ordinary.
   *
   * jsdom has no top layer (see `test/support/dialog.ts`), so what is asserted here is the part
   * that decides the outcome in a real browser: which element the panel is a child of.
   */
  it('keeps a Select panel inside the dialog rather than on the body', async () => {
    const wrapper = mount(UiDialog, {
      props: { open: true, title: 'Shipping' },
      slots: {
        default: () =>
          h(Select, {
            'aria-label': 'Shipping method',
            options: [
              { value: 'standard', label: 'Standard' },
              { value: 'express', label: 'Express' },
            ],
          }),
      },
      global: eldraGlobal,
      attachTo: document.body,
    });
    await nextTick();

    const dialog = wrapper.find('dialog').element as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);

    // A real pointer press: `pointerdown` then the click, which is what the kit's trigger reads as
    // "a pointer opened this" (a bare `click()` is the label-forwarded kind, which only focuses).
    const trigger = wrapper.find('[data-part="trigger"]');
    await trigger.trigger('pointerdown');
    await trigger.trigger('click');
    await nextTick();

    const panelId = `${trigger.attributes('id')}-panel`;
    const panel = document.getElementById(panelId);
    expect(panel).not.toBeNull();
    expect(panel?.parentElement).toBe(dialog);
    expect(panel?.parentElement).not.toBe(document.body);

    // The listbox the trigger names is in there too, so the ARIA wiring survives the move.
    const listbox = document.getElementById(trigger.attributes('aria-controls') ?? '');
    expect(listbox).not.toBeNull();
    expect(dialog.contains(listbox as HTMLElement)).toBe(true);

    wrapper.unmount();
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
