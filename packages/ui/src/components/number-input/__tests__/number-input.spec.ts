import { IconCurrencyDollar } from '@tabler/icons-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, nextTick, ref, type Ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import NumberInput from '../NumberInput.vue';
import type { NumberInputProps } from '../types';

/**
 * `NumberInput` is an addition beyond design spec 1, which has no editable numeric field at all.
 * Everything a customer can see is `Input`'s (the box, the sizes, the ring, the error boundary,
 * all imported from `../../input/classes.ts`); what is tested here is the part that is its own —
 * a `number` on one side of the control and a locale-formatted string on the other.
 */

/** Every mount needs an accessible name; a `FieldWrapper` supplies one in real use. */
const NAME = { 'aria-label': 'Price' };

/** `is-IS` groups with `.` and uses `,` as its decimal point — `en-US` is the other way round. */
const IS = 'is-IS';

/** The non-breaking space ICU puts between an Icelandic amount and its currency. */
const NBSP = ' ';

function mount(props: Partial<NumberInputProps> = {}) {
  return mountWith(NumberInput, { props, attrs: NAME });
}

function control(wrapper: { find: (s: string) => { element: Element } }): HTMLInputElement {
  return wrapper.find('[data-part="control"]').element as HTMLInputElement;
}

/**
 * The control inside a parent that actually holds the value — which is what every real caller is.
 * `mount()` above passes `modelValue` as a plain prop and never updates it, so the control stays
 * *controlled at the value it was given*: correct for testing what it renders, and useless for
 * testing what it does after a commit, because the parent refuses every write. These tests need
 * the round trip, so they get a real `v-model`.
 */
function mountModel(props: Partial<NumberInputProps> = {}, initial: number | null = null) {
  const value: Ref<number | null> = ref(initial);
  const host = mountWith(
    defineComponent({
      components: { NumberInput },
      setup: () => ({ value, bound: props }),
      template: `<NumberInput v-bind="bound" v-model="value" aria-label="Price" />`,
    })
  );
  return { host, value, field: () => host.find('[data-part="control"]') };
}

/** Focus the field, replace what is in it, and leave — the whole commit path a customer walks. */
async function typeAndBlur(
  wrapper: {
    find: (selector: string) => { element: Element; trigger: (e: string) => Promise<unknown> };
  },
  text: string
): Promise<void> {
  const field = wrapper.find('[data-part="control"]');
  await field.trigger('focus');
  (field.element as HTMLInputElement).value = text;
  await field.trigger('input');
  await field.trigger('blur');
  await nextTick();
}

