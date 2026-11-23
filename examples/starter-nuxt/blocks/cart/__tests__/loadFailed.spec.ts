// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { Toaster, useToast } from '@eldrajs/ui';
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
  useToast().clear?.();
  document.body.innerHTML = '';
});

const fails = async (): Promise<CartSnapshot> => {
  throw new Error('timeout');
};
const answersLines = async (): Promise<CartSnapshot> => ({
  lines: DEMO_CART_LINES,
  totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
});

/** A storefront whose cart reads answer in turn: by default the first fails and the next answers. */
function unreadCartStorefront(
  answers: Array<() => Promise<CartSnapshot>> = [fails, answersLines]
): StorefrontSource {
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

  it('shows only the error in the drawer, accessibly', async () => {
    const storefront = unreadCartStorefront();
    storefront.cart.drawerOpen.value = true;
    const wrapper = await mountWith(Block, { ...mock, variant: 'drawer' }, storefront);
    const dialog = document.body.querySelector<HTMLElement>('dialog')!;
    expect(dialog.querySelector('[data-eldra-cart-load-failed]')).not.toBeNull();
    expect(dialog.textContent).not.toContain('Your cart is empty');
    expect(await axe(dialog)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('4662896752: says so again when Try again fails too', async () => {
    const storefront = unreadCartStorefront([fails, fails]);
    const Harness = defineComponent({
      setup: () => () =>
        h('div', [
          h(Block as never, { entry: { id: 'cart', data: { ...mock, variant: 'page' } } }),
          h(Toaster),
        ]),
    });
    const wrapper = await mountWith(Harness, {}, storefront);
    await wrapper.get('[data-eldra-cart-load-failed] button').trigger('click');
    await flushPromises();
    // The notice itself is an alert too; the new signal is a toast outside it.
    const toasts = [...document.body.querySelectorAll('[role="alert"]')].filter(
      (node) => node.closest('[data-eldra-cart-load-failed]') === null
    );
    expect(toasts.map((node) => node.textContent).join(' ')).toContain(
      'Something went wrong. Please try again.'
    );
  });

  it('Block.vue:252: shows the error over the lines a cart kept when a later read fails', async () => {
    const storefront = unreadCartStorefront([answersLines, fails]);
    const wrapper = await mountWith(Block, { ...mock, variant: 'page' }, storefront);
    expect(wrapper.find('[data-eldra-cart-load-failed]').exists()).toBe(false);
    await storefront.cart.reload();
    await flushPromises();
    expect(wrapper.find('[data-eldra-cart-load-failed]').exists()).toBe(true);
    expect(storefront.cart.lines.value).toHaveLength(DEMO_CART_LINES.length);
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
