/**
 * Core's own two reads of the same records (WS-1358): each fixture under
 * `fixtures/preview-parity/` is recorded from cms-service's read code — the public answer a build
 * prerenders and the preview answer a draft preview session reads — with the differences Core
 * documents for it. `asPublicRead` over the preview answer must give the public answer, apart from
 * exactly those: an entry's `publishedAt` and `updatedAt` (Publish sets them) and a media item's
 * `linkId` (one link row per owner). `status`, which the public read drops, `asPublicRead` drops
 * too. Anything else that differs is a mismatch a session would render.
 *
 * One vector is a refusal, not two answers: a page placing a component that no longer resolves
 * (archived) is served by the public read with the placement dropped, and refused by a preview
 * read (404 `REUSABLE_COMPONENT_NOT_FOUND`), so a session resolves no page (a 404 is the theme's
 * not-found) and shows nothing of it. That is the accepted difference (`docs/themes.md`); the spec pins it.
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
      public: { status: number; body: unknown };
      preview: { status: number; body: unknown };
    }),
  }));

const ENTRY_METADATA = ['publishedAt', 'updatedAt'];

/** The one refusal: a preview read refuses a placement that does not resolve. */
const REFUSED = ['divergence-archived-component.json'];
const answered = vectors.filter((vector) => !REFUSED.includes(vector.name));

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

/** How many entry envelopes carry a `status`. */
function entryStatuses(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce((sum: number, item) => sum + entryStatuses(item), 0);
  if (typeof value !== 'object' || value === null) return 0;
  const record = value as Record<string, unknown>;
  const own = isEntry(record) && 'status' in record ? 1 : 0;
  return Object.values(record).reduce((sum: number, child) => sum + entryStatuses(child), own);
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([name, child]) => name === key || containsKey(child, key));
}

describe('asPublicRead over Core’s recorded reads', () => {
  it('has the vectors', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(31);
  });

  for (const vector of answered) {
    it(`${vector.case}: the preview answer, read as public, is the public answer`, () => {
      expect([vector.public.status, vector.preview.status]).toEqual([200, 200]);
      const read = asPublicRead(vector.preview.body);
      expect(containsKey(read, 'reusableComponentProjection')).toBe(false);
      expect(withoutDocumented(read)).toEqual(withoutDocumented(vector.public.body));
    });
  }

  it('drops every entry status, as the public read does', () => {
    const withStatus = answered.filter((vector) => entryStatuses(vector.preview.body) > 0);
    expect(withStatus).not.toEqual([]);
    for (const vector of answered) {
      expect(entryStatuses(asPublicRead(vector.preview.body)), vector.case).toBe(0);
      expect(entryStatuses(vector.public.body), vector.case).toBe(0);
    }
  });

  it('a preview read refuses a placed component that does not resolve (accepted difference)', () => {
    const [vector] = vectors.filter((candidate) => REFUSED.includes(candidate.name));
    expect(vector?.public.status).toBe(200);
    expect(vector?.preview.status).toBe(404);
    expect(vector?.preview.body).toMatchObject({ errorId: 'REUSABLE_COMPONENT_NOT_FOUND' });
    // The refusal is passed on as it is: there is nothing to reshape.
    expect(asPublicRead(vector?.preview.body)).toEqual(vector?.preview.body);
  });

  it('leaves the public answers as they are', () => {
    for (const vector of answered) {
      expect(asPublicRead(vector.public.body), vector.case).toEqual(vector.public.body);
    }
  });

  it('covers a projection outside the top level (a nested page, a list)', () => {
    const nested = answered.filter(
      (vector) =>
        containsKey(vector.preview.body, 'reusableComponentProjection') &&
        !Object.hasOwn(vector.preview.body as object, 'reusableComponentProjection')
    );
    expect(nested.map((vector) => vector.case).sort()).not.toEqual([]);
  });
});