/** A stub `FieldWrapper` context, the same fixture `input.spec.ts` uses. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-price',
        labelId: 'field-price-label',
        describedBy: 'field-price-error field-price-help',
        invalid: true,
        required: true,
        labelsControl: true,
        ...context,
      })),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('NumberInput — element and parts', () => {
  it('renders a text input inside a root wrapper, with a data-part on every part', () => {
    const wrapper = mountWith(NumberInput, {
      props: { modelValue: 12, clearable: true, leadingIcon: IconCurrencyDollar },
      attrs: NAME,
      slots: { prefix: '<span>≈</span>', suffix: '<span>kg</span>' },
    });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(control(wrapper).tagName).toBe('INPUT');
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="prefix"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="suffix"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('is a text field with a decimal keypad, not a native number input', () => {
    // A native number input's DOM value can only hold the ungrouped US grammar, so it cannot hold
    // `is-IS`'s "1.234" at all — the same reason `QuantityStepper` is `type="text"`.
    const wrapper = mount({ modelValue: 1 });
    const element = control(wrapper);
    expect(element.getAttribute('type')).toBe('text');
    expect(element.getAttribute('inputmode')).toBe('decimal');
    expect(element.getAttribute('autocomplete')).toBe('off');
    expect(element.getAttribute('dir')).toBe('ltr');
    expect(wrapper.find('[data-part="control"]').classes()).toContain('tabular-nums');
    wrapper.unmount();
  });

  it('draws the same box as Input, rather than a copy of it', async () => {
    const { FIELD_BASE } = await import('../../input/classes');
    const wrapper = mount({ modelValue: 1 });
    const classes = wrapper.find('[data-part="control"]').classes();
    for (const token of FIELD_BASE.split(/\s+/).filter(Boolean)) {
      expect(classes, `the control is missing Input's ${token}`).toContain(token);
    }
    wrapper.unmount();
  });
});

describe('NumberInput — display formatting', () => {
  it('shows a plain decimal in the locale', () => {
    const enUS = mount({ modelValue: 1234.5 });
    expect(control(enUS).value).toBe('1,234.5');
    enUS.unmount();

    const isIS = mount({ modelValue: 1234.5, locale: IS });
    expect(control(isIS).value).toBe('1.234,5');
    isIS.unmount();
  });

  it('shows a currency with its symbol and its own fraction digits', () => {
    const usd = mount({ modelValue: 1234.5, format: 'currency', currency: 'USD' });
    expect(control(usd).value).toBe('$1,234.50');
    usd.unmount();

    // ISK has **no** minor unit, so the default precision is 0 and the value is rounded, not
    // padded — hard-coding two decimals is exactly the assumption that breaks here.
    const isk = mount({ modelValue: 1234.5, format: 'currency', currency: 'ISK', locale: IS });
    expect(control(isk).value).toBe(`1.235${NBSP}kr.`);
    isk.unmount();
  });

  it('honours currencyDisplay', () => {
    const code = mount({
      modelValue: 12,
      format: 'currency',
      currency: 'USD',
      currencyDisplay: 'code',
    });
    expect(control(code).value).toContain('USD');
    code.unmount();
  });

  it('shows a unit through Intl, not as text the component appends', () => {
    const short = mount({ modelValue: 2.5, format: 'unit', unit: 'kilogram' });
    expect(control(short).value).toBe('2.5 kg');
    short.unmount();

    const long = mount({ modelValue: 2.5, format: 'unit', unit: 'kilogram', unitDisplay: 'long' });
    expect(control(long).value).toBe('2.5 kilograms');
    long.unmount();
  });

  it('shows nothing at all for a null value', () => {
    const wrapper = mount({ modelValue: null });
    expect(control(wrapper).value).toBe('');
    wrapper.unmount();
  });
});

describe('NumberInput — editing', () => {
  it('drops the group separators while the field has focus, and keeps the decimal one', async () => {
    const wrapper = mount({ modelValue: 1234.5, locale: IS });
    expect(control(wrapper).value).toBe('1.234,5');
    await wrapper.find('[data-part="control"]').trigger('focus');
    // The editable text is what a person can put a caret in without fighting a group separator.
    expect(control(wrapper).value).toBe('1234,5');
    wrapper.unmount();
  });

  it('parses what was typed in the locale, and reformats it on blur', async () => {
    const { host, value } = mountModel({ locale: IS });
    await typeAndBlur(host, '1234,56');
    expect(value.value).toBe(1234.56);
    expect(control(host).value).toBe('1.234,56');
    host.unmount();
  });

  it('clamps to min and max on commit', async () => {
    const high = mountModel({ min: 1, max: 10 }, 5);
    await typeAndBlur(high.host, '99');
    expect(high.value.value).toBe(10);
    high.host.unmount();

    const low = mountModel({ min: 1, max: 10 }, 5);
    await typeAndBlur(low.host, '0');
    expect(low.value.value).toBe(1);
    low.host.unmount();
  });

  it('rounds to precision', async () => {
    const two = mountModel();
    await typeAndBlur(two.host, '1.005');
    expect(two.value.value).toBe(1.01);
    two.host.unmount();

    const none = mountModel({ precision: 0 });
    await typeAndBlur(none.host, '1.6');
    expect(none.value.value).toBe(2);
    none.host.unmount();
  });

  it('emits only when the number actually changed', async () => {
    const wrapper = mount({ modelValue: 12 });
    // Focus and leave with no edit at all.
    await wrapper.find('[data-part="control"]').trigger('focus');
    await wrapper.find('[data-part="control"]').trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();

    // A typed value that rounds back to the same number is not a change either.
    await typeAndBlur(wrapper, '12.001');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();

    await typeAndBlur(wrapper, '13');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([13]);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([13]);
    wrapper.unmount();
  });

  it('commits null for text that is not a number, rather than putting the old value back', async () => {
    // A field that silently restored a number the customer had just deleted would be lying about
    // what it holds. Whether `null` is an *error* is the caller's to say, through `invalid`.
    const wrapper = mount({ modelValue: 12 });
    await typeAndBlur(wrapper, 'twelve');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([null]);
    wrapper.unmount();
  });

  it('commits the whole number when the fraction has not been typed yet', async () => {
    // Deleting the digits after the decimal point and tabbing away used to commit `null`: the
    // value vanished because the caret had stopped one character short of a number.
    const enUS = mountModel();
    await typeAndBlur(enUS.host, '12.');
    expect(enUS.value.value).toBe(12);
    expect(control(enUS.host).value).toBe('12');
    enUS.host.unmount();

    const isIS = mountModel({ locale: IS });
    await typeAndBlur(isIS.host, '12,');
    expect(isIS.value.value).toBe(12);
    isIS.host.unmount();
  });

  it('still commits null for a separator with no number in front of it', async () => {
    const enUS = mountModel(undefined, 5);
    await typeAndBlur(enUS.host, '.');
    expect(enUS.value.value).toBeNull();
    enUS.host.unmount();

    const isIS = mountModel({ locale: IS }, 5);
    await typeAndBlur(isIS.host, ',');
    expect(isIS.value.value).toBeNull();
    isIS.host.unmount();
  });

  it('commits null for an emptied field', async () => {
    const wrapper = mount({ modelValue: 12 });
    await typeAndBlur(wrapper, '');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    wrapper.unmount();
  });

  it('commits on Enter without leaving the field', async () => {
    const wrapper = mount({ modelValue: 0 });
    const field = wrapper.find('[data-part="control"]');
    await field.trigger('focus');
    (field.element as HTMLInputElement).value = '42';
    await field.trigger('input');
    await field.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([42]);
    // Still editing: the next keystroke must not be overwritten by the formatted value snapping
    // back under a live caret (the bug `QuantityStepper` documents in its own `onBlur`).
    expect(wrapper.emitted('blur')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('NumberInput — the arrows', () => {
  async function arrow(
    model: ReturnType<typeof mountModel>,
    key: 'ArrowUp' | 'ArrowDown',
    shiftKey = false
  ): Promise<void> {
    await model.field().trigger('keydown', { key, shiftKey });
  }

  it('steps by step, and by ten times it with Shift', async () => {
    const model = mountModel({ step: 5 }, 10);
    await arrow(model, 'ArrowUp');
    expect(model.value.value).toBe(15);
    await arrow(model, 'ArrowDown');
    expect(model.value.value).toBe(10);
    await arrow(model, 'ArrowUp', true);
    expect(model.value.value).toBe(60);
    model.host.unmount();
  });

  it('defaults a currency step to one minor unit of that currency', async () => {
    const usd = mountModel({ format: 'currency', currency: 'USD' }, 1);
    await arrow(usd, 'ArrowUp');
    expect(usd.value.value).toBe(1.01);
    usd.host.unmount();

    // ISK has no minor unit at all, so its step is a whole króna.
    const isk = mountModel({ format: 'currency', currency: 'ISK' }, 1);
    await arrow(isk, 'ArrowUp');
    expect(isk.value.value).toBe(2);
    isk.host.unmount();
  });

  it('clamps at the limits and emits nothing once it is there', async () => {
    const model = mountModel({ min: 0, max: 10 }, 9);
    const inner = model.host.findComponent(NumberInput);
    await arrow(model, 'ArrowUp');
    expect(model.value.value).toBe(10);
    await arrow(model, 'ArrowUp');
    // At the limit the value does not move, so nothing is emitted a second time either.
    expect(inner.emitted('update:modelValue')).toHaveLength(1);
    expect(inner.emitted('change')).toHaveLength(1);
    model.host.unmount();
  });

  it('lands on min itself from an empty field, not a step above it', async () => {
    // The lowest value the field accepts is the answer someone pressing Up on a blank amount is
    // asking for; starting at `min + step` makes the first allowed value unreachable by the
    // keyboard without pressing Down again.
    const model = mountModel({ min: 5 }, null);
    await arrow(model, 'ArrowUp');
    expect(model.value.value).toBe(5);
    model.host.unmount();
  });

  it('lands on the step itself from an empty field with no min', async () => {
    const up = mountModel({ step: 5 }, null);
    await arrow(up, 'ArrowUp');
    expect(up.value.value).toBe(5);
    up.host.unmount();

    const down = mountModel({ step: 5 }, null);
    await arrow(down, 'ArrowDown');
    expect(down.value.value).toBe(-5);
    down.host.unmount();
  });

  it('does nothing on a read-only or disabled field', async () => {
    const readonly = mountModel({ readonly: true }, 1);
    await arrow(readonly, 'ArrowUp');
    expect(readonly.value.value).toBe(1);
    readonly.host.unmount();

    const disabled = mountModel({ disabled: true }, 1);
    await arrow(disabled, 'ArrowUp');
    expect(disabled.value.value).toBe(1);
    disabled.host.unmount();
  });
});

describe('NumberInput — numeric-only typing', () => {
  function beforeInput(element: HTMLInputElement, data: string, inputType = 'insertText'): boolean {
    const event = new InputEvent('beforeinput', {
      inputType,
      data,
      cancelable: true,
      bubbles: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('lets digits through and refuses letters', () => {
    const wrapper = mount({ modelValue: 1 });
    const element = control(wrapper);
    element.setSelectionRange(element.value.length, element.value.length);
    expect(beforeInput(element, '2')).toBe(false);
    expect(beforeInput(element, 'a')).toBe(true);
    wrapper.unmount();
  });

  it('takes the locale decimal separator, and only one of it', () => {
    // Each locale's *other* character is its group separator, which the field's own formatted text
    // already contains — so it is accepted as a group separator, never as a second decimal point.
    // What must be refused is a second decimal separator, and that is what is asserted per locale.
    const enUS = mount({ modelValue: 1 });
    const enElement = control(enUS);
    enElement.setSelectionRange(1, 1);
    expect(beforeInput(enElement, '.')).toBe(false);
    expect(beforeInput(enElement, ',')).toBe(false);
    enElement.value = '1.5';
    enElement.setSelectionRange(3, 3);
    expect(beforeInput(enElement, '.')).toBe(true);
    enUS.unmount();

    const isIS = mount({ modelValue: 1, locale: IS });
    const isElement = control(isIS);
    isElement.setSelectionRange(1, 1);
    expect(beforeInput(isElement, ',')).toBe(false);
    expect(beforeInput(isElement, '.')).toBe(false);
    isElement.value = '1,5';
    isElement.setSelectionRange(3, 3);
    expect(beforeInput(isElement, ',')).toBe(true);
    isIS.unmount();
  });

  it('refuses a decimal separator on a whole-number field', () => {
    const wrapper = mount({ modelValue: 1, precision: 0 });
    const element = control(wrapper);
    element.setSelectionRange(1, 1);
    expect(beforeInput(element, '.')).toBe(true);
    wrapper.unmount();
  });

  it('offers a minus only when min allows a negative value', () => {
    const positive = mount({ modelValue: 1, min: 0 });
    const positiveElement = control(positive);
    positiveElement.setSelectionRange(0, 0);
    expect(beforeInput(positiveElement, '-')).toBe(true);
    positive.unmount();

    const signed = mount({ modelValue: 1, min: -100 });
    const signedElement = control(signed);
    signedElement.setSelectionRange(0, 0);
    expect(beforeInput(signedElement, '-')).toBe(false);
    signed.unmount();
  });

  it('sanitises a paste instead of refusing it, and the model sees the result', async () => {
    const wrapper = mount({ modelValue: null });
    const field = wrapper.find('[data-part="control"]');
    await field.trigger('focus');
    const element = field.element as HTMLInputElement;
    element.setSelectionRange(0, 0);
    expect(beforeInput(element, '12ab3', 'insertFromPaste')).toBe(true);
    expect(element.value).toBe('123');
    await field.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([123]);
    wrapper.unmount();
  });
});

describe('NumberInput — the form value', () => {
  it('posts the raw number through a hidden input, never the locale string', () => {
    const wrapper = mount({ modelValue: 1234.5, name: 'price', locale: IS });
    // What a person reads.
    expect(control(wrapper).value).toBe('1.234,5');
    const hidden = wrapper.find('input[type="hidden"]');
    expect(hidden.attributes('name')).toBe('price');
    // What the server gets. "1.234,5" would be parsed as 1.2345 by almost every one of them.
    expect((hidden.element as HTMLInputElement).value).toBe('1234.5');
    // Exactly one value is posted: the visible control carries no name of its own.
    expect(control(wrapper).getAttribute('name')).toBeNull();
    wrapper.unmount();
  });

  it('posts an empty string for a null value', () => {
    const wrapper = mount({ modelValue: null, name: 'price' });
    expect((wrapper.find('input[type="hidden"]').element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('renders no hidden input at all without a name', () => {
    const wrapper = mount({ modelValue: 1 });
    expect(wrapper.find('input[type="hidden"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('NumberInput — the clear button', () => {
  it('shows only while there is a value, and empties the field', async () => {
    const empty = mount({ modelValue: null, clearable: true });
    expect(empty.find('[data-part="clearButton"]').exists()).toBe(false);
    empty.unmount();

    const wrapper = mount({ modelValue: 12, clearable: true });
    await wrapper.find('[data-part="clearButton"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(document.activeElement).toBe(control(wrapper));
    wrapper.unmount();
  });

  it('never shows on a disabled or read-only field', () => {
    for (const state of [{ disabled: true }, { readonly: true }]) {
      const wrapper = mount({ modelValue: 12, clearable: true, ...state });
      expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });
});

describe('NumberInput — the field context', () => {
  it('takes the wrapper’s id, invalid and required state', () => {
    const wrapper = mountWith(NumberInput, { props: { modelValue: 1 }, global: fieldProvider() });
    const element = control(wrapper);
    expect(element.id).toBe('field-price');
    expect(element.getAttribute('aria-invalid')).toBe('true');
    expect(element.hasAttribute('required')).toBe(true);
    wrapper.unmount();
  });

  it('composes describedBy — its own ids first, then the wrapper’s', () => {
    const wrapper = mountWith(NumberInput, {
      props: { modelValue: 1, describedBy: 'own-help' },
      global: fieldProvider(),
    });
    expect(control(wrapper).getAttribute('aria-describedby')).toBe(
      'own-help field-price-error field-price-help'
    );
    wrapper.unmount();
  });

  it('keeps its own id when it is given one, so the wrapper’s label cannot reach it', () => {
    const wrapper = mountWith(NumberInput, {
      props: { modelValue: 1, id: 'my-price' },
      global: fieldProvider(),
    });
    expect(control(wrapper).id).toBe('my-price');
    wrapper.unmount();
  });

  it('does not take a group wrapper’s id', () => {
    const wrapper = mountWith(NumberInput, {
      props: { modelValue: 1 },
      global: fieldProvider({ labelsControl: false }),
    });
    expect(control(wrapper).id).not.toBe('field-price');
    wrapper.unmount();
  });

  it('draws the error boundary on an invalid field and drops it on a disabled one', () => {
    const invalid = mount({ modelValue: 1, invalid: true });
    expect(invalid.classes()).toContain('eldra-field-invalid');
    expect(invalid.find('[data-part="control"]').classes()).toContain('border-danger');
    invalid.unmount();

    // `aria-invalid` stays: the field is still invalid, it just cannot be fixed here.
    const dead = mount({ modelValue: 1, invalid: true, disabled: true });
    expect(dead.classes()).not.toContain('eldra-field-invalid');
    expect(control(dead).getAttribute('aria-invalid')).toBe('true');
    dead.unmount();
  });
});

describe('NumberInput — accessibility', () => {
  const STATES: Array<[string, Partial<NumberInputProps>]> = [
    ['default', { modelValue: 1234.5 }],
    ['invalid', { modelValue: 1234.5, invalid: true, describedBy: 'story-error' }],
    ['disabled', { modelValue: 1234.5, disabled: true }],
    ['read-only', { modelValue: 1234.5, readonly: true }],
    ['currency', { modelValue: 1234.5, format: 'currency', currency: 'USD' }],
    ['ISK currency', { modelValue: 1234.5, format: 'currency', currency: 'ISK', locale: IS }],
    ['unit', { modelValue: 2.5, format: 'unit', unit: 'kilogram' }],
    ['clearable', { modelValue: 1234.5, clearable: true }],
  ];

  it.each(STATES)('has no axe violations when %s', async (_name, props) => {
    const wrapper = mount(props);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders in a 20rem container without overflowing', async () => {
    const wrapper = mountNarrow(NumberInput, {
      props: { modelValue: 1234567.89, format: 'currency', currency: 'USD', clearable: true },
      attrs: NAME,
    });
    expect(wrapper.find('[data-part="control"]').classes()).toContain('min-w-0');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

/**
 * Read-only is "the value is readable but fixed" — focusable and selectable, which is the whole
 * reason it is not `disabled`. The defect: focusing one swapped the formatted text for the
 * editable string (so a price stopped looking like a price the moment a customer clicked it), and
 * leaving it committed — which, for a value outside `min`/`max`, silently clamped a value the
 * control had promised not to change.
 */
