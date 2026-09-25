import { afterEach, describe, expect, it } from 'vitest';
import { computed } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import QuantityStepper from '../QuantityStepper.vue';
import type { QuantityStepperSize } from '../types';

const SIZES: QuantityStepperSize[] = ['md', 'sm'];

type Finder = { find: (selector: string) => { element: Element } };

function root(wrapper: Finder): HTMLDivElement {
  return wrapper.find('[data-part="root"]').element as HTMLDivElement;
}
function decreaseButton(wrapper: Finder): HTMLButtonElement {
  return wrapper.find('[data-part="decrease"]').element as HTMLButtonElement;
}
function increaseButton(wrapper: Finder): HTMLButtonElement {
  return wrapper.find('[data-part="increase"]').element as HTMLButtonElement;
}
function input(wrapper: Finder): HTMLInputElement {
  return wrapper.find('[data-part="input"]').element as HTMLInputElement;
}

/** A stub FieldWrapper, exactly what a plain (non-group) `FieldWrapper` provides. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-quantity',
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

describe('QuantityStepper — element and parts', () => {
  it('has a data-part on every named part', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(root(wrapper)).toBeTruthy();
    expect(decreaseButton(wrapper)).toBeTruthy();
    expect(input(wrapper)).toBeTruthy();
    expect(increaseButton(wrapper)).toBeTruthy();
    wrapper.unmount();
  });

  it('the buttons are type="button", so they never submit a form', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(decreaseButton(wrapper).getAttribute('type')).toBe('button');
    expect(increaseButton(wrapper).getAttribute('type')).toBe('button');
    wrapper.unmount();
  });

  it('the field is inputmode=numeric with the spinbutton role and no native spin buttons', () => {
    const wrapper = mountWith(QuantityStepper);
    const el = input(wrapper);
    expect(el.getAttribute('inputmode')).toBe('numeric');
    expect(el.getAttribute('role')).toBe('spinbutton');
    // Deliberately not type="number" — see QuantityStepper.vue's own doc comment for why. A plain
    // text field has no native spin buttons to hide in the first place.
    expect(el.getAttribute('type')).toBe('text');
    wrapper.unmount();
  });
});

describe('QuantityStepper — aria-value*', () => {
  it('aria-valuenow/-valuemin/-valuemax/-valuetext reflect modelValue/min/max on mount', () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4, min: 1, max: 10 } });
    const el = input(wrapper);
    expect(el.getAttribute('aria-valuenow')).toBe('4');
    expect(el.getAttribute('aria-valuemin')).toBe('1');
    expect(el.getAttribute('aria-valuemax')).toBe('10');
    expect(el.getAttribute('aria-valuetext')).toBe('4');
    wrapper.unmount();
  });

  it('aria-valuenow and aria-valuetext track a step', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { min: 1, max: 10 } });
    await wrapper.find('[data-part="increase"]').trigger('click');
    const el = input(wrapper);
    expect(el.getAttribute('aria-valuenow')).toBe('2');
    expect(el.getAttribute('aria-valuetext')).toBe('2');
    wrapper.unmount();
  });

  it('aria-valuenow and aria-valuetext track a typed value clamped on blur', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { max: 10 } });
    const el = input(wrapper);
    el.value = '150';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(el.getAttribute('aria-valuenow')).toBe('10');
    expect(el.getAttribute('aria-valuetext')).toBe('10');
    wrapper.unmount();
  });

  it('aria-valuemin/-valuemax reflect custom min/max props', () => {
    const wrapper = mountWith(QuantityStepper, { props: { min: 5, max: 250 } });
    const el = input(wrapper);
    expect(el.getAttribute('aria-valuemin')).toBe('5');
    expect(el.getAttribute('aria-valuemax')).toBe('250');
    wrapper.unmount();
  });
});

describe('QuantityStepper — value and v-model', () => {
  it('defaults to min (1) with no modelValue', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(input(wrapper).value).toBe('1');
    wrapper.unmount();
  });

  it('defaults to a custom min', () => {
    const wrapper = mountWith(QuantityStepper, { props: { min: 5 } });
    expect(input(wrapper).value).toBe('5');
    wrapper.unmount();
  });

  it('shows the modelValue', () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    expect(input(wrapper).value).toBe('4');
    wrapper.unmount();
  });

  it('is uncontrolled without modelValue: pressing increase updates its own state', async () => {
    const wrapper = mountWith(QuantityStepper);
    await wrapper.find('[data-part="increase"]').trigger('click');
    expect(input(wrapper).value).toBe('2');
    wrapper.unmount();
  });

  it('is controlled with modelValue: a parent that refuses the change keeps it as it was', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="increase"]').trigger('click');
    expect(input(wrapper).value).toBe('4');
    wrapper.unmount();
  });
});

describe('QuantityStepper — buttons step and clamp', () => {
  it('increase adds 1 and emits update:modelValue and change', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="increase"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([5]);
    expect(wrapper.emitted('change')?.[0]).toEqual([5]);
    wrapper.unmount();
  });

  it('decrease subtracts 1', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="decrease"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([3]);
    wrapper.unmount();
  });

  it('increase clamps at max and stops emitting once there', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 99, max: 99 } });
    await wrapper.find('[data-part="increase"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(input(wrapper).value).toBe('99');
    wrapper.unmount();
  });

  it('decrease clamps at min (never reaches 0 on a cart line) and stops emitting once there', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 1, min: 1 } });
    await wrapper.find('[data-part="decrease"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(input(wrapper).value).toBe('1');
    wrapper.unmount();
  });
});

describe('QuantityStepper — at-limit and disabled states', () => {
  it('decrease is aria-disabled at min but stays focusable', () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 1, min: 1 } });
    const btn = decreaseButton(wrapper);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    expect(btn.tabIndex).toBe(0);
    wrapper.unmount();
  });

  it('increase is aria-disabled at max but stays focusable', () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 99, max: 99 } });
    const btn = increaseButton(wrapper);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    wrapper.unmount();
  });

  it('neither button is aria-disabled away from a limit', () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 50 } });
    expect(decreaseButton(wrapper).getAttribute('aria-disabled')).toBeNull();
    expect(increaseButton(wrapper).getAttribute('aria-disabled')).toBeNull();
    wrapper.unmount();
  });

  it('disabled (sold out): both buttons and the field are natively disabled, dashed group boundary', () => {
    const wrapper = mountWith(QuantityStepper, { props: { disabled: true } });
    expect(decreaseButton(wrapper).disabled).toBe(true);
    expect(increaseButton(wrapper).disabled).toBe(true);
    expect(input(wrapper).disabled).toBe(true);
    expect(root(wrapper).className).toContain('border-dashed');
    expect(root(wrapper).className).toContain('cursor-not-allowed');
    wrapper.unmount();
  });

  it('a disabled stepper never fires click on either button', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4, disabled: true } });
    await wrapper.find('[data-part="increase"]').trigger('click');
    await wrapper.find('[data-part="decrease"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('QuantityStepper — accessible names', () => {
  it('names the buttons Decrease/Increase quantity', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(decreaseButton(wrapper).getAttribute('aria-label')).toBe('Decrease');
    expect(increaseButton(wrapper).getAttribute('aria-label')).toBe('Increase');
    wrapper.unmount();
  });

  it('appends the item name to both button names', () => {
    const wrapper = mountWith(QuantityStepper, { props: { itemName: 'Stoneware mug' } });
    expect(decreaseButton(wrapper).getAttribute('aria-label')).toBe('Decrease, Stoneware mug');
    expect(increaseButton(wrapper).getAttribute('aria-label')).toBe('Increase, Stoneware mug');
    wrapper.unmount();
  });

  it('names the field "Quantity" by default', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(input(wrapper).getAttribute('aria-label')).toBe('Quantity');
    wrapper.unmount();
  });
});

describe('QuantityStepper — keyboard', () => {
  it('ArrowUp in the field steps up by 1 and commits', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="input"]').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([5]);
    expect(wrapper.emitted('change')?.[0]).toEqual([5]);
    wrapper.unmount();
  });

  it('ArrowDown in the field steps down by 1', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="input"]').trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([3]);
    wrapper.unmount();
  });

  it('ArrowUp at max fires no change', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 99, max: 99 } });
    await wrapper.find('[data-part="input"]').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('Enter commits a typed value', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    const el = input(wrapper);
    el.value = '7';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([7]);
    expect(el.value).toBe('7');
    wrapper.unmount();
  });

  /**
   * Fix round 1, item 3: after `Enter` commits, the field stays focused (no blur happens), and
   * `isEditing` must stay true so `displayValue` keeps reading `editingText` rather than snapping
   * back to the freshly committed, formatted number the instant a further keystroke arrives. Before
   * the fix, the next character typed after `Enter` was silently overwritten by the reactive
   * `:value` binding.
   */
  it('typing continues to show what was typed after an Enter-commit, while still focused', async () => {
    const wrapper = mountWith(QuantityStepper);
    const el = input(wrapper);
    await wrapper.find('[data-part="input"]').trigger('focus');
    el.value = '5';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('keydown', { key: 'Enter' });
    expect(el.value).toBe('5');

    // Still focused — no blur/refocus in between — and the user keeps typing.
    el.value = '56';
    await wrapper.find('[data-part="input"]').trigger('input');
    expect(el.value).toBe('56');
    wrapper.unmount();
  });
});

