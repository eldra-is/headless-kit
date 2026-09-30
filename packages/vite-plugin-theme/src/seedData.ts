import { isRecord } from './util';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_VALUE_KEYS = new Set(['assetId', 'framing']);
/** The two shapes a seed may name a referenced object by: one that already
 * exists (`id`), or a catalog collection Core looks up by slug on deploy. */
const REFERENCE_ID_KEYS = new Set(['_type', 'id']);
const REFERENCE_SLUG_KEYS = new Set(['_type', 'slug']);
const REFERENCE_MESSAGE =
  'reference values must be absent, {_type, id: uuid} or {_type: "collection", slug} — Core resolves the slug at seed time';
const REFERENCE_RELATION_MESSAGE =
  'a {_type: "collection", slug} seed reference needs a relation with allowCollections';
/** A `link` target named by handle. Wider than `REFERENCE_SLUG_KEYS` on
 * purpose: Core resolves a link target's slug against both catalogs, while the
 * `reference` field's own seed grammar stays collection-only. */
const LINK_SLUG_KEYS = new Set(['_type', 'slug']);
const LINK_SLUG_TYPES = new Set(['product', 'collection']);
const LINK_KINDS = new Set(['product', 'collection', 'category', 'entry', 'page', 'url']);
const LINK_MESSAGE =
  'link values must be {kind, …}: a target is absent, {_type, id: uuid} or {_type: "product"|"collection", slug} — Core resolves the slug at seed time';

/** How one finding is worded, so the same walk serves both callers: a block's
 * `mock.json` (`<file>: <path>: <message>`) and a template seed's block data
 * (`templates[i].blocks[j].data — <path>: <message>`). */
export type SeedErrorFormat = (path: string, message: string) => string;

/**
 * Validates one seed's data against the block's own fields: the two value
 * shapes Core's write side refuses outright are media and reference values.
 *
 * **Media.** Studio seeds a freshly-inserted block's CMS entry from `mock.json`
 * verbatim, and the CMS's write-side media validator only accepts
 * `{ assetId: <uuid>, framing? }` — the starter's old convention of
 * embedding a Storybook fixture
 * (`{ assetId: "demo-<name>", url, altText }`) in a media field 400s every
 * such insert. Seed data must therefore either omit a media field entirely
 * or carry a write-valid value; demo imagery belongs in the sibling
 * `preview.json` overlay instead. Walks the block's field tree (including
 * `list`/`composite` nesting) alongside the parsed data object so a media
 * field buried inside `feature-grid`'s `items` or `gallery`'s multi-value
 * `images` is checked too, not just top-level fields. A theme's template
 * seeds are the same kind of write, so they go through the same walk.
 *
 * **References.** A `reference` field's seed value either names an object that
 * already exists (`{_type, id: <uuid>}`) or, for a relation that allows catalog
 * collections, names one by slug (`{_type: "collection", slug}`) — the form a
 * theme ships, because a theme cannot know the organisation's collection ids.
 * Core resolves that slug against the organisation's own catalog at seed time
 * and leaves the field empty when nothing matches, so a deploy still succeeds.
 * Anything else — a bare handle string, a resolved read's full object, a slug
 * on a relation that allows no collection — would be written verbatim into an
 * entry Core then refuses, so it is refused here with the path that carries it.
 *
 * **Links.** A `link` field's seed value carries a `kind` and, for every kind
 * but `url`, an optional `target`. A product or a collection may be named by
 * handle (`{_type: "product", slug}`) because a theme cannot know an
 * organisation's catalog ids and Core resolves the handle at seed time; the
 * other kinds address organisation-owned objects a theme has no portable name
 * for, so a seed leaves their target out and an author fills it in. Children
 * are walked too, and one of them may not carry children of its own.
 */
export function checkSeedData(
  format: SeedErrorFormat,
  fields: Array<Record<string, unknown>>,
  data: Record<string, unknown>,
  errors: string[],
  pathPrefix = ''
): void {
  for (const field of fields) {
    const fieldId = String(field.fieldId ?? '');
    if (fieldId === '' || !Object.hasOwn(data, fieldId)) continue;
    const value = data[fieldId];
    const path = pathPrefix === '' ? fieldId : `${pathPrefix}.${fieldId}`;
    const metadata =
      field.metadata !== null && typeof field.metadata === 'object'
        ? (field.metadata as Record<string, unknown>)
        : {};

    if (field.type === 'media') {
      if (metadata.multiple === true) {
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            checkMediaValue(format, `${path}[${index}]`, item, errors)
          );
        } else {
          checkMediaValue(format, path, value, errors);
        }
      } else {
        checkMediaValue(format, path, value, errors);
      }
      continue;
    }

    if (field.type === 'reference') {
      const relation = isRecord(field.relation) ? field.relation : {};
      if (relation.multiple === true) {
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            checkReferenceValue(format, `${path}[${index}]`, item, relation, errors)
          );
        } else {
          checkReferenceValue(format, path, value, relation, errors);
        }
      } else {
        checkReferenceValue(format, path, value, relation, errors);
      }
      continue;
    }

    if (field.type === 'link') {
      checkLinkValue(format, path, value, errors);
      continue;
    }

    if (field.type === 'composite') {
      const nestedFields = Array.isArray(metadata.fields)
        ? (metadata.fields as Array<Record<string, unknown>>)
        : [];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        checkSeedData(format, nestedFields, value as Record<string, unknown>, errors, path);
      }
      continue;
    }

    if (field.type === 'list') {
      const item = isRecord(metadata.item) ? metadata.item : null;
      if (item === null || !Array.isArray(value)) continue;
      const itemFields =
        item.type === 'composite' &&
        Array.isArray((item.metadata as Record<string, unknown>)?.fields)
          ? ((item.metadata as Record<string, unknown>).fields as Array<Record<string, unknown>>)
          : null;
      value.forEach((entry, index) => {
        if (item.type === 'media') {
          checkMediaValue(format, `${path}[${index}]`, entry, errors);
        } else if (item.type === 'link') {
          checkLinkValue(format, `${path}[${index}]`, entry, errors);
        } else if (itemFields !== null && entry !== null && typeof entry === 'object') {
          checkSeedData(
            format,
            itemFields,
            entry as Record<string, unknown>,
            errors,
            `${path}[${index}]`
          );
        }
      });
    }
  }
}

