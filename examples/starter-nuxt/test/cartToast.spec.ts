// @vitest-environment jsdom
//
// The "Added to cart" toast (`blocks/product-detail/Block.vue`, `CART_ADD_TOAST_ID` in
// `app/storefront/feedback.ts`) offers the cart rather than interrupting for it (spec
// `01-core-components.md` -> "Drawer"), so once the shopper actually gets there — by the toast's
// own "View cart" action, by the header bag, or any other way `cart.drawerOpen` turns true — the
// toast has nothing left to confirm and `app/app.vue` dismisses it (see that file's own comment on
// the watch). This is the one place that rule is asserted: a toast raised under that id disappears
// the moment the drawer opens, and a toast under any other id is left alone.
import { defineComponent, h, reactive, type Component } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '@eldrajs/ui';
import { mountOptions } from './support/mountBlock';
import { createDemoStorefront } from '../app/storefront/demo';
import { STOREFRONT_KEY, type StorefrontSource } from '../app/storefront/types';
import { CART_ADD_TOAST_ID } from '../app/storefront/feedback';

vi.stubGlobal('useHead', () => {});
const route = reactive({ fullPath: '/' });
vi.stubGlobal('useRoute', () => route);

const { default: App } = await import('../app/app.vue');

const EmptyPage: Component = defineComponent({
  name: 'EmptyPageStub',
  setup: () => () => h('main', { id: 'main' }, 'A page with no cart block on it'),
});

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.documentElement.style.overflow = '';
  document.body.innerHTML = '';
  route.fullPath = '/';
  useToast().clear();
});

async function mountShell(): Promise<StorefrontSource> {
  const storefront = createDemoStorefront();
  const base = mountOptions({ entry: { id: 'unused', data: {} } });
  wrappers.push(
    mount(App, {
      attachTo: document.body,
      global: {
        ...base.global,
        provide: { ...base.global.provide, [STOREFRONT_KEY]: storefront },
        components: { ...base.global.components, NuxtPage: EmptyPage },
        stubs: { ...base.global.stubs, transition: false, 'transition-group': false },
      },
    })
  );
  await flushPromises();
  return storefront;
}

function toastTitles(): string[] {
  return [...document.querySelectorAll('[data-part="title"]')].map((el) => el.textContent ?? '');
}

describe('the cart drawer opening dismisses the add-to-cart toast', () => {
  it('dismisses the toast once the drawer opens, however it opened', async () => {
    const storefront = await mountShell();
    useToast().show({ id: CART_ADD_TOAST_ID, title: 'Added to cart' });
    await flushPromises();
    expect(toastTitles()).toContain('Added to cart');

    // Standing in for any of the drawer's own openers (the toast's "View cart" action, the header
    // bag) — all of them do nothing but set this.
    storefront.cart.drawerOpen.value = true;
    await flushPromises();

    expect(toastTitles()).not.toContain('Added to cart');
  });

  it('leaves a toast under a different id alone', async () => {
    const storefront = await mountShell();
    useToast().show({ id: 'storefront-mutation', variant: 'danger', title: 'Something else' });
    await flushPromises();

    storefront.cart.drawerOpen.value = true;
    await flushPromises();

    expect(toastTitles()).toContain('Something else');
  });
});