describe('QuantityStepper — commits only a real change', () => {
  /**
   * Fix round 1, item 1: `commit()` used to emit `change` and announce unconditionally, so
   * focusing and blurring (or pressing `Enter`) with no edit at all fired a spurious `change` and
   * a "settled update" announcement for an update that never happened — mirrors the guard `step()`
   * already had for a button press at a limit.
   */
  it('blur with no edit fires no change, no update:modelValue, and announces nothing', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="input"]').trigger('focus');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.find('[role="status"]').element.textContent).toBe('');
    wrapper.unmount();
  });

  it('Enter with no edit fires no change and no update:modelValue', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    await wrapper.find('[data-part="input"]').trigger('focus');
    await wrapper.find('[data-part="input"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('blur after only a formatting no-op (e.g. re-typing the same value) still fires nothing', async () => {
    const wrapper = mountWith(QuantityStepper);
    const el = input(wrapper);
    await wrapper.find('[data-part="input"]').trigger('focus');
    el.value = '1'; // same as the default min the field already shows
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('QuantityStepper — typed values clamp on blur', () => {
  /**
   * These mount uncontrolled (no `modelValue` bound): `useControllableModel`'s setter only writes
   * back to a *controlled* component's own state when the parent applies the emitted value (see
   * the "a parent that refuses the change keeps it as it was" tests above) — exactly like every
   * other component in this package. A few clicks first (never at a bound-in value) prove the
   * blur/Enter correction is real rather than a coincidence of the starting value.
   */
  async function reachFour(wrapper: ReturnType<typeof mountWith>): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
      await wrapper.find('[data-part="increase"]').trigger('click');
    }
  }

  it('rounds and clamps a value above max', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { max: 99 } });
    await reachFour(wrapper);
    const el = input(wrapper);
    el.value = '150';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(el.value).toBe('99');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([99]);
    wrapper.unmount();
  });

  it('a non-number becomes min, with no error', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { min: 1 } });
    await reachFour(wrapper);
    const el = input(wrapper);
    el.value = 'abc';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(el.value).toBe('1');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1]);
    wrapper.unmount();
  });

  it('"0" is silently corrected to min rather than shown as an error', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { min: 1 } });
    await reachFour(wrapper);
    const el = input(wrapper);
    el.value = '0';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(el.value).toBe('1');
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('rounds a fractional typed value to a whole number', async () => {
    const wrapper = mountWith(QuantityStepper);
    const el = input(wrapper);
    el.value = '6.6';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(el.value).toBe('7');
    wrapper.unmount();
  });

  it('fires only one change on commit, not per keystroke', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    const el = input(wrapper);
    for (const partial of ['1', '15']) {
      el.value = partial;
      await wrapper.find('[data-part="input"]').trigger('input');
    }
    expect(wrapper.emitted('change')).toBeUndefined();
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(wrapper.emitted('change')).toHaveLength(1);
    expect(wrapper.emitted('change')?.[0]).toEqual([15]);
    wrapper.unmount();
  });
});

