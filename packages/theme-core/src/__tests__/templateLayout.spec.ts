import { describe, expect, it } from 'vitest';
import { decodeStega, encodeStega } from '../stega';
import { buildTemplateBlockRenames, createTemplateLayoutRenderModel } from '../templateLayout';

const entry = {
  id: 'entry-1',
  data: {
    title: encodeStega('Hello', { entryId: 'entry-1', fieldPath: 'title', locale: 'en' }),
    slug: 'hello',
    author: { id: 'author-1', data: { name: 'Ada' } },
  },
};
const catalog = {
  hero: {
    apiId: 'hero',
    fields: [
      { fieldId: 'heading', default: 'Default heading' },
      { fieldId: 'byline', default: 'Default byline' },
      { fieldId: 'eyebrow', default: 'News' },
    ],
  },
};
const blockEntry = {
  id: 'block-hero-1',
  schemaApiId: 'hero',
  data: { heading: 'Static heading', byline: 'Static byline', eyebrow: 'Static eyebrow' },
};
const navigationEntry = {
  id: 'block-navigation-1',
  schemaApiId: 'navigation',
  data: { links: [{ label: 'Original label', url: '/' }] },
};
const layout = (block: Record<string, unknown>) => ({
  version: 1,
  root: {
    id: 'root',
    type: 'flex',
    layout: { direction: { normal: 'column' } },
    children: [block],
  },
});

describe('template layout render model', () => {
  it('binds direct and nested values, applies defaults, and preserves stega ownership', () => {
    const model = createTemplateLayoutRenderModel(
      layout({
        id: 'hero-placement',
        type: 'template-block',
        apiId: 'hero',
        bindings: { heading: 'title', byline: 'author.name' },
      }),
      { entry, blockCatalog: catalog }
    );
    const block = model.root.children[0];
    expect(block?.type).toBe('template-block');
    if (block?.type !== 'template-block') throw new Error('expected template block');
    expect(block.entry.id).toBe('entry-1');
    expect(decodeStega(String(block.entry.data.heading))).toMatchObject({
      cleaned: 'Hello',
      meta: { entryId: 'entry-1', fieldPath: 'title', locale: 'en' },
    });
    expect(block.entry.data.byline).toBe('Ada');
    expect(block.entry.data.eyebrow).toBe('News');
    expect(model.css).toContain(model.root.className);
  });

  it('starts with the ordinary block entry and applies optional dynamic overrides', () => {
    const model = createTemplateLayoutRenderModel(
      layout({
        id: 'hero-placement',
        type: 'template-block',
        apiId: 'hero',
        entryId: blockEntry.id,
        bindings: { byline: 'author.name' },
        templates: { heading: 'Read {{ title }}' },
      }),
      { entry, blockEntries: [blockEntry], blockCatalog: catalog }
    );
    const block = model.root.children[0];
    expect(block?.type).toBe('template-block');
    if (block?.type !== 'template-block') throw new Error('expected template block');
    expect(block.entry.id).toBe(blockEntry.id);
    expect(block.entry.data.eyebrow).toBe('Static eyebrow');
    expect(block.entry.data.byline).toBe('Ada');
    expect(decodeStega(String(block.entry.data.heading))).toMatchObject({
      cleaned: 'Read Hello',
      meta: { entryId: 'entry-1', fieldPath: 'title', locale: 'en' },
    });
  });

  it('applies text templates to nested composite list-item fields without mutating the block entry', () => {
    const model = createTemplateLayoutRenderModel(
      layout({
        id: 'navigation-placement',
        type: 'template-block',
        apiId: 'navigation',
        entryId: navigationEntry.id,
        templates: {
          'links.0.label': '{{ title }}',
          'links.0.url': '/guides/{{ slug }}',
        },
      }),
      {
        entry,
        // Framework adapters may proxy both the record and nested list items.
        blockEntries: [
          {
            ...navigationEntry,
            data: new Proxy(
              {
                links: new Proxy(
                  navigationEntry.data.links.map((item) => new Proxy(item, {})),
                  {}
                ),
              },
              {}
            ),
          },
        ],
        blockCatalog: {
          navigation: { apiId: 'navigation', fields: [{ fieldId: 'links' }] },
        },
      }
    );
    const block = model.root.children[0];
    expect(block?.type).toBe('template-block');
    if (block?.type !== 'template-block') throw new Error('expected template block');
    const renderedLinks = block.entry.data.links as Array<{ label: string; url: string }>;
    expect(decodeStega(renderedLinks[0]!.label).cleaned).toBe('Hello');
    expect(renderedLinks[0]!.url).toBe('/guides/hello');
    expect(navigationEntry.data.links).toEqual([{ label: 'Original label', url: '/' }]);
  });

  it.each([
    [{ id: 'bad', type: 'template-block', apiId: 'missing' }, 'BLOCK_NOT_FOUND'],
    [{ id: 'bad', type: 'template-block', apiId: 'hero', entryId: 'missing' }, 'BLOCK_NOT_FOUND'],
    [{ id: 'bad', type: 'template-block', apiId: 'hero', slots: {} }, 'UNKNOWN_KEY'],
    [
      { id: 'bad', type: 'template-block', apiId: 'hero', bindings: { missing: 'title' } },
      'INVALID_VALUE',
    ],
    [
      { id: 'bad', type: 'template-block', apiId: 'hero', bindings: { heading: 'missing' } },
      'INVALID_VALUE',
    ],
    [
      { id: 'bad', type: 'template-block', apiId: 'hero', templates: { heading: '{{ missing }}' } },
      'INVALID_VALUE',
    ],
    [
      {
        id: 'bad',
        type: 'template-block',
        apiId: 'hero',
        bindings: { heading: 'title' },
        templates: { heading: '{{title}}' },
      },
      'INVALID_VALUE',
    ],
    [{ id: 'bad', type: 'block', entryId: 'entry-1' }, 'INVALID_VALUE'],
  ])('fails closed for invalid template node %#', (node, code) => {
    expect(() =>
      createTemplateLayoutRenderModel(layout(node), { entry, blockCatalog: catalog })
    ).toThrow(expect.objectContaining({ issue: expect.objectContaining({ code }) }));
  });
});

