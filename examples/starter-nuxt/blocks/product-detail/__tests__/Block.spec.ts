// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { EldraHttpError } from '@eldrajs/sdk';
import { useToast, type ToastAction } from '@eldrajs/ui';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { createCartStore, type CartOps, type CartSnapshot } from '../../../app/storefront/cart';
import {
  STOREFRONT_KEY,
  type StorefrontCommerce,
  type StorefrontProduct,
  type StorefrontResult,
  type VolatileKey,
} from '../../../app/storefront/types';
import { enUS } from '../../../app/i18n/en-US';
import { isIS } from '../../../app/i18n/is-IS';
import { formatMoney } from '../../../app/storefront/money';
import Block from '../Block.vue';
import mock from '../mock.json';

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = { variant: 'gallery-left' as const };

const VARIANTS = ['gallery-left', 'gallery-right'] as const;

/**
 * A demo storefront whose product is patched on the way out. The Northwind catalogue
 * (`app/storefront/demo.ts`) has no low-stock and no made-to-order
 * product, so the two states that need one are reached by overlaying the fields on the demo product
 * rather than by editing that shared fixture: the block reads exactly the same shape either way.
 */
function storefrontWith(patch: Partial<StorefrontProduct> = {}) {
  const source = createDemoStorefront();
  return {
    ...source,
    catalog: {
      ...source.catalog,
      product: (handle: Parameters<typeof source.catalog.product>[0]) => {
        const result = source.catalog.product(handle);
        return {
          ...result,
          data: computed(() => (result.data.value ? { ...result.data.value, ...patch } : null)),
        };
      },
    },
  };
}

function mountBlock(
  data: Record<string, unknown>,
  options: {
    editing?: boolean;
    attach?: boolean;
    storefront?: ReturnType<typeof storefrontWith>;
    productHandle?: string | null;
    /** The page's content locale — `en-US` unless a spec is about another one's formatting. */
    locale?: string;
    /** What the store sells in; the demo store's US dollars unless a spec says otherwise. */
    commerce?: StorefrontCommerce | null;
  } = {}
) {
  const base = mountOptions(
    { entry: { id: 'e1', data } },
    { locale: options.locale, commerce: options.commerce }
  );
  const storefront = options.storefront ?? storefrontWith();
  if (options.productHandle !== undefined) storefront.route.productHandle = options.productHandle;
  const opts = {
    ...base,
    // Focus tracking (`document.activeElement`) only works for a tree attached to the document.
    ...(options.attach === false ? {} : { attachTo: document.body }),
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [STOREFRONT_KEY]: storefront,
      },
    },
  };
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

async function mountReady(
  data: Record<string, unknown>,
  options: Parameters<typeof mountBlock>[1] = {}
) {
  const wrapper = mountBlock(data, options);
  await flushPromises();
  await nextTick();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountReady>>;

/** The gallery's own strip. Scoped by its name so the `Lightbox`'s own thumbnails ("Go to image n")
 *  are never counted once the viewer is open. */
function thumbnails(wrapper: Wrapper) {
  return wrapper.findAll('button[aria-label^="Show image"]');
}
function zoomButton(wrapper: Wrapper) {
  return wrapper.get('button[aria-haspopup="dialog"]');
}
function lightbox(wrapper: Wrapper) {
  return wrapper.get('dialog[aria-label="Merino crew sweater, images"]');
}
function statusLine(wrapper: Wrapper) {
  return wrapper.get('[role="status"][aria-live="polite"]');
}
function addToCart(wrapper: Wrapper) {
  return wrapper.get('button[type="submit"]');
}
function optionByLabel(wrapper: Wrapper, label: string) {
  return wrapper
    .findAll('label')
    .find((candidate) => candidate.text().startsWith(label))!
    .get<HTMLInputElement>('input[type="radio"]');
}

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  // `useToast` is a module-level queue in `@eldrajs/ui`; a toast left in it would leak into the
  // next test.
  useToast().clear();
});

/** A gateway refusal as `@eldrajs/sdk` throws it, problem body and all. */
function refusal(body: unknown): EldraHttpError {
  return new EldraHttpError({ status: 409, statusText: 'Conflict' } as Response, body);
}

function emptyCart(): CartSnapshot {
  return {
    lines: [],
    totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
  };
}

/**
 * The demo storefront with a cart whose `add` refuses — the one thing the in-memory demo ops cannot
 * do, and the state the whole buy box has to behave in: the gateway answered, it said no, and the
 * page looks exactly as it did a moment ago unless the block says otherwise.
 */
function storefrontWithRefusingCart(thrown: unknown, patch: Partial<StorefrontProduct> = {}) {
  const source = storefrontWith(patch);
  const ops: CartOps = {
    init: async () => emptyCart(),
    add: async () => {
      throw thrown;
    },
    setQuantity: async () => emptyCart(),
    remove: async () => emptyCart(),
    applyDiscount: async () => ({ ack: { ok: false, reason: 'invalid' as const } }),
    removeDiscount: async () => emptyCart(),
    checkoutUrl: ref<string | null>(null),
  };
  return { ...source, cart: createCartStore(ops) };
}

