// @vitest-environment jsdom
import { defineComponent, h, nextTick, ref, type PropType } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster, useToast } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { EldraHttpError } from '@eldrajs/sdk';
import { createDemoStorefront, DEMO_CART_LINES } from '../../../app/storefront/demo';
import { createCartStore, type CartSnapshot } from '../../../app/storefront/cart';
import { STOREFRONT_KEY, type StorefrontSource } from '../../../app/storefront/types';
import type { StorefrontCartLine } from '../../../app/storefront/types';

/** Only `variant` is required at the schema level — the "genuinely minimal" fixture every rebuilt
 *  block spec covers alongside the full `mock.json`. With no `freeShippingThreshold` there is no
 *  shipping bar, and with no empty copy the empty state falls back to its own heading. */
const bare = { variant: 'drawer' as const };

/**
 * The block plus the one `Toaster` `app/app.vue` mounts app-wide (the Undo toast is queued by
 * `useToast`, a module-level store, and only a mounted `Toaster` renders it), plus a stand-in for the
 * header's bag button so "focus returns to the opener" has a real opener to return to —
 * `blocks/navigation/Block.vue` is what plays that part on a real page.
 */
const Harness = defineComponent({
  name: 'CartHarness',
  props: {
    entry: {
      type: Object as PropType<{ id: string; data: Record<string, unknown> }>,
      required: true,
    },
    storefront: { type: Object as PropType<StorefrontSource>, required: true },
  },
  setup(props) {
    return () =>
      h('div', [
        h(
          'button',
          {
            id: 'bag',
            type: 'button',
            'aria-haspopup': 'dialog',
            onClick: () => {
              props.storefront.cart.drawerOpen.value = true;
            },
          },
          'Cart'
        ),
        // The generated ambient `EldraBlockEntry<'cart'>` is a compile-time type only; the runtime
        // shape is exactly `{ id, data }`, which is what every block spec mounts with.
        h(Block as never, { entry: props.entry }),
        h(Toaster),
      ]);
  },
});

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
  // The toast queue and the modal scroll lock are both module-level in `@eldrajs/ui`.
  useToast().clear();
  document.documentElement.style.overflow = '';
});

async function mountCart(
  data: Record<string, unknown>,
  options: {
    cartLines?: StorefrontCartLine[];
    refuseMutations?: unknown;
    /** Refuse only the re-add behind Undo, so the removal itself still succeeds. */
    refuseOnly?: 'add';
  } = {}
): Promise<{ wrapper: VueWrapper; storefront: StorefrontSource }> {
  const lines = options.cartLines ?? DEMO_CART_LINES;
  const storefront =
    options.refuseMutations === undefined
      ? createDemoStorefront({ cartLines: lines })
      : refusingStorefront(lines, options.refuseMutations, options.refuseOnly);
  const base = mountOptions({ entry: { id: 'cart', data } });
  const wrapper = mount(Harness, {
    props: { entry: { id: 'cart', data }, storefront },
    attachTo: document.body,
    global: {
      ...base.global,
      // `@vue/test-utils` stubs `<TransitionGroup>` by default, which would put a
      // `transition-group-stub` element between the `<ul>` and its `<li>`s and break the list
      // semantics axe checks — in a browser it renders a fragment and there is no wrapper at all.
      // Rendering the real thing is both what the page does and what the axe gate has to see.
      stubs: { ...base.global.stubs, transition: false, 'transition-group': false },
      provide: {
        ...base.global.provide,
        [STOREFRONT_KEY]: storefront,
      },
    },
  });
  trackedWrappers.push(wrapper);
  // The cart store loads itself on creation (`createCartStore` → `ops.init()`), one microtask out.
  await flushPromises();
  return { wrapper, storefront };
}

/** Opens the drawer the way the header does: focus the bag, then click it. `trigger('click')` only
 *  dispatches the event, so the focus has to be real for the focus-return assertion to mean
 *  anything. */
async function openDrawer(wrapper: VueWrapper): Promise<void> {
  const bag = wrapper.get('#bag');
  bag.element.focus();
  await bag.trigger('click');
  await flushPromises();
}

