import { afterEach, describe, expect, it } from 'vitest';
import { computed, h } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import Switch from '../Switch.vue';
import type { SwitchSize } from '../types';

const SIZES: SwitchSize[] = ['md', 'sm'];

type Finder = { find: (selector: string) => { element: Element } };

function root(wrapper: Finder): HTMLButtonElement {
  return wrapper.find('[data-part="root"]').element as HTMLButtonElement;
}

function hiddenInput(wrapper: Finder): HTMLInputElement {
  return wrapper.find('input[type="checkbox"]').element as HTMLInputElement;
}

/** A stub FieldWrapper, exactly what a plain (non-group) `FieldWrapper` provides. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-restock',
        labelId: 'field-restock-label',
        describedBy: undefined,
        invalid: false,
        required: false,
        labelsControl: true,
        ...context,
      })),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Switch — element and parts', () => {
  it('is a native button, role switch, with a data-part on every named part', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(root(wrapper).tagName).toBe('BUTTON');
    expect(root(wrapper).getAttribute('type')).toBe('button');
    expect(root(wrapper).getAttribute('role')).toBe('switch');
    expect(wrapper.find('[data-part="track"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="thumb"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="label"]').text()).toBe('Restock alerts');
    wrapper.unmount();
  });

  it('marks the root as the eldra:group its track hover reads', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(root(wrapper).classList).toContain('eldra:group');
    expect(wrapper.find('[data-part="track"]').classes().join(' ')).toContain('eldra:group-hover:');
    wrapper.unmount();
  });

  it('renders no description part without one', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(wrapper.find('[data-part="description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the description from the prop', () => {
    const wrapper = mountWith(Switch, {
      props: { description: 'Email me when a sold-out size is back.' },
      slots: { default: 'Restock alerts' },
    });
    expect(wrapper.find('[data-part="description"]').text()).toBe(
      'Email me when a sold-out size is back.'
    );
    wrapper.unmount();
  });

  it('takes the description from a slot as well as from the prop', () => {
    const wrapper = mountWith(Switch, {
      slots: { default: 'Restock alerts', description: '<em>Weekly at most</em>' },
    });
    expect(wrapper.find('[data-part="description"]').html()).toContain('<em>Weekly at most</em>');
    wrapper.unmount();
  });

  it('renders no check icon while off, and one while on', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Restock alerts' },
    });
    expect(wrapper.find('[data-part="thumb"] svg').exists()).toBe(false);
    wrapper.unmount();

    const on = mountWith(Switch, {
      props: { modelValue: true },
      slots: { default: 'Restock alerts' },
    });
    expect(on.find('[data-part="thumb"] svg').exists()).toBe(true);
    on.unmount();
  });
});

describe('Switch — value and v-model', () => {
  it('defaults to off (false)', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(root(wrapper).getAttribute('aria-checked')).toBe('false');
    wrapper.unmount();
  });

  it('reflects modelValue as aria-checked', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: true },
      slots: { default: 'Restock alerts' },
    });
    expect(root(wrapper).getAttribute('aria-checked')).toBe('true');
    wrapper.unmount();
  });

  it('toggles on click and emits update:modelValue and change', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Restock alerts' },
    });
    await wrapper.find('[data-part="root"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(wrapper.emitted('change')?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it('clicking the label toggles it, since the label is inside the button', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Restock alerts' },
    });
    await wrapper.find('[data-part="label"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it('clicking the track toggles it, since the track is inside the button', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Restock alerts' },
    });
    await wrapper.find('[data-part="track"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it('is uncontrolled without modelValue: toggling flips its own state', async () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(root(wrapper).getAttribute('aria-checked')).toBe('false');
    await wrapper.find('[data-part="root"]').trigger('click');
    expect(root(wrapper).getAttribute('aria-checked')).toBe('true');
    wrapper.unmount();
  });

  it('is controlled with modelValue: a parent that refuses the change keeps it as it was', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Restock alerts' },
    });
    await wrapper.find('[data-part="root"]').trigger('click');
    // The parent never wrote the emitted value back, so the prop is still false.
    expect(root(wrapper).getAttribute('aria-checked')).toBe('false');
    wrapper.unmount();
  });

  it('never moves focus or navigates on toggle', async () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    const before = document.activeElement;
    await wrapper.find('[data-part="root"]').trigger('click');
    expect(document.activeElement).toBe(before);
    wrapper.unmount();
  });
});

describe('Switch — sizes', () => {
  it.each(SIZES)('renders the %s track and thumb sizes from the spec', (size) => {
    const wrapper = mountWith(Switch, { props: { size }, slots: { default: 'In stock only' } });
    const track = wrapper.find('[data-part="track"]').element.className;
    const thumb = wrapper.find('[data-part="thumb"]').element.className;
    if (size === 'md') {
      expect(track).toContain('eldra:w-11');
      expect(track).toContain('eldra:h-6');
      expect(thumb).toContain('eldra:size-4');
    } else {
      expect(track).toContain('eldra:w-9');
      expect(track).toContain('eldra:h-5');
      expect(thumb).toContain('eldra:size-3');
    }
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'In stock only' } });
    expect(wrapper.find('[data-part="track"]').element.className).toContain('eldra:w-11');
    wrapper.unmount();
  });
});

describe('Switch — states', () => {
  it('off: background track, border-strong boundary, border-strong thumb, no icon', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Restock alerts' },
    });
    const track = wrapper.find('[data-part="track"]').element.className;
    const thumb = wrapper.find('[data-part="thumb"]').element.className;
    expect(track).toContain('eldra:bg-background');
    expect(track).toContain('eldra:border-border-strong');
    expect(thumb).toContain('eldra:bg-border-strong');
    expect(wrapper.find('[data-part="thumb"] svg').exists()).toBe(false);
    wrapper.unmount();
  });

  it('on: primary track and border, primary-contrast thumb with a check in primary, moved to the end', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: true },
      slots: { default: 'Restock alerts' },
    });
    const track = wrapper.find('[data-part="track"]').element.className;
    const thumb = wrapper.find('[data-part="thumb"]').element.className;
    expect(track).toContain('eldra:bg-primary');
    expect(track).toContain('eldra:border-primary');
    expect(thumb).toContain('eldra:bg-primary-contrast');
    expect(thumb).toContain('eldra:text-primary');
    expect(thumb).toContain('eldra:translate-x-5');
    expect(wrapper.find('[data-part="thumb"] svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('disabled off: surface-strong track, dashed border-strong boundary, muted label, cursor not-allowed', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false, disabled: true },
      slots: { default: 'Restock alerts' },
    });
    const btn = root(wrapper);
    const track = wrapper.find('[data-part="track"]').element.className;
    const label = wrapper.find('[data-part="label"]').element.className;
    expect(btn.disabled).toBe(true);
    expect(track).toContain('eldra:bg-surface-strong');
    expect(track).toContain('eldra:border-dashed');
    expect(label).toContain('eldra:text-muted');
    expect(btn.className).toContain('eldra:cursor-not-allowed');
    wrapper.unmount();
  });

  it('disabled on: muted solid track, primary-contrast thumb with check kept, muted label', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: true, disabled: true },
      slots: { default: 'Restock alerts' },
    });
    const track = wrapper.find('[data-part="track"]').element.className;
    const thumb = wrapper.find('[data-part="thumb"]').element.className;
    expect(track).toContain('eldra:bg-muted');
    expect(track).not.toContain('eldra:border-dashed');
    expect(thumb).toContain('eldra:bg-primary-contrast');
    expect(wrapper.find('[data-part="thumb"] svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('a disabled button never fires click, so toggling is impossible', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false, disabled: true },
      slots: { default: 'Restock alerts' },
    });
    await wrapper.find('[data-part="root"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Switch — focus ring and motion', () => {
  it('carries the standard focus ring on the root, at the spec radius-sm corner', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    const cls = root(wrapper).className;
    expect(cls).toContain('eldra:eldra-focus');
    expect(cls).toContain('eldra:rounded-sm');
    wrapper.unmount();
  });

  it('the thumb slides and changes colour together, with a reduced-motion fallback', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    const cls = wrapper.find('[data-part="thumb"]').element.className;
    expect(cls).toContain('eldra:transition-[translate,background-color,color]');
    expect(cls).toContain('eldra:duration-fast');
    expect(cls).toContain('eldra:motion-reduce:transition-none');
    wrapper.unmount();
  });

  it('the track fills over duration-fast too, with a reduced-motion fallback', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    const cls = wrapper.find('[data-part="track"]').element.className;
    expect(cls).toContain('eldra:transition-colors');
    expect(cls).toContain('eldra:duration-fast');
    expect(cls).toContain('eldra:motion-reduce:transition-none');
    wrapper.unmount();
  });
});

describe('Switch — keyboard', () => {
  /**
   * happy-dom does not run a button's default activation behaviour: a `keydown` of `Enter` or
   * `Space` produces no `click`, exactly the limitation Button's own spec documents. So this
   * asserts the contract that earns Space/Enter for free from a real, enabled, focusable
   * `<button>` with no key handler of its own — not a simulated activation.
   */
  it('meets the native activation contract for Enter and Space', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    const button = root(wrapper);
    expect(button.tagName).toBe('BUTTON');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('tabindex')).toBeNull();
    button.focus();
    expect(document.activeElement).toBe(button);
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    button.click();
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Switch — the hidden form input', () => {
  it('is a hidden, unfocusable checkbox mirroring modelValue and carrying name', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: true, name: 'gift-receipt' },
      slots: { default: 'Gift receipt' },
    });
    const input = hiddenInput(wrapper);
    expect(input.type).toBe('checkbox');
    expect(input.hidden).toBe(true);
    expect(input.name).toBe('gift-receipt');
    expect(input.checked).toBe(true);
    expect(input.tabIndex).toBe(-1);
    wrapper.unmount();
  });

  it('mirrors a toggle', async () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Gift receipt' } });
    await wrapper.find('[data-part="root"]').trigger('click');
    expect(hiddenInput(wrapper).checked).toBe(true);
    wrapper.unmount();
  });

  it('is disabled, so it drops out of form submission, exactly when the switch is', () => {
    const wrapper = mountWith(Switch, {
      props: { disabled: true },
      slots: { default: 'Gift receipt' },
    });
    expect(hiddenInput(wrapper).disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('Switch — description', () => {
  it('links the description with aria-describedby, and keeps it out of the accessible name', () => {
    const wrapper = mountWith(Switch, {
      props: { description: 'Email me when a sold-out size is back.' },
      slots: { default: 'Restock alerts' },
    });
    const btn = root(wrapper);
    const description = wrapper.find('[data-part="description"]').element;
    expect(btn.getAttribute('aria-describedby')).toBe(description.id);
    expect(description.getAttribute('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('sets no aria-describedby without a description', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(root(wrapper).getAttribute('aria-describedby')).toBeNull();
    wrapper.unmount();
  });
});

describe('Switch — field context', () => {
  it('drops its own label and takes the id from a labelling FieldWrapper', () => {
    const wrapper = mountWith(Switch, {
      slots: { default: 'Restock alerts' },
      global: fieldProvider({ id: 'field-restock' }),
    });
    expect(wrapper.find('[data-part="label"]').exists()).toBe(false);
    expect(root(wrapper).id).toBe('field-restock');
    wrapper.unmount();
  });

  it('keeps its own label and id when it has an id of its own', () => {
    const wrapper = mountWith(Switch, {
      props: { id: 'own-id' },
      slots: { default: 'Restock alerts' },
      global: fieldProvider({ id: 'field-restock' }),
    });
    expect(wrapper.find('[data-part="label"]').exists()).toBe(true);
    expect(root(wrapper).id).toBe('own-id');
    wrapper.unmount();
  });

  it('keeps its own label outside a field context', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(wrapper.find('[data-part="label"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Switch — inside a real FieldWrapper', () => {
  /** Mounts the two components together, which is the only way this wiring can be checked. */
  function inWrapper(wrapperProps: Record<string, unknown>, aSwitch: string) {
    return mountWith({
      components: { FieldWrapper, Switch },
      setup: () => ({ wrapperProps }),
      template: `<FieldWrapper v-bind="wrapperProps">${aSwitch}</FieldWrapper>`,
    });
  }

  it('renders no label of its own, named by the wrapper for>, and is axe-clean', async () => {
    const wrapper = inWrapper({ label: 'Restock alerts' }, '<Switch />');
    const button = wrapper.find('button[role="switch"]').element as HTMLButtonElement;
    expect(button.querySelector('[data-part="label"]')).toBeNull();
    const label = wrapper.find('label').element as HTMLLabelElement;
    expect(label.getAttribute('for')).toBe(button.id);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('keeps its own label and id when it has one of its own', () => {
    const wrapper = inWrapper(
      { label: 'Restock alerts' },
      '<Switch id="own-id">Restock alerts</Switch>'
    );
    const button = wrapper.find('button[role="switch"]').element as HTMLButtonElement;
    expect(button.querySelector('[data-part="label"]')).not.toBeNull();
    expect(button.id).toBe('own-id');
    wrapper.unmount();
  });

  it("merges the wrapper's help into aria-describedby when the switch has no description of its own", async () => {
    const wrapper = inWrapper(
      { label: 'Restock alerts', help: 'About one email a month.' },
      '<Switch />'
    );
    const button = wrapper.find('button[role="switch"]').element as HTMLButtonElement;
    const help = wrapper.find('[data-part="help"]').element;
    expect(button.getAttribute('aria-describedby')).toBe(help.id);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it("puts the switch's own description first, then the wrapper's help", async () => {
    const wrapper = inWrapper(
      { label: 'Restock alerts', help: 'About one email a month.' },
      '<Switch description="Email me when a sold-out size is back.">Restock alerts</Switch>'
    );
    const button = wrapper.find('button[role="switch"]').element as HTMLButtonElement;
    const description = button.querySelector('[data-part="description"]') as HTMLElement;
    const help = wrapper.find('[data-part="help"]').element;
    expect(button.getAttribute('aria-describedby')).toBe(`${description.id} ${help.id}`);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Switch — content and layout', () => {
  it('is at least 1.5rem tall (target-min)', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(root(wrapper).className).toContain('eldra:target-min');
    wrapper.unmount();
  });

  it('renders in a 20rem container without overflowing, with a long label and description', () => {
    const wrapper = mountNarrow(Switch, {
      props: {
        description:
          'About one email a month, and never your address or your order history — restocks only.',
      },
      slots: {
        default:
          'Email me about new arrivals, restocks of the things I have looked at, and the studio journal',
      },
    });
    expect(root(wrapper).getBoundingClientRect().width).toBeLessThanOrEqual(320);
    wrapper.unmount();
  });
});

describe('Switch — accessibility', () => {
  it('is axe-clean off', async () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean on, with a description', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: true, description: 'Email me when a sold-out size is back.' },
      slots: { default: 'Restock alerts' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean disabled, both off and on', async () => {
    const off = mountWith(Switch, {
      props: { disabled: true },
      slots: { default: 'Restock alerts' },
    });
    expect(await axe(off.element)).toHaveNoViolations();
    off.unmount();

    const on = mountWith(Switch, {
      props: { disabled: true, modelValue: true },
      slots: { default: 'Restock alerts' },
    });
    expect(await axe(on.element)).toHaveNoViolations();
    on.unmount();
  });

  it('is axe-clean sm', async () => {
    const wrapper = mountWith(Switch, {
      props: { size: 'sm' },
      slots: { default: 'In stock only' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Switch — thumb and track slots', () => {
  const SUN = '<svg data-test="sun" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3" /></svg>';

  it('renders no track slot boxes and the default check icon when no slot is given', () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: true },
      slots: { default: 'Dark mode' },
    });
    expect(wrapper.find('[data-part="trackStart"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="trackEnd"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="thumb"] svg path').exists()).toBe(true);
    expect(wrapper.find('[data-part="thumb"]').classes()).not.toContain('eldra:text-background');
    wrapper.unmount();
  });

  it('replaces the check icon with the thumb slot, handed checked and disabled, in both states', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false, disabled: false },
      slots: {
        default: 'Dark mode',
        thumb: `<template #thumb="{ checked, disabled }"><i :data-checked="checked" :data-disabled="disabled" /></template>`,
      },
    });
    const thumb = () => wrapper.get('[data-part="thumb"]');
    expect(thumb().get('i').attributes('data-checked')).toBe('false');
    expect(thumb().classes()).toContain('eldra:text-background');
    await wrapper.setProps({ modelValue: true, disabled: true });
    expect(thumb().get('i').attributes('data-checked')).toBe('true');
    expect(thumb().get('i').attributes('data-disabled')).toBe('true');
    expect(thumb().find('path').exists()).toBe(false);
    expect(thumb().get('span').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it.each(SIZES)(
    'draws trackStart and trackEnd at the thumb rest positions, in the thumb size (%s)',
    (size) => {
      const wrapper = mountWith(Switch, {
        props: { size },
        slots: { default: 'Dark mode', trackStart: SUN, trackEnd: SUN },
      });
      const start = wrapper.get('[data-part="trackStart"]');
      const end = wrapper.get('[data-part="trackEnd"]');
      const thumbSize = size === 'md' ? 'eldra:size-4' : 'eldra:size-3';
      const travel = size === 'md' ? 'eldra:translate-x-5' : 'eldra:translate-x-4';
      for (const box of [start, end]) {
        expect(box.attributes('aria-hidden')).toBe('true');
        expect(box.classes()).toEqual(
          expect.arrayContaining(['eldra:absolute', 'eldra:eldra-switch-thumb-offset', thumbSize])
        );
        expect(box.find('[data-test="sun"]').exists()).toBe(true);
      }
      expect(start.classes()).not.toContain(travel);
      expect(end.classes()).toContain(travel);
      // Painted before the thumb, so the thumb covers whichever one it rests on.
      const track = wrapper.get('[data-part="track"]').element;
      expect([...track.children].map((child) => child.getAttribute('data-part'))).toEqual([
        'trackStart',
        'trackEnd',
        'thumb',
      ]);
      wrapper.unmount();
    }
  );

  it('inks track content primary-contrast while on and muted while off or disabled', async () => {
    const wrapper = mountWith(Switch, {
      props: { modelValue: false },
      slots: { default: 'Dark mode', trackStart: SUN },
    });
    const start = () => wrapper.get('[data-part="trackStart"]');
    expect(start().classes()).toContain('eldra:text-muted');
    await wrapper.setProps({ modelValue: true });
    expect(start().classes()).toContain('eldra:text-primary-contrast');
    await wrapper.setProps({ disabled: true });
    expect(start().classes()).toContain('eldra:text-muted');
    wrapper.unmount();
  });

  it('takes classes for the two track parts', () => {
    const wrapper = mountWith(Switch, {
      props: { classes: { trackStart: 'text-accent', trackEnd: 'text-danger' } },
      slots: { default: 'Dark mode', trackStart: SUN, trackEnd: SUN },
    });
    expect(wrapper.get('[data-part="trackStart"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="trackEnd"]').classes()).toContain('text-danger');
    wrapper.unmount();
  });

  it('keeps slot content out of the accessible name', () => {
    const wrapper = mountWith(Switch, {
      slots: { default: 'Dark mode', thumb: 'Moon', trackStart: 'On', trackEnd: 'Off' },
    });
    for (const selector of ['[data-part="trackStart"]', '[data-part="trackEnd"]']) {
      expect(wrapper.get(selector).attributes('aria-hidden')).toBe('true');
    }
    expect(wrapper.get('[data-part="thumb"] > span').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('is axe-clean with every slot filled, off, on and disabled', async () => {
    for (const props of [{ modelValue: false }, { modelValue: true }, { disabled: true }]) {
      const wrapper = mountWith(Switch, {
        props,
        slots: { default: 'Dark mode', thumb: SUN, trackStart: SUN, trackEnd: SUN },
      });
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  });
});

describe('Switch — requiredMark and error', () => {
  it('renders the button and its mirror input alone without either', () => {
    const wrapper = mountWith(Switch, { slots: { default: 'Restock alerts' } });
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="requiredMark"]').exists()).toBe(false);
    expect(root(wrapper).getAttribute('aria-invalid')).toBeNull();
    wrapper.unmount();
  });

  it("draws FieldWrapper's mark after the label, with the hidden Required", async () => {
    const wrapper = mountWith(Switch, {
      props: { requiredMark: true },
      slots: { default: 'Restock alerts' },
    });
    const label = wrapper.find('[data-part="label"]');
    expect(label.find('[data-part="requiredMark"]').attributes('aria-hidden')).toBe('true');
    expect(label.text()).toBe('Restock alerts*Required');
    expect(await axe(document.body)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('draws the error row after the switch, linked first, and marks it invalid', async () => {
    const wrapper = mountWith(Switch, {
      props: { error: 'Turn this on to continue.', description: 'Weekly at most' },
      slots: { default: 'Restock alerts' },
    });
    const error = wrapper.find('[data-part="error"]');
    expect(error.text()).toBe('Turn this on to continue.');
    expect(root(wrapper).contains(error.element)).toBe(false);
    expect(root(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(root(wrapper).getAttribute('aria-describedby')).toBe(
      `${error.attributes('id')} ${wrapper.find('[data-part="description"]').attributes('id')}`
    );
    expect(await axe(document.body)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('keeps its own label inside a FieldWrapper with no visible label', () => {
    const wrapper = mountWith(FieldWrapper, {
      slots: { default: () => h(Switch, null, () => 'Restock alerts') },
    });
    expect(wrapper.find('[data-part="label"]').text()).toBe('Restock alerts');
    wrapper.unmount();
  });
});

describe('Switch — invalid', () => {
  it('sets aria-invalid with no error row and no extra description', async () => {
    const wrapper = mountWith(Switch, {
      props: { invalid: true },
      slots: { default: 'Restock alerts' },
    });
    expect(root(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    expect(root(wrapper).getAttribute('aria-describedby')).toBeNull();
    expect(await axe(document.body)).toHaveNoViolations();
    await wrapper.setProps({ invalid: false });
    expect(root(wrapper).getAttribute('aria-invalid')).toBeNull();
    wrapper.unmount();
  });

  it('keeps the error row when error is also given', () => {
    const wrapper = mountWith(Switch, {
      props: { invalid: true, error: 'Turn this on to continue.' },
      slots: { default: 'Restock alerts' },
    });
    expect(wrapper.find('[data-part="error"]').exists()).toBe(true);
    expect(root(wrapper).getAttribute('aria-invalid')).toBe('true');
    wrapper.unmount();
  });
});
