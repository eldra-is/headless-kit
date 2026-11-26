import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'vue';
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

  it('draws the closed trigger through the leading and value slots', async () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'EUR' },
      slots: {
        leading: '<svg data-test="globe" />',
        value:
          '<template #value="{ code, label }">Prices in <b>{{ code }}</b> ({{ label }})</template>',
      },
      attachTo: document.body,
    });
    const trigger = wrapper.get('button[role="combobox"]');
    expect(trigger.find('[data-test="globe"]').exists()).toBe(true);
    expect(trigger.text()).toContain('Prices in EUR (Euro (EUR))');
    expect(trigger.get('b').text()).toBe('EUR');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('draws each row through optionContent, the name and the code apart', async () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: { currencies: ['ISK', 'EUR'], modelValue: 'EUR' },
      slots: {
        optionContent: ({
          code,
          currencyName,
          selected,
        }: {
          code: string;
          currencyName: string;
          selected: boolean;
        }) => [
          h('span', { 'data-test': 'name' }, currencyName),
          h('small', code),
          selected ? h('i', 'on') : null,
        ],
      },
      attachTo: document.body,
    });
    const trigger = wrapper.get('button[role="combobox"]');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    const rows = [...document.querySelectorAll('[role="option"]')];
    expect(rows.map((row) => row.querySelector('[data-test="name"]')?.textContent)).toEqual([
      'Icelandic Króna',
      'Euro',
    ]);
    expect(rows.map((row) => row.querySelector('small')?.textContent)).toEqual(['ISK', 'EUR']);
    expect(rows.map((row) => row.querySelector('i') !== null)).toEqual([false, true]);
    // Still an option the keyboard chooses.
    (rows[0] as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['ISK']]);
    wrapper.unmount();
  });

  it('draws a shown label through the label slot and the label part', () => {
    const wrapper = mountWith(CurrencyPicker, {
      props: {
        currencies: ['ISK', 'EUR'],
        modelValue: 'EUR',
        label: 'Prices in',
        showLabel: true,
        classes: { label: 'with-icon' },
      },
      slots: { label: '<svg data-test="globe" />Prices in' },
      attachTo: document.body,
    });
    const label = wrapper.get('label');
    expect(label.find('[data-test="globe"]').exists()).toBe(true);
    expect(label.text()).toBe('Prices in');
    expect(label.classes()).toContain('with-icon');
    expect(label.classes()).not.toContain('eldra:sr-only');
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
