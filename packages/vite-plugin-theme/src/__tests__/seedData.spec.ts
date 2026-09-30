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

describe('checkSeedData — link values', () => {
  const LINK_MESSAGE =
    'link values must be {kind, …}: a target is absent, {_type, id: uuid} or {_type: "product"|"collection", slug} — Core resolves the slug at seed time';
  const linkField = { fieldId: 'cta', name: 'Button link', type: 'link' };
  const linkList = {
    fieldId: 'links',
    name: 'Links',
    type: 'list',
    metadata: { item: { fieldId: 'link', name: 'Link', type: 'link', metadata: { tree: true } } },
  };

  it('accepts a link field the seed leaves out entirely', () => {
    expect(errorsFor([linkField], { variant: 'default' })).toEqual([]);
  });

  it('accepts a collection named by slug, a product named by slug and a target by id', () => {
    expect(
      errorsFor([linkField], {
        cta: { kind: 'collection', target: { _type: 'collection', slug: 'gifts' } },
      })
    ).toEqual([]);
    expect(
      errorsFor([linkField], {
        cta: { kind: 'product', target: { _type: 'product', slug: 'ash-glaze-mug' } },
      })
    ).toEqual([]);
    expect(
      errorsFor([linkField], { cta: { kind: 'page', target: { _type: 'page', id: UUID } } })
    ).toEqual([]);
  });

  it('accepts a kind whose target the theme cannot name yet', () => {
    expect(errorsFor([linkField], { cta: { kind: 'entry', label: 'Read the journal' } })).toEqual(
      []
    );
  });

  it('accepts a url link, and a url link that heads a mega-menu column', () => {
    expect(errorsFor([linkField], { cta: { kind: 'url', url: '/journal' } })).toEqual([]);
    expect(
      errorsFor([linkList], {
        links: [
          {
            kind: 'url',
            url: '/journal',
            children: [{ kind: 'url', url: '/journal/care', group: 'Guides' }],
          },
        ],
      })
    ).toEqual([]);
  });

  it('accepts a list of links with collection children', () => {
    expect(
      errorsFor([linkList], {
        links: [
          {
            kind: 'collection',
            target: { _type: 'collection', slug: 'knitwear' },
            label: 'Knitwear',
            children: [
              {
                kind: 'collection',
                target: { _type: 'collection', slug: 'womens-sweaters' },
                group: 'Women',
                label: 'Sweaters',
              },
            ],
          },
        ],
      })
    ).toEqual([]);
  });

  it('accepts a heading: kind "none" with a label and children', () => {
    expect(
      errorsFor([linkList], {
        links: [
          {
            kind: 'none',
            label: 'Shop',
            children: [{ kind: 'url', url: '/collections/knitwear', label: 'Knitwear' }],
          },
        ],
      })
    ).toEqual([]);
  });

  it.each([
    ['no children at all', { kind: 'none', label: 'Shop' }],
    ['an empty children list', { kind: 'none', label: 'Shop', children: [] }],
    ['no label', { kind: 'none', children: [{ kind: 'url', url: '/a', label: 'A' }] }],
    [
      'a blank label',
      { kind: 'none', label: '  ', children: [{ kind: 'url', url: '/a', label: 'A' }] },
    ],
    [
      'a url',
      {
        kind: 'none',
        label: 'Shop',
        url: '/x',
        children: [{ kind: 'url', url: '/a', label: 'A' }],
      },
    ],
    [
      'a target',
      {
        kind: 'none',
        label: 'Shop',
        target: { _type: 'collection', slug: 'x' },
        children: [{ kind: 'url', url: '/a', label: 'A' }],
      },
    ],
  ])('refuses a heading with %s', (_label, value) => {
    expect(errorsFor([linkField], { cta: value })).toEqual([
      'cta: a link with kind "none" is a heading: it needs a label and children, and carries no target or url',
    ]);
  });

  it('refuses a heading as a child — a child may carry no children, so it can head nothing', () => {
    expect(
      errorsFor([linkList], {
        links: [{ kind: 'url', url: '/a', children: [{ kind: 'none', label: 'Shop' }] }],
      })
    ).toEqual([
      'links[0].children[0]: a link with kind "none" is a heading: it needs a label and children, and carries no target or url',
    ]);
  });

  it('refuses a product-typed slug target on a collection link', () => {
    expect(
      errorsFor([linkField], {
        cta: { kind: 'collection', target: { _type: 'product', slug: 'gifts' } },
      })
    ).toEqual([`cta: ${LINK_MESSAGE}`]);
  });

  it('refuses a slug target for a kind Core cannot resolve a handle for', () => {
    expect(
      errorsFor([linkField], {
        cta: { kind: 'category', target: { _type: 'category', slug: 'mugs' } },
      })
    ).toEqual([`cta: ${LINK_MESSAGE}`]);
  });

  it.each([
    ['a value that is not an object', 'https://example.com'],
    ['a missing kind', { target: { _type: 'collection', slug: 'gifts' } }],
    ['an unknown kind', { kind: 'blog', url: '/journal' }],
    ['a url kind with no url', { kind: 'url' }],
    ['a url kind with a blank url', { kind: 'url', url: '   ' }],
    [
      'a url kind carrying a target',
      { kind: 'url', url: '/x', target: { _type: 'page', id: UUID } },
    ],
    ['a url on a kind that is not url', { kind: 'collection', url: '/collections/gifts' }],
    ['an id that is not a uuid', { kind: 'page', target: { _type: 'page', id: 'home' } }],
    ['a target with no _type', { kind: 'collection', target: { slug: 'gifts' } }],
    [
      'a resolved read instead of a target',
      { kind: 'collection', target: { _type: 'collection', slug: 'gifts', title: 'Gifts' } },
    ],
    ['children that are not an array', { kind: 'url', url: '/x', children: {} }],
  ])('refuses %s', (_label, value) => {
    expect(errorsFor([linkField], { cta: value })).toEqual([`cta: ${LINK_MESSAGE}`]);
  });

  it('refuses a child carrying children of its own — depth 2, never 3', () => {
    expect(
      errorsFor([linkList], {
        links: [
          {
            kind: 'url',
            url: '/a',
            children: [{ kind: 'url', url: '/b', children: [{ kind: 'url', url: '/c' }] }],
          },
        ],
      })
    ).toEqual([`links[0].children[0]: ${LINK_MESSAGE}`]);
  });

  it('walks a link nested inside a composite and inside a list of composites', () => {
    const composite = {
      fieldId: 'card',
      name: 'Card',
      type: 'composite',
      metadata: { fields: [linkField] },
    };
    expect(errorsFor([composite], { card: { cta: { kind: 'blog' } } })).toEqual([
      `card.cta: ${LINK_MESSAGE}`,
    ]);

    const listOfComposites = {
      fieldId: 'items',
      name: 'Items',
      type: 'list',
      metadata: {
        item: {
          fieldId: 'item',
          name: 'Item',
          type: 'composite',
          metadata: { fields: [linkField] },
        },
      },
    };
    expect(errorsFor([listOfComposites], { items: [{ cta: { kind: 'url' } }] })).toEqual([
      `items[0].cta: ${LINK_MESSAGE}`,
    ]);
  });
});
