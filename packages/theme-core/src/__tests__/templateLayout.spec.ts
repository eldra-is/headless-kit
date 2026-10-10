import { describe, expect, it } from 'vitest';
import { LayoutValidationError, layoutNodeClass, layoutRenderNodeId } from '../layout';
import { createReusableLayoutRenderModel, type ReusableComponentProjection } from '../reusable';
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
    // A `block` node is admitted in a template now (the public read is
    // pre-expanded into them), so these two rows are the page block-node rules
    // biting, not a blanket refusal: a non-uuid entry id, and a key a page
    // block node does not have.
    [{ id: 'bad', type: 'block', entryId: 'entry-1' }, 'INVALID_VALUE'],
    [
      { id: 'bad', type: 'block', entryId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', apiId: 'hero' },
      'UNKNOWN_KEY',
    ],
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

describe('template-block binding sources with list indices', () => {
  // A catalog-backed route entry: the product's own lists are what a binding
  // reaches into, so a source path has to be able to name one element of them.
  const productEntry = {
    id: 'product-1',
    data: {
      title: 'Kettle',
      images: [
        { url: '/img/kettle-front.jpg', alt: 'Front' },
        { url: '/img/kettle-side.jpg', alt: 'Side' },
      ],
      variants: [{ price: '4.990 kr.' }, { price: '5.990 kr.' }],
    },
  };
  const productCatalog = {
    hero: {
      apiId: 'hero',
      fields: [{ fieldId: 'heading' }, { fieldId: 'byline' }, { fieldId: 'eyebrow' }],
    },
  };
  const render = (bindings: Record<string, string>) =>
    createTemplateLayoutRenderModel(
      layout({ id: 'hero-placement', type: 'template-block', apiId: 'hero', bindings }),
      { entry: productEntry, blockCatalog: productCatalog }
    );
  const blockOf = (model: ReturnType<typeof render>) => {
    const block = model.root.children[0];
    if (block?.type !== 'template-block') throw new Error('expected template block');
    return block;
  };

  it('reads a list element through a numeric segment', () => {
    const block = blockOf(render({ heading: 'images.0.url', byline: 'images.1.alt' }));
    expect(block.entry.data.heading).toBe('/img/kettle-front.jpg');
    expect(block.entry.data.byline).toBe('Side');
  });

  it('reads a variant price through a numeric segment', () => {
    expect(blockOf(render({ heading: 'variants.0.price' })).entry.data.heading).toBe('4.990 kr.');
    expect(blockOf(render({ heading: 'variants.1.price' })).entry.data.heading).toBe('5.990 kr.');
  });

  it('leaves an identifier-only binding exactly as it was', () => {
    expect(blockOf(render({ heading: 'title' })).entry.data.heading).toBe('Kettle');
  });

  it.each([['images.2.url'], ['images.2'], ['variants.9.price']])(
    'treats an out-of-range index (%s) as not found',
    (source) => {
      expect(() => render({ heading: source })).toThrow(
        expect.objectContaining({
          issue: { path: '/root/children/0/bindings/heading', code: 'INVALID_VALUE' },
        })
      );
    }
  );

  it('reports an out-of-range index exactly like a missing key', () => {
    const issueOf = (source: string) => {
      try {
        render({ heading: source });
      } catch (error) {
        return (error as { issue: unknown }).issue;
      }
      throw new Error('expected a validation failure');
    };
    expect(issueOf('images.2.url')).toEqual(issueOf('images.0.missing'));
  });

  it.each([
    ['images.-1.url'],
    ['images.-1'],
    ['images.01.url'],
    ['images.01'],
    ['images.1a.url'],
    ['images.x.url'],
    ['title.0'],
  ])('rejects a non-canonical or unusable index segment (%s)', (source) => {
    expect(() => render({ heading: source })).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ code: 'INVALID_VALUE' }) })
    );
  });

  it('keeps the text-template grammar identifier-only', () => {
    expect(() =>
      createTemplateLayoutRenderModel(
        layout({
          id: 'hero-placement',
          type: 'template-block',
          apiId: 'hero',
          templates: { heading: '{{ images.0.alt }}' },
        }),
        { entry: productEntry, blockCatalog: productCatalog }
      )
    ).toThrow(
      expect.objectContaining({
        issue: { path: '/root/children/0/templates/heading', code: 'INVALID_VALUE' },
      })
    );
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

describe('reusable placements inside a route template', () => {
  const SITE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const COMPONENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const OTHER_COMPONENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const COMPONENT_BLOCK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const componentDocument = {
    version: 1 as const,
    root: {
      id: 'FooterRoot',
      type: 'flex' as const,
      layout: { direction: { normal: 'column' as const } },
      children: [{ id: 'FooterBlock', type: 'block' as const, entryId: COMPONENT_BLOCK }],
    },
  };

  const placement = () => ({ id: 'FooterA', type: 'reusable', componentId: COMPONENT });

  const templateOf = (...children: unknown[]) => ({
    version: 1,
    root: {
      id: 'root',
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children,
    },
  });

  // The same placement, at the same pointer, in a page document — so a
  // template's outcome can be compared against the page's rather than restated.
  const pageOf = (node: unknown) => ({ ...templateOf(node), version: 2 });

  function projection(): ReusableComponentProjection {
    return {
      bindings: [{ placementId: 'FooterA', componentId: COMPONENT, siteId: SITE, revision: 7 }],
      revisions: [
        { componentId: COMPONENT, siteId: SITE, revision: 7, document: componentDocument },
      ],
    };
  }

  /** What the DOM actually keys off, with the preview-only identity collapsed:
   *  a node is addressed by its `renderId` (which is its `id` once Core has
   *  expanded it) and styled by its `className`. */
  function asRendered(node: unknown): unknown {
    if (typeof node !== 'object' || node === null) return node;
    const {
      renderId,
      nodeId: _nodeId,
      placementId: _placementId,
      ...rest
    } = node as Record<string, unknown>;
    const out: Record<string, unknown> = { ...rest };
    if (typeof renderId === 'string') out.id = renderId;
    if (Array.isArray(out.children)) out.children = out.children.map(asRendered);
    return out;
  }

  function issue(run: () => unknown) {
    try {
      run();
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutValidationError);
      return (error as LayoutValidationError).issue;
    }
  }

  it('expands a placement between template blocks without disturbing them', () => {
    const model = createTemplateLayoutRenderModel(
      templateOf(
        {
          id: 'HeroPlacement',
          type: 'template-block',
          apiId: 'hero',
          bindings: { heading: 'title' },
        },
        placement(),
        { id: 'TailPlacement', type: 'template-block', apiId: 'hero' }
      ),
      { entry, blockCatalog: catalog, reusableComponentProjection: projection() }
    );

    const [hero, footer, tail] = model.root.children;
    if (hero?.type !== 'template-block' || tail?.type !== 'template-block')
      throw new Error('expected template blocks around the placement');
    if (footer?.type !== 'flex') throw new Error('expected the expanded component root');

    // The component's own root, addressed by its authored id plus the
    // placement that owns it — the pair the overlay reads off the DOM.
    expect(footer.id).toBe('FooterRoot');
    expect(footer.nodeId).toBe('FooterRoot');
    expect(footer.renderId).toBe('FooterA');
    expect(footer.placementId).toBe('FooterA');
    const [block] = footer.children;
    if (block?.type !== 'block') throw new Error('expected the component block');
    expect(block.id).toBe('FooterBlock');
    expect(block.entryId).toBe(COMPONENT_BLOCK);
    expect(block.placementId).toBe('FooterA');
    expect(block.renderId).toBe(layoutRenderNodeId('FooterA FooterBlock'));
    expect(block.className).toBe(layoutNodeClass(block.renderId));
    expect(model.css).toContain(layoutNodeClass('FooterA'));

    // The template blocks either side are untouched: bindings still resolve,
    // defaults still apply, and neither is owned by a placement.
    expect(decodeStega(String(hero.entry.data.heading))).toMatchObject({ cleaned: 'Hello' });
    expect(hero.placementId).toBeUndefined();
    expect(hero.renderId).toBe('HeroPlacement');
    expect(tail.entry.data.heading).toBe('Default heading');
    expect(model.document.root.children.map((child) => child.type)).toEqual([
      'template-block',
      'flex',
      'template-block',
    ]);
  });

  // Core serves a route template in two shapes. The PREVIEW read keeps the
  // `reusable` node and attaches the projection; the PUBLIC read — the one
  // `resolveRoute` and every prerender see — has already replaced the placement
  // with the component's own container: `flex`/`grid` of `block` children, node
  // ids namespaced by the placement id, no `componentId` and no projection
  // anywhere. Both must render the same template, so this asserts it rather
  // than restating the shape: the normalized document and the stylesheet are
  // equal outright, and the render trees are equal once the preview-only
  // identity (`renderId`/`nodeId`/`placementId`, and the authored `id` they
  // let the overlay recover) is collapsed back to what the DOM keys off.
  it('renders the public pre-expanded shape identically to the preview shape', () => {
    const heroNode = {
      id: 'HeroPlacement',
      type: 'template-block',
      apiId: 'hero',
      bindings: { heading: 'title' },
    };
    const tailNode = { id: 'TailPlacement', type: 'template-block', apiId: 'hero' };
    // Exactly what Core's public read emits for `placement()`: the component
    // root keyed by the placement id, its block keyed by the namespaced id.
    const expandedNode = {
      id: 'FooterA',
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children: [
        {
          id: layoutRenderNodeId('FooterA\u0000FooterBlock'),
          type: 'block',
          entryId: COMPONENT_BLOCK,
        },
      ],
    };

    const preview = createTemplateLayoutRenderModel(templateOf(heroNode, placement(), tailNode), {
      entry,
      blockCatalog: catalog,
      reusableComponentProjection: projection(),
    });
    const publicRead = createTemplateLayoutRenderModel(
      templateOf(heroNode, expandedNode, tailNode),
      { entry, blockCatalog: catalog }
    );

    expect(publicRead.document).toEqual(preview.document);
    expect(publicRead.css).toBe(preview.css);
    expect(asRendered(publicRead.root)).toEqual(asRendered(preview.root));

    // The one intended difference: only the preview shape can tell the overlay
    // which placement owns the node and what its authored id was.
    const previewFooter = preview.root.children[1];
    const publicFooter = publicRead.root.children[1];
    if (previewFooter?.type !== 'flex' || publicFooter?.type !== 'flex')
      throw new Error('expected the component root in both shapes');
    expect(previewFooter.placementId).toBe('FooterA');
    expect(previewFooter.id).toBe('FooterRoot');
    expect(publicFooter.placementId).toBeUndefined();
    expect(publicFooter.id).toBe('FooterA');
  });

  it('treats an absent projection as an empty one, exactly as a page does', () => {
    const templateIssue = issue(() =>
      createTemplateLayoutRenderModel(templateOf(placement()), { entry, blockCatalog: catalog })
    );
    const pageIssue = issue(() =>
      createReusableLayoutRenderModel(pageOf(placement()), {
        projection: { bindings: [], revisions: [] },
      })
    );
    expect(templateIssue).toEqual({ path: '/root/children/0', code: 'COMPONENT_NOT_FOUND' });
    expect(templateIssue).toEqual(pageIssue);
  });

  it.each([
    ['a missing revision', { bindings: projection().bindings, revisions: [] }],
    [
      'a revision mismatch',
      { ...projection(), bindings: [{ ...projection().bindings[0]!, revision: 8 }] },
    ],
    [
      'an unknown component',
      {
        ...projection(),
        bindings: [{ ...projection().bindings[0]!, componentId: OTHER_COMPONENT }],
      },
    ],
  ])('fails for %s exactly as the same placement does on a page', (_name, value) => {
    const projectionValue = value as ReusableComponentProjection;
    const templateIssue = issue(() =>
      createTemplateLayoutRenderModel(templateOf(placement()), {
        entry,
        blockCatalog: catalog,
        reusableComponentProjection: projectionValue,
      })
    );
    expect(templateIssue).not.toBeNull();
    expect(templateIssue).toEqual(
      issue(() =>
        createReusableLayoutRenderModel(pageOf(placement()), { projection: projectionValue })
      )
    );
  });

  it('refuses a placement, a block and a template-block as the root, and an unknown key on a placement', () => {
    expect(
      issue(() =>
        createTemplateLayoutRenderModel(
          { version: 1, root: placement() },
          { entry, blockCatalog: catalog, reusableComponentProjection: projection() }
        )
      )
    ).toEqual({ path: '/root/type', code: 'INVALID_VALUE' });
    // A `block` is admitted inside a template now that the public read arrives
    // pre-expanded into them — but a document is still a container at the root,
    // exactly as a page is, so neither the expanded shape's block nor the
    // `template-block` that becomes one may be the root.
    expect(
      issue(() =>
        createTemplateLayoutRenderModel(
          { version: 1, root: { id: 'root', type: 'block', entryId: COMPONENT_BLOCK } },
          { entry, blockCatalog: catalog }
        )
      )
    ).toEqual({ path: '/root/type', code: 'INVALID_VALUE' });
    expect(
      issue(() =>
        createTemplateLayoutRenderModel(
          { version: 1, root: { id: 'root', type: 'template-block', apiId: 'hero' } },
          { entry, blockCatalog: catalog }
        )
      )
    ).toEqual({ path: '/root/type', code: 'INVALID_VALUE' });
    // And it is refused *first*, ahead of the expansion: a preview read whose
    // root is a block is a malformed document, not a stale projection, so the
    // issue must name the root rather than the bindings the expansion would
    // then find unused.
    expect(
      issue(() =>
        createTemplateLayoutRenderModel(
          { version: 1, root: { id: 'root', type: 'block', entryId: COMPONENT_BLOCK } },
          { entry, blockCatalog: catalog, reusableComponentProjection: projection() }
        )
      )
    ).toEqual({ path: '/root/type', code: 'INVALID_VALUE' });
    expect(
      issue(() =>
        createTemplateLayoutRenderModel(templateOf({ ...placement(), extra: true }), {
          entry,
          blockCatalog: catalog,
          reusableComponentProjection: projection(),
        })
      )
    ).toEqual({ path: '/root/children/0/extra', code: 'UNKNOWN_KEY' });
  });
});