describe('template-block bindings/templates through declared field renames', () => {
  // A block that bumped its version and renamed `brand` -> `brandText`; the
  // route template node below is deliberately still keyed by the old name,
  // as an un-migrated stored document would be.
  const renamedCatalog = {
    navigation: {
      apiId: 'navigation',
      fields: [{ fieldId: 'brandText' }, { fieldId: 'links' }],
      renames: { brand: 'brandText' },
    },
    chained: {
      apiId: 'chained',
      fields: [{ fieldId: 'c' }],
      // a -> b -> c, already flattened the way buildTemplateBlockRenames would.
      renames: { a: 'c', b: 'c' },
    },
  };

  it('rewrites a bindings key whose head was renamed into the current field', () => {
    const model = createTemplateLayoutRenderModel(
      layout({
        id: 'nav',
        type: 'template-block',
        apiId: 'navigation',
        bindings: { brand: 'slug' },
      }),
      { entry, blockCatalog: renamedCatalog }
    );
    const block = model.root.children[0];
    if (block?.type !== 'template-block') throw new Error('expected template block');
    expect(block.entry.data.brandText).toBe('hello');
    expect(block.entry.data.brand).toBeUndefined();
  });

  it('rewrites a templates key whose head was renamed into the current field', () => {
    const model = createTemplateLayoutRenderModel(
      layout({
        id: 'nav',
        type: 'template-block',
        apiId: 'navigation',
        templates: { brand: 'Brand: {{ slug }}' },
      }),
      { entry, blockCatalog: renamedCatalog }
    );
    const block = model.root.children[0];
    if (block?.type !== 'template-block') throw new Error('expected template block');
    expect(block.entry.data.brandText).toBe('Brand: hello');
    expect(block.entry.data.brand).toBeUndefined();
  });

  it.each([['a'], ['b']])(
    'resolves a chained rename (%s -> ... -> c) to the final field',
    (head) => {
      const model = createTemplateLayoutRenderModel(
        layout({
          id: 'chained',
          type: 'template-block',
          apiId: 'chained',
          bindings: { [head]: 'slug' },
        }),
        { entry, blockCatalog: renamedCatalog }
      );
      const block = model.root.children[0];
      if (block?.type !== 'template-block') throw new Error('expected template block');
      expect(block.entry.data.c).toBe('hello');
    }
  );

  it('still fails closed for an undeclared head with no matching rename', () => {
    expect(() =>
      createTemplateLayoutRenderModel(
        layout({
          id: 'nav',
          type: 'template-block',
          apiId: 'navigation',
          bindings: { ghost: 'slug' },
        }),
        { entry, blockCatalog: renamedCatalog }
      )
    ).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ code: 'INVALID_VALUE' }) })
    );
  });

  it('fails closed when a rewritten key collides with an already-declared key', () => {
    expect(() =>
      createTemplateLayoutRenderModel(
        layout({
          id: 'nav',
          type: 'template-block',
          apiId: 'navigation',
          bindings: { brand: 'slug', brandText: 'slug' },
        }),
        { entry, blockCatalog: renamedCatalog }
      )
    ).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ code: 'INVALID_VALUE' }) })
    );
  });

  it('never mutates the caller-supplied node', () => {
    const node = {
      id: 'nav',
      type: 'template-block',
      apiId: 'navigation',
      bindings: { brand: 'slug' },
    };
    const before = JSON.parse(JSON.stringify(node));
    createTemplateLayoutRenderModel(layout(node), { entry, blockCatalog: renamedCatalog });
    expect(node).toEqual(before);
  });
});

describe('buildTemplateBlockRenames', () => {
  it('flattens a single rename step', () => {
    expect(
      buildTemplateBlockRenames([{ version: 2, renames: [{ from: 'brand', to: 'brandText' }] }])
    ).toEqual({
      brand: 'brandText',
    });
  });

  it('chain-resolves renames across steps in ascending version order, regardless of input order', () => {
    const migrations = [
      { version: 3, renames: [{ from: 'b', to: 'c' }] },
      { version: 2, renames: [{ from: 'a', to: 'b' }] },
    ];
    expect(buildTemplateBlockRenames(migrations)).toEqual({ a: 'c', b: 'c' });
  });

  it('tolerates a malformed migrations value and malformed steps within it', () => {
    expect(buildTemplateBlockRenames(undefined)).toEqual({});
    expect(buildTemplateBlockRenames(null)).toEqual({});
    expect(buildTemplateBlockRenames('nope')).toEqual({});
    expect(buildTemplateBlockRenames({})).toEqual({});
    expect(
      buildTemplateBlockRenames([
        null,
        { version: 'not-a-number', renames: [{ from: 'a', to: 'b' }] },
        { version: 1, renames: 'not-an-array' },
        { version: 1 },
        {
          version: 2,
          renames: [null, { from: 'a' }, { to: 'b' }, { from: '', to: 'b' }, { from: 'a', to: '' }],
        },
        { version: 3, renames: [{ from: 'ok', to: 'fine' }] },
      ])
    ).toEqual({ ok: 'fine' });
  });
});
