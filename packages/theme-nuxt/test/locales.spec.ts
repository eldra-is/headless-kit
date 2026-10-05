import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeLocaleForPath,
  localeForPath,
  localeHref,
  localePathFor,
  localePrefixOf,
  LOCALES_READ_FAILED_WARNING,
  READ_TIMEOUT_MS,
  readStoreLocales,
  resolveLocaleRouting,
  resolveStoreLocales,
  stripLocalePrefix,
  type StoreLocalesReader,
} from '../src/runtime/locales';

/** An SDK client narrowed to the one method this read calls. */
function reader(getLocales: StoreLocalesReader['features']['getLocales']): StoreLocalesReader {
  return { features: { getLocales } };
}

const TWO = { default: 'en-US', supported: ['en-US', 'is-IS'] };

afterEach(() => {
  vi.useRealTimers();
});

describe('readStoreLocales', () => {
  it('passes the organisation’s locales through, silently', async () => {
    const warn = vi.fn();

    await expect(
      readStoreLocales(
        reader(async () => TWO),
        warn
      )
    ).resolves.toEqual(TWO);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing about an organisation that publishes none', async () => {
    // Deliberately unlike `commerce`, which warns for its own absent value because prices then
    // render with no symbol. Nothing is lost here — one unprefixed site is the ordinary state of
    // most stores — and a line every single-locale build printed would only teach its reader to
    // ignore build warnings.
    const warn = vi.fn();

    await expect(
      readStoreLocales(
        reader(async () => null),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('makes no request, and no noise, without gateway credentials', async () => {
    const warn = vi.fn();

    await expect(readStoreLocales(null, warn)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('names the cause when the read itself failed', async () => {
    // The outcome — one unprefixed site, no switcher — is indistinguishable from the ordinary
    // state above, and only this one is something somebody can fix.
    const warn = vi.fn();

    await expect(
      readStoreLocales(
        reader(() => Promise.reject(new Error('connect ECONNREFUSED'))),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(`${LOCALES_READ_FAILED_WARNING} (connect ECONNREFUSED)`);
  });

  it('bounds the read, so a gateway that never answers cannot hang the build', async () => {
    // Which routes exist *is* this answer, so the prerender pass waits for it — and a locale list
    // nobody can fetch must still not be the reason a deploy never finishes. Pins the bound as
    // well: one long enough to outlast any real build would bound nothing.
    expect(READ_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    vi.useFakeTimers();
    const warn = vi.fn();
    let signal: AbortSignal | undefined;
    const pending = readStoreLocales(
      reader(
        (_options, context) =>
          new Promise((_resolve, reject) => {
            signal = context?.signal;
            signal?.addEventListener('abort', () => reject(signal?.reason));
          })
      ),
      warn
    );

    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(pending).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('refuses half an answer, and puts the default first', async () => {
    const warn = vi.fn();
    const refused: unknown[] = [
      { default: '   ', supported: ['is-IS'] },
      { default: 'en-US', supported: 'en-US' },
      { default: 'en-US', supported: ['en-US', ' '] },
      { default: 'en-US' },
    ];

    for (const answer of refused) {
      await expect(
        readStoreLocales(
          reader(async () => answer as never),
          warn
        )
      ).resolves.toBeNull();
    }
    // The SDK already orders and de-duplicates; the same validator runs on the way back out of the
    // runtime config, where whatever a theme wrote by hand also arrives.
    await expect(
      readStoreLocales(
        reader(async () => ({ default: 'en-US', supported: ['is-IS', 'en-US', 'is-IS'] })),
        warn
      )
    ).resolves.toEqual({ default: 'en-US', supported: ['en-US', 'is-IS'] });
  });
});

describe('resolveStoreLocales', () => {
  it('reads the empty string Nuxt serialises an absent record as', () => {
    // `runtimeConfig.public` turns a `null` into `''`, exactly as it does for `commerce` and
    // `locale`, so the key is always present and is not always a record.
    expect(resolveStoreLocales('')).toBeNull();
    expect(resolveStoreLocales(null)).toBeNull();
    expect(resolveStoreLocales(undefined)).toBeNull();
    expect(resolveStoreLocales(TWO)).toEqual(TWO);
  });
});

describe('resolveLocaleRouting', () => {
  it('behaves exactly as a site with no locales always has', () => {
    expect(resolveLocaleRouting(null)).toEqual({
      default: undefined,
      supported: [],
      prefixed: [],
      override: undefined,
    });
    // `ELDRA_LOCALE` on such a site still means what it always meant: forward this locale on every
    // read, and prefix nothing.
    expect(resolveLocaleRouting(null, ' is-IS ')).toEqual({
      default: 'is-IS',
      supported: ['is-IS'],
      prefixed: [],
      override: 'is-IS',
    });
  });

  it('serves the organisation’s default at / and prefixes the rest', () => {
    expect(resolveLocaleRouting(TWO)).toEqual({
      default: 'en-US',
      supported: ['en-US', 'is-IS'],
      prefixed: ['is-IS'],
      override: undefined,
    });
  });

  it('lets eldra.locale choose which supported locale lives at /', () => {
    expect(resolveLocaleRouting(TWO, 'is-IS')).toEqual({
      default: 'is-IS',
      supported: ['is-IS', 'en-US'],
      prefixed: ['en-US'],
      override: 'is-IS',
    });
  });

  it('answers in the stored spelling, whatever case the override arrived in', () => {
    // Otherwise the site would serve `/IS-is/about` beside `?locale=IS-is` and a `lang="IS-is"`,
    // three spellings of one locale nobody configured.
    expect(resolveLocaleRouting(TWO, 'IS-is').default).toBe('is-IS');
    expect(resolveLocaleRouting(TWO, 'IS-is').prefixed).toEqual(['en-US']);
  });

  it('ignores an override the organisation does not support, without dropping it', () => {
    // The URLs stay as they were — prefixing a locale the organisation has no content for would
    // generate routes the gateway answers with 400 — but the value is still forwarded on every
    // read, which is what a site deployed against one locale has always done.
    const routing = resolveLocaleRouting(TWO, 'fr-CA');
    expect(routing.default).toBe('en-US');
    expect(routing.prefixed).toEqual(['is-IS']);
    expect(routing.override).toBe('fr-CA');
  });
});

describe('path and locale', () => {
  const routing = resolveLocaleRouting(TWO);

  it('reads a prefixed first segment, case-insensitively, in the stored spelling', () => {
    expect(localePrefixOf('/is-IS/about', routing)).toBe('is-IS');
    expect(localePrefixOf('/IS-is/about', routing)).toBe('is-IS');
    expect(localePrefixOf('/is-IS', routing)).toBe('is-IS');
    expect(localePrefixOf('/about', routing)).toBeUndefined();
    expect(localePrefixOf('/', routing)).toBeUndefined();
  });

  it('never reads the default locale as a prefix', () => {
    // The default locale lives at `/` only: `/en-US/about` is not generated and must resolve as
    // the unknown path it is, so the theme renders its not-found shell rather than a duplicate.
    expect(localePrefixOf('/en-US/about', routing)).toBeUndefined();
    expect(stripLocalePrefix('/en-US/about', routing)).toBe('/en-US/about');
  });

  it('strips a prefix back to the path the content is stored at', () => {
    expect(stripLocalePrefix('/is-IS/products/mug', routing)).toBe('/products/mug');
    expect(stripLocalePrefix('/is-IS', routing)).toBe('/');
    expect(stripLocalePrefix('/is-IS/', routing)).toBe('/');
    expect(stripLocalePrefix('/products/mug', routing)).toBe('/products/mug');
  });

  it('sends a prefixed read its own locale and an unprefixed one the override alone', () => {
    // Deliberately not the resolved default: a site that configured no override has never sent a
    // locale, the gateway's own default is the same document, and sending it now would change
    // every request on every existing site for no change in the answer.
    expect(localeForPath('/is-IS/about', routing)).toBe('is-IS');
    expect(localeForPath('/about', routing)).toBeUndefined();
    expect(localeForPath('/about', resolveLocaleRouting(TWO, 'is-IS'))).toBe('is-IS');
  });

  it('still calls the unprefixed route the default locale for everything a reader sees', () => {
    expect(activeLocaleForPath('/about', routing)).toBe('en-US');
    expect(activeLocaleForPath('/is-IS/about', routing)).toBe('is-IS');
    expect(activeLocaleForPath('/about', resolveLocaleRouting(null))).toBeUndefined();
  });

  it('spells one path under every locale, replacing whatever prefix it arrived with', () => {
    expect(localePathFor('/products/mug', 'is-IS', routing)).toBe('/is-IS/products/mug');
    expect(localePathFor('/is-IS/products/mug', 'en-US', routing)).toBe('/products/mug');
    expect(localePathFor('/is-IS/products/mug', 'is-IS', routing)).toBe('/is-IS/products/mug');
    expect(localePathFor('/', 'is-IS', routing)).toBe('/is-IS');
    expect(localePathFor('/is-IS', 'en-US', routing)).toBe('/');
  });

  it('carries the query and fragment across a language switch', () => {
    // This is the switcher's own call, and it is what keeps the page a visitor was looking at:
    // dropping `?q=mug` would land them on the search page's empty state in the new language, and
    // dropping a collection's filters would silently un-filter the grid.
    expect(localePathFor('/search?q=mug', 'is-IS', routing)).toBe('/is-IS/search?q=mug');
    expect(localePathFor('/is-IS/search?q=mug', 'en-US', routing)).toBe('/search?q=mug');
    expect(localePathFor('/is-IS/collections/x?minPrice=10&size=m', 'en-US', routing)).toBe(
      '/collections/x?minPrice=10&size=m'
    );
    expect(localePathFor('/about#team', 'is-IS', routing)).toBe('/is-IS/about#team');
    expect(localePathFor('/?page=2', 'is-IS', routing)).toBe('/is-IS?page=2');
    expect(localePathFor('/is-IS?page=2', 'en-US', routing)).toBe('/?page=2');
  });
});

describe('localeHref', () => {
  const routing = resolveLocaleRouting(TWO);

  it('keeps the active prefix on a same-site destination', () => {
    expect(localeHref('/products/mug', 'is-IS', routing)).toBe('/is-IS/products/mug');
    expect(localeHref('/', 'is-IS', routing)).toBe('/is-IS');
  });

  it('is idempotent, so a destination may pass through more than one prefixer', () => {
    // A resolved `link` field is prefixed where it is resolved and handed to a router link that
    // prefixes too; a second prefix would produce `/is-IS/is-IS/products/mug`, which nothing on
    // the site answers.
    expect(localeHref('/is-IS/products/mug', 'is-IS', routing)).toBe('/is-IS/products/mug');
    // A path already spelled in another supported locale is left alone rather than rewritten:
    // `/en-US/...` is the unknown path it is, and silently moving it would hide that.
    expect(localeHref('/en-US/products/mug', 'is-IS', routing)).toBe('/en-US/products/mug');
  });

  it('carries the query and fragment along without parsing them', () => {
    expect(localeHref('/search?q=mug', 'is-IS', routing)).toBe('/is-IS/search?q=mug');
    expect(localeHref('/about#team', 'is-IS', routing)).toBe('/is-IS/about#team');
    expect(localeHref('/?page=2', 'is-IS', routing)).toBe('/is-IS?page=2');
  });

  it('touches nothing that is not a path on this site', () => {
    for (const href of [
      'https://example.com/products/mug',
      'mailto:hello@example.com',
      'tel:+3545551234',
      '#main',
      '//evil.example/path',
      'products/mug',
    ]) {
      expect(localeHref(href, 'is-IS', routing)).toBe(href);
    }
  });

  it('prefixes nothing on a site whose locale is not a prefixed one', () => {
    expect(localeHref('/products/mug', 'en-US', routing)).toBe('/products/mug');
    expect(localeHref('/products/mug', undefined, routing)).toBe('/products/mug');
    expect(localeHref('/products/mug', 'is-IS', resolveLocaleRouting(null))).toBe('/products/mug');
  });
});
