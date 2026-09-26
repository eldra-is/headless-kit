import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { currentDialog } from '../../../composables/dialogStack';
import Dialog from '../Dialog.vue';

type Finder = { find: (selector: string) => { element: Element } };

function root(wrapper: Finder): HTMLDialogElement {
  return wrapper.find('[data-part="root"]').element as HTMLDialogElement;
}

function closeButton(wrapper: Finder): HTMLButtonElement {
  return wrapper.find('[data-part="close"]').element as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Dialog — element and parts', () => {
  it('is a native dialog with a data-part on every named part', () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Remove from cart?', modelValue: true },
      slots: { default: 'This removes it from your bag.' },
    });
    expect(root(wrapper).tagName).toBe('DIALOG');
    expect(wrapper.find('[data-part="panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="header"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="title"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="close"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="body"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('has no role="dialog" anywhere — the native element carries its own semantics', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the title as a real h2', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    const title = wrapper.find('[data-part="title"]').element;
    expect(title.tagName).toBe('H2');
    expect(title.textContent).toBe('Remove from cart?');
    wrapper.unmount();
  });

  it('renders no footer part without a footer slot', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(wrapper.find('[data-part="footer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the footer part from the footer slot', () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Notify me', modelValue: true },
      slots: { footer: '<button type="button">Notify me</button>' },
    });
    expect(wrapper.find('[data-part="footer"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="footer"] button').text()).toBe('Notify me');
    wrapper.unmount();
  });

  it('renders the description part from the description prop, inside body', () => {
    const wrapper = mountWith(Dialog, {
      props: {
        title: 'Remove from cart?',
        description: 'This cannot be undone.',
        modelValue: true,
      },
    });
    const body = wrapper.find('[data-part="body"]').element;
    const description = wrapper.find('[data-part="description"]').element;
    expect(body.contains(description)).toBe(true);
    expect(description.textContent).toBe('This cannot be undone.');
    wrapper.unmount();
  });

  it('renders no description part without one', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(wrapper.find('[data-part="description"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Dialog — open and close', () => {
  it('opens with showModal, reflected as the open attribute', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(root(wrapper).open).toBe(true);
    expect(root(wrapper).hasAttribute('open')).toBe(true);
    wrapper.unmount();
  });

  it('does not open without modelValue', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me' } });
    expect(root(wrapper).open).toBe(false);
    wrapper.unmount();
  });

  it('opens when modelValue turns true, and closes when it turns false', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: false } });
    await wrapper.setProps({ modelValue: true });
    expect(root(wrapper).open).toBe(true);
    await wrapper.setProps({ modelValue: false });
    expect(root(wrapper).open).toBe(false);
    wrapper.unmount();
  });

  it('is uncontrolled without modelValue: it stays closed until told to open', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me' } });
    expect(root(wrapper).open).toBe(false);
    wrapper.unmount();
  });

  it('the close button closes it, emitting close("button") and update:modelValue(false)', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await closeButton(wrapper).click();
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('the close button carries cursor-pointer and the standard focus ring', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    const cls = closeButton(wrapper).className;
    expect(cls).toContain('cursor-pointer');
    expect(cls).toContain('eldra-focus');
    wrapper.unmount();
  });

  it("the exposed close(value) closes with an action value of the consumer's own", async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Remove from cart?', modelValue: true },
    });
    (wrapper.vm as unknown as { close: (v?: string) => void }).close('remove');
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['remove']);
    wrapper.unmount();
  });
});

describe('Dialog — Esc (the native cancel event)', () => {
  /**
   * happy-dom's `HTMLDialogElement` (see `src/test/setup.ts`) implements `showModal()`/`close()`
   * but not the browser's own keyboard-driven default action that fires `cancel` on `Esc` — so the
   * native contract this composable reacts to is exercised by dispatching the event itself,
   * exactly as a real browser's own internal "close a dialog" algorithm would.
   */
  it('fires cancel, then closes with close("escape") and update:modelValue(false)', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['escape']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('closes on Esc even when dismissable is false — only the backdrop is gated', async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Unsaved changes', modelValue: true, dismissable: false },
    });
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    wrapper.unmount();
  });
});

describe('Dialog — backdrop click', () => {
  it('a click on the dialog element itself closes it (dismissable defaults to true)', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    root(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['backdrop']);
    wrapper.unmount();
  });

  it('a click inside the panel does not close it — the target is a descendant, not the dialog', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    wrapper
      .find('[data-part="panel"]')
      .element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('dismissable: false keeps a backdrop click from closing it', async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Unsaved changes', modelValue: true, dismissable: false },
    });
    root(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });
});

describe('Dialog — never stack two modals', () => {
  it('a second dialog asked to open while one is already open is refused, with a dev warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    const second = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await nextTick();

    expect(root(first).open).toBe(true);
    expect(root(second).open).toBe(false);
    expect(second.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('modal');

    first.unmount();
    second.unmount();
  });

  it('closing the first frees the slot for the next dialog to open', async () => {
    const first = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await first.setProps({ modelValue: false });
    expect(currentDialog()).toBeNull();

    const second = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await nextTick();
    expect(root(second).open).toBe(true);

    first.unmount();
    second.unmount();
  });

  it('re-opening the same dialog is not treated as a second modal', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });
});

