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
