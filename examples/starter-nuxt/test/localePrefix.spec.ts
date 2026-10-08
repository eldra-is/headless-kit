// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createEldraLocaleState, ELDRA_KEY, type EldraLocaleState } from '@eldrajs/theme-vue';
import { localeHref, localePathFor, resolveLocaleRouting } from '@eldrajs/theme-nuxt/locales';
import { Button, Link } from '@eldrajs/ui';
import EldraRouterLink from '../app/components/EldraRouterLink.vue';
import { mountOptions } from './support/mountBlock';
import isIS from '../i18n/is-IS.json';
import { STOREFRONT_KEY } from '../app/storefront/types';
import type { StorefrontResult, StorefrontSearchResponse } from '../app/storefront/types';
import { createDemoStorefront } from '../app/storefront/demo';
import { hydrateBlock, hydrationWarnings, renderBlockHtml } from './support/hydrate';
import FooterBlock from '../blocks/footer/Block.vue';
import NavigationBlock from '../blocks/navigation/Block.vue';
import SearchBlock from '../blocks/search/Block.vue';
import footerMock from '../blocks/footer/mock.json';
import navigationMock from '../blocks/navigation/mock.json';
import searchMock from '../blocks/search/mock.json';

/**
 * **Nothing on a page in a prefixed locale may point back out of it.** The theme's links come from
 * three different places — the router-link component every internal destination passes through, a
 * `link` field resolved by `useEldraLink()`, and a handful of hard-coded theme routes (`/cart`,
 * `/wishlist`, `/search`) — and a visitor reading `/is-IS/...` who follows any of them must stay in
 * Icelandic. One miss is a visitor silently thrown back into the default language mid-visit, which
 * no other spec in this suite can see: every block spec runs on a single-locale site, where every
 * one of these rules is the identity.
 *
 * The rule itself is `@eldrajs/theme-nuxt`'s (`localeHref`), imported rather than restated: a
 * locale state written by hand here could agree with the test and disagree with the site.
 */
const ROUTING = resolveLocaleRouting({ default: 'en-US', supported: ['en-US', 'is-IS'] });

/** The locale state a page served at `/is-IS/...` carries, built from the real routing rules. */
function icelandic(path = '/is-IS/products/ash-glaze-mug'): Partial<EldraLocaleState> {
  return {
    active: 'is-IS',
    defaultLocale: 'en-US',
    supported: ROUTING.supported,
    path: (href: string) => localeHref(href, 'is-IS', ROUTING),
    switchPath: (locale: string) => localePathFor(path, locale, ROUTING),
  };
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? '');
}

describe('EldraRouterLink', () => {
  const mountLink = (to: string, locales: Partial<EldraLocaleState>): string =>
    mount(
      defineComponent({
        setup() {
          return () => h(EldraRouterLink, { to }, () => 'go');
        },
      }),
      { global: mountOptions({ entry: { id: 'e', data: {} } }, { locales }).global }
    ).html();

  it('puts the active locale’s prefix on every destination it routes', () => {
    expect(mountLink('/cart', icelandic())).toContain('href="/is-IS/cart"');
    expect(mountLink('/', icelandic())).toContain('href="/is-IS"');
    expect(mountLink('/search?q=mug', icelandic())).toContain('href="/is-IS/search?q=mug"');
  });

  it('leaves a destination that is already prefixed alone', () => {
    // `useEldraLink()` prefixes a resolved `link` field and then hands it here as `as`, so this
    // component sees an href that has been through the rule once already. A second prefix would
    // produce `/is-IS/is-IS/...`, which nothing on the site answers.
    expect(mountLink('/is-IS/cart', icelandic())).toContain('href="/is-IS/cart"');
  });

  it('is the identity on a single-locale site, in Storybook and in tests', () => {
    expect(mountLink('/cart', createEldraLocaleState())).toContain('href="/cart"');
  });
});

/**
 * `mock.json` names a collection by handle, because a theme cannot know an organisation's catalog
 * ids; Core rewrites those to ids when it seeds the entry and the site resolves each id to a slug
 * before rendering. This is the smaller sibling of `blocks/navigation/__tests__/Block.spec.ts`'s
 * own `resolveTargets`, so the header here renders the hrefs a real page produces — which is the
 * only way the `useEldraLink()` half of the rule is under test at all.
 */
const COLLECTION_TEMPLATE = {
  id: 'rt-collection',
  data: {
    schemaApiId: 'catalog:collection',
    routePattern: '/collections/:slug',
    slugField: 'slug',
  },
};

interface SeedLink {
  kind?: string;
  target?: { _type: string; slug?: string; id?: string };
  label?: string;
  children?: SeedLink[];
}