describe('Dialog — initial focus', () => {
  it('focuses the first meaningful control, never the close button, when a field exists', async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Notify me', modelValue: true },
      slots: { default: '<input data-testid="email" />' },
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find('[data-testid="email"]').element);
    wrapper.unmount();
  });

  it('focuses the first footer action when the body has no focusable control', async () => {
    const wrapper = mountWith(Dialog, {
      props: {
        title: 'Remove from cart?',
        description: 'This cannot be undone.',
        modelValue: true,
      },
      slots: {
        footer:
          '<button type="button" data-testid="keep">Keep it</button>' +
          '<button type="button" data-testid="remove">Remove</button>',
      },
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find('[data-testid="keep"]').element);
    wrapper.unmount();
  });

  it('falls back to the close button when nothing else is focusable', async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Notify me', description: 'All set.', modelValue: true },
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(closeButton(wrapper));
    wrapper.unmount();
  });

  it('returns focus to the opener once the dialog closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Remove item…';
    document.body.append(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const wrapper = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();
    expect(document.activeElement).not.toBe(opener);

    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(document.activeElement).toBe(opener);

    wrapper.unmount();
    opener.remove();
  });
});

describe('Dialog — labelling', () => {
  it('is aria-labelledby the title', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    const titleId = wrapper.find('[data-part="title"]').element.id;
    expect(root(wrapper).getAttribute('aria-labelledby')).toBe(titleId);
    wrapper.unmount();
  });

  it('is aria-describedby the description when there is one', () => {
    const wrapper = mountWith(Dialog, {
      props: {
        title: 'Remove from cart?',
        description: 'This cannot be undone.',
        modelValue: true,
      },
    });
    const descriptionId = wrapper.find('[data-part="description"]').element.id;
    expect(root(wrapper).getAttribute('aria-describedby')).toBe(descriptionId);
    wrapper.unmount();
  });

  it('has no aria-describedby when there is no description (a form body)', () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Notify me', modelValue: true },
      slots: { default: '<input />' },
    });
    expect(root(wrapper).hasAttribute('aria-describedby')).toBe(false);
    wrapper.unmount();
  });
});

describe('Dialog — sizes', () => {
  it('defaults to md (32rem, capped at the viewport)', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(wrapper.find('[data-part="panel"]').element.className).toContain('eldra-dialog-width');
    wrapper.unmount();
  });

  it('sm renders the 24rem clamp instead', () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Remove from cart?', modelValue: true, size: 'sm' },
    });
    const cls = wrapper.find('[data-part="panel"]').element.className;
    expect(cls).toContain('eldra-dialog-width-sm');
    wrapper.unmount();
  });
});

describe('Dialog — long content and narrow viewports', () => {
  it('the body scrolls on its own; header and footer never shrink', () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Terms', modelValue: true },
      slots: {
        default: '<p>Long content…</p>',
        footer: '<button type="button">Accept</button>',
      },
    });
    expect(wrapper.find('[data-part="body"]').element.className).toContain('overflow-y-auto');
    expect(wrapper.find('[data-part="header"]').element.className).toContain('shrink-0');
    expect(wrapper.find('[data-part="footer"]').element.className).toContain('shrink-0');
    wrapper.unmount();
  });

  it('keeps its own width clamp regardless of a narrow ancestor', () => {
    const wrapper = mountNarrow(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(wrapper.find('[data-part="panel"]').element.className).toContain('eldra-dialog-width');
    wrapper.unmount();
  });
});

describe('Dialog — classes prop', () => {
  it('merges a classes override onto the named part instead of landing beside it', () => {
    const wrapper = mountWith(Dialog, {
      props: {
        title: 'Notify me',
        modelValue: true,
        classes: { panel: 'rounded-none', title: 'text-h1' },
      },
    });
    const panelClass = wrapper.find('[data-part="panel"]').element.className;
    const titleClass = wrapper.find('[data-part="title"]').element.className;
    expect(panelClass).toContain('rounded-none');
    expect(panelClass).not.toContain('rounded-lg');
    expect(titleClass).toContain('text-h1');
    expect(titleClass).not.toContain('text-dialog-title');
    wrapper.unmount();
  });
});

describe('Dialog — messages', () => {
  it('the close button label overrides through the messages prop', () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Loka', modelValue: true, messages: { close: 'Loka' } },
    });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Loka');
    wrapper.unmount();
  });

  it('defaults the close button label to "Close"', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    expect(closeButton(wrapper).getAttribute('aria-label')).toBe('Close');
    wrapper.unmount();
  });
});

describe('Dialog — accessibility', () => {
  it('is axe-clean open, with a description', async () => {
    const wrapper = mountWith(Dialog, {
      props: {
        title: 'Remove from cart?',
        description: 'This cannot be undone.',
        modelValue: true,
      },
      slots: {
        footer: '<button type="button">Keep it</button><button type="button">Remove</button>',
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean open, with a form field and no description', async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Notify me when it’s back', modelValue: true },
      slots: {
        default: '<label for="notify-email">Email</label><input id="notify-email" type="email" />',
        footer: '<button type="button">Notify me</button>',
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean sm', async () => {
    const wrapper = mountWith(Dialog, {
      props: { title: 'Remove from cart?', modelValue: true, size: 'sm' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean closed', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: false } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
