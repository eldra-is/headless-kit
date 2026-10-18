import {
  resolveSeo,
  type ResolvedSeo,
  type SeoContext,
  type SeoData,
  type SeoEntryValue,
  type SeoSetting,
} from '@eldrajs/theme-core';
import { useEldra, useEldraLocale } from '@eldrajs/theme-vue';
import { useHead, useRoute, useRuntimeConfig } from 'nuxt/app';
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { isStudioPreviewFrame } from '../origins';
import { buildSeoHead } from '../seoHead';

/** What `useEldraSeo` needs beyond the context's variables. */
export interface UseEldraSeoOptions {
  /** The page's (or catalog route's template's) own `seo` field value. */
  entry?: SeoEntryValue | null;
  /** The route template's `seo` field value, when the route renders through one. */
  template?: SeoEntryValue | null;
  /** The content's own image (a product's first), used when the entry has none. */
  contentImage?: string | null;
}

/**
 * Sets the page's `<title>`, description, canonical link, Open Graph and Twitter tags and `robots`
 * from the platform's SEO setting and the route's own `seo` value, by the one resolver Studio's
 * previews share (`resolveSeo` in `@eldrajs/theme-core`).
 *
 * `context` says what the route shows (`page`, `home`, `catalog:product`, ...) and `data` carries
 * that context's variables (`page.title`, `product.name`, ...); `site.*` is filled in here. Every
 * argument may be a ref or a getter, so the tags follow a route change.
 *
 * A **preview build** (`ELDRA_BUILD_TARGET=preview`, `nuxi dev`, or a page framed
 * by Studio) is always `noindex`. A site whose setting could not be read renders with the default
 * pattern (`{{page.title}} · {{site.name}}`).
 *
 * Returns the resolved values, so a page can reuse them (a JSON-LD builder, say).
 */
export function useEldraSeo(
  context: MaybeRefOrGetter<SeoContext>,
  data: MaybeRefOrGetter<SeoData>,
  options: MaybeRefOrGetter<UseEldraSeoOptions | undefined> = {}
): ComputedRef<ResolvedSeo> {
  const cfg = useRuntimeConfig().public;
  const seoConfig = cfg.eldraSeo as {
    setting: SeoSetting | null;
    siteUrl: string;
    siteName: string;
    isPreview: boolean;
  };
  // Nuxt serialises a `null` in the public runtime config as `''`, so "no setting" arrives as an
  // empty string, and so does every unset field inside a setting (the resolver reads those as
  // absent).
  const setting =
    typeof seoConfig.setting === 'object' && seoConfig.setting !== null ? seoConfig.setting : null;
  const studioOrigins = (cfg.eldra as { studioOrigins: string[] }).studioOrigins;
  const route = useRoute();
  const locale = useEldraLocale();
  const eldra = useEldra();

  const resolved = computed(() => {
    const extra = toValue(options) ?? {};
    return resolveSeo({
      locale: locale.active,
      defaultLocale: locale.defaultLocale,
      context: toValue(context),
      site: setting,
      siteName: seoConfig.siteName,
      siteUrl: seoConfig.siteUrl,
      path: route.path,
      entry: extra.entry,
      template: extra.template,
      contentImage: extra.contentImage,
      data: toValue(data),
      isPreview: seoConfig.isPreview || eldra.preview.active || isStudioPreviewFrame(studioOrigins),
    });
  });

  useHead(() =>
    buildSeoHead(resolved.value, {
      locale: locale.active,
      siteName: setting?.site.name?.trim() || seoConfig.siteName,
    })
  );

  return resolved;
}
