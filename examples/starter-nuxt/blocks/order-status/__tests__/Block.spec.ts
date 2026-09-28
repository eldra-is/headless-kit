// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { createDemoStorefront, buildOrder } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontOrder,
  StorefrontOrderStatus,
  StorefrontSource,
} from '../../../app/storefront/types';
import { enUS } from '../../../app/i18n/en-US';

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

/** A real order token in the URL (`route.orderToken` stays the demo default), but the fetch it
 *  drives never resolves — the loading state a real order page shows before the gateway answers. */
function storefrontPendingForever(): StorefrontSource {
  const base = createDemoStorefront();
  return {
    ...base,
    orders: {
      current: () => ({
        data: ref(null),
        pending: ref(true),
        error: ref(null),
        refresh: async () => {},
      }),
    },
  };
}

/** A real order token, but the fetch failed — `StorefrontResult.error` set. */
function storefrontWithError(message: string): StorefrontSource {
  const base = createDemoStorefront();
  return {
    ...base,
    orders: {
      current: () => ({
        data: ref(null),
        pending: ref(false),
        error: ref(message),
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
    /** The badge is the first (outermost) `<span>` whose text names the state — scoped past the
     *  status prefix so a future decorative element elsewhere carrying the same word can't be
     *  picked up by accident. */
    function badgeFor(wrapper: VueWrapper, word: string) {
      return wrapper
        .findAll('span')
        .find(
          (el) => el.text().includes(enUS.order.statusPrefix.trim()) && el.text().includes(word)
        )!;
    }

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
        const badge = badgeFor(wrapper, word);
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toContain(enUS.order.statusPrefix.trim());
        expect(badge.find('svg').exists()).toBe(true);
      }
    );

    /** `Badge`'s own `outline` look ignores `tone` entirely (`bg-background text-text
     *  border-border-strong` regardless of the prop), so without an explicit override every status
     *  would render in the same neutral colour — this pins the per-state `classes.root` override
     *  that recolours the icon/word/border for the three non-neutral states. */
    it.each([
      ['delivered', enUS.storefront.orderStatus.delivered, 'success'],
      ['delayed', enUS.storefront.orderStatus.delayed, 'warning'],
      ['cancelled', enUS.storefront.orderStatus.cancelled, 'danger'],
    ] as const)(
      'the %s badge carries its own %s tone, not the neutral outline default',
      async (status, word, tone) => {
        const wrapper = await mountStatus(status);
        const badge = badgeFor(wrapper, word);
        expect(badge.classes()).toContain(`text-${tone}`);
        expect(badge.classes()).toContain(`border-${tone}`);
        expect(badge.classes()).not.toContain('text-text');
      }
    );

    it.each([
      ['processing', enUS.storefront.orderStatus.processing],
      ['shipped', enUS.storefront.orderStatus.shipped],
    ] as const)(
      'the %s badge keeps the neutral outline look (no tone override)',
      async (status, word) => {
        const wrapper = await mountStatus(status);
        const badge = badgeFor(wrapper, word);
        expect(badge.classes()).not.toContain('text-success');
        expect(badge.classes()).not.toContain('text-warning');
        expect(badge.classes()).not.toContain('text-danger');
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

    it('shows the new estimate ("Est. 30 Sept") on the warning step\'s date — the spec\'s own worked example — not the literal word "Delayed", while the marker stays the warning/alert-triangle disc and the step is still aria-current', async () => {
      const wrapper = await mountStatus('delayed');
      const items = wrapper.get('ol').findAll('li');
      const current = items.filter((li) => li.attributes('aria-current') === 'step');
      expect(current).toHaveLength(1);
      expect(current[0]!.text()).toContain('Delivered');
      expect(current[0]!.text()).toContain('Sep 30, 2026');
      expect(current[0]!.text()).toContain(enUS.order.estimated.replace('{date}', '').trim());
      expect(current[0]!.text()).not.toContain(enUS.storefront.orderStatus.delayed);
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

  describe('loading and error', () => {
    it('shows a Skeleton placeholder, announced through a labelled busy region, while the order is still loading', async () => {
      const wrapper = mountBlock(mock, { source: storefrontPendingForever() });
      await flushPromises();
      const busyRegion = wrapper.get('[role="status"][aria-busy="true"]');
      expect(busyRegion.attributes('aria-label')).toBe(enUS.storefront.loading);
      // The decorative shimmering shapes carry no accessible name of their own.
      expect(wrapper.findAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
      // Nothing from the real content (title, panel, items) is rendered yet.
      expect(wrapper.find('h1').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('shows an EmptyState variant="error" (role="alert") when the fetch fails', async () => {
      const wrapper = mountBlock(mock, { source: storefrontWithError('failed') });
      await flushPromises();
      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toContain(enUS.storefront.error);
      expect(wrapper.find('h1').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders nothing (not even a loading/error state) with no order token in the URL at all', async () => {
      const wrapper = mountBlock(mock, { source: storefrontWithNoOrder() });
      await flushPromises();
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.text()).toBe('');
    });
  });

  describe('status panel layout', () => {
    it('the summary and the call-to-action sit in one row from @tablet: (stacked below it)', async () => {
      const wrapper = await mountStatus('shipped');
      const heading = wrapper.get('h2');
      // The row wrapper is the heading's grandparent: h2 -> summary column -> row.
      const row = heading.element.parentElement!.parentElement!;
      expect(row.classList.contains('flex-col')).toBe(true);
      expect(row.classList.contains('@tablet:flex-row')).toBe(true);
    });
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
