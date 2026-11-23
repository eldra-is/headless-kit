// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { createCartStore, type CartSnapshot } from '../../../app/storefront/cart';
import { createDemoStorefront, DEMO_CART_LINES } from '../../../app/storefront/demo';
import { STOREFRONT_KEY, type StorefrontSource } from '../../../app/storefront/types';
import Navigation from '../../navigation/Block.vue';
import navigationMock from '../../navigation/mock.json';
import Block from '../Block.vue';
import mock from '../mock.json';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A storefront whose first cart read fails and whose next one answers the demo lines. */
function unreadCartStorefront(): StorefrontSource {
  const answers: Array<() => Promise<CartSnapshot>> = [
    async () => {
      throw new Error('timeout');
    },
    async () => ({
      lines: DEMO_CART_LINES,
      totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
    }),
  ];
  const unused = async (): Promise<never> => {
    throw new Error('unused');
  };
  const cart = createCartStore({
    init: () => answers.shift()!(),
    add: unused,
    setQuantity: unused,
    remove: unused,
    applyDiscount: async () => ({ ack: { ok: false, reason: 'failed' } }),
    removeDiscount: unused,
    checkoutUrl: ref(null),
  });
  return { ...createDemoStorefront(), cart };
}

async function mountWith(
  component: object,
  data: Record<string, unknown>,
  storefront: StorefrontSource
) {
  const options = mountOptions({ entry: { id: 'cart', data } });
  const wrapper = mount(component, {
    ...options,
    props: { entry: { id: 'cart', data } },
    attachTo: document.body,
    global: {
      ...options.global,
      provide: { ...options.global.provide, [STOREFRONT_KEY]: storefront },
      stubs: { ...options.global.stubs, transition: false, 'transition-group': false },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('a cart whose read failed', () => {
  it('shows only the error and Try again on the cart page, no count and no empty state', async () => {
    const storefront = unreadCartStorefront();
    const wrapper = await mountWith(Block, { ...mock, variant: 'page' }, storefront);

    const notice = wrapper.get('[data-eldra-cart-load-failed]');
    expect(notice.text()).toContain("We couldn't load your cart.");
    expect(wrapper.text()).not.toContain('Your cart is empty');
    expect(wrapper.text()).not.toContain('0 items');
    expect(await axe(wrapper.element)).toHaveNoViolations();

    await notice.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-eldra-cart-load-failed]').exists()).toBe(false);
    expect(storefront.cart.lines.value).toHaveLength(DEMO_CART_LINES.length);
  });

  it('shows only the error in the drawer', async () => {
    const storefront = unreadCartStorefront();
    storefront.cart.drawerOpen.value = true;
    const wrapper = await mountWith(Block, { ...mock, variant: 'drawer' }, storefront);
    expect(document.body.querySelector('[data-eldra-cart-load-failed]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Your cart is empty');
    wrapper.unmount();
  });

  it('gives the header bag no count', async () => {
    const storefront = unreadCartStorefront();
    const wrapper = await mountWith(Navigation, navigationMock, storefront);
    const bag = wrapper
      .findAll('[data-eldra-header-actions] a, [data-eldra-header-actions] button')
      .find((node) => (node.attributes('aria-label') ?? '').startsWith('Cart'));
    expect(bag?.attributes('aria-label')).toBe('Cart');
  });
});
