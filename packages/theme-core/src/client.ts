import { isBlockFieldSelect } from './blockFields';
import { encodeEntryDataStega } from './stegaWalk';
import type {
  EldraClient,
  EldraClientOptions,
  EntryDoc,
  EntryList,
  EntryQuery,
  ResolveEntryListBody,
} from './clientTypes';
import { EldraClientError } from './clientTypes';

export * from './clientTypes'; // the interface block from **Interfaces** lives in clientTypes.ts

export function createEldraClient(opts: EldraClientOptions): EldraClient {
  const gatewayUrl = opts.gatewayUrl.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const stegaEnabled = opts.stega === true;
  let previewToken: string | null = null;

  function buildUrl(path: string, query?: EntryQuery, extra?: Record<string, string>): URL {
    const url = new URL(gatewayUrl + path);
    if (query?.locale !== undefined) url.searchParams.set('locale', query.locale);
    if (query?.depth !== undefined) url.searchParams.set('depth', String(query.depth));
    if (query?.page !== undefined) url.searchParams.set('page', String(query.page));
    if (query?.pageSize !== undefined) url.searchParams.set('pageSize', String(query.pageSize));
    if (query?.sort?.length) url.searchParams.set('sort', query.sort.join(','));
    if (query?.fields?.length) url.searchParams.set('fields', query.fields.join(','));
    for (const f of query?.filter ?? []) url.searchParams.append('filter', f);
    for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v);
    return url;
  }

  async function request(url: URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set('X-Org-Id', opts.orgId);
    if (previewToken !== null) headers.set('X-Preview-Token', previewToken);
    const merged: RequestInit = { ...init, headers };
    if (previewToken !== null) merged.cache = 'no-store'; // draft responses must never be cached
    const res = await doFetch(url.toString(), merged);
    if (!res.ok) {
      throw new EldraClientError(res.status, res.statusText, url.pathname);
    }
    return res;
  }

  function maybeStega(entry: EntryDoc, locale: string | null): EntryDoc {
    const apiId = typeof entry.schemaApiId === 'string' ? entry.schemaApiId : undefined;
    const projected = { ...entry, data: projectLocalizedLeaves(entry.data, locale, apiId) };
    if (!stegaEnabled || previewToken === null) return projected;
    return { ...projected, data: encodeEntryDataStega(entry.id, projected.data, locale, apiId) };
  }

  return {
    async getEntries(schemaIdentifier, query) {
      const res = await request(
        buildUrl(`/cms/v1/schema/${encodeURIComponent(schemaIdentifier)}/entry`, query)
      );
      const list = (await res.json()) as Omit<EntryList, 'data'> & { data?: EntryDoc[] | null };
      if (list.data !== undefined && list.data !== null && !Array.isArray(list.data)) {
        throw new TypeError('[eldra] gateway entry list data must be an array');
      }
      return {
        ...list,
        data: (list.data ?? []).map((e) => maybeStega(e, query?.locale ?? null)),
      };
    },
    async getEntry(schemaIdentifier, entryId, query) {
      const res = await request(
        buildUrl(
          `/cms/v1/schema/${encodeURIComponent(schemaIdentifier)}/entry/${encodeURIComponent(entryId)}`,
          query
        )
      );
      return maybeStega((await res.json()) as EntryDoc, query?.locale ?? null);
    },
    async getEntryByUniqueField(schemaIdentifier, fieldId, value, query) {
      const res = await request(
        buildUrl(
          `/cms/v1/schema/${encodeURIComponent(schemaIdentifier)}/entry/unique/${encodeURIComponent(fieldId)}/${encodeURIComponent(value)}`,
          query
        )
      );
      return maybeStega((await res.json()) as EntryDoc, query?.locale ?? null);
    },
    async resolveEntryListField(entryId, fieldId, query) {
      const res = await request(
        buildUrl(
          `/cms/v1/entry/${encodeURIComponent(entryId)}/list/${encodeURIComponent(fieldId)}`,
          query
        )
      );
      return (await res.json()) as Record<string, unknown>;
    },
    async resolveEntryList(body, query) {
      const res = await request(buildUrl('/cms/v1/entry-list/resolve', query), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body satisfies ResolveEntryListBody),
      });
      return (await res.json()) as Record<string, unknown>;
    },
    async getTypeScriptDefinitions(tsOpts) {
      const url = new URL(`${gatewayUrl}/cms/v1/typescript-definitions`);
      if (tsOpts?.schemas?.length) url.searchParams.set('schemas', tsOpts.schemas.join(','));
      if (tsOpts?.maxDepth !== undefined) url.searchParams.set('maxDepth', String(tsOpts.maxDepth));
      if (tsOpts?.moduleName !== undefined) url.searchParams.set('moduleName', tsOpts.moduleName);
      const res = await request(url);
      return await res.text();
    },
    enablePreview(token) {
      previewToken = token;
    },
    disablePreview() {
      previewToken = null;
    },
    get previewEnabled() {
      return previewToken !== null;
    },
    encodeEntryDataStega,
  };
}

