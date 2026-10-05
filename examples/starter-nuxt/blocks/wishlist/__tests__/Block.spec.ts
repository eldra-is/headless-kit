// @vitest-environment jsdom
//
// The wishlist block is what `/wishlist` is made of — a page Core seeds and a merchant composes,
// with this block's node `required` so it cannot be deleted from it. Every assertion here was
// written against the code route this block replaced (`app/pages/wishlist.vue`), and they carry
// over unchanged except for the two things that moved: the heading is a field now, and the page's
// own `<title>` belongs to the page document rather than to a `useHead` call in this component.
//
// Everything else is the real thing: the demo catalogue, the real wishlist store with jsdom's own
// `localStorage` behind it, and the theme's own messages.
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref, watch, type Ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import Block from '../Block.vue';
import mock from '../mock.json';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontSource,
  VolatileKey,
} from '../../../app/storefront/types';
import { enUS } from '../../../app/i18n/en-US';

const WISHLIST_KEY = 'eldra.storefront.wishlist';

/** Nothing is required at the schema level: the "genuinely minimal" fixture every block spec
 *  covers alongside the full `mock.json`. With no copy at all, every string falls back to the
 *  theme's own and the empty state's button still points at `/`. */
const bare = {};

/** What a visitor's browser holds before the page is opened — the only input this block has. */
function saved(...handles: string[]): void {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(handles));
}

/**
 * `attachTo` because the focus assertions below are about real focus movement, and `.focus()` on a
 * detached element does nothing — the same reason `test/cartDrawer.spec.ts` attaches.
 */
function mountBlock(
  data: Record<string, unknown> = mock as unknown as Record<string, unknown>,
  storefront?: StorefrontSource
) {
  const base = mountOptions({ entry: { id: 'wishlist-1', data } });
  return mount(Block as never, {
    props: { entry: { id: 'wishlist-1', data } },
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        ...(storefront ? { [STOREFRONT_KEY]: storefront } : {}),
      },
    },
    attachTo: document.body,
  });
}

/** Mounted, hydrated from storage, and with the catalogue read settled. */
async function mountReady(
  data?: Record<string, unknown>,
  storefront?: StorefrontSource
): Promise<ReturnType<typeof mountBlock>> {
  const wrapper = mountBlock(data, storefront);
  await flushPromises();
  await nextTick();
  return wrapper;
}

/**
 * A storefront whose `byHandles` read the test drives by hand: the skeleton and error branches are
 * states the demo fixture passes through too fast to observe, and the load *count* is the only way
 * to see whether a removal re-asks the gateway for rows the block already holds.
 *
 * `loads` is counted the way `createGatewayResult` actually loads — once per change of the handle
 * ref it was given, immediately and deeply (`app/storefront/gateway.ts`) — so the number here is the
 * number of requests a real gateway would have seen. Each of those also raises `loading`
 * synchronously, as the gateway's own does, which is what puts a block into its refresh treatment
 * for the length of a round trip; the demo fixture does not, which is why the dim and the
 * `aria-busy` cannot be observed against it.
 */
function controlledStorefront(): {
  storefront: StorefrontSource;
  data: Ref<StorefrontProductListItem[] | null>;
  pending: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  loads: () => number;
  asked: () => string[];
} {
  const base = createDemoStorefront();
  const data = ref<StorefrontProductListItem[] | null>(null) as Ref<
    StorefrontProductListItem[] | null
  >;
  const pending = ref(true);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const revalidating = ref<ReadonlySet<VolatileKey>>(new Set());
  const result: StorefrontResult<StorefrontProductListItem[]> = {
    data,
    pending,
    error,
    loading,
    revalidating,
    refresh: async () => {},
  };
  let loads = 0;
  let asked: string[] = [];
  return {
    storefront: {
      ...base,
      catalog: {
        ...base.catalog,
        byHandles: (handles) => {
          watch(
            handles,
            (next) => {
              loads += 1;
              asked = [...next];
              loading.value = true;
            },
            { immediate: true, deep: true }
          );
          return result;
        },
      },
    },
    data,
    pending,
    loading,
    error,
    loads: () => loads,
    asked: () => asked,
  };
}

/** The demo catalogue's own rows for a set of handles, to answer a controlled read with. The demo
 *  result resolves on the next tick in a browser environment, so this awaits it. */
async function demoRows(...handles: string[]): Promise<StorefrontProductListItem[]> {
  const base = createDemoStorefront();
  const all = base.catalog.byHandles(ref(handles));
  await flushPromises();
  return all.data.value ?? [];
}

