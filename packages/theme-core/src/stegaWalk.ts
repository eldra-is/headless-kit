import { encodeStega } from './stega';
import { isBlockFieldSelect } from './blockFields';

const LOCALE_KEY = /^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

/**
 * A resolved `select` field's public-read shape: the CMS gateway replaces
 * the stored plain string with `{ value, label }` so a schema-blind consumer
 * can show a human label.
 * Themes only ever declare `select` fields as their plain value union
 * (generated from `block.json`), so `Block.vue` compares the field directly
 * against those literals — never against this wrapper. Left unprojected in
 * the live-editing draft, a `select`/`variant` field never matches and a
 * block silently keeps its default/no-variant markup while editing.
 *
 * This shape check alone is not enough to unwrap: a theme-authored composite
 * field can legitimately declare two string sub-fields literally named
 * `value`/`label`. `project` below additionally confirms, via
 * `isBlockFieldSelect`, that the *registered* field at the current path
 * really is `type: "select"` before unwrapping.
 */
function looksLikeSelectValue(value: unknown): value is { value: string; label: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.value === 'string' &&
    typeof record.label === 'string'
  );
}

/**
 * Projects a complete localized CMS draft into the active-locale shape used
 * by theme renderers. The input is never mutated, so Studio can keep sending
 * and persisting the complete document.
 *
 * `apiId` (the entry's own `schemaApiId`, when known) gates the
 * `{value,label}` select unwrap above on `isBlockFieldSelect`, tracking the
 * dot-separated field path as the walk descends (the same convention
 * `encodeEntryDataStega`'s `walk` uses), so it only fires for a field the
 * theme's manifest actually registered as `type: "select"` — including one
 * nested inside a `list`'s composite item, e.g. `"items.0.variant"`. When
 * `apiId` is omitted, or the schema has no registered block fields at all
 * (a non-block entry, such as a page, never appears in the block-fields
 * registry), `isBlockFieldSelect` returns false for every path and nothing
 * is unwrapped — safe by construction, never a guess.
 *
 * Entering a nested resolved entry doc (`{id, data, schemaApiId, ...}` —
 * the shape a page's embedded `blocks[]` array carries, or any other
 * resolved reference field) re-derives `apiId` from that doc's own
 * `schemaApiId` and resets the path, mirroring `encodeEntryDataStega`'s
 * `walkNode`: a page's own schema is never registered as a block, so
 * threading the outer `apiId` straight through would make every nested
 * block's own select fields silently fail to unwrap forever, exactly the
 * "non-block entry" case above — but the nested doc has its own registered
 * fields once its own `schemaApiId` is used.
 */
export function projectEntryDataLocale(
  data: Record<string, unknown>,
  locale: string | null,
  apiId?: string
): Record<string, unknown> {
  const project = (value: unknown, path: string, currentApiId: string | undefined): unknown => {
    if (Array.isArray(value)) {
      return value.map((item, i) =>
        project(item, path === '' ? String(i) : `${path}.${i}`, currentApiId)
      );
    }
    if (typeof value !== 'object' || value === null) return value;
    if (looksLikeSelectValue(value) && isBlockFieldSelect(currentApiId, path)) return value.value;
    if (looksLikeCatalogReference(value)) return value;

    if (looksLikeEntryDoc(value)) {
      const nestedApiId =
        typeof (value as Record<string, unknown>).schemaApiId === 'string'
          ? ((value as Record<string, unknown>).schemaApiId as string)
          : undefined;
      return { ...value, data: project(value.data, '', nestedApiId) };
    }

    const entries = Object.entries(value);
    if (
      locale !== null &&
      entries.length > 0 &&
      entries.every(([key]) => LOCALE_KEY.test(key)) &&
      Object.prototype.hasOwnProperty.call(value, locale)
    ) {
      return project((value as Record<string, unknown>)[locale], path, currentApiId);
    }

    return Object.fromEntries(
      entries.map(([key, child]) => [
        key,
        project(child, path === '' ? key : `${path}.${key}`, currentApiId),
      ])
    );
  };

  return project(data, '', apiId) as Record<string, unknown>;
}

/** A resolved reference embedded by the gateway looks like an entry doc: { id, data: {...} }. */
function looksLikeEntryDoc(v: unknown): v is { id: string; data: Record<string, unknown> } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).id === 'string' &&
    typeof (v as Record<string, unknown>).data === 'object' &&
    (v as Record<string, unknown>).data !== null &&
    !Array.isArray((v as Record<string, unknown>).data)
  );
}

/**
 * A catalog reference — a product or a collection a `reference` field points at
 * (`{ id, _type: 'collection', slug, status, productCount, … }`, resolved, or
 * just `{ id, _type }` at depth 0, for an archived collection, and in a
 * page-builder draft overlay). It
 * carries no `data`, so it is never an entry doc, and every field on it is
 * catalog control data a block looks the thing up by — `slug` above all, which
 * a theme block hands straight to the storefront. Encoding it would send that
 * request after a collection nobody has, exactly like an encoded media URL
 * (`looksLikeMediaAsset`) requests an asset nobody has. `translations` is also
 * locale-keyed without being one of the theme's own localized fields, so the
 * locale projection has to leave it whole too.
 */
function looksLikeCatalogReference(
  v: unknown
): v is { id: string; _type: 'product' | 'collection' } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const record = v as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    (record._type === 'collection' || record._type === 'product') &&
    record.data === undefined
  );
}