describe('QuantityStepper — locale formatting and parseLocaleNumber', () => {
  it('formats a value with is-IS grouping when not focused', () => {
    const wrapper = mountWith(QuantityStepper, {
      props: { modelValue: 1234, max: 9999, locale: 'is-IS' },
    });
    const expected = new Intl.NumberFormat('is-IS', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(1234);
    expect(input(wrapper).value).toBe(expected);
    wrapper.unmount();
  });

  it('parses an is-IS grouped typed value ("1.234") via parseLocaleNumber on blur', async () => {
    const wrapper = mountWith(QuantityStepper, {
      props: { modelValue: 4, max: 9999, locale: 'is-IS' },
    });
    const el = input(wrapper);
    el.value = '1.234';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1234]);
    wrapper.unmount();
  });

  it('parses an en-US grouped typed value ("1,234") via parseLocaleNumber on blur', async () => {
    const wrapper = mountWith(QuantityStepper, {
      props: { modelValue: 4, max: 9999, locale: 'en-US' },
    });
    const el = input(wrapper);
    el.value = '1,234';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1234]);
    wrapper.unmount();
  });

  it('defaults to en-US when no locale is given', () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    expect(input(wrapper).value).toBe('4');
    wrapper.unmount();
  });
});

describe('QuantityStepper — sizes', () => {
  it.each(SIZES)('renders the %s button and input sizes from the spec', (size) => {
    const wrapper = mountWith(QuantityStepper, { props: { size } });
    const dec = decreaseButton(wrapper).className;
    const field = input(wrapper).className;
    if (size === 'md') {
      expect(dec).toContain('control-h');
      expect(dec).toContain('aspect-square');
      expect(field).toContain('w-11');
    } else {
      expect(dec).toContain('control-h-sm');
      expect(field).toContain('w-9');
    }
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(input(wrapper).className).toContain('w-11');
    wrapper.unmount();
  });
});

