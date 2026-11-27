import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, nextTick, ref, type Ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import CurrencyInput from '../CurrencyInput.vue';
import type { CurrencyInputProps } from '../types';

/**
 * The private library's `CurrencyInput` spec, case for case, plus the two things this port does
 * differently: it forwards only the props that were actually passed (see the component's own doc
 * comment), and it draws this package's parts. Everything else is `UnitInput`'s and is tested
 * there.
 */

const NAME = { 'aria-label': 'Price' };
const NBSP = ' ';

function mount(props: Partial<CurrencyInputProps> = {}) {
  return mountWith(CurrencyInput, { props, attrs: NAME });
}

function control(wrapper: { find: (s: string) => { element: Element } }): HTMLInputElement {
  return wrapper.find('[data-part="control"]').element as HTMLInputElement;
}

async function type(
  field: { element: Element; trigger: (event: string) => Promise<unknown> },
  text: string
): Promise<void> {
  const element = field.element as HTMLInputElement;
  element.focus();
  element.value = text;
  element.setSelectionRange(text.length, text.length);
  await field.trigger('input');
  await nextTick();
  await nextTick();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CurrencyInput — rendering (ported)', () => {
  it('renders an input element', () => {
    const wrapper = mount();
    expect(wrapper.find('input').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders label when provided', () => {
    const wrapper = mount({ label: 'Price' });
    expect(wrapper.find('label').text()).toContain('Price');
    wrapper.unmount();
  });

  it('shows currency placeholder (defaults to USD)', () => {
    const wrapper = mount();
    expect(control(wrapper).getAttribute('placeholder')).toBe('$0.00');
    wrapper.unmount();
  });
});

