import type { EntryDoc } from '@eldrajs/theme-core';
import { useEldra } from '@eldrajs/theme-vue';
import { clearNuxtData, useAsyncData, useRoute, useRuntimeConfig } from 'nuxt/app';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { CatalogRouteRef } from '../catalog';
import { overlayPreviewDrafts } from '../drafts';
import { normalizeLocale } from '../locale';
import { EMPTY_ELDRA_ROUTE, resolveEldraRoute, type ResolvedEldraRoute } from '../resolveRoute';

export function useEldraPage(): {
  page: Ref<EntryDoc | null>;
  template: Ref<EntryDoc | null>;
  entry: Ref<EntryDoc | null>;
  catalog: ComputedRef<CatalogRouteRef | null>;
  layout: ComputedRef<unknown | null>;
  blocks: ComputedRef<EntryDoc[]>;
  reusableComponentProjection: ComputedRef<unknown | undefined>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
} {
  const route = useRoute();
  const ctx = useEldra();
  const cfg = useRuntimeConfig().public.eldra as {
    pageSchema: string;
    routeTemplateSchema: string;
    locale: string | null;
  };
  const error = ref<string | null>(null);
  // A site that configures no locale still carries `""` in the public runtime
  // config, and an empty `?locale=` is a locale the gateway rejects rather than
  // the absence of one — so a blank value on either side means "no locale".
  const runtimeLocale = (): string | undefined =>
    normalizeLocale(ctx.preview.active ? ctx.preview.locale : null) ?? normalizeLocale(cfg.locale);

  const resolveCurrentRoute = async (): Promise<ResolvedEldraRoute> => {
    error.value = null;
    try {
      return await resolveEldraRoute(
        ctx.client,
        cfg,
        canonicalRoutePath(route.path),
        runtimeLocale()
      );
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      return EMPTY_ELDRA_ROUTE;
    }
  };

  const { data: resolvedRoute, pending } = useAsyncData<ResolvedEldraRoute>(
    () => `eldra-page:${canonicalRoutePath(route.path)}`,
    resolveCurrentRoute,
    { watch: [() => route.path], default: () => EMPTY_ELDRA_ROUTE }
  );

  const previewResolvedRoute = ref<ResolvedEldraRoute | undefined>(undefined);
  let previewRefreshRequest = 0;
  const resolvePreviewRoute = (): void => {
    if (!ctx.preview.active) return;
    const request = ++previewRefreshRequest;
    const path = canonicalRoutePath(route.path);
    const activeKey = `eldra-page:${path}`;
    clearNuxtData((key) => key.startsWith('eldra-page:') && key !== activeKey);
    void resolveCurrentRoute().then((next) => {
      if (request === previewRefreshRequest && path === canonicalRoutePath(route.path)) {
        previewResolvedRoute.value = next;
      }
    });
  };
  watch(() => ctx.preview.refreshRevision, resolvePreviewRoute);
  watch(
    () => ctx.preview.active,
    (active) => {
      if (active) resolvePreviewRoute();
    },
    { immediate: true }
  );
  watch(
    () => route.path,
    () => {
      previewRefreshRequest += 1;
      previewResolvedRoute.value = undefined;
    }
  );

  const active = computed(
    () => previewResolvedRoute.value ?? resolvedRoute.value ?? EMPTY_ELDRA_ROUTE
  );
  const page = computed(() => {
    void ctx.preview.revision;
    return overlayPreviewDrafts(
      active.value.page,
      ctx.preview.drafts,
      ctx.preview.draftSchemaApiIds
    );
  });
  const template = computed(() =>
    overlayPreviewDrafts(active.value.template, ctx.preview.drafts, ctx.preview.draftSchemaApiIds)
  );
  const entry = computed(() => overlayEntryDraft(active.value.entry, ctx.preview.drafts));
  const catalog = computed<CatalogRouteRef | null>(() => active.value.catalog);
  const layout = computed<unknown | null>(
    () => template.value?.data.layout ?? page.value?.data.layout ?? null
  );
  const blocks = computed<EntryDoc[]>(() => {
    const raw = template.value?.data.blocks ?? page.value?.data.blocks;
    return Array.isArray(raw) ? raw.filter(isEntryDoc) : [];
  });
  // Core attaches the projection to whichever document the read returned, and a
  // route resolves exactly one of the two: a static route has a `page` and no
  // `template`, a dynamic one a `template` and no `page`. So this is a fallback
  // and never a merge — `@eldrajs/theme-core`'s expansion refuses a projection
  // carrying a binding the rendered document does not place (`COMPONENT_STALE`),
  // which is what a merged projection would be.
  const reusableComponentProjection = computed<unknown | undefined>(
    () => page.value?.reusableComponentProjection ?? template.value?.reusableComponentProjection
  );

  return {
    page: page as Ref<EntryDoc | null>,
    template: template as Ref<EntryDoc | null>,
    entry: entry as Ref<EntryDoc | null>,
    catalog,
    layout,
    blocks,
    reusableComponentProjection,
    pending,
    error,
  };
}

function overlayEntryDraft(
  entry: EntryDoc | null,
  drafts: Readonly<Record<string, Record<string, unknown>>>
): EntryDoc | null {
  if (entry === null) return null;
  const draft = drafts[entry.id];
  return draft === undefined ? entry : { ...entry, data: { ...entry.data, ...draft } };
}

function canonicalRoutePath(path: string): string {
  return path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
}

function isEntryDoc(value: unknown): value is EntryDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { data?: unknown }).data === 'object' &&
    (value as { data?: unknown }).data !== null
  );
}
