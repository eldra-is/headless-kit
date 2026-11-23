/**
 * Core's own two reads of the same records (WS-1358): each fixture under
 * `fixtures/preview-parity/` is recorded from cms-service's read code — the public answer a build
 * prerenders and the preview answer a draft preview session reads — with the differences Core
 * documents for it. `asPublicRead` over the preview answer must give the public answer, apart from
 * exactly those: the entry metadata a draft carries (`status`, which the public read drops;
 * `publishedAt` and `updatedAt`, which Publish sets) and a media item's `linkId` (one link row per
 * owner). Anything else that differs is a mismatch a session would render.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asPublicRead } from '../index';

const dir = join(__dirname, 'fixtures', 'preview-parity');
const vectors = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => ({
    name,
    ...(JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
      case: string;
      differences: string[];
      public: { body: unknown };
      preview: { body: unknown };
    }),
  }));

const ENTRY_METADATA = ['status', 'publishedAt', 'updatedAt'];

/** An entry's envelope: what `MergeData` writes around every record. */
const isEntry = (record: Record<string, unknown>): boolean =>
  'id' in record && 'schemaId' in record && 'data' in record;

/** Both answers without the documented differences, so the rest compares exactly. */
function withoutDocumented(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDocumented);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const entry = isEntry(record);
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== 'linkId' && !(entry && ENTRY_METADATA.includes(key)))
      .map(([key, child]) => [key, withoutDocumented(child)])
  );
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([name, child]) => name === key || containsKey(child, key));
}

describe('asPublicRead over Core’s recorded reads', () => {
  it('has the vectors', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(18);
  });

  for (const vector of vectors) {
    it(`${vector.case}: the preview answer, read as public, is the public answer`, () => {
      const read = asPublicRead(vector.preview.body);
      expect(containsKey(read, 'reusableComponentProjection')).toBe(false);
      expect(withoutDocumented(read)).toEqual(withoutDocumented(vector.public.body));
    });
  }

  it('leaves the public answers as they are', () => {
    for (const vector of vectors) {
      expect(asPublicRead(vector.public.body), vector.case).toEqual(vector.public.body);
    }
  });

  it('covers a projection outside the top level (a nested page, a list)', () => {
    const nested = vectors.filter(
      (vector) =>
        containsKey(vector.preview.body, 'reusableComponentProjection') &&
        !Object.hasOwn(vector.preview.body as object, 'reusableComponentProjection')
    );
    expect(nested.map((vector) => vector.case).sort()).not.toEqual([]);
  });
});