describe('CurrencyInput — props (ported)', () => {
  it('formats initial modelValue with currency symbol', async () => {
    const wrapper = mount({ modelValue: 100, currency: 'USD' });
    await nextTick();
    expect(control(wrapper).value).toBe('$100');
    wrapper.unmount();
  });

  it('disabled prop disables the input', () => {
    const wrapper = mount({ disabled: true });
    expect(control(wrapper).hasAttribute('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('renders input with decimal inputMode', () => {
    const wrapper = mount();
    expect(control(wrapper).getAttribute('inputmode')).toBe('decimal');
    wrapper.unmount();
  });
});

describe('CurrencyInput — accessibility (ported)', () => {
  it('has no axe violations (WCAG 2.2 AA)', async () => {
    const wrapper = mountWith(CurrencyInput, {
      props: { label: 'Price', name: 'price-a11y', currency: 'USD' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('CurrencyInput — the money field', () => {
  it('is a currency field whatever else it is given', async () => {
    const wrapper = mount({ currency: 'USD' });
    await type(wrapper.find('[data-part="control"]'), '1234');
    expect(control(wrapper).value).toBe('$1,234');
    wrapper.unmount();
  });

  it('formats ISK under is-IS, symbol last', async () => {
    const wrapper = mount({ currency: 'ISK', locale: 'is-IS' });
    await type(wrapper.find('[data-part="control"]'), '1234');
    expect(control(wrapper).value).toBe(`1.234${NBSP}kr.`);
    wrapper.unmount();
  });

  it('shows the wide symbol by default and the narrow one when asked', async () => {
    const wide = mount({ currency: 'USD', locale: 'en-CA', modelValue: 12 });
    await nextTick();
    expect(control(wide).value).toBe('US$12');
    wide.unmount();

    const narrow = mount({ currency: 'USD', locale: 'en-CA', modelValue: 12, narrowSymbol: true });
    await nextTick();
    expect(control(narrow).value).toBe('$12');
    narrow.unmount();
  });

  it('round-trips a number through v-model', async () => {
    const value: Ref<number | null> = ref(null);
    const host = mountWith(
      defineComponent({
        components: { CurrencyInput },
        setup: () => ({ value }),
        template: `<CurrencyInput v-model="value" currency="USD" aria-label="Price" />`,
      })
    );

    await type(host.find('[data-part="control"]'), '1234.5');

    expect(value.value).toBe(1234.5);
    expect((host.find('[data-part="control"]').element as HTMLInputElement).value).toBe('$1,234.5');
    host.unmount();
  });

  it('stays controlled when v-model starts undefined, and reconciles what the parent refuses', async () => {
    // `undefined` is both "nobody bound it" and "bound to a ref nobody has set", and those are
    // opposite contracts — so the binding is read off the vnode, not off the value. Here the parent
    // binds a value that starts `undefined` and clamps anything above 100: the field has to end up
    // showing the parent's 100, not the 150 that was typed.
    const raw = ref<number | undefined>(undefined);
    const host = mountWith(
      defineComponent({
        components: { CurrencyInput },
        setup() {
          const value = computed({
            get: () => raw.value,
            set: (next: number | null) => {
              raw.value = Math.min(next ?? 0, 100);
            },
          });
          return { value };
        },
        template: `<CurrencyInput v-model="value" currency="USD" aria-label="Price" />`,
      })
    );

    // Nothing bound yet: the field is empty, and the placeholder is all there is to see.
    expect((host.find('[data-part="control"]').element as HTMLInputElement).value).toBe('');

    await type(host.find('[data-part="control"]'), '150');

    expect(raw.value).toBe(100);
    expect((host.find('[data-part="control"]').element as HTMLInputElement).value).toBe('$100');
    host.unmount();
  });

  it('keeps what was typed when nothing binds modelValue', async () => {
    // The port forwards only the props that were passed. Forwarding every declared prop — which
    // is what the private wrapper does — would make `UnitInput` see a bound `modelValue` on a
    // field nobody bound, and the reconciliation would clear the field a tick after each keystroke.
    const wrapper = mount({ currency: 'USD' });
    await type(wrapper.find('[data-part="control"]'), '1234');
    await nextTick();
    expect(control(wrapper).value).toBe('$1,234');
    wrapper.unmount();
  });
});

// ─── Formatting while typing, one parser for every way text arrives (WS-1390) ─────────────────

function mountMoney(props: Partial<CurrencyInputProps>, initial: number | null = null) {
  const value: Ref<number | null> = ref(initial);
  const host = mountWith(
    defineComponent({
      components: { CurrencyInput },
      setup: () => ({ value, bound: props }),
      template: `<CurrencyInput v-bind="bound" v-model="value" aria-label="Price" />`,
    })
  );
  const element = () => host.find('[data-part="control"]').element as HTMLInputElement;
  return { host, value, element };
}

/** One `input` event: the text the browser now holds, where its caret is, the kind of edit. */
async function input(
  element: HTMLInputElement,
  text: string,
  caret: number,
  init: InputEventInit = {}
): Promise<void> {
  element.focus();
  element.value = text;
  element.setSelectionRange(caret, caret);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, ...init }));
  await nextTick();
  await nextTick();
}

/** Types one character at a time at the caret, each as its own `insertText` event. */
async function typeKeys(element: HTMLInputElement, keys: string): Promise<void> {
  element.focus();
  for (const key of keys) {
    const at = element.selectionStart ?? element.value.length;
    const text = element.value.slice(0, at) + key + element.value.slice(element.selectionEnd ?? at);
    await input(element, text, at + 1, { inputType: 'insertText', data: key });
  }
}

const isk = { currency: 'ISK', locale: 'is-IS', narrowSymbol: true };
const eur = { currency: 'EUR', locale: 'is-IS', narrowSymbol: true, fixedFraction: true };

describe('CurrencyInput — formatting while typing (WS-1390)', () => {
  it('shows the symbol and the grouping on every keystroke while focused', async () => {
    const { host, value, element } = mountMoney(isk);

    await typeKeys(element(), '1');
    expect(element().value).toBe(`1${NBSP}kr.`);
    await typeKeys(element(), '234');

    expect(element().value).toBe(`1.234${NBSP}kr.`);
    expect(element().selectionStart).toBe(5);
    expect(document.activeElement).toBe(element());
    expect(value.value).toBe(1234);
    host.unmount();
  });

  it('keeps typed decimals and pads a fixed currency only on blur', async () => {
    const { host, value, element } = mountMoney(eur);

    await typeKeys(element(), '34,9');
    expect(element().value).toBe(`34,9${NBSP}€`);
    expect(value.value).toBe(34.9);

    element().dispatchEvent(new FocusEvent('blur'));
    await nextTick();
    expect(element().value).toBe(`34,90${NBSP}€`);
    host.unmount();
  });

  it('opens on the formatted value: focus does not swap the text', async () => {
    const { host, element } = mountMoney(eur, 1234.5);
    await nextTick();
    element().focus();
    element().dispatchEvent(new FocusEvent('focus'));
    await nextTick();
    expect(element().value).toBe(`1.234,50${NBSP}€`);
    host.unmount();
  });

  it('a paste into a selection replaces only the selection', async () => {
    const { host, value, element } = mountMoney({ currency: 'USD', locale: 'en-US' }, 1234);
    await nextTick();
    // "US$1,234" with "234" selected and "999" pasted over it.
    const before = element().value;
    const pasted = before.slice(0, before.length - 3) + '999';
    await input(element(), pasted, pasted.length, { inputType: 'insertFromPaste' });

    expect(value.value).toBe(1999);
    expect(element().value).toBe(before.replace('234', '999'));
    host.unmount();
  });

  it('reads a paste in the other convention and shows it in the field’s own', async () => {
    const { host, value, element } = mountMoney(isk);

    await input(element(), '1,000,000', 9, { inputType: 'insertFromPaste' });

    expect(value.value).toBe(1000000);
    expect(element().value).toBe(`1.000.000${NBSP}kr.`);
    host.unmount();
  });

  it('autofill: the whole text replaced with no key event and no input type', async () => {
    const { host, value, element } = mountMoney(eur, 12);
    await nextTick();

    await input(element(), '4.990,50', 8);

    expect(value.value).toBe(4990.5);
    expect(element().value).toBe(`4.990,50${NBSP}€`);
    host.unmount();
  });

  it('reads nothing during an IME composition, and the whole of it when it ends', async () => {
    const { host, value, element } = mountMoney({ currency: 'USD', locale: 'en-US' });
    const field = element();
    field.focus();
    field.dispatchEvent(new CompositionEvent('compositionstart'));
    field.value = '１２';
    field.dispatchEvent(
      new InputEvent('input', { isComposing: true, inputType: 'insertCompositionText' })
    );
    await nextTick();
    expect(value.value).toBe(null);
    expect(field.value).toBe('１２');

    field.value = '１２３４';
    field.setSelectionRange(4, 4);
    field.dispatchEvent(new CompositionEvent('compositionend'));
    await nextTick();

    expect(value.value).toBe(1234);
    expect(field.value).toBe('$1,234');
    host.unmount();
  });

  it('reads a leading mark as 0,', async () => {
    const { host, value, element } = mountMoney(eur);

    await typeKeys(element(), ',5');

    expect(value.value).toBe(0.5);
    expect(element().value).toBe(`0,5${NBSP}€`);
    host.unmount();
  });

  it('reads an ISK "4.990,00" as 4990 and drops the tail on blur', async () => {
    const { host, value, element } = mountMoney(isk);

    await input(element(), '4.990,00', 8, { inputType: 'insertFromPaste' });
    expect(value.value).toBe(4990);

    element().dispatchEvent(new FocusEvent('blur'));
    await nextTick();
    expect(element().value).toBe(`4.990${NBSP}kr.`);
    host.unmount();
  });

  it('typing ",00" after krónur keeps the amount, never multiplies it', async () => {
    const { host, value, element } = mountMoney(isk);

    await typeKeys(element(), '4990,00');

    expect(value.value).toBe(4990);
    host.unmount();
  });

  it('marks a non-zero fraction in a currency without decimals invalid and keeps the model', async () => {
    const { host, value, element } = mountMoney(isk, 100);
    await nextTick();
    const money = host.findComponent(CurrencyInput);

    await input(element(), '1,5', 3, { inputType: 'insertFromPaste' });

    expect(value.value).toBe(100);
    expect(element().getAttribute('aria-invalid')).toBe('true');
    const unit = money.findComponent({ name: 'UnitInput' });
    expect(unit.emitted('update:valid')?.at(-1)).toEqual([false]);
    expect((unit.vm as unknown as { invalidReason: string }).invalidReason).toBe('noDecimals');
    host.unmount();
  });

  it('holds a third decimal typed into a two-decimal currency, never a thousand', async () => {
    const { host, value, element } = mountMoney(eur);

    await typeKeys(element(), '1,000');

    expect(value.value).toBe(null);
    expect(element().value).toBe(`1,000${NBSP}€`);
    element().dispatchEvent(new FocusEvent('blur'));
    await nextTick();
    expect(element().getAttribute('aria-invalid')).toBe('true');
    host.unmount();
  });

  it('a letter typed after an amount does nothing', async () => {
    const { host, value, element } = mountMoney(eur, 12);
    await nextTick();

    await typeKeys(element(), 'a');

    expect(element().value).toBe(`12,00${NBSP}€`);
    expect(value.value).toBe(12);
    host.unmount();
  });

  it('nullable: an emptied field emits null and stays empty on blur', async () => {
    const { host, value, element } = mountMoney({ ...eur, nullable: true }, 5);
    await nextTick();

    await input(element(), '', 0, { inputType: 'deleteContentBackward' });
    element().dispatchEvent(new FocusEvent('blur'));
    await nextTick();

    expect(value.value).toBe(null);
    expect(element().value).toBe('');
    host.unmount();
  });

  it('shows a given placeholder in place of the formatted zero', () => {
    const wrapper = mount({ ...isk, placeholder: 'Verð' });
    expect(control(wrapper).placeholder).toBe('Verð');
    wrapper.unmount();
  });
});
