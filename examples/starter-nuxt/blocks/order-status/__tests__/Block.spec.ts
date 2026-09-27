// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import { createDemoStorefront, buildOrder } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontOrder,
  StorefrontOrderStatus,
  StorefrontSource,
} from '../../../app/storefront/types';
import { enUS } from '../../../app/i18n/en-US';

/** `EldraIcon` (badge/tracker/payment/help-link icons) resolves through `useEldraIcon`, which
 *  outside Nuxt needs an injected fetcher — the pattern `newsletter`'s/`collection-grid`'s own
 *  specs use. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/** Only the required fields (the freshly-inserted seed): every optional part (text, links,
 *  help links) is absent, exercising every "optional part renders nothing" branch at once. */
const bare = {
  variant: 'default',
  processingTitle: mock.processingTitle,
  shippedTitle: mock.shippedTitle,
  deliveredTitle: mock.deliveredTitle,
  delayedTitle: mock.delayedTitle,
  cancelledTitle: mock.cancelledTitle,
};

const STATUSES: StorefrontOrderStatus[] = [
  'processing',
  'shipped',
  'delivered',
  'delayed',
  'cancelled',
];

/** A 14-line order (the shipped fixture's own other fields, its three real lines cycled out to
 *  fourteen) for the "many items" collapse — `app/storefront/demo.ts`'s own Northwind fixture
 *  keeps to the spec's exact three-line default content, so a longer order is built here instead
 *  of extending that shared fixture. */
function manyItemsOrder(): StorefrontOrder {
  const base = buildOrder('shipped');
  const lines = Array.from({ length: 14 }, (_, index) => {
    const source = base.lines[index % base.lines.length]!;
    return { ...source, id: `many-${index + 1}` };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    ...base,
    lines,
    totals: { ...base.totals, subtotal, total: subtotal + (base.totals.tax ?? 0) },
  };
}

function storefrontFor(status: StorefrontOrderStatus): StorefrontSource {
  return createDemoStorefront({ orderStatus: status });
}

function storefrontWithOrder(order: StorefrontOrder): StorefrontSource {
  const base = createDemoStorefront();
  return {
    ...base,
    orders: {
      current: () => ({
        data: ref(order),
        pending: ref(false),
        error: ref(null),
        refresh: async () => {},
      }),
    },
  };
}

/** No order bound at all (`orders.current()` resolves `null`) — the real-page "no `?token=`"
 *  case, spec → States, "Freshly inserted (editor)". */
function storefrontWithNoOrder(): StorefrontSource {
  const base = createDemoStorefront();
  return {
    ...base,
    route: { ...base.route, orderToken: null },
    orders: {
      current: () => ({
        data: ref(null),
        pending: ref(false),
        error: ref(null),
        refresh: async () => {},
      }),
    },
  };
}

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

function mountBlock(
  data: Record<string, unknown>,
  options: { source?: StorefrontSource; editing?: boolean } = {}
) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  const wrapper = mount(Block, {
    ...opts,
    global: {
      ...opts.global,
      provide: {
        ...opts.global.provide,
        [ICON_FETCHER_KEY]: stubFetcher,
        ...(options.source ? { [STOREFRONT_KEY]: options.source } : {}),
      },
    },
  });
  trackedWrappers.push(wrapper);
  return wrapper;
}

async function mountStatus(status: StorefrontOrderStatus, data: Record<string, unknown> = mock) {
  const wrapper = mountBlock(data, { source: storefrontFor(status) });
  await flushPromises();
  return wrapper;
}

