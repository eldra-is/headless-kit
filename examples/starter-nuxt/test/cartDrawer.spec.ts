// @vitest-environment jsdom
//
// The cart drawer belongs to the theme, not to a page: `app/app.vue` mounts exactly one, beside the
// `Toaster` whose own doc comment makes the same "exactly one host" argument, so a shopper can open
// their cart from the header on every route. Before this, the drawer only existed where an author
// had placed a `cart` block in its `drawer` variant — nobody does — so every bag click left the page
// for `/cart`.
//
// This is the one spec that mounts the app shell itself. Everything it asserts is about the shell
// and a page agreeing with each other (one drawer between them, a bag that opens it, a `/cart` page
// that still renders the page variant beside the hosted drawer), which neither a block spec nor a
// page spec can see. `app/app.vue` reads `useRoute()`/`useHead()` as bare Nuxt auto-imports, so both
// are stubbed before that module is imported. The route stub is a plain reactive object this file
// writes to, which is how a navigation is driven here: `app.vue` watches `route.fullPath`, so moving
// it is exactly what the router does to the shell when the shopper follows any link. `<NuxtPage>` is
// registered per mount as whatever stands in for the page.
import { defineComponent, h, reactive, type Component } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEldraLinkState, createEldraPreviewState, ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from './support/axe';
import { mountOptions } from './support/mountBlock';
import CartBlock from '../blocks/cart/Block.vue';
import NavigationBlock from '../blocks/navigation/Block.vue';
import navigationMock from '../blocks/navigation/mock.json';
import cartPageFixture from '../pages/cart.page.json';
import { createDemoStorefront, DEMO_CART_LINES } from '../app/storefront/demo';
import { STOREFRONT_KEY, type StorefrontSource } from '../app/storefront/types';
import { enUS } from '../app/i18n/en-US';

vi.stubGlobal('useHead', () => {});

/** The shell's `useRoute()`. One object for the file; every mount reads the same one. */
const route = reactive({ fullPath: '/' });
vi.stubGlobal('useRoute', () => route);

const { default: App } = await import('../app/app.vue');

/** What an author's own `cart` block looks like on a page: the `drawer` variant, placed in the
 *  layout, with no idea that the theme already hosts one. */
const AUTHORED_DRAWER_ENTRY = { id: 'authored-cart', data: { variant: 'drawer' } };

const EmptyPage = defineComponent({
  name: 'EmptyPageStub',
  setup: () => () => h('main', { id: 'main' }, 'A page with no cart block on it'),
});

const HeaderPage = defineComponent({
  name: 'HeaderPageStub',
  setup: () => () => [
    h(NavigationBlock as never, { entry: { id: 'header', data: navigationMock } }),
    h('main', { id: 'main' }, 'A page'),
  ],
});

/**
 * The seeded `/cart` page, as the catch-all renders it: the `page`-variant `cart` block from
 * `pages/cart.page.json` inside `<main id="main">`. `/cart` was a code route under `app/pages/`
 * until it became a page document, and the shell still has to agree with it about the one drawer
 * between them — so the stand-in carries the seed's own data rather than an invented entry.
 */
const SEEDED_CART_ENTRY = {
  id: 'seeded-cart',
  data: cartPageFixture.blocks.find((block) => block.apiId === 'cart')!.data,
};

const CartPage = defineComponent({
  name: 'CartPageStub',
  setup: () => () =>
    h('main', { id: 'main' }, [h(CartBlock as never, { entry: SEEDED_CART_ENTRY })]),
});

const AuthoredCartPage = defineComponent({
  name: 'AuthoredCartPageStub',
  setup: () => () =>
    h('main', { id: 'main' }, [h(CartBlock as never, { entry: AUTHORED_DRAWER_ENTRY })]),
});

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
  // `@eldrajs/ui`'s modal scroll lock is module-level.
  document.documentElement.style.overflow = '';
  document.body.innerHTML = '';
  route.fullPath = '/';
});

interface ShellOptions {
  storefront?: StorefrontSource;
  editing?: boolean;
}

