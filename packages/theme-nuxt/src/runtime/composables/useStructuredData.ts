import {
  applyStructuredDataPolicy,
  serializeLd,
  STRUCTURED_DATA_TYPES,
  type StructuredDataContext,
  type StructuredDataEntry,
  type StructuredDataPolicy,
  type StructuredDataType,
} from '@eldrajs/theme-core';
import { useEldraLocale } from '@eldrajs/theme-vue';
import { useHead, useNuxtApp, useRoute, useRuntimeConfig } from 'nuxt/app';
import { toValue, type MaybeRefOrGetter } from 'vue';
import type { ResolvedSiteProfile } from '../siteProfile';

/** The theme's runtime edit of one node; see `provideStructuredData`. */
export type StructuredDataExtender = NonNullable<StructuredDataPolicy['extend']>;

/** The `eldra.structuredData` module option as the runtime config carries it. */
interface RuntimeStructuredData {
  disable: StructuredDataType[] | boolean | '';
}

/**
 * Per app, not per module: a server renders many apps from one module instance, and an extender
 * one request installed must not decorate another's markup.
 */
const extenders = new WeakMap<object, StructuredDataExtender>();

/**
 * Lets a theme edit or drop a node before it is written: `(type, node, { path, locale }) => node |
 * null`. Call it from a plugin or the root component. A function cannot ride in the module option
 * (the runtime config is serialised), so this is the runtime half of `eldra.structuredData`.
 */
export function provideStructuredData(extend: StructuredDataExtender): void {
  extenders.set(useNuxtApp(), extend);
}

/**
 * Writes the page's schema.org JSON-LD into the head as one `<script type="application/ld+json">`.
 * `entries` is what the page built (`buildProductLd` & co. from `@eldrajs/theme-core`, each tagged
 * with its kind), a ref or a getter so it follows a route change. The theme's `disable` option (the
 * module's `eldra.structuredData`) and its `provideStructuredData` extender are applied here, so a
 * page never has to know about either.
 *
 * Nothing is written for no nodes, and nothing for a page that passes `enabled: false` — pass
 * `!seo.noindex` from `useEldraSeo` so a page kept out of the index carries no markup either. One
 * head entry under a fixed key, so two calls in one app replace each other instead of stacking
 * duplicate markup.
 */
export function useStructuredData(
  entries: MaybeRefOrGetter<readonly StructuredDataEntry[]>,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {}
): void {
  const config = useRuntimeConfig().public.eldra as { structuredData?: RuntimeStructuredData };
  const disable = readDisable(config.structuredData?.disable);
  const nuxtApp = useNuxtApp();
  const route = useRoute();
  const locale = useEldraLocale();

  useHead(() => {
    if (toValue(options.enabled) === false) return {};
    const context: StructuredDataContext = { path: route.path, locale: locale.active ?? null };
    const nodes = applyStructuredDataPolicy(
      toValue(entries),
      { disable, extend: extenders.get(nuxtApp) },
      context
    );
    if (nodes.length === 0) return {};
    return {
      script: [{ key: 'eldra-ld', type: 'application/ld+json', innerHTML: serializeLd(nodes) }],
    };
  });
}

/** The runtime config turns `false`/unset into `''`; a list and `true` survive. */
function readDisable(value: unknown): StructuredDataPolicy['disable'] {
  if (value === true) return true;
  if (!Array.isArray(value)) return [];
  return value.filter((type): type is StructuredDataType =>
    (STRUCTURED_DATA_TYPES as readonly string[]).includes(type as string)
  );
}

/**
 * The shop's profile for an `Organization` node (name, logo, social links, contact, legal details), with the
 * site name and the site icon filling what the merchant left unset, plus the site's origin.
 * `siteUrl` is `''` when the build does not know it; the page then has no absolute URL to write,
 * and should write no node that needs one.
 */
export function useSiteProfile(): ResolvedSiteProfile & { siteUrl: string } {
  const config = useRuntimeConfig().public;
  const profile = config.eldra as { siteProfile?: ResolvedSiteProfile | '' };
  const seo = config.eldraSeo as { siteUrl?: string; siteName?: string };
  const resolved = typeof profile.siteProfile === 'object' ? profile.siteProfile : null;
  return {
    name: resolved?.name || seo.siteName || '',
    logoUrl: resolved?.logoUrl || null,
    sameAs: resolved?.sameAs ?? [],
    contact: {
      email: resolved?.contact?.email || null,
      telephone: resolved?.contact?.telephone || null,
    },
    legal: resolved?.legal ?? null,
    siteUrl: seo.siteUrl ?? '',
  };
}