describe('order-status block', () => {
  describe('accessibility', () => {
    it('renders the full mock.json content (shipped, the demo default) with no axe violations', async () => {
      const wrapper = await mountStatus('shipped');
      expect(wrapper.text()).toContain('NW-10482');
      expect(wrapper.text()).toContain(mock.shippedTitle);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content with no axe violations', async () => {
      const wrapper = mountBlock(bare, { source: storefrontFor('shipped') });
      await flushPromises();
      expect(wrapper.text()).toContain(bare.shippedTitle);
      // No returnLink/shopAgainLink/helpLinks fields at all: no Need Help section.
      expect(wrapper.text()).not.toContain(enUS.order.needHelp);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it.each(STATUSES)('renders the %s status with no axe violations', async (status) => {
      const wrapper = await mountStatus(status);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('has exactly one h1 (the order number) and one h2 per region', async () => {
    const wrapper = await mountStatus('shipped');
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h1').text()).toContain('NW-10482');
    // Panel, Items, Delivery address, Payment, Need help?
    expect(wrapper.findAll('h2')).toHaveLength(5);
  });

  describe('status badge', () => {
    it.each([
      ['processing', enUS.storefront.orderStatus.processing],
      ['shipped', enUS.storefront.orderStatus.shipped],
      ['delivered', enUS.storefront.orderStatus.delivered],
      ['delayed', enUS.storefront.orderStatus.delayed],
      ['cancelled', enUS.storefront.orderStatus.cancelled],
    ] as const)(
      'pairs an icon with the word for %s, behind a hidden "Status:" prefix',
      async (status, word) => {
        const wrapper = await mountStatus(status);
        const badge = wrapper.findAll('span').find((el) => el.text().includes(word))!;
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toContain(enUS.order.statusPrefix.trim());
        expect(badge.find('svg').exists()).toBe(true);
      }
    );
  });

  describe('tracker', () => {
    it('is an <ol> naming the current step with aria-current="step", each step\'s state in words, and aria-hidden discs', async () => {
      const wrapper = await mountStatus('shipped');
      const list = wrapper.get('ol');
      expect(list.attributes('aria-label')).toBe(enUS.order.progress);
      const items = list.findAll('li');
      expect(items).toHaveLength(4);

      const current = items.filter((li) => li.attributes('aria-current') === 'step');
      expect(current).toHaveLength(1);
      expect(current[0]!.text()).toContain('Shipped');

      for (const li of items) {
        const disc = li.find('span[aria-hidden="true"]');
        expect(disc.exists()).toBe(true);
      }
      const doneCount = items.filter((li) =>
        li.text().includes(enUS.order.completed.trim())
      ).length;
      const notYetCount = items.filter((li) => li.text().includes(enUS.order.notYet.trim())).length;
      expect(doneCount).toBe(2); // Ordered, Packed
      expect(notYetCount).toBe(2); // Shipped (current), Delivered (upcoming)
    });

    it('shows "In progress" for the current step with no date yet (processing)', async () => {
      const wrapper = await mountStatus('processing');
      const current = wrapper
        .get('ol')
        .findAll('li')
        .find((li) => li.attributes('aria-current') === 'step')!;
      expect(current.text()).toContain(enUS.order.inProgress);
    });

    it('shows the word "Delayed" on the warning step\'s date, marks it aria-current, and keeps the tracker and tracking row', async () => {
      const wrapper = await mountStatus('delayed');
      const items = wrapper.get('ol').findAll('li');
      const current = items.filter((li) => li.attributes('aria-current') === 'step');
      expect(current).toHaveLength(1);
      expect(current[0]!.text()).toContain(enUS.storefront.orderStatus.delayed);
      expect(current[0]!.text()).toContain('Delivered');
      expect(wrapper.text()).toContain(enUS.order.trackingNumber);
    });

    it('renders no tracker and no tracking row for a cancelled order', async () => {
      const wrapper = await mountStatus('cancelled');
      expect(wrapper.find('ol').exists()).toBe(false);
      expect(wrapper.text()).not.toContain(enUS.order.trackingNumber);
    });

    it('switches from a vertical list to a 4-column horizontal grid at 36rem block width (@two-col:)', async () => {
      const wrapper = await mountStatus('shipped');
      const list = wrapper.get('ol');
      expect(list.classes()).toContain('flex-col');
      expect(list.classes()).toContain('@two-col:grid');
      expect(list.classes()).toContain('@two-col:grid-cols-4');
    });
  });

  describe('call to action', () => {
    it('Track package opens the carrier site: an accessible name saying so, target _blank', async () => {
      const wrapper = await mountStatus('shipped');
      const button = wrapper
        .findAll('a')
        .find((el) => el.text().includes(enUS.order.trackPackage))!;
      expect(button.exists()).toBe(true);
      expect(button.text()).toContain(enUS.order.trackOpens.trim());
      expect(button.attributes('target')).toBe('_blank');
      expect(button.attributes('rel')).toContain('noopener');
    });

    it('offers Start a return once an order is delivered', async () => {
      const wrapper = await mountStatus('delivered');
      const button = wrapper.findAll('a').find((el) => el.text().includes(mock.returnLinkLabel));
      expect(button?.exists()).toBe(true);
      expect(wrapper.text()).not.toContain(enUS.order.trackPackage);
    });

    it('offers Shop again once an order is cancelled', async () => {
      const wrapper = await mountStatus('cancelled');
      const button = wrapper.findAll('a').find((el) => el.text().includes(mock.shopAgainLinkLabel));
      expect(button?.exists()).toBe(true);
    });
  });

  describe('keyboard', () => {
    it('Tab order is the call-to-action button, then item title links, then help links — every real operable element, nothing else in the way', async () => {
      const wrapper = await mountStatus('shipped');
      const focusables = wrapper.findAll('a, button');
      const labels = focusables.map((el) => el.text());
      const trackIndex = labels.findIndex((label) => label.includes(enUS.order.trackPackage));
      const firstItemIndex = labels.findIndex((label) => label.includes('Fell crew sweater'));
      const firstHelpIndex = labels.findIndex((label) => label.includes(mock.helpLinks[0]!.label));
      expect(trackIndex).toBeGreaterThanOrEqual(0);
      expect(firstItemIndex).toBeGreaterThan(trackIndex);
      expect(firstHelpIndex).toBeGreaterThan(firstItemIndex);
      // Nothing carries an explicit tabindex of its own (native elements only).
      expect(wrapper.findAll('[tabindex]')).toHaveLength(0);
    });

    it('a native click activates "Show all N items" (Enter/Space activate a real <button> natively)', async () => {
      const wrapper = mountBlock(mock, { source: storefrontWithOrder(manyItemsOrder()) });
      await flushPromises();
      const button = wrapper
        .findAll('button')
        .find((el) => el.text().includes('Show all 14 items'))!;
      expect(button.element.tagName).toBe('BUTTON');
      expect(button.attributes('type')).toBe('button');
      await button.trigger('click');
      expect(wrapper.get('ul').findAll('li')).toHaveLength(14);
    });
  });

  describe('the delay/cancel note', () => {
    it('is a role="status" alert under the delayed title', async () => {
      const wrapper = await mountStatus('delayed');
      const status = wrapper.find('[role="status"]');
      expect(status.exists()).toBe(true);
      expect(status.text()).toContain('North Sea');
    });

    it('is a role="status" alert under the cancelled title', async () => {
      const wrapper = await mountStatus('cancelled');
      const status = wrapper.find('[role="status"]');
      expect(status.exists()).toBe(true);
      expect(status.text()).toContain('refund');
    });
  });

  describe('items', () => {
    it('renders 10 of 14 lines behind a "Show all 14 items" button that reveals the rest', async () => {
      const wrapper = mountBlock(mock, { source: storefrontWithOrder(manyItemsOrder()) });
      await flushPromises();
      const rows = () => wrapper.get('ul').findAll('li');
      expect(rows()).toHaveLength(10);

      const button = wrapper
        .findAll('button')
        .find((el) => el.text().includes('Show all 14 items'))!;
      expect(button.exists()).toBe(true);
      await button.trigger('click');
      expect(rows()).toHaveLength(14);
    });

    it('is a description list for the totals, right at full width', async () => {
      const wrapper = await mountStatus('shipped');
      const dl = wrapper.find('dl');
      expect(dl.exists()).toBe(true);
      expect(dl.text()).toContain(enUS.order.subtotal);
      expect(dl.text()).toContain(enUS.order.total);
      expect(dl.text()).toContain(enUS.order.shippingFree);
    });
  });

  describe('details', () => {
    it('names the aside "Order details" and lists the delivery address, payment and help links', async () => {
      const wrapper = await mountStatus('shipped');
      const aside = wrapper.get('aside');
      expect(aside.attributes('aria-label')).toBe(enUS.order.detailsLabel);
      expect(aside.text()).toContain('Maren Holt');
      expect(aside.text()).toContain('Visa');
      expect(aside.text()).toContain('4242');
      for (const link of mock.helpLinks) expect(aside.text()).toContain(link.label);
    });
  });

  it('renders the sample order when the editor has no order bound yet (no empty layout)', async () => {
    const wrapper = mountBlock(mock, { source: storefrontWithNoOrder(), editing: true });
    await flushPromises();
    expect(wrapper.text()).toContain('NW-10482');
    expect(wrapper.text()).toContain(enUS.storefront.orderStatus.shipped);
  });

  it('renders nothing on the live site with no order bound', async () => {
    const wrapper = mountBlock(mock, { source: storefrontWithNoOrder(), editing: false });
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('carries no motion class anywhere', async () => {
    const wrapper = await mountStatus('shipped');
    for (const element of wrapper.element.querySelectorAll('*')) {
      for (const className of element.classList) {
        expect(className.startsWith('animate-')).toBe(false);
        expect(className.startsWith('transition-')).toBe(false);
      }
    }
  });
});
