import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { siteOrigin, type ResolvedSeo } from '@eldrajs/theme-core';
import { useEldraLocale } from '@eldrajs/theme-vue';
import { useI18n } from 'vue-i18n';
import { categoryHref } from '../utils/links';
import { useMoney } from '../storefront/money';
import { pageStructuredData, type PageLdKind } from '../storefront/structuredData';
import { useStorefront } from './useStorefront';

/** The listing's own first page: what a shopper sees before they scroll, and what Google reads. */
const ITEM_LIST_SIZE = 24;

/** The search page the seeded `search` page lives at (`app/templates.ts`): its `SearchAction`. */
const SEARCH_PATH = '/search';

export interface PageStructuredDataInput {
  catalog: Ref<{ kind: 'product' | 'collection' | 'category'; slug: string; path?: string } | null>;
  isNotFound: Ref<boolean>;
  isHome: Ref<boolean>;
  /** `useEldraSeo`'s answer: the canonical, and `noindex`, which carries no markup. */
  seo: Ref<ResolvedSeo>;
  /** The page's (or catalog object's) own name, the last breadcrumb level. */
  title: ComputedRef<string>;
  /** The request path as served. */
  path: Ref<string>;
}

/**
 * Writes the page's schema.org JSON-LD (`app/storefront/structuredData.ts` says which nodes a page
 * type gets) through `@eldrajs/theme-nuxt`'s `useStructuredData`, which applies the theme's
 * opt-out and extender.
 *
 * It reads through the storefront the blocks read through, so a product page's markup carries the
 * very product, price, currency and stock state the buy box renders; the results share the
 * blocks' cache keys, so the build reads each one once. A page the SEO resolver marks `noindex`
 * (a preview build, the not-found shell, an author's own choice) carries none.
 */
export function usePageStructuredData(input: PageStructuredDataInput): void {
  const storefront = useStorefront();
  const locale = useEldraLocale();
  const money = useMoney();
  const profile = useSiteProfile();
  const { t } = useI18n();

  // Final at setup, like every source a result is keyed by: a route change remounts the page.
  const kind = input.catalog.value?.kind ?? null;
  const catalogSlug = input.catalog.value?.slug ?? null;
  const categoryPath = input.catalog.value?.path ?? null;

  const product = storefront.catalog.product(ref(kind === 'product' ? catalogSlug : null)).data;
  const category = storefront.catalog.category(ref(kind === 'category' ? categoryPath : null)).data;
  const items =
    kind === 'collection' && catalogSlug !== null
      ? storefront.catalog.collectionProducts(
          ref({ slug: catalogSlug }),
          ref({ page: 1, pageSize: ITEM_LIST_SIZE })
        ).data
      : kind === 'category' && categoryPath !== null
        ? storefront.catalog.products(ref({ page: 1, pageSize: ITEM_LIST_SIZE, categoryPath })).data
        : ref(null);

  const origin = siteOrigin(profile.siteUrl);
  // A site path as the URL to write: the page's language kept, absolute when the origin is known.
  const url = (path: string): string => {
    const prefixed = locale.path(path);
    return origin === null ? prefixed : `${origin}${prefixed}`;
  };

  const pageKind = computed<PageLdKind>(() => {
    if (input.isNotFound.value) return 'notFound';
    if (kind !== null) return kind;
    return input.isHome.value ? 'home' : 'page';
  });

  useStructuredData(
    () => {
      const trail =
        kind === 'product'
          ? (product.value?.categoryTrail ?? []).map((level) => ({
              label: level.label,
              path: level.href,
            }))
          : kind === 'category'
            ? (category.value?.ancestors ?? []).map((ancestor) => ({
                label: ancestor.title,
                path: categoryHref(ancestor.path),
              }))
            : [];
      return pageStructuredData({
        kind: pageKind.value,
        title: input.title.value,
        currentUrl: input.seo.value.canonical ?? url(input.path.value),
        url,
        absolute: origin !== null,
        homeLabel: t('breadcrumbs.home'),
        trail,
        product: product.value,
        currency: money.currency.value,
        items: (items.value?.items ?? []).map((item) => ({
          title: item.title,
          url: url(item.url),
        })),
        profile,
        searchPath: SEARCH_PATH,
      });
    },
    { enabled: () => !input.seo.value.noindex }
  );
}
