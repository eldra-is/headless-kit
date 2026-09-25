import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, nextTick, ref, type Ref } from 'vue';
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

  it('shows the narrow symbol by default and the wide one when asked', async () => {
    const narrow = mount({ currency: 'USD', locale: 'en-CA', modelValue: 12 });
    await nextTick();
    expect(control(narrow).value).toBe('$12');
    narrow.unmount();

    const wide = mount({ currency: 'USD', locale: 'en-CA', modelValue: 12, narrowSymbol: false });
    await nextTick();
    expect(control(wide).value).toBe('US$12');
    wide.unmount();
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