/** What the single app-wide `Toaster` would render: the live queue, newest last. */
function toasts(): Array<{ title: string; variant: string }> {
  return useToast().toasts.value.map((item) => ({ title: item.title, variant: item.variant }));
}

/** The one queued toast's action, as the `Toaster` would render it — a link or a button. */
function toastAction(): ToastAction | undefined {
  return useToast().toasts.value[0]?.action;
}

describe('add to cart feedback', () => {
  /**
   * The defect this guards: the block awaited `cart.add`, the button's `:loading` flipped back, and
   * a 409 `CART_INSUFFICIENT_STOCK` reached nothing a shopper could see — "Add to cart does
   * nothing". The copy is the specific one, because the refusal named its cause.
   */
  it('says the item is out of stock when the gateway refuses the add for stock', async () => {
    const storefront = storefrontWithRefusingCart(
      refusal({
        code: 'CONFLICT',
        errorId: 'CART_INSUFFICIENT_STOCK',
        detail: 'insufficient stock',
      })
    );
    const wrapper = await mountReady(mock, { storefront });
    expect(statusLine(wrapper).text()).toContain('In stock, ready to ship');

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await nextTick();

    expect(toasts()).toEqual([{ title: 'This item is out of stock.', variant: 'danger' }]);
    // …and the page stops offering a button that cannot work: the spec's own sold-out state.
    expect(statusLine(wrapper).text()).toContain('Sold out in Oat / XS');
    expect(addToCart(wrapper).text()).toContain('Notify me');
    expect(wrapper.find('[role="spinbutton"]').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('says something generic for a refusal it has no words for, and leaves the stock line alone', async () => {
    const storefront = storefrontWithRefusingCart(refusal({ code: 'INTERNAL' }));
    const wrapper = await mountReady(mock, { storefront });

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await nextTick();

    expect(toasts()).toEqual([
      { title: 'Something went wrong. Please try again.', variant: 'danger' },
    ]);
    // Nothing was learned about stock, so nothing about stock changes.
    expect(statusLine(wrapper).text()).toContain('In stock, ready to ship');
    expect(addToCart(wrapper).text()).toContain('Add to cart · $96');
  });

  it('reports a request that never reached the gateway the same generic way', async () => {
    const storefront = storefrontWithRefusingCart(new TypeError('Failed to fetch'));
    const wrapper = await mountReady(mock, { storefront });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(toasts()).toEqual([
      { title: 'Something went wrong. Please try again.', variant: 'danger' },
    ]);
  });

  it('presses the refused button twice without stacking two toasts', async () => {
    const storefront = storefrontWithRefusingCart(refusal({ code: 'INTERNAL' }));
    const wrapper = await mountReady(mock, { storefront });

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(toasts()).toHaveLength(1);
  });

  it('lets the stock line recover when a fresher product read disagrees', async () => {
    const storefront = storefrontWithRefusingCart(
      refusal({ code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' })
    );
    const wrapper = await mountReady(mock, { storefront });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await nextTick();
    expect(addToCart(wrapper).text()).toContain('Notify me');

    // Another variant chosen is not the variant the backend refused.
    await optionByLabel(wrapper, 'L').setValue();
    await nextTick();
    expect(addToCart(wrapper).text()).toContain('Add to cart · $96');
    expect(statusLine(wrapper).text()).toContain('In stock, ready to ship');
  });

  /**
   * Success is confirmed by a toast and **not** by opening the drawer — the design spec's own rule for
   * the Drawer primitive ("a Toast (not the drawer) to confirm 'Added to cart' unless the shopper
   * asked to see the cart"): a modal over the page takes the focus and the scroll position of someone
   * who pressed one button while reading a product.
   */
  it('confirms a successful add with a toast, leaving the drawer closed', async () => {
    const storefront = storefrontWith();
    storefront.cart.drawerAvailable.value = true;
    const wrapper = await mountReady(mock, { storefront });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(storefront.cart.lines.value).toHaveLength(1);
    expect(toasts()).toEqual([{ title: 'Added to cart', variant: 'success' }]);
    expect(storefront.cart.drawerOpen.value).toBe(false);
  });

  it('offers the cart from the toast, opening the hosted drawer when one is live', async () => {
    const storefront = storefrontWith();
    storefront.cart.drawerAvailable.value = true;
    const wrapper = await mountReady(mock, { storefront });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    // The shopper asking to see the cart is the spec's own exception — and the only thing that opens
    // the drawer here.
    const action = toastAction();
    expect(action?.label).toBe('View cart');
    expect(action).not.toHaveProperty('href');
    (action as { onActivate: () => void }).onActivate();
    expect(storefront.cart.drawerOpen.value).toBe(true);
  });

  it('offers /cart from the toast when no drawer is mounted', async () => {
    const storefront = storefrontWith();
    const wrapper = await mountReady(mock, { storefront });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(toasts()).toEqual([{ title: 'Added to cart', variant: 'success' }]);
    // The same destination the header's bag has without a live drawer.
    expect(toastAction()).toEqual({ label: 'View cart', href: '/cart' });
    expect(storefront.cart.drawerOpen.value).toBe(false);
  });
});

describe('product-detail block', () => {
  it('renders the demo product from mock.json with no axe violations', async () => {
    const wrapper = await mountReady(mock);
    expect(wrapper.text()).toContain('Merino crew sweater');
    expect(wrapper.text()).toContain('$96');
    expect(wrapper.text()).toContain('Knitwear');
    expect(wrapper.text()).toContain('Free delivery over $80.');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare fixture — no perks, no tabs, no size guide — axe-clean', async () => {
    const wrapper = await mountReady(bare);
    expect(wrapper.text()).toContain('Merino crew sweater');
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Size guide');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(VARIANTS)('renders the %s variant with no axe violations', async (variant) => {
    const wrapper = await mountReady({ ...mock, variant });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('mirrors gallery-right visually while keeping gallery-then-info reading order', async () => {
    for (const variant of VARIANTS) {
      const wrapper = await mountReady({ ...mock, variant });
      const gallery = wrapper.get('[role="group"][aria-label="Product images"]');
      const info = wrapper.get('[role="group"][aria-label="Product information"]');
      // DOM order never changes …
      expect(
        gallery.element.compareDocumentPosition(info.element) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      // … only which column each one is painted in.
      expect(gallery.classes()).toContain(
        variant === 'gallery-right' ? '@tablet:order-2' : '@tablet:order-1'
      );
      expect(info.classes()).toContain(
        variant === 'gallery-right' ? '@tablet:order-1' : '@tablet:order-2'
      );
    }
  });

  it('has exactly one h1, the product title, and it labels the section', async () => {
    const wrapper = await mountReady(mock);
    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toBe('Merino crew sweater');
    const section = wrapper.get('section');
    expect(section.attributes('aria-labelledby')).toBe(headings[0]!.attributes('id'));
  });

  it('computes the saving badge from the two prices', async () => {
    const wrapper = await mountReady(mock);
    // The demo product is $96, was $128.
    expect(wrapper.text()).toContain('Save $32');
    expect(wrapper.text()).toContain('$128');
  });

  it('renders a whole-unit price as itself, not as a hundredth of it', async () => {
    // The catalog sends money in major units (`app/storefront/types.ts`), so a $28 product
    // arrives as `28` — dividing it again rendered "$0.28" on a live store.
    const wrapper = await mountReady(mock, {
      storefront: storefrontWith({ price: { amount: 28, compareAt: null } }),
    });
    expect(wrapper.text()).toContain('$28');
    expect(wrapper.text()).not.toContain('$0.28');
    // The same amount inside the button's own label, which formats it rather than rendering
    // `<Price>`: the two must agree.
    expect(addToCart(wrapper).text()).toContain('Add to cart · $28');
  });

  /**
   * The store's currency is the platform's, and the page's number formatting is the content
   * locale's — two separate decisions, which this is the one spec that exercises together. An
   * Icelandic page of a store selling in krónur reads "2.800 kr.", never "$2,800" and never a
   * bare "2.800": the amount inside the button's label and the `<Price>` above it both come from
   * the same provide (`CURRENCY_KEY`), so they cannot disagree.
   */
  it('formats money in the store’s currency and the page’s locale', async () => {
    const wrapper = await mountReady(mock, {
      locale: 'is-IS',
      commerce: { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 },
      storefront: storefrontWith({ price: { amount: 2800, compareAt: null } }),
    });

    const price = formatMoney(2800, 'ISK', 'is-IS');
    expect(price).toMatch(/^2\.800\s?kr\.$/u);
    // The label the shopper reads on the button, interpolated from the Icelandic message set.
    expect(addToCart(wrapper).text()).toContain(isIS.product.addToCart.replace('{price}', price));
    expect(addToCart(wrapper).text()).not.toContain('$');
    // And every `<Price>` the block renders — the one above the button and the quick-add bar's —
    // reads the same amount, because both take the currency from the same provide. (Asserted on
    // the price parts, not the block's whole text: the authored copy in `mock.json` mentions a
    // free-delivery threshold in dollars, which is content, not a formatted price.)
    const rendered = wrapper.findAll('[data-part="current"]').map((part) => part.text());
    expect(rendered.length).toBeGreaterThan(0);
    for (const amount of rendered) {
      expect(amount).toBe(price);
      // A zero-decimal currency grows no invented decimals, whichever side formatted it.
      expect(amount).not.toContain(',00');
    }
  });

  /**
   * The same store on an **English** page, which is the one case where the sign is a choice: the
   * narrow sign for krónur is `kr`, the wide one is the code itself. The button's label and the
   * `<Price>` above it must agree on it, and `kr 2,800` is what the operator's own back office
   * writes — an `ISK 2,800` here beside a `kr 2,800` in a currency field was the defect.
   */
  it('writes the store currency’s narrow sign on a page in another locale', async () => {
    const wrapper = await mountReady(mock, {
      locale: 'en-US',
      commerce: { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 },
      storefront: storefrontWith({ price: { amount: 2800, compareAt: null } }),
    });

    expect(formatMoney(2800, 'ISK', 'en-US')).toBe('kr\u00a02,800');
    expect(addToCart(wrapper).text()).toContain(
      enUS.product.addToCart.replace('{price}', 'kr\u00a02,800')
    );
    const rendered = wrapper.findAll('[data-part="current"]').map((part) => part.text());
    expect(rendered.length).toBeGreaterThan(0);
    for (const amount of rendered) {
      expect(amount).toBe('kr\u00a02,800');
    }
    // Not the wide sign, in either half.
    expect(wrapper.text()).not.toContain('ISK\u00a02,800');
  });

  /**
   * And the other end of it: a store that has not configured commerce publishes no currency, and
   * the page must then show its prices as numbers. A guessed symbol is a *wrong* price — `$4.800`
   * in front of an amount in krónur — where a bare `4.800` is merely an incomplete one, so the
   * theme declines the currency rather than letting one be assumed (`uiCurrencyFor`,
   * `app/storefront/commerce.ts`). Both halves of the block's money obey it: the `<Price>` and the
   * button's own formatted label.
   */
  it('renders prices as plain numbers when the store publishes no currency', async () => {
    const wrapper = await mountReady(mock, {
      commerce: null,
      storefront: storefrontWith({ price: { amount: 96, compareAt: null } }),
    });

    for (const part of wrapper.findAll('[data-part="current"]')) {
      expect(part.text()).toBe('96');
    }
    expect(addToCart(wrapper).text()).toContain('Add to cart · 96');
    expect(addToCart(wrapper).text()).not.toContain('$');
  });

  it('hides the rating below three reviews and when the field is off', async () => {
    const withRating = await mountReady(mock);
    expect(withRating.get('a[href="#reviews"]').exists()).toBe(true);

    const fieldOff = await mountReady({ ...mock, showRating: false });
    expect(fieldOff.find('a[href="#reviews"]').exists()).toBe(false);

    const tooFew = await mountReady(mock, {
      storefront: storefrontWith({ rating: { value: 4.5, count: 2 } }),
    });
    expect(tooFew.find('a[href="#reviews"]').exists()).toBe(false);
  });

  it('drops the category trail when showCategory is off', async () => {
    const wrapper = await mountReady({ ...mock, showCategory: false });
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').exists()).toBe(false);
  });

  describe('gallery', () => {
    it('names every thumbnail by position and alt text, marking the current one', async () => {
      const wrapper = await mountReady(mock);
      const buttons = thumbnails(wrapper);
      expect(buttons.length).toBeGreaterThan(1);
      buttons.forEach((button, index) => {
        expect(button.attributes('aria-label')).toBe(
          `Show image ${index + 1} of ${buttons.length}: ${
            index === 0 ? 'Merino crew sweater' : 'Merino crew sweater, alternate view'
          }`
        );
      });
      expect(buttons[0]!.attributes('aria-current')).toBe('true');
      expect(buttons[1]!.attributes('aria-current')).toBeUndefined();
    });

    it('moves the current thumbnail, the index pill and the zoom name together', async () => {
      const wrapper = await mountReady(mock);
      const buttons = thumbnails(wrapper);
      expect(zoomButton(wrapper).attributes('aria-label')).toBe(
        `Zoom image 1 of ${buttons.length}`
      );
      expect(wrapper.text()).toContain(`1 / ${buttons.length}`);

      await buttons[1]!.trigger('click');
      expect(thumbnails(wrapper)[1]!.attributes('aria-current')).toBe('true');
      expect(thumbnails(wrapper)[0]!.attributes('aria-current')).toBeUndefined();
      expect(zoomButton(wrapper).attributes('aria-label')).toBe(
        `Zoom image 2 of ${buttons.length}`
      );
      expect(wrapper.text()).toContain(`2 / ${buttons.length}`);
    });

    it('opens the viewer from zoom, arrows between images, and Esc returns focus', async () => {
      const wrapper = await mountReady(mock);
      const zoom = zoomButton(wrapper);
      zoom.element.focus();
      await zoom.trigger('click');
      await nextTick();

      const dialog = lightbox(wrapper);
      expect(dialog.attributes('open')).toBe('');
      expect(await axe(wrapper.element)).toHaveNoViolations();

      const count = thumbnails(wrapper).length;
      expect(dialog.text()).toContain(`1 / ${count}`);
      await dialog.trigger('keydown', { key: 'ArrowRight' });
      expect(dialog.text()).toContain(`2 / ${count}`);
      await dialog.trigger('keydown', { key: 'ArrowLeft' });
      expect(dialog.text()).toContain(`1 / ${count}`);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await nextTick();
      expect(lightbox(wrapper).attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(zoom.element);
    });
  });

  describe('variant pickers', () => {
    it('gives each block instance its own radio groups, so two on a page never collide', async () => {
      // Two separate `mount()` calls each get their own Vue app, so `useId()` — scoped per app —
      // would trivially "differ" for the wrong reason (both would actually start again at `v-1`).
      // Mounting both blocks as siblings under one app is what proves real-page uniqueness: one
      // `useId()` sequence, shared, the way a real page's single app renders every block.
      const storefront = storefrontWith();
      const Host = defineComponent({
        render: () =>
          h('div', [
            h(Block, { entry: { id: 'e1', data: mock } }),
            h(Block, { entry: { id: 'e2', data: mock } }),
          ]),
      });
      const base = mountOptions({ entry: { id: 'e1', data: mock } });
      const wrapper = mount(Host, {
        ...base,
        attachTo: document.body,
        global: {
          ...base.global,
          provide: {
            ...base.global.provide,
            [STOREFRONT_KEY]: storefront,
          },
        },
      });
      await flushPromises();
      await nextTick();

      // Scoped by component instance, not `<form>`: the block also renders a second, unrelated
      // `FormLayout`-backed form for its back-in-stock notice, so counting `<form>` elements would
      // count that too.
      const blocks = wrapper.findAllComponents(Block);
      expect(blocks).toHaveLength(2);
      const firstColour = blocks[0]!.get<HTMLInputElement>('input[type="radio"]');
      const secondColour = blocks[1]!.get<HTMLInputElement>('input[type="radio"]');
      expect(firstColour.element.checked).toBe(true);
      expect(secondColour.element.checked).toBe(true);
      // A unique native `name` (via `useUiId()`) is what isolates the groups — `legend` is what
      // keeps the visible/accessible text reading "Colour", never the id.
      expect(firstColour.element.name).not.toBe(secondColour.element.name);
      expect(firstColour.element.name).not.toBe('');
      expect(blocks[0]!.get('legend').text()).toContain('Colour');

      // Choosing in the second block leaves the first block's selection checked.
      const secondBlockRadios = blocks[1]!.findAll<HTMLInputElement>('input[type="radio"]');
      await secondBlockRadios[1]!.setValue();
      expect(secondBlockRadios[1]!.element.checked).toBe(true);
      expect(firstColour.element.checked).toBe(true);
    });

    it('keeps sold-out options selectable, named ", sold out", and never pre-selected', async () => {
      const wrapper = await mountReady(mock);
      const moss = optionByLabel(wrapper, 'Moss');
      const xl = optionByLabel(wrapper, 'XL');
      for (const option of [moss, xl]) {
        expect(option.attributes('disabled')).toBeUndefined();
        expect(option.element.checked).toBe(false);
      }
      expect(
        wrapper
          .findAll('label')
          .find((label) => label.text().startsWith('Moss'))!
          .text()
      ).toContain(', sold out');
      // The default selection is the first *available* value of each option.
      expect(optionByLabel(wrapper, 'Oat').element.checked).toBe(true);
      expect(optionByLabel(wrapper, 'XS').element.checked).toBe(true);
    });

    it('announces the new stock state politely on change without moving focus', async () => {
      const wrapper = await mountReady(mock);
      const status = statusLine(wrapper);
      expect(status.text()).toContain('In stock, ready to ship');

      const wishlist = wrapper.get('button[aria-pressed]');
      wishlist.element.focus();
      await optionByLabel(wrapper, 'XL').setValue();
      await nextTick();

      expect(statusLine(wrapper).text()).toContain('Sold out in Oat / XL');
      expect(statusLine(wrapper).text()).toContain('We restock knitwear every 6 to 8 weeks.');
      expect(document.activeElement).toBe(wishlist.element);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('shows the size guide link beside the size pills only when both fields are set', async () => {
      const wrapper = await mountReady({ ...mock, sizeGuideHref: '/pages/size-guide' });
      expect(wrapper.get('a[href="/pages/size-guide"]').text()).toBe('Size guide');

      // `sizeGuideHref` ships empty in the seed (no dead demo link) — `mock` on its own already
      // exercises that default.
      const noHref = await mountReady(mock);
      expect(noHref.find('a[href="/pages/size-guide"]').exists()).toBe(false);
    });
  });

  describe('stock states', () => {
    it('reads in stock for the demo product, axe-clean', async () => {
      const wrapper = await mountReady(mock);
      expect(statusLine(wrapper).text()).toContain('In stock, ready to ship');
      expect(addToCart(wrapper).text()).toContain('Add to cart · $96');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('reads low stock only at or below the threshold, never with it off', async () => {
      const low = await mountReady(mock, { storefront: storefrontWith({ inventory: 2 }) });
      expect(statusLine(low).text()).toContain('Low stock: only 2 left in Oat / XS');
      expect(await axe(low.element)).toHaveNoViolations();

      const above = await mountReady(mock, { storefront: storefrontWith({ inventory: 4 }) });
      expect(above.text()).not.toContain('Low stock');

      const off = await mountReady(
        { ...mock, lowStockThreshold: 'off' },
        { storefront: storefrontWith({ inventory: 2 }) }
      );
      expect(off.text()).not.toContain('Low stock');
      expect(statusLine(off).text()).toContain('In stock, ready to ship');
    });

    it('swaps the button for Notify me and hides the stepper when sold out, axe-clean', async () => {
      const wrapper = await mountReady(mock, {
        storefront: storefrontWith({ stock: 'out', inventory: 0 }),
      });
      expect(statusLine(wrapper).text()).toContain('Sold out in Oat / XS');
      expect(addToCart(wrapper).text()).toContain('Notify me');
      expect(wrapper.find('[role="spinbutton"]').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('reads back-order with the ship date for a made-to-order product, axe-clean', async () => {
      const wrapper = await mountReady(mock, {
        storefront: storefrontWith({ stock: 'preorder', shipsBy: '14 October' }),
      });
      expect(statusLine(wrapper).text()).toContain('Back-order: ships by 14 October');
      expect(statusLine(wrapper).text()).toContain('we reserve one from the next batch');
      expect(addToCart(wrapper).text()).toContain('Back-order');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('quantity', () => {
    it('follows inventory for its maximum and marks the limits aria-disabled', async () => {
      const wrapper = await mountReady(
        { ...mock, lowStockThreshold: 'off' },
        { storefront: storefrontWith({ inventory: 2 }) }
      );
      const field = wrapper.get('[role="spinbutton"]');
      expect(field.attributes('aria-valuemax')).toBe('2');
      expect(field.attributes('aria-valuenow')).toBe('1');

      const decrease = wrapper.get('[data-part="decrease"]');
      const increase = wrapper.get('[data-part="increase"]');
      expect(decrease.attributes('aria-disabled')).toBe('true');
      expect(increase.attributes('aria-disabled')).toBeUndefined();

      await increase.trigger('click');
      expect(wrapper.get('[role="spinbutton"]').attributes('aria-valuenow')).toBe('2');
      expect(wrapper.get('[data-part="increase"]').attributes('aria-disabled')).toBe('true');
      expect(wrapper.get('[data-part="decrease"]').attributes('aria-disabled')).toBeUndefined();
    });

    it('is hidden entirely when showQuantity is off', async () => {
      const wrapper = await mountReady({ ...mock, showQuantity: false });
      expect(wrapper.find('[role="spinbutton"]').exists()).toBe(false);
    });
  });

  it('adds the selected variant and quantity to the cart', async () => {
    const storefront = storefrontWith();
    const wrapper = await mountReady(mock, { storefront });
    await wrapper.get('[data-part="increase"]').trigger('click');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(storefront.cart.lines.value).toHaveLength(1);
    expect(storefront.cart.lines.value[0]!.quantity).toBe(2);
  });

  it('toggles the wishlist button aria-pressed', async () => {
    const wrapper = await mountReady(mock);
    const button = wrapper.get('button[aria-pressed]');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(button.attributes('aria-label')).toBe('Save Merino crew sweater to wishlist');

    await button.trigger('click');
    expect(wrapper.get('button[aria-pressed]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-pressed]').attributes('aria-label')).toBe(
      'Remove Merino crew sweater from wishlist'
    );
  });

  it('hides the wishlist button when the field is off', async () => {
    const wrapper = await mountReady({ ...mock, showWishlist: false });
    expect(wrapper.find('button[aria-pressed]').exists()).toBe(false);
  });

  describe('back-in-stock dialog', () => {
    const soldOut = () => storefrontWith({ stock: 'out', inventory: 0 });

    async function open(wrapper: Wrapper) {
      const button = addToCart(wrapper);
      button.element.focus();
      await wrapper.get('form').trigger('submit');
      await nextTick();
      return button;
    }

    it('opens on Notify me, focuses the email field, and Esc returns focus', async () => {
      const wrapper = await mountReady(mock, { storefront: soldOut() });
      const opener = await open(wrapper);

      const dialog = wrapper.get('dialog[aria-labelledby]');
      expect(dialog.attributes('open')).toBe('');
      await flushPromises();
      await nextTick();
      const email = dialog.get<HTMLInputElement>('input[type="email"]');
      expect(document.activeElement).toBe(email.element);
      expect(await axe(wrapper.element)).toHaveNoViolations();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await nextTick();
      expect(wrapper.get('dialog[aria-labelledby]').attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(opener.element);
    });

    it('refuses a malformed address before anything is sent', async () => {
      const wrapper = await mountReady(mock, { storefront: soldOut() });
      await open(wrapper);
      const dialog = wrapper.get('dialog[aria-labelledby]');
      await dialog.get('input[type="email"]').setValue('not-an-address');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.text()).toContain('Enter an email address like name@example.com.');
    });

    it('confirms a successful sign-up', async () => {
      const wrapper = await mountReady(mock, { storefront: soldOut() });
      await open(wrapper);
      const dialog = wrapper.get('dialog[aria-labelledby]');
      await dialog.get('input[type="email"]').setValue('maren@example.com');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.text()).toContain('we will email you as soon as it is back');
    });

    it('explains a store that does not support back-in-stock emails', async () => {
      const storefront = soldOut();
      storefront.catalog.notifyBackInStock = async () => ({
        ok: false as const,
        reason: 'unsupported' as const,
      });
      const wrapper = await mountReady(mock, { storefront });
      await open(wrapper);
      const dialog = wrapper.get('dialog[aria-labelledby]');
      await dialog.get('input[type="email"]').setValue('maren@example.com');
      await dialog.get('form').trigger('submit');
      await flushPromises();
      expect(dialog.text()).toContain('Back-in-stock emails are not set up for this store yet.');
    });
  });

  describe('tabs', () => {
    it('renders one tab per entry, only the selected one in the tab order', async () => {
      const wrapper = await mountReady(mock);
      const tabs = wrapper.findAll('[role="tab"]');
      expect(tabs.map((tab) => tab.text())).toEqual(['Details', 'Shipping', 'Returns']);
      expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1']);
      expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Product details');
      expect(wrapper.text()).toContain('extra-fine Merino in a family mill in Biella');
    });

    it('moves between tabs with arrows (wrapping) and Home/End', async () => {
      const wrapper = await mountReady(mock);
      const tabs = () => wrapper.findAll('[role="tab"]');
      await tabs()[0]!.trigger('keydown', { key: 'ArrowRight' });
      expect(tabs()[1]!.attributes('aria-selected')).toBe('true');
      await tabs()[1]!.trigger('keydown', { key: 'ArrowLeft' });
      expect(tabs()[0]!.attributes('aria-selected')).toBe('true');
      // Wraps backwards from the first to the last.
      await tabs()[0]!.trigger('keydown', { key: 'ArrowLeft' });
      expect(tabs()[2]!.attributes('aria-selected')).toBe('true');
      await tabs()[2]!.trigger('keydown', { key: 'Home' });
      expect(tabs()[0]!.attributes('aria-selected')).toBe('true');
      await tabs()[0]!.trigger('keydown', { key: 'End' });
      expect(tabs()[2]!.attributes('aria-selected')).toBe('true');
    });

    it('keeps every panel reachable by keyboard', async () => {
      const wrapper = await mountReady(mock);
      const panels = wrapper.findAll('[role="tabpanel"]');
      expect(panels).toHaveLength(3);
      // Panels with no focusable content of their own carry `tabindex="0"` so the text is
      // reachable (`TabPanel`'s own rule); these three are plain prose.
      for (const panel of panels) expect(panel.attributes('tabindex')).toBe('0');
    });

    it('puts Add to cart before the tabs in reading order', async () => {
      const wrapper = await mountReady(mock);
      const button = addToCart(wrapper).element;
      const tablist = wrapper.get('[role="tablist"]').element;
      expect(
        button.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  describe('quick-add bar', () => {
    it('is absent while the main button is on screen', async () => {
      const wrapper = await mountReady(mock);
      expect(wrapper.find('[role="region"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Quick add');
    });

    it('appears once the main button scrolls out of view, and never duplicates it otherwise', async () => {
      const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
      class StubObserver {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          observers.push(callback);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubObserver;

      const wrapper = await mountReady(mock);
      expect(observers).toHaveLength(1);
      expect(wrapper.find('[role="region"]').exists()).toBe(false);

      observers[0]!([{ isIntersecting: false }]);
      await nextTick();
      const bar = wrapper.get('[role="region"]');
      expect(bar.attributes('aria-label')).toBe('Quick add');
      expect(bar.text()).toContain('Merino crew sweater');
      expect(bar.text()).toContain('Oat / XS · $96');
      // The quick-add button is the one control that exists only below 48rem, where primary
      // actions are at least 2.75rem tall: it takes the package's `lg` size.
      expect(bar.get('button[type="button"]').classes()).toContain('control-h-lg');
      expect(await axe(wrapper.element)).toHaveNoViolations();

      observers[0]!([{ isIntersecting: true }]);
      await nextTick();
      expect(wrapper.find('[role="region"]').exists()).toBe(false);
    });

    it('is never rendered when the field is off', async () => {
      const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
      class StubObserver {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          observers.push(callback);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubObserver;

      const wrapper = await mountReady({ ...mock, stickyBar: false });
      expect(observers).toHaveLength(0);
      expect(wrapper.find('[role="region"]').exists()).toBe(false);
    });
  });

  describe('no product bound', () => {
    it('renders nothing on the live site', async () => {
      const wrapper = await mountReady(
        { ...mock, productHandle: '' },
        { productHandle: null, attach: false }
      );
      expect(wrapper.find('section').exists()).toBe(false);
      expect(wrapper.text()).toBe('');
    });

    it('shows the "Choose a product" hint in the editor', async () => {
      const wrapper = await mountReady(
        { ...mock, productHandle: '' },
        { productHandle: null, editing: true, attach: false }
      );
      expect(wrapper.text()).toContain('Choose a product');
      expect(wrapper.text()).toContain('On a product template this binds automatically.');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('records the product as viewed on mount', async () => {
    const storefront = storefrontWith();
    await mountReady(mock, { storefront });
    expect(storefront.history.recentlyViewed.value[0]).toBe('merino-crew-sweater');
  });

  it('never renders a countdown, a viewer count or manufactured urgency', async () => {
    for (const data of [mock, bare]) {
      const wrapper = await mountReady(data);
      expect(wrapper.html()).not.toMatch(/\d+ (people|viewing)|only today|hurry/i);
    }
  });

  /**
   * The prerendered page's live refresh (`app/storefront/types.ts`): the HTML shipped with this
   * product's real price and stock line, and a few hundred milliseconds after mount the storefront
   * swaps in the backend's current ones. The buy box never redraws for it.
   */
  describe('the volatile refresh', () => {
    /** The demo product, with the result's own flags under the test's control. */
    function refreshable(patch: Partial<StorefrontProduct> = {}) {
      const source = storefrontWith(patch);
      const revalidating = ref<ReadonlySet<VolatileKey>>(new Set());
      const loading = ref(false);
      const pending = ref(false);
      const error = ref<string | null>(null);
      return {
        revalidating,
        loading,
        pending,
        error,
        storefront: {
          ...source,
          catalog: {
            ...source.catalog,
            product: (handle: Parameters<typeof source.catalog.product>[0]) => {
              const result = source.catalog.product(handle);
              return {
                ...result,
                pending,
                loading,
                error,
                revalidating,
              } as unknown as StorefrontResult<StorefrontProduct>;
            },
          },
        } as ReturnType<typeof storefrontWith>,
      };
    }

    it('keeps the price and the stock line, marks both busy and draws a spinner beside each', async () => {
      const { storefront, revalidating } = refreshable();
      const wrapper = await mountReady(mock, { storefront });
      expect(wrapper.text()).toContain('$96');

      revalidating.value = new Set(['price', 'stock']);
      await nextTick();

      // The value itself is untouched — this state is a dim and a spinner, never a skeleton.
      expect(wrapper.text()).toContain('$96');
      expect(wrapper.text()).toContain('In stock, ready to ship');
      expect(wrapper.find('.eldra-skeleton').exists()).toBe(false);

      const price = wrapper.get('[data-part="root"][aria-busy="true"]');
      expect(price.find('[data-part="spinner"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-part="root"][aria-busy="true"]')).toHaveLength(2);
      // A product page has one price and one stock line, so each announces for itself — unlike a
      // grid, which announces once for all of its cards (`announce: false` there).
      expect(wrapper.findAll('[data-part="srStatus"]').length).toBeGreaterThanOrEqual(2);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('refreshes only the value the storefront named', async () => {
      const { storefront, revalidating } = refreshable();
      const wrapper = await mountReady(mock, { storefront });

      revalidating.value = new Set(['price']);
      await nextTick();

      expect(wrapper.findAll('[data-part="root"][aria-busy="true"]')).toHaveLength(1);
      expect(wrapper.findAll('[data-part="spinner"]')).toHaveLength(1);
    });

    it('draws no skeleton and no error over a product the visitor can already see', async () => {
      const { storefront, pending, loading, error } = refreshable();
      const wrapper = await mountReady(mock, { storefront });

      // Every flag at once, all of them lying about a page that has its product: none of them may
      // replace it. `pending` is the skeleton state and nothing else, and a failed read never
      // regresses a page that already has something to show.
      pending.value = true;
      loading.value = true;
      error.value = 'gateway exploded';
      await nextTick();

      expect(wrapper.text()).toContain('Merino crew sweater');
      expect(wrapper.text()).toContain('$96');
      expect(wrapper.text()).not.toContain(enUS.storefront.loading);
      expect(wrapper.text()).not.toContain(enUS.storefront.error);
      expect(wrapper.get('[data-part="root"]').attributes('aria-busy')).toBe('true');
    });
  });

  /**
   * A prerendered page outlives the catalogue it was built from: a visitor can follow a bookmark to
   * a product that has since been deleted. The read answers `null` with no error, which is neither
   * "still loading" nor "we couldn't ask".
   */
  describe('a product that no longer exists', () => {
    it('says so, rather than rendering nothing at all', async () => {
      const source = createDemoStorefront();
      const storefront = {
        ...source,
        catalog: {
          ...source.catalog,
          product: () =>
            ({
              data: ref(null),
              pending: ref(false),
              loading: ref(false),
              error: ref(null),
              revalidating: ref(new Set()),
              refresh: async () => {},
            }) as unknown as StorefrontResult<StorefrontProduct>,
        },
      } as ReturnType<typeof storefrontWith>;
      const wrapper = await mountReady(mock, { storefront });

      expect(wrapper.text()).toContain(enUS.storefront.notFound);
      expect(wrapper.text()).not.toContain(enUS.storefront.loading);
      expect(wrapper.text()).not.toContain(enUS.storefront.error);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('stays on the loading line while the read has not answered', async () => {
      const source = createDemoStorefront();
      const storefront = {
        ...source,
        catalog: {
          ...source.catalog,
          product: () =>
            ({
              data: ref(null),
              pending: ref(true),
              loading: ref(true),
              error: ref(null),
              revalidating: ref(new Set()),
              refresh: async () => {},
            }) as unknown as StorefrontResult<StorefrontProduct>,
        },
      } as ReturnType<typeof storefrontWith>;
      const wrapper = await mountReady(mock, { storefront });

      expect(wrapper.text()).toContain(enUS.storefront.loading);
      expect(wrapper.text()).not.toContain(enUS.storefront.notFound);
    });
  });
});
