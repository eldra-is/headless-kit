import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { currentDialog, TOAST_HOST_KEY } from '../../../composables/dialogStack';
import { expectClosedModalRendersNothing } from '../../../test/modal';
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

  /** Fix, from the operator's own finding: a closed `Dialog` must render nothing, not sit on
   *  screen because a `display` utility on the root beat the UA's own `display: none`. */
  it('renders nothing while closed — hidden open:flex on the root, not a bare flex', () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: false } });
    expectClosedModalRendersNothing(root(wrapper), 'block');
    wrapper.unmount();
  });

  it('closing it (modelValue turns false) goes back to hidden open:flex, not a leftover flex', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await wrapper.setProps({ modelValue: false });
    expectClosedModalRendersNothing(root(wrapper), 'block');
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

  /**
   * Final review M2/item 1: `modelValue` must default to `undefined`, not a literal `false` — a
   * literal default is never `undefined`, so `useControllableModel` would treat the dialog as
   * *permanently controlled* the instant a parent stops passing the prop at all, snapping it shut
   * as a side effect (the prop resolves to the buggy default, `false`) rather than leaving it open
   * and self-managed the way `SearchModal`/`Tabs` already document. This is the regression that
   * default breaks: closing it via its own close button once the parent stops binding v-model.
   */
  it('going uncontrolled (modelValue prop removed) keeps the dialog open instead of snapping shut', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await wrapper.setProps({ modelValue: undefined });
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('once uncontrolled, its own close button still closes it and emits update:modelValue(false)', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await wrapper.setProps({ modelValue: undefined });
    await closeButton(wrapper).click();
    await nextTick();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });
});

describe('Dialog — close reason does not go stale (I4)', () => {
  it('a v-model close after a prior button close reads "programmatic", not the stale "button"', async () => {
    const wrapper = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await closeButton(wrapper).click();
    await nextTick();
    expect(wrapper.emitted('close')?.[0]).toEqual(['button']);
    // Simulate the real v-model round trip: the parent accepts the emitted `false`, then reopens
    // and closes again from outside (a route with no `returnValue` of its own).
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await wrapper.setProps({ modelValue: false });
    await nextTick();
    expect(wrapper.emitted('close')?.[1]).toEqual(['programmatic']);
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

describe('Dialog — nested modals (operator override, 2026-09-26)', () => {
  it('a second dialog opens on top of the first — no refusal, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    const second = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();

    expect(root(first).open).toBe(true);
    expect(root(second).open).toBe(true);
    expect(second.emitted('update:modelValue')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

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

  it('Esc closes only the top dialog; the lower one stays open', async () => {
    const lower = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();

    root(top).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();

    expect(root(top).open).toBe(false);
    expect(top.emitted('close')?.[0]).toEqual(['escape']);
    expect(root(lower).open).toBe(true);
    expect(lower.emitted('close')).toBeUndefined();

    lower.unmount();
    top.unmount();
  });

  it('Esc dispatched at the lower dialog directly does nothing — it is not the top', async () => {
    const lower = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();

    root(lower).dispatchEvent(new Event('cancel', { cancelable: true }));
    await nextTick();

    expect(root(lower).open).toBe(true);
    expect(root(top).open).toBe(true);
    expect(lower.emitted('cancel')).toBeUndefined();
    expect(lower.emitted('close')).toBeUndefined();

    lower.unmount();
    top.unmount();
  });

  it('a backdrop click on the top dialog closes only the top', async () => {
    const lower = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();

    root(top).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(root(top).open).toBe(false);
    expect(top.emitted('close')?.[0]).toEqual(['backdrop']);
    expect(root(lower).open).toBe(true);

    lower.unmount();
    top.unmount();
  });

  it('a backdrop click dispatched at the lower dialog directly does nothing', async () => {
    const lower = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();

    root(lower).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(root(lower).open).toBe(true);
    expect(root(top).open).toBe(true);

    lower.unmount();
    top.unmount();
  });

  it('closing the top returns focus to whatever was focused in the lower dialog, not the page', async () => {
    const lower = mountWith(Dialog, {
      props: { title: 'Your cart', modelValue: true },
      slots: { footer: '<button type="button" data-testid="remove">Remove…</button>' },
    });
    await nextTick();
    const trigger = lower.find('[data-testid="remove"]').element as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();
    expect(document.activeElement).not.toBe(trigger);

    await top.setProps({ modelValue: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);

    lower.unmount();
    top.unmount();
  });

  it('TOAST_HOST_KEY follows the top of the stack, and back down as each closes', async () => {
    const lower = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    await nextTick();
    expect(TOAST_HOST_KEY.value).toBe(root(lower));

    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();
    expect(TOAST_HOST_KEY.value).toBe(root(top));

    await top.setProps({ modelValue: false });
    await nextTick();
    expect(TOAST_HOST_KEY.value).toBe(root(lower));

    await lower.setProps({ modelValue: false });
    await nextTick();
    expect(TOAST_HOST_KEY.value).toBeNull();

    lower.unmount();
    top.unmount();
  });

  it('the scroll lock is released only once every open dialog has closed', async () => {
    document.documentElement.style.overflow = '';
    const lower = mountWith(Dialog, { props: { title: 'Your cart', modelValue: true } });
    await nextTick();
    expect(document.documentElement.style.overflow).toBe('hidden');

    const top = mountWith(Dialog, { props: { title: 'Remove from cart?', modelValue: true } });
    await nextTick();
    expect(document.documentElement.style.overflow).toBe('hidden');

    await top.setProps({ modelValue: false });
    await nextTick();
    expect(document.documentElement.style.overflow).toBe('hidden');

    await lower.setProps({ modelValue: false });
    await nextTick();
    expect(document.documentElement.style.overflow).toBe('');

    lower.unmount();
    top.unmount();
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
