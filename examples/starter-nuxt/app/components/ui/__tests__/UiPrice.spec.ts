// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiPrice from '../UiPrice.vue';
import { mountOptions } from '../../../../test/support/mountBlock';

// Only the `provide` half of `mountOptions()`'s `global` is needed here
// (for `useT()`'s Eldra context) — its `stubs` is typed loosely
// (`Record<string, unknown>`) for block mounts and isn't assignable to
// `@vue/test-utils`'s own `Stubs` type, which this component doesn't need.
const eldraGlobal = (locale?: string) => ({
  provide: mountOptions({ entry: { id: 'test', data: {} } }, { locale }).global.provide,
});

describe('UiPrice', () => {
  it('formats a plain amount with Intl.NumberFormat', () => {
    const wrapper = mount(UiPrice, {
      props: { amount: 42, currency: 'USD', locale: 'en-US' },
      global: eldraGlobal(),
    });
    expect(wrapper.text()).toBe('$42.00');
  });

  it('does not render was/now markup when there is no compareAt', () => {
    const wrapper = mount(UiPrice, {
      props: { amount: 42, currency: 'USD', locale: 'en-US' },
      global: eldraGlobal(),
    });
    expect(wrapper.find('s').exists()).toBe(false);
  });

  it('renders struck-through compare-at with sr-only was/now text when on sale', () => {
    const wrapper = mount(UiPrice, {
      props: { amount: 42, currency: 'USD', compareAt: 60, locale: 'en-US' },
      global: eldraGlobal(),
    });
    const struck = wrapper.find('s');
    expect(struck.exists()).toBe(true);
    expect(struck.text()).toBe('$60.00');
    expect(wrapper.text()).toContain('Was');
    expect(wrapper.text()).toContain('Now');
    expect(wrapper.text()).toContain('$42.00');
  });

  it('does not treat a compareAt lower than or equal to amount as a sale', () => {
    const wrapper = mount(UiPrice, {
      props: { amount: 42, currency: 'USD', compareAt: 42, locale: 'en-US' },
      global: eldraGlobal(),
    });
    expect(wrapper.find('s').exists()).toBe(false);
  });

  it('formats using the given locale/currency pair', () => {
    const wrapper = mount(UiPrice, {
      props: { amount: 1999.5, currency: 'ISK', locale: 'is-IS' },
      global: eldraGlobal('is-IS'),
    });
    // Icelandic krona formats with no decimals and a dot thousands separator.
    expect(wrapper.text()).toContain('2.000');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiPrice, {
      props: { amount: 42, currency: 'USD', compareAt: 60, locale: 'en-US' },
      global: eldraGlobal(),
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