describe('QuantityStepper — error', () => {
  it('renders no error row without an error', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    expect(input(wrapper).getAttribute('aria-describedby')).toBeNull();
    wrapper.unmount();
  });

  it('renders the error message and links it by aria-describedby', () => {
    const wrapper = mountWith(QuantityStepper, { props: { error: 'Only 3 left' } });
    const error = wrapper.find('[data-part="error"]').element;
    expect(error.textContent).toContain('Only 3 left');
    expect(input(wrapper).getAttribute('aria-describedby')).toBe(error.id);
    expect(input(wrapper).getAttribute('aria-invalid')).toBe('true');
    wrapper.unmount();
  });

  it('puts the error id first when a field wrapper also describes it', () => {
    const wrapper = mountWith(QuantityStepper, {
      props: { error: 'Only 3 left' },
      global: fieldProvider({ describedBy: 'help-1' }),
    });
    const error = wrapper.find('[data-part="error"]').element;
    expect(input(wrapper).getAttribute('aria-describedby')).toBe(`${error.id} help-1`);
    wrapper.unmount();
  });
});

describe('QuantityStepper — field context', () => {
  it('takes the id from a labelling FieldWrapper and drops its own aria-label', () => {
    const wrapper = mountWith(QuantityStepper, { global: fieldProvider({ id: 'field-quantity' }) });
    expect(input(wrapper).id).toBe('field-quantity');
    expect(input(wrapper).getAttribute('aria-label')).toBeNull();
    wrapper.unmount();
  });

  it('keeps its own id and aria-label when it has an id of its own', () => {
    const wrapper = mountWith(QuantityStepper, {
      props: { id: 'own-id' },
      global: fieldProvider({ id: 'field-quantity' }),
    });
    expect(input(wrapper).id).toBe('own-id');
    expect(input(wrapper).getAttribute('aria-label')).toBe('Quantity');
    wrapper.unmount();
  });

  it('renders inside a real FieldWrapper, named by its <label for>, and is axe-clean', async () => {
    const wrapper = mountWith({
      components: { FieldWrapper, QuantityStepper },
      template: `<FieldWrapper label="Quantity"><QuantityStepper /></FieldWrapper>`,
    });
    const label = wrapper.find('label').element as HTMLLabelElement;
    expect(label.getAttribute('for')).toBe(input(wrapper).id);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('QuantityStepper — live region', () => {
  it('announces the settled value once per commit, not per keystroke', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    const status = wrapper.find('[role="status"]').element;
    expect(status.textContent).toBe('');
    await wrapper.find('[data-part="increase"]').trigger('click');
    expect(status.textContent).toBe('Quantity: 5');
    wrapper.unmount();
  });

  it('announces once on blur-commit of a typed value', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { modelValue: 4 } });
    const el = input(wrapper);
    el.value = '9';
    await wrapper.find('[data-part="input"]').trigger('input');
    await wrapper.find('[data-part="input"]').trigger('blur');
    const status = wrapper.find('[role="status"]').element;
    expect(status.textContent).toBe('Quantity: 9');
    wrapper.unmount();
  });
});

