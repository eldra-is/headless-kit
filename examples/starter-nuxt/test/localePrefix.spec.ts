// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { createEldraLocaleState, type EldraLocaleState } from '@eldrajs/theme-vue';
import { localeHref, localePathFor, resolveLocaleRouting } from '@eldrajs/theme-nuxt/locales';
import { Button, Link } from '@eldrajs/ui';
import EldraRouterLink from '../app/components/EldraRouterLink.vue';
import { mountOptions } from './support/mountBlock';
import NavigationBlock from '../blocks/navigation/Block.vue';
import SearchBlock from '../blocks/search/Block.vue';
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
