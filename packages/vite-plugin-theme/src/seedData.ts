import { isRecord } from './util';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_VALUE_KEYS = new Set(['assetId', 'framing']);

/** How one finding is worded, so the same walk serves both callers: a block's
 * `mock.json` (`<file>: <path>: <message>`) and a template seed's block data
 * (`templates[i].blocks[j].data — <path>: <message>`). */
export type SeedErrorFormat = (path: string, message: string) => string;

/**
 * Studio seeds a freshly-inserted block's CMS entry from `mock.json`
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
 */
export function checkSeedMedia(
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

    if (field.type === 'composite') {
      const nestedFields = Array.isArray(metadata.fields)
        ? (metadata.fields as Array<Record<string, unknown>>)
        : [];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        checkSeedMedia(format, nestedFields, value as Record<string, unknown>, errors, path);
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
          checkSeedMedia(
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
