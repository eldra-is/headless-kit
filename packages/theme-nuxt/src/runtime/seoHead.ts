import type { ResolvedSeo } from '@eldrajs/theme-core';

/** A `<meta>` tag as `useHead` takes it. */
export interface SeoMetaTag {
  name?: string;
  property?: string;
  content: string;
}

export interface SeoHead {
  title: string;
  meta: SeoMetaTag[];
  link: { rel: 'canonical'; href: string }[];
}

/**
 * The head one resolved route writes: `<title>`, description, canonical, Open Graph, Twitter card
 * and robots. Pure, so a test can read every tag without a Nuxt app.
 *
 * `og:url`, `og:image` and the canonical link are written only when absolute (the resolver
 * returns `null` otherwise); a share card with a relative URL is worse than none. `robots` is
 * written only for `noindex` — an indexable page says nothing, which is the default.
 */
export function buildSeoHead(
  seo: ResolvedSeo,
  context: { locale: string | null; siteName: string }
): SeoHead {
  const meta: SeoMetaTag[] = [];
  const name = (key: string, content: string | null): void => {
    if (content !== null && content !== '') meta.push({ name: key, content });
  };
  const property = (key: string, content: string | null): void => {
    if (content !== null && content !== '') meta.push({ property: key, content });
  };

  name('description', seo.description);
  property('og:title', seo.title);
  property('og:description', seo.description);
  property('og:type', seo.ogType);
  property('og:site_name', context.siteName);
  property('og:locale', context.locale === null ? null : context.locale.replace('-', '_'));
  property('og:url', seo.canonical);
  property('og:image', seo.image);
  name('twitter:card', seo.image === null ? 'summary' : 'summary_large_image');
  name('twitter:title', seo.title);
  name('twitter:description', seo.description);
  name('twitter:image', seo.image);
  name('twitter:site', seo.twitterSite);
  if (seo.noindex) name('robots', 'noindex');

  return {
    title: seo.title,
    meta,
    link: seo.canonical === null ? [] : [{ rel: 'canonical', href: seo.canonical }],
  };
}
