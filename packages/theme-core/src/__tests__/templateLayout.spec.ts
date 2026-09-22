import { describe, expect, it } from 'vitest';
import { decodeStega, encodeStega } from '../stega';
import { createTemplateLayoutRenderModel } from '../templateLayout';

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