/** The real `app/app.vue`, with `page` standing in for `<NuxtPage>`. */
async function mountShell(
  page: Component,
  options: ShellOptions = {}
): Promise<{ wrapper: VueWrapper; storefront: StorefrontSource }> {
  const storefront = options.storefront ?? createDemoStorefront();
  const base = mountOptions({ entry: { id: 'unused', data: {} } });
  const provide: Record<symbol, unknown> = {
    ...base.global.provide,
    [STOREFRONT_KEY]: storefront,
  };
  if (options.editing === true) {
    // The same shape `blocks/navigation/__tests__/Block.spec.ts` builds for its editor assertions:
    // `mountOptions()` always provides a read-only, inactive preview.
    provide[ELDRA_KEY] = {
      client: {},
      designTokens: { colors: {} },
      links: createEldraLinkState(),
      preview: Object.assign(createEldraPreviewState(), {
        active: true,
        mode: 'edit',
        locale: 'en-US',
      }),
    };
  }
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      ...base.global,
      provide,
      // `<NuxtPage>` is a Nuxt global; an unregistered name resolves to nothing at all.
      components: { ...base.global.components, NuxtPage: page },
      // The cart's line list is a real `<TransitionGroup>` on a page; test-utils stubs it by
      // default, which breaks the `<ul>`/`<li>` semantics axe checks.
      stubs: { ...base.global.stubs, transition: false, 'transition-group': false },
    },
  });
  trackedWrappers.push(wrapper);
  // The cart store loads itself on creation (`createCartStore` → `ops.init()`), one microtask out.
  await flushPromises();
  return { wrapper, storefront };
}

/** Every `<dialog>` in the document — the header's menu drawer is one too, so the cart's own is
 *  picked out by the heading it is labelled by. */
function dialogs(): HTMLDialogElement[] {
  return [...document.querySelectorAll('dialog')];
}

function cartDialogs(): HTMLDialogElement[] {
  return dialogs().filter((dialog) => {
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const label = labelledBy === null ? null : document.getElementById(labelledBy);
    return (label?.textContent ?? '').includes(enUS.cart.title);
  });
}

/** The header's bag, in either of its two forms (a `<button>` once a drawer is live, an
 *  `<a href="/cart">` until then). */
function bag(wrapper: VueWrapper) {
  return wrapper
    .findAll('a, button')
    .find((el) => el.attributes('aria-label')?.startsWith('Cart'))!;
}