describe('NumberInput — read-only', () => {
  it('keeps the formatted value on focus instead of entering edit mode', async () => {
    const wrapper = mount({
      modelValue: 1234.5,
      readonly: true,
      format: 'currency',
      currency: 'USD',
    });
    const field = wrapper.find('[data-part="control"]');
    expect(control(wrapper).value).toBe('$1,234.50');
    await field.trigger('focus');
    expect(control(wrapper).value).toBe('$1,234.50');
    expect(wrapper.emitted('focus')).toHaveLength(1);
    wrapper.unmount();
  });

  it('commits nothing on blur', async () => {
    const wrapper = mount({ modelValue: 1234.5, readonly: true });
    const field = wrapper.find('[data-part="control"]');
    await field.trigger('focus');
    await field.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.emitted('blur')).toHaveLength(1);
    wrapper.unmount();
  });

  it('commits nothing on Enter', async () => {
    const wrapper = mount({ modelValue: 1234.5, readonly: true });
    const field = wrapper.find('[data-part="control"]');
    await field.trigger('focus');
    await field.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
  });

  it('never clamps a value that is outside min and max', async () => {
    // The sharp end of it: a read-only field showing an out-of-range value (a historical price, a
    // figure from another system) must keep showing it, not quietly correct it on the first click.
    const model = mountModel({ readonly: true, min: 0, max: 100 }, 250);
    await model.field().trigger('focus');
    expect(control(model.host).value).toBe('250');
    await model.field().trigger('blur');
    expect(model.value.value).toBe(250);
    model.host.unmount();
  });

  it('still shows the formatted value after focus and blur', async () => {
    const wrapper = mount({ modelValue: 2.5, readonly: true, format: 'unit', unit: 'kilogram' });
    const field = wrapper.find('[data-part="control"]');
    await field.trigger('focus');
    await field.trigger('blur');
    expect(control(wrapper).value).toBe('2.5 kg');
    wrapper.unmount();
  });
});