function accessibleNameOf(element: Element): string {
  return element.getAttribute('aria-label') ?? (element.textContent ?? '').trim();
}

function focusableNames(root: Element): string[] {
  return [...root.querySelectorAll('a[href], button, input')].map(accessibleNameOf);
}

/**
 * The demo storefront with a cart that holds its lines but refuses every change — what the in-memory
 * ops cannot do, and the one state these controls have nothing of their own to show: the stepper
 * springs back and the row stays put, exactly as if the button did nothing.
 */
function refusingStorefront(
  lines: StorefrontCartLine[],
  thrown: unknown,
  only?: 'add'
): StorefrontSource {
  let held = lines.map((line) => ({ ...line }));
  const snapshot = (): CartSnapshot => ({
    lines: held.map((line) => ({ ...line })),
    totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
  });
  const refuse = async (): Promise<never> => {
    throw thrown;
  };
  const source = createDemoStorefront({ cartLines: lines });
  return {
    ...source,
    cart: createCartStore({
      init: async () => snapshot(),
      add: refuse,
      setQuantity: only === 'add' ? async () => snapshot() : refuse,
      remove:
        only === 'add'
          ? async (lineId) => {
              held = held.filter((line) => line.id !== lineId);
              return snapshot();
            }
          : refuse,
      applyDiscount: refuse,
      removeDiscount: refuse,
      checkoutUrl: ref<string | null>(null),
    }),
  };
}

/** The live Undo toast the `Toaster` rendered (it teleports into the open drawer, or to `<body>`). */
function toastRoot(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-part="list"]');
}

/** A `danger` toast is rendered as `role="alert"`, *beside* the polite list rather than inside it
 *  (`Toaster`), so a refusal is announced immediately instead of waiting its turn. */
function alertToast(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="alert"]');
}

