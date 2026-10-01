// @vitest-environment jsdom
//
// `app/pages/cart.vue` is the theme's own `/cart` route — the destination the header's bag has
// always named and nothing answered, so the catch-all asked the gateway for a CMS page called
// "cart" and every shopper who clicked the bag got the not-found shell instead of a cart.
//
// Like `test/slugPage.spec.ts`, the page reads `useHead()` as a bare Nuxt auto-import, so it is
// installed with `vi.stubGlobal` before the module is imported. Everything else is the real thing:
// the `cart` block, the demo storefront, and the theme's own messages.
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { axe } from './support/axe';
import { mountOptions } from './support/mountBlock';

vi.stubGlobal('useHead', () => {});

const { default: CartPage } = await import('../app/pages/cart.vue');

/** The page takes no props; it needs only the provides a block does. */
function mountCartPage() {
  const base = mountOptions({ entry: { id: 'unused', data: {} } });
  return mount(CartPage, { global: base.global });
}

describe('app/pages/cart.vue', () => {
  it('renders the cart in its page variant, with the empty-cart state', async () => {
    const wrapper = mountCartPage();

    const heading = wrapper.get('h1');
    expect(heading.text()).toContain('Your cart');
    // The live item count beside the title: the demo storefront's cart starts empty.
    expect(heading.text()).toContain('0 items');
    expect(wrapper.text()).toContain('Your cart is empty');
    // The empty state's button and the page's own back link both lead somewhere that always
    // exists, which is what a theme can promise — a store need not have `/collections/all`.
    expect(wrapper.findAll('a[href="/"]').length).toBeGreaterThan(0);
  });

  it('puts the cart inside the `#main` landmark the skip link targets', () => {
    const wrapper = mountCartPage();
    const main = wrapper.get('main');
    expect(main.attributes('id')).toBe('main');
    expect(main.text()).toContain('Your cart is empty');
  });

  it('is axe-clean', async () => {
    const wrapper = mountCartPage();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