function checkMediaValue(
  format: SeedErrorFormat,
  path: string,
  value: unknown,
  errors: string[]
): void {
  const valid =
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => MEDIA_VALUE_KEYS.has(key)) &&
    typeof (value as Record<string, unknown>).assetId === 'string' &&
    UUID_PATTERN.test((value as Record<string, unknown>).assetId as string);
  if (!valid) {
    errors.push(
      format(path, 'media values must be {assetId: uuid} — use preview.json for demo imagery')
    );
  }
}

/**
 * One reference value. `_type` is required in both forms — Core reads it to
 * know which catalog the identifier belongs to — and the id form is checked
 * only for shape: whether that object exists is the deploy's to find out,
 * exactly like the slug form.
 */
function checkReferenceValue(
  format: SeedErrorFormat,
  path: string,
  value: unknown,
  relation: Record<string, unknown>,
  errors: string[]
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(format(path, REFERENCE_MESSAGE));
    return;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const type = typeof record._type === 'string' ? record._type.trim() : '';
  const byId =
    keys.every((key) => REFERENCE_ID_KEYS.has(key)) &&
    type !== '' &&
    typeof record.id === 'string' &&
    UUID_PATTERN.test(record.id);
  const bySlug =
    keys.every((key) => REFERENCE_SLUG_KEYS.has(key)) &&
    type === 'collection' &&
    typeof record.slug === 'string' &&
    record.slug.trim() !== '';
  if (!byId && !bySlug) {
    errors.push(format(path, REFERENCE_MESSAGE));
    return;
  }
  // A slug only resolves against the catalog the relation opens: a theme that
  // did not ask for collections must not smuggle one in through a seed.
  if (bySlug && relation.allowCollections !== true) {
    errors.push(format(path, REFERENCE_RELATION_MESSAGE));
  }
}

/**
 * One link value, and each of its children.
 *
 * A theme cannot know an organisation's catalog ids, so a seed may name a
 * product or a collection by handle — `{_type: "product", slug}` — and Core
 * resolves it against that organisation's own catalog on deploy, leaving the
 * link out when nothing matches rather than failing the deploy. The other four
 * kinds have no portable handle (a category, an entry and a page are all
 * organisation-owned), so they can only be seeded by an id a theme does not
 * have — which is why a seed for them names no target at all and an author
 * fills it in.
 *
 * Unlike `reference`, a `link` carries no `relation`: which catalogs it may
 * name is the type's own grammar rather than the field's, so there is no
 * analogue of the relation check above.
 */
function checkLinkValue(
  format: SeedErrorFormat,
  path: string,
  value: unknown,
  errors: string[],
  isChild = false
): void {
  if (!isRecord(value)) {
    errors.push(format(path, LINK_MESSAGE));
    return;
  }
  const kind = typeof value.kind === 'string' ? value.kind.trim() : '';
  if (!LINK_KINDS.has(kind)) {
    errors.push(format(path, LINK_MESSAGE));
    return;
  }
  if (kind === 'url') {
    if (typeof value.url !== 'string' || value.url.trim() === '' || value.target !== undefined) {
      errors.push(format(path, LINK_MESSAGE));
    }
  } else {
    if (value.url !== undefined) {
      errors.push(format(path, LINK_MESSAGE));
    } else if (value.target !== undefined && !validLinkTarget(value.target, kind)) {
      errors.push(format(path, LINK_MESSAGE));
    }
  }
  if (value.children === undefined) return;
  // Depth 2, never 3: an item may carry children, a child may not. Core
  // refuses a deeper value outright, so a seed carrying one would write
  // something no author could ever save again.
  if (isChild || !Array.isArray(value.children)) {
    errors.push(format(path, LINK_MESSAGE));
    return;
  }
  value.children.forEach((child, index) =>
    checkLinkValue(format, `${path}.children[${index}]`, child, errors, true)
  );
}

function validLinkTarget(target: unknown, kind: string): boolean {
  if (!isRecord(target)) return false;
  const keys = Object.keys(target);
  const type = typeof target._type === 'string' ? target._type.trim() : '';
  if (type === '') return false;
  if (
    keys.every((key) => REFERENCE_ID_KEYS.has(key)) &&
    typeof target.id === 'string' &&
    UUID_PATTERN.test(target.id)
  ) {
    return true;
  }
  return (
    keys.every((key) => LINK_SLUG_KEYS.has(key)) &&
    LINK_SLUG_TYPES.has(kind) &&
    type === kind &&
    typeof target.slug === 'string' &&
    target.slug.trim() !== ''
  );
}