function resolveTargets(data: Record<string, unknown>): {
  data: Record<string, unknown>;
  links: { templates: (typeof COLLECTION_TEMPLATE)[]; targets: Map<string, unknown> };
} {
  const targets = new Map<string, unknown>();
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (typeof value !== 'object' || value === null) return value;
    const link = value as SeedLink;
    const slug = link.target?.slug;
    if (link.target !== undefined && slug !== undefined) {
      const id = `id-${slug}`;
      targets.set(`${link.target._type}:${id}`, { slug, title: link.label });
      return {
        ...link,
        target: { _type: link.target._type, id },
        ...(link.children ? { children: link.children.map(rewrite) } : {}),
      };
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        rewrite(nested),
      ])
    );
  };
  return {
    data: rewrite(data) as Record<string, unknown>,
    links: { templates: [COLLECTION_TEMPLATE], targets },
  };
}

describe('the header’s own destinations', () => {
  it('keeps the bag, the heart and every resolved navigation link in the active locale', () => {
    const resolved = resolveTargets(navigationMock as Record<string, unknown>);
    const wrapper = mount(NavigationBlock, {
      ...mountOptions(
        { entry: { id: 'nav', data: resolved.data } },
        { links: resolved.links, locales: icelandic() }
      ),
    });

    const internal = hrefs(wrapper.html()).filter(
      (href) => href.startsWith('/') && href !== '#main'
    );
    expect(internal.length).toBeGreaterThan(0);
    // `/wishlist` is in the bar on every variant but `minimal`, and the bag is an `<a href>` until
    // the shell claims the drawer — which is exactly the prerendered state a static host serves.
    expect(internal).toContain('/is-IS/wishlist');
    expect(internal).toContain('/is-IS/cart');
    // And the author's own navigation row, resolved through `useEldraLink()` and then routed —
    // prefixed exactly once by the two rules together.
    expect(internal).toContain('/is-IS/collections/knitwear');
    for (const href of internal) {
      expect(href, href).toMatch(/^\/is-IS(\/|$|\?)/);
    }
  });
});

/**
 * **The header's search is three destinations, and `EldraRouterLink` can reach none of them.**
 * `SearchBar`/`SearchModal` render a real `<form method="get" :action>` (the no-JavaScript submit),
 * the overlay's "See all N results" row is built by the library as `${action}?q=…`, and every
 * result row is a plain `<a>` in a panel that takes no `linkAs`. All three used to point at the
 * default language's `/search` and `/products/…` from a prefixed page — the header search is the
 * common way into a catalogue, and `showSearch: true` with `searchStyle: 'icon'` is the shipped
 * default, so this was the likeliest way of all to be thrown back into English mid-visit.
 */
describe('the header’s search', () => {
  const QUERY = 'mug';
  const ANSWER: StorefrontSearchResponse = {
    query: QUERY,
    total: 1,
    products: [
      {
        handle: 'ash-glaze-mug',
        title: 'Ash glaze mug',
        url: '/products/ash-glaze-mug',
        featuredImage: null,
        price: { amount: 42, compareAt: null },
        stock: 'in',
        available: true,
        productId: 'ash-glaze-mug',
      },
    ],
    articles: [{ title: 'On glazes', href: '/journal/on-glazes' }],
    pages: [{ title: 'Care', href: '/pages/care' }],
    suggestion: null,
  };

  /** The header with a search answer already in hand, on a page served under `/is-IS`. */
  function mountHeader(data: Record<string, unknown>) {
    const base = mountOptions({ entry: { id: 'nav', data } }, { locales: icelandic() });
    const result: StorefrontResult<StorefrontSearchResponse> = {
      data: ref(ANSWER) as Ref<StorefrontSearchResponse | null>,
      pending: ref(false),
      loading: ref(false),
      revalidating: ref(new Set()),
      error: ref(null),
      refresh: async () => {},
    };
    return mount(NavigationBlock, {
      attachTo: document.body,
      ...base,
      global: {
        ...base.global,
        provide: {
          ...base.global.provide,
          [STOREFRONT_KEY]: { ...createDemoStorefront(), search: { run: () => result } },
        },
      },
    });
  }

  it('submits the overlay’s form into the active locale, and offers its rows there', async () => {
    const wrapper = mountHeader(navigationMock as Record<string, unknown>);
    try {
      // The search trigger, not the menu drawer's: both are `aria-haspopup="dialog"`. Its label is
      // Icelandic here, which is itself part of the rule under test one layer up.
      await wrapper.get(`button[aria-label="${isIS.header.search}"]`).trigger('click');
      await nextTick();

      // 1. The native submit path.
      const form = document.querySelector('dialog[open] form[role="search"]');
      expect(form?.getAttribute('action')).toBe('/is-IS/search');

      // The panel only has rows for a query it has an answer for, so type the one `ANSWER` is
      // about — the same precondition `blocks/navigation/__tests__/Block.spec.ts` sets up.
      const input = wrapper.get('dialog[open] input[type="search"]');
      await input.setValue(QUERY);
      await nextTick();

      const rows = [...document.querySelectorAll<HTMLElement>('[role="option"][href]')];
      const hrefs = rows.map((row) => row.getAttribute('href') ?? '');
      expect(hrefs.length).toBeGreaterThan(1);

      // 2. The library's own "See all N results" row, built from the same `action`.
      expect(hrefs[hrefs.length - 1]).toBe(`/is-IS/search?q=${QUERY}`);

      // 3. Every result row the storefront supplied — a product, an article and a page.
      expect(hrefs).toContain('/is-IS/products/ash-glaze-mug');
      expect(hrefs).toContain('/is-IS/journal/on-glazes');
      expect(hrefs).toContain('/is-IS/pages/care');
      for (const href of hrefs) {
        expect(href, `${href} leaves the is-IS site`).toMatch(/^\/is-IS(\/|$|\?)/);
      }
    } finally {
      wrapper.unmount();
    }
  });

  it('submits the inline field into the active locale too', () => {
    // `searchStyle: 'field'` renders `SearchBar` in the bar itself, with its own `<form action>`.
    const wrapper = mountHeader({
      ...(navigationMock as Record<string, unknown>),
      searchStyle: 'field',
    });
    try {
      const actions = wrapper
        .findAll('form[role="search"]')
        .map((form) => form.attributes('action'));
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) expect(action).toBe('/is-IS/search');
    } finally {
      wrapper.unmount();
    }
  });
});

