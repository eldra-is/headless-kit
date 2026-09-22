import { EldraClientError, resolveRoute, stripStega, type EntryDoc } from '@eldrajs/theme-core';
import { useEldra } from '@eldrajs/theme-vue';
import { clearNuxtData, useAsyncData, useRoute, useRuntimeConfig } from 'nuxt/app';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { overlayPreviewDrafts } from '../drafts';

interface ResolvedEldraRoute {
  page: EntryDoc | null;
  template: EntryDoc | null;
  entry: EntryDoc | null;
}

const EMPTY_ROUTE: ResolvedEldraRoute = { page: null, template: null, entry: null };

export function useEldraPage(): {
  page: Ref<EntryDoc | null>;
  template: Ref<EntryDoc | null>;
  entry: Ref<EntryDoc | null>;
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
  const runtimeLocale = (): string | undefined =>
    (ctx.preview.active ? ctx.preview.locale : null) ?? cfg.locale ?? undefined;

  const listEntries = async (schemaApiId: string): Promise<EntryDoc[]> => {
    const entries: EntryDoc[] = [];
    let page = 1;
    for (;;) {
      const response = await ctx.client.getEntries(schemaApiId, {
        page,
        pageSize: 100,
        depth: 0,
        locale: runtimeLocale(),
      });
      entries.push(...response.data);
      if (!response.meta.hasNext) return entries;
      page += 1;
    }
  };

  const listRouteTemplates = async (): Promise<EntryDoc[]> => {
    try {
      return await listEntries(cfg.routeTemplateSchema);
    } catch (cause) {
      // Upgrade bootstrap: manifest ingest creates this system schema for
      // sites that predate dynamic pages. Static pages must remain renderable
      // in the artifact that performs that first ingest.
      if (cause instanceof EldraClientError && cause.status === 404) return [];
      throw cause;
    }
  };

  const resolveCurrentRoute = async (): Promise<ResolvedEldraRoute> => {
    error.value = null;
    try {
      const [pages, templates] = await Promise.all([
        listEntries(cfg.pageSchema),
        listRouteTemplates(),
      ]);
      const match = resolveRoute(canonicalRoutePath(route.path), { pages, templates });
      if (match === null) return EMPTY_ROUTE;
      if (match.kind === 'static') {
        const page = await ctx.client.getEntry(cfg.pageSchema, match.entry.id, {
          depth: 3,
          locale: runtimeLocale(),
        });
        return { page, template: null, entry: null };
      }
      const schemaApiId = plainString(match.template.data.schemaApiId);
      const slugField = plainString(match.template.data.slugField);
      const slugValue = match.params[slugField];
      if (schemaApiId === '' || slugField === '' || slugValue === undefined) return EMPTY_ROUTE;
      const [template, entry] = await Promise.all([
        ctx.client.getEntry(cfg.routeTemplateSchema, match.template.id, {
          depth: 3,
          locale: runtimeLocale(),
        }),
        ctx.client.getEntryByUniqueField(schemaApiId, slugField, slugValue, {
          depth: 3,
          locale: runtimeLocale(),
        }),
      ]);
      return { page: null, template, entry };
    } catch (cause) {
      if (cause instanceof EldraClientError && cause.status === 404) return EMPTY_ROUTE;
      error.value = cause instanceof Error ? cause.message : String(cause);
      return EMPTY_ROUTE;
    }
  };

  const { data: resolvedRoute, pending } = useAsyncData<ResolvedEldraRoute>(
    () => `eldra-page:${canonicalRoutePath(route.path)}`,
    resolveCurrentRoute,
    { watch: [() => route.path], default: () => EMPTY_ROUTE }
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

  const active = computed(() => previewResolvedRoute.value ?? resolvedRoute.value ?? EMPTY_ROUTE);
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
  const layout = computed<unknown | null>(
    () => template.value?.data.layout ?? page.value?.data.layout ?? null
  );
  const blocks = computed<EntryDoc[]>(() => {
    const raw = template.value?.data.blocks ?? page.value?.data.blocks;
    return Array.isArray(raw) ? raw.filter(isEntryDoc) : [];
  });
  const reusableComponentProjection = computed<unknown | undefined>(
    () => page.value?.reusableComponentProjection
  );

  return {
    page: page as Ref<EntryDoc | null>,
    template: template as Ref<EntryDoc | null>,
    entry: entry as Ref<EntryDoc | null>,
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

function plainString(value: unknown): string {
  return typeof value === 'string' ? stripStega(value).trim() : '';
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
