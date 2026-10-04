// @vitest-environment jsdom
//
// `app/pages/wishlist.vue` is the theme's own `/wishlist` route — the one place a shopper can see
// what the heart on a product page saved, and the destination both that page's toast and the
// header's heart name.
//
// Like `test/cartPage.spec.ts` and `test/searchPage.spec.ts`, the page reads `useHead()` as a bare
// Nuxt auto-import, so it is installed with `vi.stubGlobal` before the module is imported.
// Everything else is the real thing: the demo catalogue, the real wishlist store with jsdom's own
// `localStorage` behind it, and the theme's own messages.
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from './support/axe';
import { mountOptions } from './support/mountBlock';
import { enUS } from '../app/i18n/en-US';

const heads: Array<Record<string, unknown>> = [];
vi.stubGlobal('useHead', (input: unknown) => {
  heads.push(
    (typeof input === 'function' ? (input as () => Record<string, unknown>)() : input) ?? {}
  );
});

const { default: WishlistPage } = await import('../app/pages/wishlist.vue');

const WISHLIST_KEY = 'eldra.storefront.wishlist';

/** What a visitor's browser holds before the page is opened — the only input this page has. */
function saved(...handles: string[]): void {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(handles));
}

/**
 * The page takes no props; it needs only the provides a block does. `attachTo` because the focus
 * assertions below are about real focus movement, and `.focus()` on a detached element does
 * nothing — the same reason `test/cartDrawer.spec.ts` attaches.
 */
function mountWishlistPage() {
  const base = mountOptions({ entry: { id: 'unused', data: {} } });
  return mount(WishlistPage, { global: base.global, attachTo: document.body });
}

/** Mounted, hydrated from storage, and with the catalogue read settled. */
async function mountReady() {
  const wrapper = mountWishlistPage();
  await flushPromises();
  await nextTick();
  return wrapper;
}

function removeButtons(wrapper: Awaited<ReturnType<typeof mountReady>>) {
  return wrapper.findAll('button[aria-pressed]');
}

afterEach(() => {
  localStorage.clear();
  heads.length = 0;
  document.body.innerHTML = '';
});

describe('app/pages/wishlist.vue', () => {
  describe('with nothing saved', () => {
    /**
     * What `wishlist/index.html` carries in the artifact a static host serves, and what the
     * browser's first render of that file has to be: one file answers every visitor, and what each
     * of them saved is in their own browser (`app/composables/useWishlist.ts`).
     */
    it('renders the empty state with its one next step', async () => {
      const wrapper = await mountReady();

      expect(wrapper.get('h1').text()).toContain(enUS.wishlist.title);
      expect(wrapper.get('h1').text()).toContain('0 items');
      expect(wrapper.text()).toContain(enUS.wishlist.emptyTitle);
      expect(wrapper.text()).toContain(enUS.wishlist.emptyText);
      // `/` always exists, which is what a theme can promise.
      const link = wrapper.get('a[href="/"]');
      expect(link.text()).toBe(enUS.wishlist.continueShopping);
      expect(wrapper.findAll('article').length).toBe(0);
    });

    it('puts the page inside the `#main` landmark the skip link targets', async () => {
      const wrapper = await mountReady();
      const main = wrapper.get('main');
      expect(main.attributes('id')).toBe('main');
      expect(main.text()).toContain(enUS.wishlist.emptyTitle);
    });

    it('names the tab after the page', async () => {
      await mountReady();
      expect(heads.at(-1)).toEqual({ title: enUS.wishlist.title });
    });

    it('is axe-clean', async () => {
      const wrapper = await mountReady();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('with saved products', () => {
    /**
     * The whole point of the page: the stored handles are turned into real product cards — titles,
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
    it('announces the removal politely', async () => {
      saved('merino-crew-sweater');
      const wrapper = await mountReady();
      const region = wrapper.get('[role="status"]');
      expect(region.text()).toBe('');

      await removeButtons(wrapper)[0]!.trigger('click');
      await flushPromises();

      expect(region.text()).toBe(enUS.wishlist.removed);
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
});
