# Page titles and SEO metadata

A merchant sets how their pages are titled and shared in Studio (Website and theme, SEO): a title
pattern and description for the whole site, per-context patterns for product, collection and
category pages, a default share image and a Twitter handle. A page, or a route template, can
override its own title and description, pick its own share image, set a canonical URL and opt out
of search engines (`noindex`). `@eldrajs/theme-nuxt` reads the setting at build time and
`useEldraSeo` writes the head.

## Using it

```ts
// app/pages/[...slug].vue (the starter's version builds this input in app/utils/seoInput.ts)
useEldraSeo(
  'catalog:product',
  () => ({
    'page.title': product.title,
    'product.name': product.title,
    'product.price': money.format(product.price),
  }),
  () => ({ template: templateEntry.data.seo, contentImage: product.images[0]?.url })
);
```

`useEldraSeo(context, data, options?)` takes refs or getters, so the tags follow the route. It sets
`<title>`, `description`, `<link rel="canonical">`, `og:title`, `og:description`, `og:type`,
`og:site_name`, `og:locale`, `og:url`, `og:image`, `twitter:card`, `twitter:title`,
`twitter:description`, `twitter:image`, `twitter:site` and, for a page that must stay out of
search, `robots: noindex`. It returns the resolved values. A tag whose value is empty is not
written, and a canonical, `og:url` or `og:image` is written only when it is an absolute URL.

| Context              | Variables the theme supplies (besides `site.*`)                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`               | `page.title`, `page.slug`                                                                                                                                                   |
| `home`               | `page.title`                                                                                                                                                                |
| `catalog:product`    | `product.name`, `product.brand`, `product.price` (formatted by the theme in the store's currency and locale), `product.sku`, `product.shortDescription`, `product.category` |
| `catalog:collection` | `collection.name`, `collection.description`, `collection.productCount`                                                                                                      |
| `catalog:category`   | `category.name`, `category.description`, `category.productCount`                                                                                                            |

`site.name`, `site.url` and `site.locale` are filled in for every context. The registry is
code-owned in Core (`GET /seo/variables`); a variable the theme does not supply renders empty.

## Precedence

Per field, the first that is set wins: the page's own `seo` value, the route template's `seo` value,
the site's pattern for this context, the site's pattern, then the page's own title (and the site
name when even that is empty). The default title pattern is `{{page.title}} · {{site.name}}`, and
the home page's is the site name alone. A page's own `seo.title` is a full override: variables work
in it, but the site pattern does not wrap it. The share image falls back from the entry's own image
to the content's own first image to the site's default. Every field of a locale map falls back from
the exact locale to the same language to the site's default locale.

## Substitution

Patterns are `{{dot.path}}` over strings and numbers (`"syntax": 1`). Substitution is **one pass**:
a value is never scanned again, so a product named `{{site.name}}` shows those characters. An
unknown or empty variable becomes empty, never literal braces. A title is then tidied: whitespace
is collapsed and a separator (`·`, `|`, `–`, `—`, `-` standing alone between spaces) left leading,
trailing or doubled by an empty variable is dropped, so `{{page.title}} · {{site.name}}` with no
site name is just the page title, and a hyphen inside a word is untouched. This differs on purpose
from the email renderer, which keeps unknown paths and swallows nearby whitespace and punctuation.

`packages/theme-core/src/__tests__/fixtures/seo-vectors.json` holds the pattern, data and expected
title of every rule above. Core and Studio test against the same file; change a rule by changing
the vectors first.

A page's or template's own `seo` value may also carry `ogTitle` and `ogDescription` (used for
`og:*` and `twitter:*` only; each falls back to the page's title and description) and a share
image: Core serves the resolved `imageUrl` beside `imageAssetId` in the entry read, and the kit
reads the URL.

## Which builds are indexed

A **preview build** is always `noindex`: anything built without `ELDRA_BUILD_TARGET=production`
(the module option `buildTarget`), `nuxi dev`, and any page framed by Studio. A production build
writes `robots` only for a page that opts out. Set `ELDRA_SITE_URL` (the module option `siteUrl`) to
the public origin: without it there is no canonical or `og:url`, because both must be absolute and
a guessed host is worse than none. A relative image or canonical is resolved against it. When
`ELDRA_SITE_URL` is unset, a production build reads the site's production URL from the platform
(`GET /site/v1/crawl`, below).

## sitemap.xml, robots.txt and hreflang

`nuxi generate` writes `robots.txt` and `sitemap.xml` into the static output from the routes it
prerendered, so neither can list a page that does not exist:

- **Preview build** (the default): `robots.txt` is `User-agent: *` / `Disallow: /` and there is no
  sitemap, whatever the platform says about the site's URL.
- **Production build** (`ELDRA_BUILD_TARGET=production`): `robots.txt` is `User-agent: *` /
  `Allow: /`, then the merchant's own lines (the platform's `robotsExtra`, set in Studio), then
  `Sitemap: <origin>/sitemap.xml`. `sitemap.xml` lists every prerendered content path once per
  locale, each with `xhtml:link rel="alternate" hreflang` for every locale and `x-default` (the
  unprefixed one), and `<lastmod>` where the entry or catalog record has an `updatedAt`.
- A page whose `seo.noindex` is set is **left out**. Its `seo.canonicalUrl` becomes the `loc` when
  it is a plain URL on the site's own origin; a canonical on another host, or a `{{pattern}}`, is
  ignored and the path-derived URL is used.
- Past 50,000 URLs or 50 MiB per file, `sitemap.xml` becomes a `sitemapindex` over `sitemap-1.xml`,
  `sitemap-2.xml`, ... (the module option `sitemap: { maxUrls, maxBytes }` lowers the limits;
  `sitemap: false` turns the sitemap off). Every locale counts, so a store's URL count is its page
  count times its locales.
- The origin is `ELDRA_SITE_URL` (the module option `siteUrl`), else the production URL the platform
  publishes. With neither, a production build writes **neither file** and prints one line saying
  so: a sitemap of relative URLs is invalid.
- A `public/robots.txt` or `public/sitemap.xml` of the theme's own is never replaced; the build
  prints `[eldra] <file> generation skipped: theme ships its own` instead. Do not ship either in a
  theme that should follow the merchant's settings.

The same origin makes the `<link rel="alternate" hreflang>` set in every page's head absolute
(relative paths without it). Reading the crawl settings is a fail-soft platform read like the
others: one warning, and the build goes on with no merchant lines.

## Failing soft

The read is one of the build's fail-soft platform reads (`readSeo`): no gateway client, an
unreachable gateway, a timeout, an unknown pattern syntax or a response that is not the documented
shape prints one warning (`[eldra] could not read the platform's SEO settings`) and the build goes
on with the default pattern. Nothing breaks a deploy.

## Adopting it in a theme

Replace the theme's own `useHead({ title })` with `useEldraSeo`, and keep a not-found page out of
the index by passing `{ entry: { title, noindex: true } }`. The starter's `seoInput()` is a good
starting point for the data of each context. A theme that sets `app.head.title` has that as the
default site name; otherwise there is none (never the package name) and titles are the bare page
title until the platform's `site.name` is set.