/** An unresolved CMS reference keeps its identity fields as transport metadata. */
function looksLikeEntryReference(v: unknown): v is { id: string; _type: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).id === 'string' &&
    typeof (v as Record<string, unknown>)._type === 'string'
  );
}

/** Core's ordered compatibility mirror represents references as
 * `{ position, type: 'entry', value: '<uuid>' }`. These transport fields must
 * remain structural so the preview overlay can resolve them after stega. */
function looksLikePositionedEntryReference(
  v: unknown
): v is { position: number; type: 'entry'; value: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    Number.isInteger((v as Record<string, unknown>).position) &&
    (v as Record<string, unknown>).type === 'entry' &&
    typeof (v as Record<string, unknown>).value === 'string'
  );
}

/** Hydrated media is renderer control data. Encoding its URL (or any other
 * asset metadata) changes the requested resource and makes preview images
 * fail even though the original URL is valid. */
function looksLikeMediaAsset(v: unknown): v is { assetId: string; url: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).assetId === 'string' &&
    typeof (v as Record<string, unknown>).url === 'string'
  );
}

/** Deep-copies `data`, stega-encoding every string leaf with its dot path.
 *  Entering a nested resolved entry doc re-roots entryId and fieldPath.
 *
 *  `apiId` (the entry's own `schemaApiId`, when known) is used only to skip
 *  encoding a registered `select` field's resolved value (e.g. `variant`,
 *  top-level or nested inside a `list`'s composite item — see
 *  `isBlockFieldSelect`): that string is never displayed as editable text,
 *  only compared with `===` inside a `Block.vue`, and stega's invisible
 *  tracking characters make that comparison silently fail forever. Entering
 *  a nested resolved entry doc (a page's embedded block) re-derives `apiId`
 *  from that doc's own `schemaApiId`, so a block's own select fields are
 *  protected the same way whether it is fetched directly or embedded inside
 *  a page. */
export function encodeEntryDataStega(
  entryId: string,
  data: Record<string, unknown>,
  locale: string | null,
  apiId?: string
): Record<string, unknown> {
  const cloneStructural = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(cloneStructural);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneStructural(child)])
    );
  };
  const walkRichTextNode = (
    value: Record<string, unknown>,
    ownerId: string,
    path: string
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      if (key === 'type' || key === 'attrs' || key === 'marks') {
        // Tiptap node/mark types and attributes are renderer control data.
        // Encoding them makes safe renderers stop recognizing nodes and can
        // corrupt URL-valued attributes. Only user-visible text leaves carry
        // stega metadata.
        out[key] = cloneStructural(child);
      } else if (key === 'content' && Array.isArray(child)) {
        out[key] = child.map((nested, index) => {
          const nestedPath = `${childPath}.${index}`;
          return looksLikeRichTextNode(nested)
            ? walkRichTextNode(nested, ownerId, nestedPath)
            : walkNode(nested, ownerId, nestedPath);
        });
      } else {
        out[key] = walkNode(child, ownerId, childPath);
      }
    }
    return out;
  };
  const walk = (value: unknown, ownerId: string, path: string): unknown => {
    if (typeof value === 'string') {
      // A select field's resolved value — top-level, or nested inside a
      // `list`'s composite item (e.g. "items.0.variant") — is comparison
      // data, not editable text; see the doc comment above.
      if (isBlockFieldSelect(apiId, path)) return value;
      return encodeStega(value, { entryId: ownerId, fieldPath: path, locale });
    }
    if (Array.isArray(value)) {
      return value.map((item, i) =>
        walkNode(item, ownerId, path === '' ? String(i) : `${path}.${i}`)
      );
    }
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value)) {
        out[key] = walkNode(v, ownerId, path === '' ? key : `${path}.${key}`);
      }
      return out;
    }
    return value;
  };
  const walkNode = (value: unknown, ownerId: string, path: string): unknown => {
    if (looksLikeRichTextRoot(value)) {
      return walkRichTextNode(value, ownerId, path);
    }
    if (looksLikeMediaAsset(value)) {
      return cloneStructural(value);
    }
    if (looksLikeEntryDoc(value)) {
      // resolved reference: strings inside belong to the referenced entry.
      // Re-derive apiId from the nested doc's own schemaApiId so its select
      // fields are protected too — it very likely differs from the owner's.
      const nestedApiId =
        typeof (value as Record<string, unknown>).schemaApiId === 'string'
          ? ((value as Record<string, unknown>).schemaApiId as string)
          : undefined;
      return { ...value, data: encodeEntryDataStega(value.id, value.data, locale, nestedApiId) };
    }
    if (looksLikeCatalogReference(value)) {
      return cloneStructural(value);
    }
    if (looksLikeEntryReference(value)) {
      // Reference identity is structural: encoding it breaks resolved-entry lookup.
      const encoded = walk(value, ownerId, path) as Record<string, unknown>;
      return { ...encoded, id: value.id, _type: value._type };
    }
    if (looksLikePositionedEntryReference(value)) {
      return cloneStructural(value);
    }
    return walk(value, ownerId, path);
  };
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(data)) {
    // Layout is non-localized structural data. Encoding its ids, node kinds,
    // enum values, or CSS lengths would make the shared validator reject the
    // otherwise valid preview document. Block content is encoded through each
    // referenced entry's own draft instead.
    result[key] = key === 'layout' ? v : walkNode(v, entryId, key);
  }
  return result;
}

function looksLikeRichTextRoot(value: unknown): value is Record<string, unknown> {
  return looksLikeRichTextNode(value) && value.type === 'doc';
}

function looksLikeRichTextNode(
  value: unknown
): value is Record<string, unknown> & { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}
