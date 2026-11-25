// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { computed } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { createDemoStorefront, DEMO_CART_LINES } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import Block from '../Block.vue';
import mock from '../mock.json';

const NOT_SOLD = { ...DEMO_CART_LINES[0]!, soldInCurrency: false };
const SOLD = DEMO_CART_LINES[1]!;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function mountCart(lines = [NOT_SOLD, SOLD], checkoutStaysOpen = false) {
  const demo = createDemoStorefront({ cartLines: lines });
  const storefront = checkoutStaysOpen
    ? { ...demo, cart: { ...demo.cart, checkoutUrl: computed(() => '/checkout/demo-cart') } }
    : demo;
  const options = mountOptions({ entry: { id: 'cart', data: { ...mock, variant: 'page' } } });
  const wrapper = mount(Block, {
    ...options,
    attachTo: document.body,
    global: {
      ...options.global,
      provide: { ...options.global.provide, [STOREFRONT_KEY]: storefront },
      stubs: { ...options.global.stubs, transition: false, 'transition-group': false },
    },
  });
  await flushPromises();
  return { wrapper, storefront };
}

describe('a cart with a line not sold in its currency', () => {
  it('holds Check out with the reason under it, rather than hiding it', async () => {
    const { wrapper } = await mountCart();
    const checkout = wrapper.findAll('button, a').find((node) => node.text().includes('Check out'));
    expect(checkout).toBeDefined();
    expect(checkout!.attributes('disabled')).toBeDefined();
    const reasonId = checkout!.attributes('aria-describedby')!;
    expect(wrapper.get(`[id="${reasonId}"]`).text()).toContain(NOT_SOLD.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('says the total leaves the line out and turns its stepper off', async () => {
    const { wrapper } = await mountCart();
    expect(wrapper.get('[data-eldra-not-included]').text()).toBe('1 item not included');
    const row = wrapper.get('[data-eldra-line-not-sold]').element.closest('li')!;
    const steppers = [...row.querySelectorAll('[role="group"] button')] as HTMLButtonElement[];
    expect(steppers.length).toBeGreaterThan(0);
    expect(steppers.every((button) => button.disabled)).toBe(true);
  });

  it('checks out once the lines are removed', async () => {
    const { wrapper, storefront } = await mountCart();
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const remove = wrapper
      .get('[data-eldra-not-sold-notice]')
      .findAll('button')
      .find((node) => node.text() === 'Remove and check out')!;
    await remove.trigger('click');
    await flushPromises();
    expect(storefront.cart.notSold.value).toEqual([]);
    expect(assign).toHaveBeenCalledWith('/checkout/demo-cart');
  });

  it('4662896758: a second press while the first is working checks out once', async () => {
    const { wrapper, storefront } = await mountCart();
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const removeNotSold = vi.spyOn(storefront.cart, 'removeNotSold');
    const remove = wrapper
      .get('[data-eldra-not-sold-notice]')
      .findAll('button')
      .find((node) => node.text() === 'Remove and check out')!;
    await remove.trigger('click');
    await remove.trigger('click');
    await flushPromises();
    expect(removeNotSold).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('stays on the cart when removing the lines leaves it empty', async () => {
    const { wrapper, storefront } = await mountCart([NOT_SOLD], true);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    const remove = wrapper
      .get('[data-eldra-not-sold-notice]')
      .findAll('button')
      .find((node) => node.text() === 'Remove and check out')!;
    await remove.trigger('click');
    await flushPromises();
    expect(storefront.cart.lines.value).toEqual([]);
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows no note and a working Check out when every line is sold', async () => {
    const { wrapper } = await mountCart([SOLD]);
    expect(wrapper.find('[data-eldra-not-included]').exists()).toBe(false);
    const checkout = wrapper.findAll('a').find((node) => node.text().includes('Check out'));
    expect(checkout?.attributes('href')).toBe('/checkout/demo-cart');
  });
});

describe('the way out with the store currency turned off (WS-1399)', () => {
  async function mountIn(cartCurrency: string) {
    const storefront = createDemoStorefront({
      cartLines: [NOT_SOLD, SOLD],
      commerce: {
        currency: 'USD',
        taxInclusivePricing: false,
        defaultTaxRate: 0,
        currencies: ['EUR', 'GBP'],
        defaultCurrency: 'EUR',
      },
    });
    await flushPromises();
    storefront.cart.currency.value = cartCurrency;
    const options = mountOptions({ entry: { id: 'cart', data: { ...mock, variant: 'page' } } });
    const wrapper = mount(Block, {
      ...options,
      attachTo: document.body,
      global: {
        ...options.global,
        provide: { ...options.global.provide, [STOREFRONT_KEY]: storefront },
        stubs: { ...options.global.stubs, transition: false, 'transition-group': false },
      },
    });
    await flushPromises();
    return wrapper
      .get('[data-eldra-not-sold-notice]')
      .findAll('button')
      .map((node) => node.text());
  }

  it('offers the default currency from another one', async () => {
    expect(await mountIn('GBP')).toContain('Shop in EUR');
  });

  it('offers no way out from the default itself', async () => {
    const buttons = await mountIn('EUR');
    expect(buttons).toEqual(['Remove and check out']);
  });
});
