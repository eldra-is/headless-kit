import { describe, expect, it } from 'vitest';
import { checkSeedData } from '../seedData';

const format = (path: string, message: string) => `${path}: ${message}`;
const UUID = '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a01';

const collectionField = {
  fieldId: 'collection',
  name: 'Collection',
  type: 'reference',
  relation: { allowCollections: true },
};
const productField = {
  fieldId: 'product',
  name: 'Product',
  type: 'reference',
  relation: { allowProducts: true },
};

function errorsFor(
  fields: Array<Record<string, unknown>>,
  data: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  checkSeedData(format, fields, data, errors);
  return errors;
}

describe('checkSeedData — reference values', () => {
  it('accepts a reference field the seed leaves out entirely', () => {
    expect(errorsFor([collectionField], { variant: 'sidebar' })).toEqual([]);
  });

  it('accepts the id form, which names an object that already exists', () => {
    expect(errorsFor([collectionField], { collection: { _type: 'collection', id: UUID } })).toEqual(
      []
    );
    expect(errorsFor([productField], { product: { _type: 'product', id: UUID } })).toEqual([]);
  });

  it('accepts the slug form when the relation allows collections', () => {
    expect(
      errorsFor([collectionField], { collection: { _type: 'collection', slug: 'the-winter-edit' } })
    ).toEqual([]);
  });

  it('refuses the slug form when the relation does not allow collections', () => {
    expect(
      errorsFor([productField], { product: { _type: 'collection', slug: 'the-winter-edit' } })
    ).toEqual([
      'product: a {_type: "collection", slug} seed reference needs a relation with allowCollections',
    ]);
  });

  it('refuses an id that is not a uuid', () => {
    expect(
      errorsFor([collectionField], { collection: { _type: 'collection', id: 'winter' } })
    ).toEqual([
      'collection: reference values must be absent, {_type, id: uuid} or {_type: "collection", slug} — Core resolves the slug at seed time',
    ]);
  });

  it('refuses a bare handle string, a null, and an unknown key beside the identifier', () => {
    expect(errorsFor([collectionField], { collection: 'the-winter-edit' })).toHaveLength(1);
    expect(errorsFor([collectionField], { collection: null })).toHaveLength(1);
    expect(errorsFor([collectionField], { collection: { id: UUID } })).toHaveLength(1);
    expect(
      errorsFor([collectionField], { collection: { _type: 'collection', slug: 'x', title: 'X' } })
    ).toHaveLength(1);
    expect(
      errorsFor([collectionField], { collection: { _type: 'collection', id: UUID, slug: 'x' } })
    ).toHaveLength(1);
    expect(
      errorsFor([collectionField], { collection: { _type: 'collection', slug: '  ' } })
    ).toHaveLength(1);
  });

  it('checks every item of a multiple relation, naming the index', () => {
    const field = {
      ...collectionField,
      relation: { allowCollections: true, multiple: true },
    };
    expect(
      errorsFor([field], {
        collection: [{ _type: 'collection', slug: 'the-winter-edit' }, { _type: 'collection' }],
      })
    ).toEqual([
      'collection[1]: reference values must be absent, {_type, id: uuid} or {_type: "collection", slug} — Core resolves the slug at seed time',
    ]);
    // A lone value under a `multiple` relation is checked as one value rather
    // than refused for its cardinality — the same tolerance the media walk
    // above has always had, and cardinality is the manifest diff's job.
    expect(
      errorsFor([field], { collection: { _type: 'collection', slug: 'the-winter-edit' } })
    ).toEqual([]);
  });

  it('walks into a list of composites, so a nested reference is named by its path', () => {
    const fields = [
      {
        fieldId: 'rows',
        name: 'Rows',
        type: 'list',
        metadata: {
          item: {
            fieldId: 'item',
            name: 'Row',
            type: 'composite',
            metadata: { fields: [collectionField] },
          },
        },
      },
    ];
    expect(
      errorsFor(fields, {
        rows: [{ collection: { _type: 'collection', slug: 'ok' } }, { collection: 'nope' }],
      })
    ).toEqual([
      'rows[1].collection: reference values must be absent, {_type, id: uuid} or {_type: "collection", slug} — Core resolves the slug at seed time',
    ]);
  });

  it('still refuses a media value that is not {assetId: uuid}', () => {
    const fields = [{ fieldId: 'image', name: 'Image', type: 'media' }];
    expect(errorsFor(fields, { image: { assetId: 'demo-1', url: '/demo/1.svg' } })).toEqual([
      'image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });
});