describe('QuantityStepper — focus ring', () => {
  it('the buttons use the inset ring, keyboard-focus only', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(decreaseButton(wrapper).className).toContain('eldra-focus-inset');
    expect(decreaseButton(wrapper).className).not.toContain('eldra-focus-inset-always');
    expect(increaseButton(wrapper).className).toContain('eldra-focus-inset');
    wrapper.unmount();
  });

  it('the field uses the inset ring on any focus (a text field)', () => {
    const wrapper = mountWith(QuantityStepper);
    expect(input(wrapper).className).toContain('eldra-focus-inset');
    expect(input(wrapper).className).toContain('eldra-focus-inset-always');
    wrapper.unmount();
  });
});

describe('QuantityStepper — layout', () => {
  it('renders in a 20rem container without overflowing', () => {
    const wrapper = mountNarrow(QuantityStepper, { props: { itemName: 'Stoneware mug' } });
    expect(root(wrapper).getBoundingClientRect().width).toBeLessThanOrEqual(320);
    wrapper.unmount();
  });
});

describe('QuantityStepper — accessibility', () => {
  it('is axe-clean by default', async () => {
    const wrapper = mountWith(QuantityStepper);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean at min and at max', async () => {
    const atMin = mountWith(QuantityStepper, { props: { modelValue: 1, min: 1 } });
    expect(await axe(atMin.element)).toHaveNoViolations();
    atMin.unmount();

    const atMax = mountWith(QuantityStepper, { props: { modelValue: 99, max: 99 } });
    expect(await axe(atMax.element)).toHaveNoViolations();
    atMax.unmount();
  });

  it('is axe-clean disabled', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { disabled: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean with an error', async () => {
    const wrapper = mountWith(QuantityStepper, { props: { error: 'Only 3 left' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean sm, with an item name', async () => {
    const wrapper = mountWith(QuantityStepper, {
      props: { size: 'sm', itemName: 'Stoneware mug' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
