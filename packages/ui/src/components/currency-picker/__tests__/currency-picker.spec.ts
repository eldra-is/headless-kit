import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import CurrencyPicker from '../CurrencyPicker.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CurrencyPicker', () => {
  it('names each currency in full with its code and shows the code when closed', async () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'EUR' },
      attachTo: document.body,
    });
    const trigger = wrapper.get('button[role="combobox"]');
    expect(trigger.text()).toContain('EUR');
    expect(trigger.text()).not.toContain('Euro');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    const options = [...document.querySelectorAll('[role="option"]')].map((node) =>
      (node.textContent ?? '').trim()
    );
    expect(options).toEqual(['Icelandic Króna (ISK)', 'Euro (EUR)']);
    (document.querySelectorAll('[role="option"]')[0] as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['ISK']]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('writes the names in the given language', async () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'ISK', locale: 'is-IS' },
      attachTo: document.body,
    });
    const trigger = wrapper.get('button[role="combobox"]');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    const options = [...document.querySelectorAll('[role="option"]')].map((node) =>
      (node.textContent ?? '').trim()
    );
    expect(options).toEqual(['Íslensk króna (ISK)', 'Evra (EUR)']);
    wrapper.unmount();
  });

  it('renders nothing for a single currency', () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK'], modelValue: 'ISK' },
    });
    expect(wrapper.find('[data-part="root"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows its label when asked', () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'ISK', showLabel: true },
    });
    expect(wrapper.get('label').classes()).not.toContain('eldra:sr-only');
    wrapper.unmount();
  });
});

describe('CurrencyPicker — busy', () => {
  it('says a change is on its way and still takes a newer choice', () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'ISK', busy: true },
    });
    expect(wrapper.get('[data-part="root"]').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('button[role="combobox"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('CurrencyPicker — a value outside the list', () => {
  it('shows its code rather than a blank value', () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'SEK' },
    });
    expect(wrapper.get('button[role="combobox"]').text()).toContain('SEK');
    wrapper.unmount();
  });
});