describe('the theme hosts one cart drawer', () => {
  it('mounts it on a page with no cart block at all, and tells the header it is there', async () => {
    const { storefront } = await mountShell(EmptyPage);

    expect(storefront.cart.drawerHosted.value).toBe(true);
    expect(storefront.cart.drawerAvailable.value).toBe(true);
    expect(cartDialogs()).toHaveLength(1);
    // Closed: the shell adds no visible markup to a page that never opens the cart.
    expect(cartDialogs()[0]?.hasAttribute('open')).toBe(false);
  });

  it('opens from the header bag, with the live count, and closes on Esc back onto the bag', async () => {
    const { wrapper, storefront } = await mountShell(HeaderPage, {
      storefront: createDemoStorefront({ cartLines: DEMO_CART_LINES }),
    });

    // A button, not a link: no navigation, so the shopper keeps the page they were on. And in that
    // form it is a dialog trigger, announced like every other overlay trigger in the header.
    const control = bag(wrapper);
    expect(control.element.tagName).toBe('BUTTON');
    expect(control.attributes('href')).toBeUndefined();
    expect(control.attributes('aria-haspopup')).toBe('dialog');

    control.element.focus();
    await control.trigger('click');
    await flushPromises();

    const [drawer] = cartDialogs();
    expect(drawer?.hasAttribute('open')).toBe(true);
    expect(storefront.cart.drawerOpen.value).toBe(true);
    // The count the store reports (1 + 2 + 1), beside the drawer's title.
    const titleId = drawer!.getAttribute('aria-labelledby')!;
    expect(document.getElementById(titleId)?.textContent).toContain('4');
    // The deep link stays reachable from inside the drawer.
    expect([...drawer!.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toContain(
      '/cart'
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise((resolve) => setTimeout(resolve));
    await flushPromises();

    expect(cartDialogs()[0]?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(control.element);
  });

  it('closes on any navigation out of it, whichever destination the shopper took', async () => {
    // A page-level drawer was unmounted by the navigation that left it; the shell's is not, so an
    // open one would sit over the page the shopper just went to — that page `inert` and not
    // scrolling, until they found Escape.
    const { storefront } = await mountShell(HeaderPage, {
      storefront: createDemoStorefront({ cartLines: DEMO_CART_LINES }),
    });

    storefront.cart.drawerOpen.value = true;
    await flushPromises();
    const drawer = cartDialogs()[0]!;
    expect(drawer.hasAttribute('open')).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');

    // Every way out of the drawer is an ordinary same-site router link with no close handler of its
    // own — a line's product title, Check out while the checkout is same-site, View cart — which is
    // why the rule has to live where the drawer does rather than on each of them.
    const hrefs = [...drawer.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/cart');
    expect(hrefs).toContain('/checkout/demo-cart');
    expect(hrefs.filter((href) => href?.startsWith('/products/')).length).toBeGreaterThan(0);

    // What the router does to the shell when any one of them is followed — back/forward included,
    // since the router turns a `popstate` into the same route change.
    route.fullPath = '/products/speckled-latte-mug';
    await flushPromises();

    expect(storefront.cart.drawerOpen.value).toBe(false);
    expect(cartDialogs()[0]?.hasAttribute('open')).toBe(false);
    // The new page is neither inert nor scroll-locked behind a dialog nobody closed.
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('leaves an authored drawer-variant cart block with no drawer of its own', async () => {
    const { storefront } = await mountShell(AuthoredCartPage);

    expect(cartDialogs()).toHaveLength(1);
    storefront.cart.drawerOpen.value = true;
    await flushPromises();
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
  });

  it('still draws its own drawer where nothing hosts one (Storybook, a block spec)', async () => {
    // The control for the assertion above: the block itself is unchanged, it only defers to a host.
    const base = mountOptions({ entry: AUTHORED_DRAWER_ENTRY });
    const wrapper = mount(CartBlock as never, {
      attachTo: document.body,
      props: { entry: AUTHORED_DRAWER_ENTRY },
      global: base.global,
    });
    trackedWrappers.push(wrapper);
    await flushPromises();

    expect(cartDialogs()).toHaveLength(1);
  });

  it('says so in the editor, where that block renders its placeholder and nothing else', async () => {
    const { wrapper } = await mountShell(AuthoredCartPage, { editing: true });

    expect(wrapper.text()).toContain(enUS.cart.drawerHintHosted);
    expect(wrapper.text()).not.toContain(enUS.cart.drawerHintHelp);
    // Exactly one hint: the theme's own host is not a block on the page and shows none.
    expect(
      wrapper.findAll('[data-part="label"]').filter((el) => el.text() === enUS.cart.drawerHintLabel)
    ).toHaveLength(1);
    expect(cartDialogs()).toHaveLength(1);
  });

  it('keeps the /cart page rendering the page variant beside it, axe-clean', async () => {
    const { wrapper } = await mountShell(CartPage);

    const heading = wrapper.get('main#main h1');
    expect(heading.text()).toContain(enUS.cart.title);
    expect(wrapper.get('main#main').text()).toContain(enUS.cart.emptyFallbackTitle);
    expect(cartDialogs()).toHaveLength(1);
    // The one document that holds a `page`-variant cart and the hosted drawer at once — the case
    // this arrangement created, and the mount no other spec makes.
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('is axe-clean with the drawer closed and with it open', async () => {
    const { storefront } = await mountShell(HeaderPage, {
      storefront: createDemoStorefront({ cartLines: DEMO_CART_LINES }),
    });
    expect(await axe(document.body)).toHaveNoViolations();

    storefront.cart.drawerOpen.value = true;
    await flushPromises();
    expect(cartDialogs()[0]?.hasAttribute('open')).toBe(true);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
