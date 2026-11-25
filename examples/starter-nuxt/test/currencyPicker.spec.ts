// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Navigation from '../blocks/navigation/Block.vue';
import navigationMock from '../blocks/navigation/mock.json';
import Footer from '../blocks/footer/Block.vue';
import footerMock from '../blocks/footer/mock.json';
import { STOREFRONT_KEY, type StorefrontSource } from '../app/storefront/types';
import { axe } from './support/axe';
import { mountOptions } from './support/mountBlock';

const MULTI = {
  currency: 'ISK',
  taxInclusivePricing: true,
  defaultTaxRate: 0.24,
  currencies: ['ISK', 'EUR', 'USD'],
};
const ONE = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

function mountWith(component: object, commerce: typeof MULTI | typeof ONE, data = {}) {
  const options = mountOptions({ entry: { id: 'c', data } }, { commerce });
  const storefront = options.global.provide[STOREFRONT_KEY] as StorefrontSource;
  storefront.currency.started.value = true;
  const wrapper = mount(component, { ...options, attachTo: document.body });
  return { wrapper, storefront };
}

describe('the currency picker in the starter', () => {
  it('sits in the header of a store that shows more than one currency and moves the visitor', async () => {
    const { wrapper, storefront } = mountWith(Navigation, MULTI, navigationMock);
    const trigger = wrapper.get('[data-eldra-header-actions] button[role="combobox"]');
    expect(trigger.text()).toContain('ISK');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await flushPromises();
    const euro = [...document.querySelectorAll('[role="option"]')].find((node) =>
      node.textContent?.includes('(EUR)')
    ) as HTMLElement;
    euro.click();
    await flushPromises();
    expect(storefront.currency.active.value).toBe('EUR');
    expect(localStorage.getItem('eldra.currency')).toBe('EUR');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('is not in the header of a one-currency store', () => {
    const { wrapper } = mountWith(Navigation, ONE, navigationMock);
    expect(wrapper.find('[data-eldra-header-actions] [role="combobox"]').exists()).toBe(false);
  });

  it("drives the footer's currency selector too", async () => {
    const { wrapper, storefront } = mountWith(Footer, MULTI, footerMock);
    storefront.currency.choose('USD');
    await vi.waitFor(() => expect(storefront.currency.active.value).toBe('USD'));
    await flushPromises();
    expect(
      wrapper.findAll('button[role="combobox"]').some((node) => node.text().includes('USD'))
    ).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
