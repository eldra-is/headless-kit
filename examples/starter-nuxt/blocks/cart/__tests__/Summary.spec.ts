// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import Summary from '../parts/Summary.vue';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { createDemoStorefront, DEMO_CART_LINES } from '../../../app/storefront/demo';
import { STOREFRONT_KEY, type StorefrontSource } from '../../../app/storefront/types';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/** The Northwind cart the spec's page story shows: $210.00 over three lines, over the $80
 *  free-shipping threshold, so the demo backend charges nothing for shipping. */
const SUBTOTAL = '$210.00';

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

async function mountSummary(
  props: Partial<{ showDiscount: boolean; showPaymentIcons: boolean; note: string }> = {}
): Promise<{ wrapper: VueWrapper; storefront: StorefrontSource }> {
  const storefront = createDemoStorefront({ cartLines: DEMO_CART_LINES });
  const base = mountOptions({ entry: { id: 'cart', data: {} } });
  const wrapper = mount(Summary, {
    props: { headingId: 'cart-summary-test', ...props },
    attachTo: document.body,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [STOREFRONT_KEY]: storefront,
        [ICON_FETCHER_KEY]: stubFetcher,
      },
    },
  });
  trackedWrappers.push(wrapper);
  // The store loads its cart on creation (`createCartStore` → `ops.init()`), one microtask out.
  await flushPromises();
  return { wrapper, storefront };
}

/** The `<dd>` beside the `<dt>` whose text starts with `label`. */
function valueFor(wrapper: VueWrapper, label: string): string {
  const terms = wrapper.findAll('dt');
  const index = terms.findIndex((term) => term.text().startsWith(label));
  expect(index, `no totals row labelled "${label}"`).toBeGreaterThanOrEqual(0);
  return wrapper.findAll('dd')[index]!.text();
}

async function applyCode(wrapper: VueWrapper, code: string): Promise<void> {
  await wrapper.get('input[name="discountCode"]').setValue(code);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

describe('cart summary', () => {
  it('is an aside labelled by its own heading, with no axe violations', async () => {
    const { wrapper } = await mountSummary({ note: 'Taxes calculated at checkout.' });
    const aside = wrapper.get('aside');
    expect(aside.attributes('aria-labelledby')).toBe('cart-summary-test');
    expect(wrapper.get('#cart-summary-test').text()).toBe('Order summary');
    expect(wrapper.text()).toContain('Taxes calculated at checkout.');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('shows the store totals, with words where shipping has no amount yet', async () => {
    const { wrapper, storefront } = await mountSummary();
    expect(valueFor(wrapper, 'Subtotal')).toContain(SUBTOTAL);
    expect(valueFor(wrapper, 'Shipping')).toBe('Free');
    expect(valueFor(wrapper, 'Estimated total')).toContain(SUBTOTAL);

    storefront.cart.totals.value = { ...storefront.cart.totals.value!, shipping: null };
    await flushPromises();
    expect(valueFor(wrapper, 'Shipping')).toBe('Calculated at checkout');
  });

  it('links Check out to the storefront checkout URL', async () => {
    const { wrapper, storefront } = await mountSummary();
    const checkout = wrapper.get('a[href="/checkout/demo-cart"]');
    expect(checkout.text()).toContain('Check out');
    expect(storefront.cart.checkoutUrl.value).toBe('/checkout/demo-cart');
  });

  describe('discount code', () => {
    it('applies a code typed in any case and reports it as a polite status with a removable chip', async () => {
      const { wrapper } = await mountSummary();
      await applyCode(wrapper, 'winter15');

      const status = wrapper.get('[role="status"]');
      expect(status.text()).toContain('Applied:');
      expect(status.text()).toContain('WINTER15');
      const remove = status.get('button');
      expect(remove.attributes('aria-label')).toBe('Remove discount code WINTER15');
      // The field is gone now that a code is on the cart; the chip is how it comes back off.
      expect(wrapper.find('input[name="discountCode"]').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('adds a success-coloured discount row naming the code', async () => {
      const { wrapper } = await mountSummary();
      await applyCode(wrapper, 'WINTER15');

      const terms = wrapper.findAll('dt');
      const index = terms.findIndex((term) => term.text() === 'Discount (WINTER15)');
      expect(index).toBeGreaterThanOrEqual(0);
      const value = wrapper.findAll('dd')[index]!;
      // 10 % of $210.00 in the demo backend, rendered by `Price` with the locale's own minus sign.
      expect(value.text()).toContain('21.00');
      expect(value.get('[data-part="current"]').classes()).toContain('text-success');
    });

    it('takes the code back off the cart from the chip', async () => {
      const { wrapper, storefront } = await mountSummary();
      await applyCode(wrapper, 'WINTER15');
      expect(storefront.cart.totals.value?.discount?.code).toBe('WINTER15');

      await wrapper.get('[role="status"] button').trigger('click');
      await flushPromises();

      expect(storefront.cart.totals.value?.discount ?? null).toBeNull();
      expect(wrapper.find('input[name="discountCode"]').exists()).toBe(true);
    });

    it('marks a refused code invalid and explains it in an alert linked by aria-describedby', async () => {
      const { wrapper } = await mountSummary();
      await applyCode(wrapper, 'WINTER51');

      const input = wrapper.get('input[name="discountCode"]');
      expect(input.attributes('aria-invalid')).toBe('true');
      const errorId = input.attributes('aria-describedby');
      expect(errorId).toBeTruthy();
      const alert = wrapper.get(`#${errorId}`);
      expect(alert.attributes('role')).toBe('alert');
      expect(alert.text()).toBe("WINTER51 isn't a valid code. Check the spelling and try again.");
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('clears the alert as soon as the code is edited', async () => {
      const { wrapper } = await mountSummary();
      await applyCode(wrapper, 'WINTER51');
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);

      await wrapper.get('input[name="discountCode"]').setValue('WINTER5');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.get('input[name="discountCode"]').attributes('aria-invalid')).toBeUndefined();
    });

    it('ignores a submit with nothing typed', async () => {
      const { wrapper, storefront } = await mountSummary();
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(storefront.cart.totals.value?.discount ?? null).toBeNull();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });

    it('is absent when the field is turned off', async () => {
      const { wrapper } = await mountSummary({ showDiscount: false });
      expect(wrapper.find('input[name="discountCode"]').exists()).toBe(false);
      expect(wrapper.find('form').exists()).toBe(false);
    });
  });

  describe('payment icons', () => {
    it('are one labelled image, not four named marks', async () => {
      const { wrapper } = await mountSummary();
      const image = wrapper.get('[role="img"]');
      expect(image.attributes('aria-label')).toBe(
        'We accept Visa, Mastercard, PayPal and Apple Pay'
      );
      expect(image.findAll('svg')).toHaveLength(4);
    });

    it('are absent when turned off', async () => {
      const { wrapper } = await mountSummary({ showPaymentIcons: false });
      expect(wrapper.find('[role="img"]').exists()).toBe(false);
    });
  });
});
