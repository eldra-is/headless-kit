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

## Structured data (JSON-LD)

Pages also carry schema.org JSON-LD, so a search engine can show a product as a product and a
trail as a trail. The builders are framework-free and live in `@eldrajs/theme-core`
(`buildProductLd`, `buildBreadcrumbLd`, `buildItemListLd`, `buildOrganizationLd`,
`buildWebSiteLd`, and `serializeLd`); `@eldrajs/theme-nuxt` writes them into the head with
`useStructuredData`, and the starter's `usePageStructuredData` says which nodes each page type gets:

| Page                          | Nodes                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Home                          | `Organization`, `WebSite` (with a `SearchAction` to `/search`)  |
| Product                       | `BreadcrumbList`, `Product`                                     |
| Category, collection          | `BreadcrumbList`, `ItemList` of the products shown (first page) |
| Any other page                | `BreadcrumbList`                                                |
| Not found, any `noindex` page | nothing                                                         |

- **Same data as the page.** The `Product` is built from the product the buy box renders: the
  variants' prices in the store's currency (rounded to that currency's own fraction digits, so ISK
  has none), each variant's stock state as `availability`, and the compare-at price as a list price.
  One variant, or several at one price, is an `Offer`; different prices are an `AggregateOffer` with
  one `Offer` per variant. A sold-out product keeps its offer, marked `OutOfStock`.
- **Nothing made up.** A value that is unset is left out, never written empty. `gtin` is written
  only when the barcode is a valid GTIN-8/12/13/14 (check digit included). There is no
  `AggregateRating` until real review data exists. `priceValidUntil` is not written until the
  platform has a sale schedule to give it. `Product.brand` is the product's own `brand`, else the
  shop's name.
- **Static HTML is a snapshot.** The markup is in the prerendered file, so `availability` is the
  stock at build time; it is not rewritten in the browser. Search engines re-crawl.
- **The shop's profile.** `Organization` takes its name, logo, social profile links (`sameAs`) and
  contact from the platform's site profile (`GET /site/v1/site-profile`, an eighth fail-soft read:
  one warning and the build goes on). The name falls back to the site name, the logo to the site
  icon's 512 px rendering. `Organization` and `WebSite` need an absolute URL, so they are written
  only when the origin is known (`siteUrl` / `ELDRA_SITE_URL`); the other nodes fall back to
  relative URLs.
- **One `BreadcrumbList` per page.** The page-level builder owns it, so `@eldrajs/ui`'s `Breadcrumb`
  takes `:structured-data="false"` (the starter's `breadcrumbs` block does). Left at its default
  `true`, the component writes its own, as before.
- **Escaping.** `serializeLd` writes `<` as a JSON escape, so a product called `</script>` cannot
  close the tag.

**Opting out and editing.** The module option `eldra.structuredData` takes
`{ disable: true }` (write none) or `{ disable: ['product', 'breadcrumb', 'itemList',
'organization', 'website'] }`. It rides in the runtime config, so it cannot hold a function; to
edit or drop a node call `provideStructuredData((type, node, { path, locale }) => node | null)`
from a plugin. Both apply to every `useStructuredData` call, so a theme's own pages follow them
too. Another theme on the same organisation is unaffected: the option is the theme's, the profile
is the site's.

A theme that writes its own page markup calls `useStructuredData([{ type, node }, ...], { enabled })`
with nodes from the builders; pass `enabled: !seo.noindex` (from `useEldraSeo`) so a page kept out
of the index carries no markup. One call per page: the head entry has a fixed key, so a second call
replaces the first rather than adding a duplicate.

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
