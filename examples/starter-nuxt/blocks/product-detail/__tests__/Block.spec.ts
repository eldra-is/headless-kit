// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { computed, nextTick } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { STOREFRONT_KEY, type StorefrontProduct } from '../../../app/storefront/types';
import Block from '../Block.vue';
import mock from '../mock.json';

/** Every icon in this block (`zoom-in`, the stock icons, `mail`, `heart`, the perks) resolves
 *  through `EldraIcon`, which needs Nuxt's route or an injected fetcher — this reads the real Tabler
 *  SVG synchronously, network-free, the same stub the `gallery` block's spec uses. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = { variant: 'gallery-left' as const };

const VARIANTS = ['gallery-left', 'gallery-right'] as const;

/**
 * A demo storefront whose product is patched on the way out. The Northwind catalogue
 * (`app/storefront/demo.ts`, owned by the storefront task) has no low-stock and no made-to-order
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
  } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
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
        [ICON_FETCHER_KEY]: stubFetcher,
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
function radios(wrapper: Wrapper) {
  return wrapper.findAll<HTMLInputElement>('input[type="radio"]');
}
function optionByLabel(wrapper: Wrapper, label: string) {
  return wrapper
    .findAll('label')
    .find((candidate) => candidate.text().startsWith(label))!
    .get<HTMLInputElement>('input[type="radio"]');
}

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('product-detail block', () => {
  it('renders the demo product from mock.json with no axe violations', async () => {
    const wrapper = await mountReady(mock);
    expect(wrapper.text()).toContain('Merino crew sweater');
    expect(wrapper.text()).toContain('$96.00');
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
    // The demo product is $96.00, was $128.00.
    expect(wrapper.text()).toContain('Save $32.00');
    expect(wrapper.text()).toContain('$128.00');
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
      const first = await mountReady(mock);
      const second = await mountReady(mock);

      const firstColour = radios(first)[0]!;
      const secondColour = radios(second)[0]!;
      expect(firstColour.element.checked).toBe(true);
      expect(secondColour.element.checked).toBe(true);
      // Distinct form owners are what isolate the groups — the legend still reads "Colour: Oat",
      // which a per-instance `name` would have replaced with an id.
      expect(firstColour.element.form).not.toBe(secondColour.element.form);
      expect(firstColour.element.form).not.toBeNull();
      expect(first.get('legend').text()).toContain('Colour');

      // Choosing in the second block leaves the first block's selection checked.
      await radios(second)[1]!.setValue();
      expect(radios(second)[1]!.element.checked).toBe(true);
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
      const wrapper = await mountReady(mock);
      expect(wrapper.get('a[href="/pages/size-guide"]').text()).toBe('Size guide');

      const noHref = await mountReady({ ...mock, sizeGuideHref: '' });
      expect(noHref.find('a[href="/pages/size-guide"]').exists()).toBe(false);
    });
  });

  describe('stock states', () => {
    it('reads in stock for the demo product, axe-clean', async () => {
      const wrapper = await mountReady(mock);
      expect(statusLine(wrapper).text()).toContain('In stock, ready to ship');
      expect(addToCart(wrapper).text()).toContain('Add to cart · $96.00');
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
      expect(bar.text()).toContain('Oat / XS · $96.00');
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
});
