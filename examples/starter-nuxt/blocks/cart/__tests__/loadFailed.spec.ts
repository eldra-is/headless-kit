// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { createCartStore, type CartSnapshot } from '../../../app/storefront/cart';
import { createDemoStorefront, DEMO_CART_LINES } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import Block from '../Block.vue';
import mock from '../mock.json';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a cart whose first read failed', () => {
  it('says so with Try again, which reads the cart again', async () => {
    const answers: Array<() => Promise<CartSnapshot>> = [
      async () => {
        throw new Error('timeout');
      },
      async () => ({
        lines: DEMO_CART_LINES,
        totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
      }),
    ];
    const cart = createCartStore({
      init: () => answers.shift()!(),
      add: async () => {
        throw new Error('unused');
      },
      setQuantity: async () => {
        throw new Error('unused');
      },
      remove: async () => {
        throw new Error('unused');
      },
      applyDiscount: async () => ({ ack: { ok: false, reason: 'failed' } }),
      removeDiscount: async () => {
        throw new Error('unused');
      },
      checkoutUrl: ref(null),
    });
    const storefront = { ...createDemoStorefront(), cart };
    const options = mountOptions({ entry: { id: 'cart', data: { ...mock, variant: 'page' } } });
    const wrapper = mount(Block, {
      ...options,
      attachTo: document.body,
      global: {
        ...options.global,
        provide: { ...options.global.provide, [STOREFRONT_KEY]: storefront },
      },
    });
    await flushPromises();

    const notice = wrapper.get('[data-eldra-cart-load-failed]');
    expect(notice.text()).toContain("We couldn't load your cart.");
    expect(await axe(wrapper.element)).toHaveNoViolations();
    await notice.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-eldra-cart-load-failed]').exists()).toBe(false);
    expect(cart.lines.value).toHaveLength(DEMO_CART_LINES.length);
  });
});