const localeKey = /^[a-z]{2}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * A resolved `select` field's public-read shape: the CMS gateway's
 * `resolveSelectLabels` (web-studio-core) replaces the stored plain string
 * with `{ value, label }` so a schema-blind consumer can show a human label.
 * Themes only ever declare `select` fields as their plain value union
 * (`variant?: 'primary' | 'subtle' | 'split'`, generated from `block.json`),
 * so every `Block.vue` compares `data.variant` against those literals
 * directly — never against this wrapper. Left unprojected, every variant
 * (and any other select-typed) field always fails that comparison and a
 * block silently renders its default/no-variant markup forever, in preview
 * and in production alike.
 *
 * This shape check alone is not enough to unwrap: a theme-authored composite
 * field can legitimately declare two string sub-fields literally named
 * `value`/`label` (a stat/metric field, a generic chip). Every call site
 * must additionally confirm, via `isBlockFieldSelect`, that the *registered*
 * field at this path really is `type: "select"` before unwrapping.
 */
function looksLikeSelectValue(value: unknown): value is { value: string; label: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 2 && typeof record.value === 'string' && typeof record.label === 'string';
}

/**
 * Public CMS reads normally resolve localized fields server-side. Older content
 * can still contain locale maps below list/composite fields because those
 * leaves were persisted before recursive localization extraction existed.
 * Project only objects whose every key is a locale tag, leaving ordinary
 * records (including media and references) untouched.
 *
 * `apiId` (the entry's own `schemaApiId`, when known) and `path` (the
 * dot-separated field path built as this walk descends, matching
 * `stegaWalk.ts`'s path convention) gate the `{value,label}` select unwrap
 * above on `isBlockFieldSelect`, so it only ever fires for a field the
 * theme's manifest actually registered as `type: "select"` — including one
 * nested inside a `list`'s composite item, e.g. `"items.0.variant"`. When
 * `apiId` is undefined, or the schema has no registered block fields at all
 * (a non-block entry, such as a page, never appears in the block-fields
 * registry), `isBlockFieldSelect` returns false for every path and nothing
 * is unwrapped — safe by construction, never a guess.
 *
 * Entering a nested resolved entry doc (`{id, data, schemaApiId, ...}` — the
 * shape a page's embedded `blocks[]` array carries, or any other resolved
 * reference field) re-derives `apiId` from that doc's own `schemaApiId` and
 * resets `path`, mirroring `stegaWalk.ts`'s `encodeEntryDataStega`. Without
 * this, every `getEntry`/`getEntries` call that embeds referenced entries
 * (a page fetched with `depth` > 0, most visibly) threads the *outer*
 * entry's `apiId` — a page's own schema is never a registered block — into
 * every nested block, so none of their `select` fields ever unwrap: exactly
 * the "non-block entry" case above, but for every block a page renders.
 */
function looksLikeEntryDoc(
  v: unknown
): v is { id: string; data: Record<string, unknown>; schemaApiId?: unknown } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).id === 'string' &&
    typeof (v as Record<string, unknown>).data === 'object' &&
    (v as Record<string, unknown>).data !== null &&
    !Array.isArray((v as Record<string, unknown>).data)
  );
}

function projectLocalizedValue(
  value: unknown,
  locale: string | null,
  apiId: string | undefined,
  path: string
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, i) =>
      projectLocalizedValue(item, locale, apiId, path === '' ? String(i) : `${path}.${i}`)
    );
  }
  if (value === null || typeof value !== 'object') return value;
  if (looksLikeSelectValue(value) && isBlockFieldSelect(apiId, path)) return value.value;

  if (looksLikeEntryDoc(value)) {
    const nestedApiId = typeof value.schemaApiId === 'string' ? value.schemaApiId : undefined;
    return { ...value, data: projectLocalizedValue(value.data, locale, nestedApiId, '') };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => localeKey.test(key))) {
    const exact = locale ? record[locale] : undefined;
    const language = locale?.split('-')[0]?.toLowerCase();
    const languageKey = language
      ? keys.find((key) => key.split('-')[0]?.toLowerCase() === language)
      : undefined;
    return projectLocalizedValue(
      exact !== undefined ? exact : record[languageKey ?? keys[0]!],
      locale,
      apiId,
      path
    );
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      projectLocalizedValue(item, locale, apiId, path === '' ? key : `${path}.${key}`),
    ])
  );
}

function projectLocalizedLeaves(
  data: Record<string, unknown>,
  locale: string | null,
  apiId: string | undefined
): Record<string, unknown> {
  return projectLocalizedValue(data, locale, apiId, '') as Record<string, unknown>;
}
