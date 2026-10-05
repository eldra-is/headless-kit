import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import type { EldraContext } from '@eldrajs/theme-vue';
import {
  createNuxtEldraLocaleState,
  localeAlternates,
  type LocaleRouter,
} from '../src/runtime/localeState';
import { resolveLocaleRouting } from '../src/runtime/locales';

const TWO = { default: 'en-US', supported: ['en-US', 'is-IS'] };

/**
 * The one field of the preview slice this state reads. Built here rather than through theme-vue's
 * `createEldraPreviewState`, because importing that package's root pulls in the Vite plugin's
 * `virtual:eldra/*` ids, which exist only inside a real theme build.
 */
function previewState(): EldraContext['preview'] {
  return reactive({ locale: null }) as unknown as EldraContext['preview'];
}

function router(path: string): LocaleRouter & { pushed: string[] } {
  const pushed: string[] = [];
  return {
    pushed,
    currentRoute: { value: { path } },
    push: (to: string) => {
      pushed.push(to);
      return Promise.resolve();
    },
  };
}

function state(path: string, locales = TWO, override?: string) {
  const nav = router(path);
  const preview = previewState();
  const locale = createNuxtEldraLocaleState(
    resolveLocaleRouting(locales, override),
    preview,
    () => nav
  );
  return { locale, preview, nav };
}

describe('createNuxtEldraLocaleState', () => {
  it('names the locale the path is in, and the whole set', () => {
    const unprefixed = state('/about');
    expect(unprefixed.locale.active).toBe('en-US');
    expect(unprefixed.locale.defaultLocale).toBe('en-US');
    expect(unprefixed.locale.supported).toEqual(['en-US', 'is-IS']);

    expect(state('/is-IS/about').locale.active).toBe('is-IS');
    // The trailing slash a static host redirects to is the same route (`routePath.ts`), so the
    // prefix has to survive it — otherwise every link on a redirected page loses its language.
    expect(state('/is-IS/about/').locale.active).toBe('is-IS');
    expect(state('/is-IS').locale.active).toBe('is-IS');
  });

  it('answers the one-unprefixed-site answer for an organisation with no locales', () => {
    const { locale } = state('/about', null as never);
    expect(locale.active).toBeNull();
    expect(locale.supported).toEqual([]);
    expect(locale.path('/products/mug')).toBe('/products/mug');
  });

  it('lets a Studio preview’s locale win over the path’s', () => {
    // The editor is looking at one locale of a draft and says which; the preview frame's own path
    // need not name it at all. Before the bridge says hello the path still answers, which is what
    // makes the first render of a live preview correct for the URL it is on.
    const { locale, preview } = state('/about');
    expect(locale.active).toBe('en-US');
    preview.locale = 'is-IS';
    expect(locale.active).toBe('is-IS');
    // A blank from the bridge is not a locale — it must not shadow the path's.
    preview.locale = '';
    expect(locale.active).toBe('en-US');
  });

  it('prefixes a destination for the active locale, and only then', () => {
    expect(state('/is-IS/about').locale.path('/cart')).toBe('/is-IS/cart');
    expect(state('/about').locale.path('/cart')).toBe('/cart');
    // Already prefixed: the rewrite is idempotent, because a destination passes through both
    // `useEldraLink` and the theme's router link.
    expect(state('/is-IS/about').locale.path('/is-IS/cart')).toBe('/is-IS/cart');
  });

  it('spells the page a visitor is on in another language, and goes there', () => {
    const icelandic = state('/is-IS/products/mug');
    expect(icelandic.locale.switchPath('en-US')).toBe('/products/mug');
    expect(icelandic.locale.switchPath('is-IS')).toBe('/is-IS/products/mug');

    const english = state('/products/mug');
    expect(english.locale.switchPath('is-IS')).toBe('/is-IS/products/mug');
    english.locale.select('is-IS');
    expect(english.nav.pushed).toEqual(['/is-IS/products/mug']);
    // The default locale has no prefix, so switching back is a navigation to the bare path.
    icelandic.locale.select('en-US');
    expect(icelandic.nav.pushed).toEqual(['/products/mug']);
  });

  it('reads the router lazily, so plugin ordering cannot decide the answer', () => {
    // This state is built in a plugin that may run before Nuxt installs the router. Nothing reads
    // the locale during plugin setup, and by the time anything does the router is there.
    const preview = previewState();
    let nav: LocaleRouter | undefined;
    const locale = createNuxtEldraLocaleState(resolveLocaleRouting(TWO), preview, () => nav);
    expect(locale.active).toBe('en-US');
    nav = router('/is-IS/about');
    expect(locale.active).toBe('is-IS');
  });
});

describe('localeAlternates', () => {
  it('names every locale’s spelling of the page, plus the unprefixed one', () => {
    expect(localeAlternates('/about', resolveLocaleRouting(TWO))).toEqual([
      { rel: 'alternate', hreflang: 'en-US', href: '/about' },
      { rel: 'alternate', hreflang: 'is-IS', href: '/is-IS/about' },
      { rel: 'alternate', hreflang: 'x-default', href: '/about' },
    ]);
    // The same set whichever spelling the crawler arrived at, so either one leads to the other.
    expect(localeAlternates('/is-IS/about', resolveLocaleRouting(TWO))).toEqual(
      localeAlternates('/about', resolveLocaleRouting(TWO))
    );
    expect(localeAlternates('/', resolveLocaleRouting(TWO))[1]).toEqual({
      rel: 'alternate',
      hreflang: 'is-IS',
      href: '/is-IS',
    });
  });

  it('emits none for a site with one locale or none', () => {
    // An alternate pointing at the page it is on says nothing.
    expect(localeAlternates('/about', resolveLocaleRouting(null))).toEqual([]);
    expect(
      localeAlternates('/about', resolveLocaleRouting({ default: 'is-IS', supported: ['is-IS'] }))
    ).toEqual([]);
  });
});