describe('the search block’s results destination', () => {
  it('submits the no-JavaScript form into the active locale', () => {
    // `SearchBar`'s `action` is a real `<form action>`: a document navigation the router never
    // sees, so `EldraRouterLink` cannot be what prefixes it.
    const wrapper = mount(SearchBlock, {
      ...mountOptions(
        { entry: { id: 'search', data: searchMock as Record<string, unknown> } },
        { locales: icelandic('/is-IS/search') }
      ),
    });

    expect(wrapper.find('form').attributes('action')).toBe('/is-IS/search');
    for (const href of hrefs(wrapper.html()).filter((value) => value.startsWith('/'))) {
      expect(href, href).toMatch(/^\/is-IS(\/|$|\?)/);
    }
  });
});

describe('@eldrajs/ui’s own link wrappers', () => {
  it('route through this theme’s component, so they inherit the rule', () => {
    // `Link`/`Button` hand their `href` to whatever `as` they are given, as `to`. That is the
    // whole reason one component can carry the locale rule for the entire theme.
    const wrapper = mount(
      defineComponent({
        setup() {
          return () => [
            h(Link, { href: '/journal', as: EldraRouterLink }, () => 'Journal'),
            h(Button, { href: '/cart', as: EldraRouterLink }, () => 'Cart'),
          ];
        },
      }),
      { global: mountOptions({ entry: { id: 'e', data: {} } }, { locales: icelandic() }).global }
    );

    expect(hrefs(wrapper.html())).toEqual(['/is-IS/journal', '/is-IS/cart']);
  });
});

/**
 * **A prefixed page has to hydrate into the markup it was prerendered as.** The language switcher
 * and every prefixed href are rendered on the server and computed again in the browser, and
 * anything that comes out differently repaints the page on arrival.
 *
 * Both halves here run under **one** ICU, so what this compares is the theme's own logic — the
 * switcher's value and option set, the prefixing of every destination — and not the test runner's
 * locale data. The other hazard, a label whose text depends on *whose* ICU answered, is why
 * `useEldraLocale().name` is resolved on the server and carried in the payload instead; no
 * single-runtime test can see that one, and `test/prerenderRefresh.browser.spec.ts` carries the
 * note about it.
 */
describe('a prefixed page hydrates into what it was rendered as', () => {
  const twoLocales = (): Partial<EldraLocaleState> => ({
    ...icelandic(),
    name: (tag: string) => new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag,
  });

  it.each([
    ['footer', FooterBlock, footerMock],
    ['header', NavigationBlock, navigationMock],
  ])('%s', async (_name, component, mock) => {
    const base = mountOptions({ entry: { id: 'b', data: {} } }, { locales: twoLocales() });
    const provides = { [ELDRA_KEY]: base.global.provide[ELDRA_KEY] } as Record<symbol, unknown>;
    const entry = { id: 'b', data: mock as Record<string, unknown> };

    const html = await renderBlockHtml(component, entry, provides);
    const run = hydrateBlock(component, entry, html, provides);

    expect(hydrationWarnings(run)).toEqual([]);
    expect(run.firstPaint).toBe(run.expected);
  });
});
