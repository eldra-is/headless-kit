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
a guessed host is worse than none. A relative image or canonical is resolved against it.

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
