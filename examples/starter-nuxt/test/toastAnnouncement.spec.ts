// @vitest-environment jsdom
//
// One add to the cart, one announcement.
//
// A live measurement of the deployed build reported "three identical `Added to cart View cart` live
// regions" after a single add, and the question it raises is a real one: a confirmation a screen
// reader can hear three times is worse than no confirmation. This file is the answer, held as a
// test rather than an argument.
//
// What is actually in the DOM is **one** live region — `Toaster`'s own `role="status"`
// `aria-live="polite"` list, mounted exactly once by `app/app.vue` — holding **one** toast. The
// theme's add raises it through `useToast().show({ id: 'product-add-to-cart' })`, and a fixed `id`
// is what `useToast` dedupes on, so even repeated adds replace the one toast in place rather than
// stacking. What a *text* query sees is three nested elements that each contain the confirmation,
// because containment is transitive: the live region, the toast inside it, and the toast's own body
// column. Counting those is counting one announcement three times.
//
// So both halves are asserted: exactly one element in the document is a live region carrying the
// text (the thing that matters), and the text genuinely appears in several nested elements (the
// thing that made it look like three).
import { defineComponent, h, reactive, type Component } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountOptions } from './support/mountBlock';
import ProductDetail from '../blocks/product-detail/Block.vue';
import productDetailMock from '../blocks/product-detail/mock.json';
import { createDemoStorefront } from '../app/storefront/demo';
import { STOREFRONT_KEY } from '../app/storefront/types';
import { enUS } from '../app/i18n/en-US';

vi.stubGlobal('useHead', () => {});
const route = reactive({ fullPath: '/products/merino-crew-sweater' });
vi.stubGlobal('useRoute', () => route);

const { default: App } = await import('../app/app.vue');

const ProductPage: Component = defineComponent({
  name: 'ProductPageStub',
  setup: () => () =>
    h('main', { id: 'main' }, [
      h(ProductDetail as never, { entry: { id: 'pd', data: productDetailMock } }),
    ]),
});

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

async function mountProductPage(): Promise<void> {
  const base = mountOptions({ entry: { id: 'unused', data: {} } });
  wrappers.push(
    mount(App, {
      attachTo: document.body,
      global: {
        ...base.global,
        provide: {
          ...base.global.provide,
          [STOREFRONT_KEY]: createDemoStorefront({ productHandle: 'merino-crew-sweater' }),
        },
        components: { ...base.global.components, NuxtPage: ProductPage },
        stubs: { ...base.global.stubs, transition: false, 'transition-group': false },
      },
    })
  );
  await flushPromises();
  await flushPromises();
}

/** Every element a screen reader would announce from — what a count of "live regions" has to mean. */
function liveRegions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="status"],[role="alert"],[aria-live]')];
}

async function addToCart(): Promise<void> {
  // `product.addToCart` is a template ("Add to cart · {price}"); the button is found by the part of
  // it that is not the price.
  const add = [...document.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Add to cart')
  );
  expect(add, 'the product page renders an Add to cart button').toBeDefined();
  add!.click();
  await flushPromises();
  await flushPromises();
}

describe('the add-to-cart confirmation', () => {
  it('is announced by exactly one live region', async () => {
    await mountProductPage();
    expect(liveRegions().filter((el) => el.textContent?.includes(enUS.cart.added))).toHaveLength(0);

    await addToCart();

    const announcing = liveRegions().filter((el) => el.textContent?.includes(enUS.cart.added));
    expect(announcing).toHaveLength(1);
    // And it is the one host `app/app.vue` mounts, not a per-value region that happens to contain it.
    expect(announcing[0]!.getAttribute('data-part')).toBe('list');
    expect(announcing[0]!.getAttribute('aria-live')).toBe('polite');
  });

  /**
   * Why a text-based count of the same DOM reports three. Containment is transitive, so the
   * confirmation's text belongs to the live region, to the toast inside it and to the toast's body
   * column alike — one announcement, several elements that "have" it.
   */
  it('appears in nested elements, which is what made one announcement look like three', async () => {
    await mountProductPage();
    await addToCart();

    const holdingText = [...document.querySelectorAll<HTMLElement>('*')].filter((el) =>
      el.textContent?.includes(enUS.cart.added)
    );
    expect(holdingText.length).toBeGreaterThan(1);
    // Every one of them is the live region or inside it: there is no second announcement anywhere.
    const region = liveRegions().find((el) => el.textContent?.includes(enUS.cart.added))!;
    for (const el of holdingText) {
      expect(el === region || el.contains(region) || region.contains(el)).toBe(true);
    }
  });

  /** `useToast` dedupes on the `id` the theme passes, so even three adds are one toast. */
  it('replaces its toast in place rather than stacking when the shopper adds again', async () => {
    await mountProductPage();
    await addToCart();
    await addToCart();
    await addToCart();

    expect(liveRegions().filter((el) => el.textContent?.includes(enUS.cart.added))).toHaveLength(1);
    const region = liveRegions().find((el) => el.textContent?.includes(enUS.cart.added))!;
    expect(region.querySelectorAll('[data-part="title"]')).toHaveLength(1);
  });
});