function removeButtons(wrapper: Awaited<ReturnType<typeof mountReady>>) {
  return wrapper.findAll('button[aria-pressed]');
}

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('wishlist block', () => {
  describe('with nothing saved', () => {
    /**
     * What `wishlist/index.html` carries in the artifact a static host serves, and what the
     * browser's first render of that file has to be: one file answers every visitor, and what each
     * of them saved is in their own browser (`app/composables/useWishlist.ts`).
     */
    it('renders the heading, the count and the empty state with its one next step', async () => {
      const wrapper = await mountReady();

      expect(wrapper.get('h1').text()).toContain('Your wishlist');
      expect(wrapper.get('h1').text()).toContain('0 items');
      expect(wrapper.text()).toContain(enUS.wishlist.emptyTitle);
      expect(wrapper.text()).toContain(enUS.wishlist.emptyText);
      // `/` always exists, which is what a theme can promise.
      const link = wrapper.get('a[href="/"]');
      expect(link.text()).toBe(enUS.wishlist.continueShopping);
      expect(wrapper.findAll('article').length).toBe(0);
    });

    /** The author's own words win over the theme's, which is the point of the fields. */
    it('renders the page’s own heading and empty copy when it carries them', async () => {
      const wrapper = await mountReady({
        heading: 'Saved for later',
        emptyTitle: 'Nothing saved yet',
        emptyText: 'Have a look around.',
        emptyLink: { kind: 'url', url: '/collections/all', label: 'Browse everything' },
      });

      expect(wrapper.get('h1').text()).toContain('Saved for later');
      expect(wrapper.text()).toContain('Nothing saved yet');
      expect(wrapper.text()).toContain('Have a look around.');
      const link = wrapper.get('a[href="/collections/all"]');
      expect(link.text()).toBe('Browse everything');
    });

    /**
     * Every string falls back, and the button still goes somewhere: a link whose target no longer
     * resolves — or a block rendered with no link at all — leaves `/` rather than a dead anchor.
     */
    it('falls back to the theme’s own copy and to `/` with no fields at all', async () => {
      const wrapper = await mountReady(bare);

      expect(wrapper.get('h1').text()).toContain(enUS.wishlist.title);
      expect(wrapper.text()).toContain(enUS.wishlist.emptyTitle);
      const link = wrapper.get('a[href="/"]');
      expect(link.text()).toBe(enUS.wishlist.continueShopping);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('is axe-clean', async () => {
      const wrapper = await mountReady();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('with saved products', () => {
    /**
     * The whole point of the block: the stored handles are turned into real product cards — titles,
     * images and prices off the catalogue — by one batched read, in the order they were saved.
     */
    it('lists the saved products as cards, newest first, with their real prices', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();

      const titles = wrapper.findAll('h2').map((heading) => heading.text());
      expect(titles).toEqual(['Speckled latte mug', 'Merino crew sweater']);
      expect(wrapper.get('h1').text()).toContain('2 items');
      // Real money from the catalogue, formatted in the store's own currency — not a placeholder.
      expect(wrapper.text()).toContain('$96.00');
      expect(wrapper.get('a[href="/products/merino-crew-sweater"]')).toBeTruthy();
      expect(wrapper.find('img').attributes('alt')).toBeTruthy();
    });

    /** No quick add on these cards, the same decision `collection-grid` makes: the one control a
     *  saved card owns is the heart that takes it off the list. */
    it('gives each card a pressed heart naming the product, and no quick add', async () => {
      saved('merino-crew-sweater');
      const wrapper = await mountReady();

      const buttons = removeButtons(wrapper);
      expect(buttons).toHaveLength(1);
      expect(buttons[0]!.attributes('aria-pressed')).toBe('true');
      expect(buttons[0]!.attributes('aria-label')).toBe('Remove Merino crew sweater from wishlist');
      expect(wrapper.text()).not.toContain('Add to cart');
    });

    it('removes a product from the page and from the browser when its heart is pressed', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();

      await removeButtons(wrapper)[0]!.trigger('click');
      await flushPromises();

      expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
        'Merino crew sweater',
      ]);
      expect(JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? 'null')).toEqual([
        'merino-crew-sweater',
      ]);
    });

    /**
     * A removal takes the element the shopper was standing on out of the document, so focus has to
     * be put somewhere deliberate — the next card's own heart, the same rule `blocks/cart/Block.vue`
     * follows for a removed line. Without it focus falls back to `<body>` and a keyboard visitor
     * loses their place in the grid.
     */
    it('moves focus to the next card’s heart after a removal', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();
      const first = removeButtons(wrapper)[0]!;
      (first.element as HTMLElement).focus();

      await first.trigger('click');
      await flushPromises();

      const remaining = removeButtons(wrapper);
      expect(remaining).toHaveLength(1);
      expect(document.activeElement).toBe(remaining[0]!.element);
    });

    /** The end of the list going leaves no "next" card: focus falls back to the last one. */
    it('moves focus to the last remaining heart when the end of the list goes', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();

      await removeButtons(wrapper)[1]!.trigger('click');
      await flushPromises();

      const remaining = removeButtons(wrapper);
      expect(remaining).toHaveLength(1);
      expect(document.activeElement).toBe(remaining[0]!.element);
    });

    /** The last saved product going leaves no card at all, so focus lands on the empty state's
     *  heading — which is given the one `tabindex` it needs at that moment. */
    it('moves focus to the empty state’s heading when the last product goes', async () => {
      saved('merino-crew-sweater');
      const wrapper = await mountReady();

      await removeButtons(wrapper)[0]!.trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain(enUS.wishlist.emptyTitle);
      const heading = wrapper.get('[data-part="title"]');
      expect(heading.attributes('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(heading.element);
    });

    /** Nothing else on the page says out loud that the removal happened; the card simply vanishes.
     *  No toast — the product page's heart raises one because nothing there changes. */
    it('announces the removal politely, naming the product and what is left', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();
      const region = wrapper.get('[role="status"]');
      expect(region.text()).toBe('');

      await removeButtons(wrapper)[0]!.trigger('click');
      await flushPromises();

      expect(region.text()).toBe('Removed Speckled latte mug. 1 item in your wishlist.');
    });

    /**
     * The defect this guards: a polite live region is announced when its content *changes*, and the
     * announcement used to be one fixed sentence. Writing the same string in twice is one DOM
     * mutation, so the second and every later removal was silent — and this is the block's only
     * non-visual feedback for a heart press.
     */
    it('announces every removal, not only the first', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();
      const region = wrapper.get('[role="status"]');

      const changes: string[] = [];
      const observer = new MutationObserver(() => changes.push(region.text()));
      observer.observe(region.element, { childList: true, characterData: true, subtree: true });
      try {
        await removeButtons(wrapper)[0]!.trigger('click');
        await flushPromises();
        await removeButtons(wrapper)[0]!.trigger('click');
        await flushPromises();
      } finally {
        observer.disconnect();
      }

      // Two removals, two changes of the region's text — and neither reads like the other.
      expect(changes).toHaveLength(2);
      expect(changes[0]).toBe('Removed Speckled latte mug. 1 item in your wishlist.');
      expect(changes[1]).toBe('Removed Merino crew sweater. 0 items in your wishlist.');
    });

    /**
     * **A removal is a local filter, not a re-read.** The block holds every row it is showing, so
     * taking one card off asks the gateway nothing. It used to: the read was keyed on the live
     * wishlist ref, `remove()` assigns a new array, and `createGatewayResult` watches its sources —
     * so every heart press re-ran the whole batched products read.
     */
    it('asks the catalogue nothing when a card is removed', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const controlled = controlledStorefront();
      const wrapper = await mountReady(undefined, controlled.storefront);
      controlled.data.value = await demoRows('speckled-latte-mug', 'merino-crew-sweater');
      controlled.pending.value = false;
      controlled.loading.value = false;
      await nextTick();
      expect(removeButtons(wrapper)).toHaveLength(2);
      const afterMount = controlled.loads();

      await removeButtons(wrapper)[0]!.trigger('click');
      await flushPromises();

      expect(removeButtons(wrapper)).toHaveLength(1);
      expect(controlled.loads()).toBe(afterMount);
    });

    /**
     * The cost the re-read had beyond the request: `loading` going true put the list in its refresh
     * state for the round trip, so removing one of ten cards dimmed the other nine and marked the
     * list busy. Asserted on the tick after the click — the tick the treatment used to appear on.
     */
    it('leaves the remaining cards calm after a removal — nothing busy, nothing dimmed', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const controlled = controlledStorefront();
      const wrapper = await mountReady(undefined, controlled.storefront);
      controlled.data.value = await demoRows('speckled-latte-mug', 'merino-crew-sweater');
      controlled.pending.value = false;
      controlled.loading.value = false;
      await nextTick();
      expect(wrapper.get('ul[aria-label]').attributes('aria-busy')).toBeUndefined();

      await removeButtons(wrapper)[0]!.trigger('click');
      await nextTick();

      // Nothing re-read, so nothing is in flight — and `loading` is where the dim came from.
      expect(controlled.loading.value).toBe(false);
      expect(wrapper.get('ul[aria-label]').attributes('aria-busy')).toBeUndefined();
      expect(wrapper.html()).not.toContain('eldra-revalidating');
      expect(wrapper.html()).not.toContain('data-part="spinner"');
    });

    /** A handle that arrives from somewhere else — another tab's save — is still fetched. */
    it('asks for a handle it has no row for, and only for that one', async () => {
      saved('merino-crew-sweater');
      const controlled = controlledStorefront();
      await mountReady(undefined, controlled.storefront);
      controlled.data.value = await demoRows('merino-crew-sweater');
      controlled.pending.value = false;
      controlled.loading.value = false;
      await nextTick();
      const afterMount = controlled.loads();

      // What another tab's save leaves behind, and the event the browser then fires here.
      saved('speckled-latte-mug', 'merino-crew-sweater');
      window.dispatchEvent(new StorageEvent('storage', { key: WISHLIST_KEY }));
      await flushPromises();

      expect(controlled.loads()).toBe(afterMount + 1);
      expect(controlled.asked()).toContain('speckled-latte-mug');
    });

    /**
     * A handle saved before the product was deleted has no card — and is still in the stored list
     * afterwards. Nothing here can tell "this product is gone" from "we could not ask", and a read
     * that failed must never be what empties a shopper's wishlist.
     */
    it('draws no card for a handle the catalogue does not answer about, and keeps it saved', async () => {
      saved('merino-crew-sweater', 'deleted-since-it-was-saved');
      const wrapper = await mountReady();

      expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
        'Merino crew sweater',
      ]);
      expect(JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? 'null')).toEqual([
        'merino-crew-sweater',
        'deleted-since-it-was-saved',
      ]);
    });

    it('is axe-clean with a filled list', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const wrapper = await mountReady();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  /**
   * The two branches the module comment spends a paragraph on, and the only two the demo fixture
   * cannot hold still long enough to see.
   */
  describe('while the read is in flight, and when it fails', () => {
    it('draws one skeleton per saved product, and keeps the saved count in the heading', async () => {
      saved('speckled-latte-mug', 'merino-crew-sweater');
      const controlled = controlledStorefront();
      const wrapper = await mountReady(undefined, controlled.storefront);

      // Nothing answered yet: two saved products, no rows.
      expect(wrapper.findAll('ul[aria-hidden="true"] > li')).toHaveLength(2);
      expect(wrapper.find('ul[aria-label]').exists()).toBe(false);
      // The heading counts what is saved, not the zero cards on screen — so it does not count up.
      expect(wrapper.get('h1').text()).toContain('2 items');
      expect(wrapper.text()).not.toContain(enUS.wishlist.emptyTitle);

      controlled.data.value = await demoRows('speckled-latte-mug', 'merino-crew-sweater');
      controlled.pending.value = false;
      controlled.loading.value = false;
      await nextTick();

      expect(wrapper.find('ul[aria-hidden="true"]').exists()).toBe(false);
      expect(wrapper.findAll('ul[aria-label] > li')).toHaveLength(2);
    });

    it('shows the error state when the read fails with nothing to show', async () => {
      saved('merino-crew-sweater');
      const controlled = controlledStorefront();
      const wrapper = await mountReady(undefined, controlled.storefront);

      controlled.error.value = 'the gateway is unreachable';
      controlled.pending.value = false;
      controlled.loading.value = false;
      await nextTick();

      // `role="alert"` is `EmptyState`'s own `error` variant.
      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toContain(enUS.storefront.error);
      expect(wrapper.find('ul[aria-hidden="true"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain(enUS.wishlist.emptyTitle);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    /** A refresh that fails over cards the shopper can see keeps them — the block never regresses to
     *  an error state for something it is already showing (`StorefrontResult`'s own rule). */
    it('keeps the cards when a later read fails over them', async () => {
      saved('merino-crew-sweater');
      const controlled = controlledStorefront();
      const wrapper = await mountReady(undefined, controlled.storefront);
      controlled.data.value = await demoRows('merino-crew-sweater');
      controlled.pending.value = false;
      controlled.loading.value = false;
      await nextTick();
      expect(wrapper.findAll('ul[aria-label] > li')).toHaveLength(1);

      controlled.error.value = 'the gateway is unreachable';
      await nextTick();

      expect(wrapper.findAll('ul[aria-label] > li')).toHaveLength(1);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });
  });
});