describe('cart block', () => {
  describe('accessibility', () => {
    it('renders the full mock.json content with no axe violations', async () => {
      const { wrapper } = await mountCart(mock);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content with no axe violations', async () => {
      const { wrapper } = await mountCart(bare);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it.each(['drawer', 'page'] as const)(
      'renders the %s variant with no axe violations',
      async (variant) => {
        const { wrapper } = await mountCart({ ...mock, variant });
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );

    it('has no axe violations with the drawer open', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);
      expect(wrapper.get('dialog').attributes('open')).toBe('');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('has no axe violations with an empty cart, in either shell', async () => {
      for (const variant of ['drawer', 'page'] as const) {
        const { wrapper } = await mountCart({ ...mock, variant }, { cartLines: [] });
        if (variant === 'drawer') await openDrawer(wrapper);
        expect(wrapper.text()).toContain(mock.emptyTitle);
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    });
  });

  describe('drawer', () => {
    it('is a modal dialog labelled by its title, opens focused on close, and stops the page scrolling', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);

      const dialog = wrapper.get('dialog');
      expect(dialog.attributes('open')).toBe('');
      const titleId = dialog.attributes('aria-labelledby');
      expect(titleId).toBeTruthy();
      expect(document.getElementById(titleId!)?.textContent).toContain('Your cart');
      // The count sits beside the title, from the store's own line quantities (1 + 2 + 1).
      expect(document.getElementById(titleId!)?.textContent).toContain('4');

      const close = dialog.get('[data-part="close"]');
      expect(close.attributes('aria-label')).toBe('Close Your cart');
      expect(document.activeElement).toBe(close.element);
      expect(document.documentElement.style.overflow).toBe('hidden');
    });

    it('closes on Esc, returning focus to the opener and the scroll to the page', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await flushPromises();

      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(wrapper.get('#bag').element);
      expect(document.documentElement.style.overflow).toBe('');
    });

    it('tells the header a drawer exists for as long as it is mounted', async () => {
      const { wrapper, storefront } = await mountCart(mock);
      expect(storefront.cart.drawerAvailable.value).toBe(true);
      wrapper.unmount();
      expect(storefront.cart.drawerAvailable.value).toBe(false);
    });

    it('does not claim a drawer in the page variant', async () => {
      const { storefront } = await mountCart({ ...mock, variant: 'page' });
      expect(storefront.cart.drawerAvailable.value).toBe(false);
    });

    it('has a footer with the subtotal, the note and both actions, and none at all when empty', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);
      const footer = wrapper.get('dialog [data-part="footer"]');
      expect(footer.text()).toContain('Subtotal');
      expect(footer.text()).toContain('$210');
      expect(footer.text()).toContain(mock.note);
      expect(footer.get('a[href="/checkout/demo-cart"]').text()).toContain('Check out');
      expect(footer.get('a[href="/cart"]').text()).toContain('View cart');

      const empty = await mountCart(mock, { cartLines: [] });
      await openDrawer(empty.wrapper);
      expect(empty.wrapper.find('dialog [data-part="footer"]').exists()).toBe(false);
    });

    it('runs the spec’s tab order: close, item, stepper, remove, then the two footer actions', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);
      const names = focusableNames(wrapper.get('dialog').element);

      expect(names.slice(0, 6)).toEqual([
        'Close Your cart',
        'Merino crew sweater',
        'Decrease, Merino crew sweater',
        'Quantity',
        'Increase, Merino crew sweater',
        'Remove Merino crew sweater, Oat / M',
      ]);
      expect(names.slice(-2)).toEqual(['Check out', 'View cart']);
    });
  });

  describe('line items', () => {
    it('labels the list, names every stepper group and names every remove button with its variant', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);

      expect(wrapper.get('dialog ul').attributes('aria-label')).toBe('Items in your cart');
      expect(
        wrapper.findAll('dialog [role="group"]').map((group) => group.attributes('aria-label'))
      ).toEqual([
        'Quantity, Merino crew sweater',
        'Quantity, Speckled latte mug',
        'Quantity, Walnut serving board',
      ]);
      expect(
        wrapper
          .findAll('dialog [aria-label^="Remove"]')
          .map((button) => button.attributes('aria-label'))
      ).toEqual([
        'Remove Merino crew sweater, Oat / M',
        'Remove Speckled latte mug, Clay',
        'Remove Walnut serving board, Large, 45 cm',
      ]);
    });

    it('shows the unit price only above quantity 1', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);
      const rows = wrapper.findAll('dialog li');
      // Merino: one of them, so no "each" line; the mug: two at $28.
      expect(rows[0]!.text()).not.toContain('each');
      expect(rows[1]!.text()).toMatch(/\$28\s*each/);
      expect(rows[1]!.text()).toContain('$56');
    });

    it('sends a stepper change to the store and re-renders the line total', async () => {
      const { wrapper, storefront } = await mountCart(mock);
      await openDrawer(wrapper);

      await wrapper.get('dialog [aria-label="Increase, Merino crew sweater"]').trigger('click');
      await flushPromises();

      expect(storefront.cart.lines.value[0]!.quantity).toBe(2);
      expect(wrapper.findAll('dialog li')[0]!.text()).toContain('$192');
    });

    it('carries the hidden "Line total" label on every line total', async () => {
      const { wrapper } = await mountCart({ ...mock, variant: 'page' });
      const rows = wrapper.findAll('li');
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        const total = row.get('[data-part="root"] [data-part="current"]');
        expect(total.exists()).toBe(true);
        expect(row.text()).toContain('Line total');
      }
    });

    it('draws the image placeholder for a line with no photo, never an empty <img>', async () => {
      const { wrapper } = await mountCart(mock, {
        cartLines: [{ ...DEMO_CART_LINES[0]!, image: null }],
      });
      await openDrawer(wrapper);

      const row = wrapper.get('dialog li');
      expect(row.findAll('img')).toEqual([]);
      // The title beside it already names the row, so the placeholder stays decorative.
      const placeholder = row.get('[data-part="placeholder"]');
      expect(placeholder.attributes('aria-hidden')).toBe('true');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('moves focus to the next line and offers an Undo toast that restores the removed line', async () => {
      const { wrapper, storefront } = await mountCart(mock);
      await openDrawer(wrapper);

      await wrapper
        .get('dialog [aria-label="Remove Merino crew sweater, Oat / M"]')
        .trigger('click');
      await flushPromises();

      expect(storefront.cart.lines.value.map((line) => line.title)).toEqual([
        'Speckled latte mug',
        'Walnut serving board',
      ]);
      const nextTitle = wrapper.get('dialog li a[href="/products/speckled-latte-mug"]');
      expect(document.activeElement).toBe(nextTitle.element);

      const toast = toastRoot();
      expect(toast?.textContent).toContain('Merino crew sweater removed');
      const undo = toast!.querySelector<HTMLElement>('[data-part="action"]')!;
      expect(accessibleNameOf(undo)).toBe('Undo');
      // The toast must never take focus — it appeared while focus was moving to the next line.
      expect(document.activeElement).toBe(nextTitle.element);

      undo.click();
      await flushPromises();
      expect(storefront.cart.lines.value.map((line) => line.title)).toEqual([
        'Merino crew sweater',
        'Speckled latte mug',
        'Walnut serving board',
      ]);
    });

    /**
     * A refused change has to say so. Nothing on screen moves when the backend says no — the line is
     * still there, the stepper is back at the quantity the store still holds — so without this the
     * only difference between "we could not" and "that button is broken" is invisible.
     */
    it('reports a refused removal and a refused quantity change, keeping the line', async () => {
      const { wrapper, storefront } = await mountCart(mock, {
        refuseMutations: new EldraHttpError({ status: 409, statusText: 'Conflict' } as Response, {
          code: 'CONFLICT',
          errorId: 'CART_INSUFFICIENT_STOCK',
        }),
      });
      await openDrawer(wrapper);

      await wrapper
        .get('dialog [aria-label="Remove Merino crew sweater, Oat / M"]')
        .trigger('click');
      await flushPromises();

      expect(storefront.cart.lines.value.map((line) => line.title)).toContain(
        'Merino crew sweater'
      );
      await nextTick();

      expect(alertToast()?.textContent).toContain('This item is out of stock.');
      // No Undo offered for a removal that did not happen.
      expect(toastRoot()?.textContent ?? '').not.toContain('removed');

      useToast().clear();
      await wrapper.get('dialog [data-part="increase"]').trigger('click');
      await flushPromises();
      await nextTick();

      expect(alertToast()?.textContent).toContain('This item is out of stock.');
      expect(storefront.cart.lines.value[0]?.quantity).toBe(1);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /**
     * The removal toast's own Undo was just pressed and the shop refused the re-add. That toast is
     * still standing (activating an action does not dismiss it, and its timer is paused while focus
     * is inside the stack) and its button now has nothing left to restore, so left beside the
     * refusal it would put two contradictory statements about one line to the shopper.
     */
    it('replaces the removal toast when the undo it offered is refused', async () => {
      const { wrapper, storefront } = await mountCart(mock, {
        refuseOnly: 'add',
        refuseMutations: new EldraHttpError({ status: 409, statusText: 'Conflict' } as Response, {
          code: 'CONFLICT',
          errorId: 'CART_INSUFFICIENT_STOCK',
        }),
      });
      await openDrawer(wrapper);

      await wrapper
        .get('dialog [aria-label="Remove Merino crew sweater, Oat / M"]')
        .trigger('click');
      await flushPromises();
      await nextTick();
      expect(toastRoot()?.textContent).toContain('Merino crew sweater removed');

      toastRoot()!.querySelector<HTMLElement>('[data-part="action"]')!.click();
      await flushPromises();
      await nextTick();

      expect(alertToast()?.textContent).toContain('This item is out of stock.');
      expect(toastRoot()?.textContent ?? '').not.toContain('removed');
      // The line is back on screen — the restore is local and deliberate — which is exactly why the
      // shopper has to be told the shop could not take it back.
      expect(storefront.cart.lines.value.map((line) => line.title)).toContain(
        'Merino crew sweater'
      );
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('moves focus to the empty-state heading when the last line goes', async () => {
      const { wrapper } = await mountCart(mock, { cartLines: [DEMO_CART_LINES[0]!] });
      await openDrawer(wrapper);

      await wrapper
        .get('dialog [aria-label="Remove Merino crew sweater, Oat / M"]')
        .trigger('click');
      await flushPromises();

      // The drawer's own `h2` carries `data-part="title"` too; the empty state's is the `h3`.
      const heading = wrapper.get('dialog h3[data-part="title"]');
      expect(heading.text()).toBe(mock.emptyTitle);
      expect(document.activeElement).toBe(heading.element);
    });
  });

  describe('free shipping', () => {
    it('is a polite status in words, with the bar hidden from assistive technology', async () => {
      const { wrapper } = await mountCart({ ...mock, variant: 'page' });
      // `[role="status"]` also matches `FormLayout`'s own hidden announcement region, so pick the
      // shipping one by what it says.
      const status = wrapper
        .findAll('[role="status"]')
        .find((element) => element.text().includes('Free shipping'))!;
      // $210 against the mock's $80 threshold.
      expect(status.text()).toBe('Free shipping unlocked');
      expect(status.attributes('aria-live')).toBeUndefined(); // role="status" is already polite
      expect(wrapper.find('[aria-hidden="true"] > div').exists()).toBe(true);
      expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    });

    it('renders no bar at all without a threshold', async () => {
      const { wrapper } = await mountCart({ ...bare, variant: 'page' });
      expect(wrapper.text()).not.toContain('free shipping');
      expect(wrapper.text()).not.toContain('Free shipping');
    });
  });

  describe('page', () => {
    it('renders one h1 with the live count, which names the section', async () => {
      const { wrapper } = await mountCart({ ...mock, variant: 'page' });
      const headings = wrapper.findAll('h1');
      expect(headings).toHaveLength(1);
      expect(headings[0]!.text()).toContain('Your cart');
      expect(headings[0]!.text()).toContain('4 items');
      expect(wrapper.get('section').attributes('aria-labelledby')).toBe(
        headings[0]!.attributes('id')
      );
    });

    it('hides the column headings from assistive technology', async () => {
      const { wrapper } = await mountCart({ ...mock, variant: 'page' });
      const headings = wrapper
        .findAll('[aria-hidden="true"]')
        .filter((element) => element.text().includes('Product'));
      expect(headings).toHaveLength(1);
      expect(headings[0]!.text()).toContain('Quantity');
      expect(headings[0]!.text()).toContain('Total');
    });

    it('shows the summary aside and links Check out to the storefront checkout URL', async () => {
      const { wrapper } = await mountCart({ ...mock, variant: 'page' });
      const aside = wrapper.get('aside');
      expect(aside.text()).toContain('Order summary');
      const checkout = aside.get('a[href="/checkout/demo-cart"]');
      expect(checkout.text()).toContain('Check out');
      expect(checkout.element.tagName).toBe('A');
    });

    it('offers Continue shopping beside the heading and in the empty state', async () => {
      const { wrapper } = await mountCart({ ...mock, variant: 'page' });
      expect(wrapper.get(`a[href="${mock.emptyLinkHref}"]`).text()).toContain('Continue shopping');

      const empty = await mountCart({ ...mock, variant: 'page' }, { cartLines: [] });
      expect(empty.wrapper.text()).toContain(mock.emptyText);
      expect(empty.wrapper.findAll(`a[href="${mock.emptyLinkHref}"]`).length).toBe(2);
      expect(empty.wrapper.find('aside').exists()).toBe(false);
    });

    it('keeps the discount field and payment icons out of the drawer, where the spec has neither', async () => {
      const { wrapper } = await mountCart(mock);
      await openDrawer(wrapper);
      expect(wrapper.find('dialog input[name="discountCode"]').exists()).toBe(false);
      expect(wrapper.find('dialog [role="img"]').exists()).toBe(false);
    });
  });

  it('has no pre-ticked upsells and no urgency copy', async () => {
    for (const variant of ['drawer', 'page'] as const) {
      const { wrapper } = await mountCart({ ...mock, variant });
      if (variant === 'drawer') await openDrawer(wrapper);
      expect(
        wrapper.findAll('input[type="checkbox"], input[type="radio"], [role="switch"]')
      ).toEqual([]);
      expect(wrapper.text()).not.toMatch(
        /only today|selling fast|hurry|almost gone|left in stock|people are viewing/i
      );
    }
  });
});
