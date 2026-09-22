import { encodeStega } from './stega';

const LOCALE_KEY = /^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

/**
 * Projects a complete localized CMS draft into the active-locale shape used
 * by theme renderers. The input is never mutated, so Studio can keep sending
 * and persisting the complete document.
 */
export function projectEntryDataLocale(
  data: Record<string, unknown>,
  locale: string | null
): Record<string, unknown> {
  const project = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(project);
    if (typeof value !== 'object' || value === null) return value;

    const entries = Object.entries(value);
    if (
      locale !== null &&
      entries.length > 0 &&
      entries.every(([key]) => LOCALE_KEY.test(key)) &&
      Object.prototype.hasOwnProperty.call(value, locale)
    ) {
      return project((value as Record<string, unknown>)[locale]);
    }

    return Object.fromEntries(entries.map(([key, child]) => [key, project(child)]));
  };

  return project(data) as Record<string, unknown>;
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
 *  Entering a nested resolved entry doc re-roots entryId and fieldPath. */
export function encodeEntryDataStega(
  entryId: string,
  data: Record<string, unknown>,
  locale: string | null
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
      // resolved reference: strings inside belong to the referenced entry
      return { ...value, data: encodeEntryDataStega(value.id, value.data, locale) };
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
