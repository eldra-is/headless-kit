import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { overlayPreviewDrafts } from '../src/runtime/drafts';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

function block(text: string, open: string, close: string): string {
  const start = text.indexOf(open);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf(close, start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start + open.length, end);
}

/**
 * The public runtime config is a string contract between two files that never
 * import each other: the module writes `runtimeConfig.public.eldra` at build
 * time and the runtime plugin reads it in the browser. Nothing in the type
 * system joins them — the plugin declares its own `RuntimeEldraConfig` and
 * casts — and both readers coalesce a missing key (`cfg.retry ?? undefined`),
 * so a key renamed on one side only is silent: a configured `eldra.retry`
 * would simply stop reaching the client and the library defaults would apply.
 */
describe('the public runtime config the plugin reads is the one the module writes', () => {
  it('writes every key the runtime plugin declares', () => {
    const declared = [
      ...block(
        source('../src/runtime/plugin.ts'),
        'interface RuntimeEldraConfig {',
        '\n}'
      ).matchAll(/^ {2}(\w+):/gm),
    ].map((match) => match[1]);
    const written = block(
      source('../src/module.ts'),
      'nuxt.options.runtimeConfig.public.eldra = {',
      '\n    };'
    );

    expect(declared).toContain('retry');
    for (const key of declared) expect(written).toContain(`${key}:`);
  });
});

describe('theme-nuxt runtime', () => {
  it('keeps the preview empty while Nuxt async page data is unresolved', () => {
    expect(overlayPreviewDrafts(undefined, { 'block-1': { heading: 'Draft' } })).toBeNull();
    expect(overlayPreviewDrafts(null, {})).toBeNull();
  });

  it('overlays in-memory page and resolved block drafts from content-update', () => {
    const page = {
      id: 'page-1',
      data: {
        title: 'Published title',
        blocks: [
          { id: 'block-1', schemaApiId: 'hero', data: { heading: 'Published heading' } },
          { id: 'block-2', schemaApiId: 'footer', data: { copyright: 'Published footer' } },
        ],
      },
    };
    const result = overlayPreviewDrafts(page, {
      'page-1': {
        title: 'Draft title',
        blocks: [
          { id: 'block-2', _type: 'reference' },
          { id: 'block-1', _type: 'reference' },
        ],
      },
      'block-1': { heading: 'Draft heading' },
    });

    expect(result.data.title).toBe('Draft title');
    expect((result.data.blocks as Array<{ id: string }>).map((block) => block.id)).toEqual([
      'block-2',
      'block-1',
    ]);
    expect((result.data.blocks as Array<{ data: Record<string, unknown> }>)[1]!.data.heading).toBe(
      'Draft heading'
    );
    expect(
      (result.data.blocks as Array<{ data: Record<string, unknown> }>)[0]!.data.copyright
    ).toBe('Published footer');
    expect(page.data.title).toBe('Published title');
  });

  it('preserves resolved block entries when a route-template draft carries relationship references', () => {
    const navigation = {
      id: 'navigation-entry',
      schemaApiId: 'navigation',
      data: { brand: 'Published brand', links: [{ label: 'Home', href: '/' }] },
    };
    const template = {
      id: 'route-template-1',
      schemaApiId: 'route-template',
      data: {
        blocks: [navigation],
        layout: {
          version: 1,
          root: {
            id: 'template-root',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              {
                id: 'navigation-placement',
                type: 'template-block',
                apiId: 'navigation',
                entryId: navigation.id,
                templates: { 'links.0.label': '{{ title }}' },
              },
            ],
          },
        },
      },
    };

    const result = overlayPreviewDrafts(template, {
      [template.id]: {
        ...template.data,
        blocks: [{ _type: 'entry_navigation', id: navigation.id }],
      },
    });

    expect(result?.data.blocks).toEqual([navigation]);
    expect(result?.data.layout).toEqual(template.data.layout);
  });

  it('overlays a shared block draft inside a reusable placement on a route template', () => {
    // A reusable component draft from Studio's bridge has to reach a
    // placement inside a *template* the way it reaches one inside a page. It
    // does — the projection and its component's block entries ride on the
    // template document exactly as they ride on a page document, and nothing in
    // this overlay is gated on which of the two it was handed.
    const header = {
      id: 'shared-header-entry',
      schemaApiId: 'navigation',
      data: { brand: 'Published brand' },
    };
    const projection = {
      bindings: [
        {
          placementId: 'role-header',
          componentId: 'component-1',
          siteId: 'site-1',
          revision: 2,
        },
      ],
      revisions: [
        {
          componentId: 'component-1',
          siteId: 'site-1',
          revision: 2,
          document: {
            version: 1,
            root: {
              id: 'component-root',
              type: 'flex',
              layout: { direction: { normal: 'column' } },
              children: [{ id: 'component-header', type: 'block', entryId: header.id }],
            },
          },
        },
      ],
    };
    const template = {
      id: 'route-template-1',
      schemaApiId: 'route-template',
      data: {
        blocks: [header],
        layout: {
          version: 1,
          root: {
            id: 'template-root',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              { id: 'role-header', type: 'reusable', componentId: 'component-1' },
              {
                id: 'product-hero',
                type: 'template-block',
                apiId: 'hero',
                templates: { heading: '{{ title }}' },
              },
            ],
          },
        },
      },
      reusableComponentProjection: projection,
    };

    const result = overlayPreviewDrafts(template, {
      [header.id]: { brand: 'Shared draft brand' },
    });

    expect(result?.data.blocks).toEqual([{ ...header, data: { brand: 'Shared draft brand' } }]);
    // The projection travels with the document, so `useEldraPage` can hand the
    // template read's own one to EldraLayout after the overlay.
    expect(result?.reusableComponentProjection).toEqual(projection);
  });

  it('preserves unresolved reference values for a later gateway refresh', () => {
    const page = { id: 'page-1', data: { blocks: [{ id: 'block-new', _type: 'reference' }] } };
    expect(overlayPreviewDrafts(page, { 'block-new': { heading: 'Draft' } })).toEqual(page);
  });

  it('resolves Core compatibility-mirror entry references during a v2 draft overlay', () => {
    const footer = {
      id: 'block-footer',
      schemaApiId: 'footer',
      data: { copyright: 'Published footer' },
    };
    const page = { id: 'page-1', data: { blocks: [footer] } };
    const result = overlayPreviewDrafts(page, {
      'page-1': {
        blocks: [{ position: 0, type: 'entry', value: footer.id }],
        layout: {
          version: 2,
          root: {
            id: 'root-layout',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [{ id: 'shared-footer', type: 'reusable', componentId: 'component-1' }],
          },
        },
      },
    });

    expect(result?.data.blocks).toEqual([footer]);
  });

  it('overlays shared drafts referenced only by a reusable component projection', () => {
    const sharedFooter = {
      id: 'shared-footer-entry',
      schemaApiId: 'footer',
      data: { copyright: 'Published footer' },
    };
    const reusableLayout = {
      version: 1,
      root: {
        id: 'component-root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [{ id: 'component-footer', type: 'block', entryId: sharedFooter.id }],
      },
    };
    const page = {
      id: 'page-1',
      data: {
        layout: {
          version: 2,
          root: {
            id: 'page-root',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [{ id: 'placement-1', type: 'reusable', componentId: 'component-1' }],
          },
        },
        blocks: [sharedFooter],
      },
      reusableComponentProjection: {
        bindings: [
          {
            placementId: 'placement-1',
            componentId: 'component-1',
            siteId: 'site-1',
            revision: 1,
          },
        ],
        revisions: [
          {
            componentId: 'component-1',
            siteId: 'site-1',
            revision: 1,
            document: reusableLayout,
          },
        ],
      },
    };

    const result = overlayPreviewDrafts(
      page,
      {
        'page-1': page.data,
        [sharedFooter.id]: { copyright: 'Shared draft footer' },
      },
      { [sharedFooter.id]: 'footer' }
    );

    expect(result?.data.blocks).toEqual([
      { ...sharedFooter, data: { copyright: 'Shared draft footer' } },
    ]);
  });

  it('preserves the page layout while overlaying resolved block drafts', () => {
    const layout = {
      version: 1,
      root: {
        id: 'root-layout',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'hero-placement',
            type: 'block',
            entryId: '11111111-1111-4111-8111-111111111111',
          },
        ],
      },
    };
    const page = {
      id: 'page-1',
      data: {
        layout,
        blocks: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            schemaApiId: 'hero',
            data: { heading: 'Published heading' },
          },
        ],
      },
    };
    const result = overlayPreviewDrafts(page, {
      '11111111-1111-4111-8111-111111111111': { heading: 'Draft heading' },
    });

    expect(result).not.toBeNull();
    if (result === null) throw new Error('expected the page overlay to remain available');
    expect(result.data.layout).toBe(layout);
    expect((result.data.blocks as EntryDocLike[])[0]!.data.heading).toBe('Draft heading');
  });

  it('materializes newly created layout blocks from draft metadata before a gateway refresh', () => {
    const newEntryId = '22222222-2222-4222-8222-222222222222';
    const page = {
      id: 'page-1',
      data: {
        layout: {
          version: 1,
          root: {
            id: 'root-layout',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [{ id: 'new-placement', type: 'block', entryId: newEntryId }],
          },
        },
        blocks: [],
      },
    };

    const result = overlayPreviewDrafts(
      page,
      { [newEntryId]: { heading: 'Unsaved hero' } },
      { [newEntryId]: 'hero' }
    );

    expect(result?.data.blocks).toEqual([
      {
        id: newEntryId,
        schemaApiId: 'hero',
        data: { heading: 'Unsaved hero' },
      },
    ]);
  });

  it('keeps slot-descendant entries through the layout-driven draft projection', () => {
    const hostId = '55555555-5555-4555-8555-555555555555';
    const ctaId = '66666666-6666-4666-8666-666666666666';
    const page = {
      id: 'page-1',
      data: {
        layout: {
          version: 3,
          root: {
            id: 'root-layout',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              {
                id: 'hero-placement',
                type: 'block',
                entryId: hostId,
                slots: {
                  actions: [{ id: 'cta-placement', type: 'block', entryId: ctaId }],
                },
              },
            ],
          },
        },
        blocks: [
          { id: hostId, schemaApiId: 'hero', data: { heading: 'Published hero' } },
          { id: ctaId, schemaApiId: 'cta', data: { label: 'Published cta' } },
        ],
      },
    };

    const result = overlayPreviewDrafts(page, {
      [ctaId]: { label: 'Draft cta' },
    });

    // normalizeLayoutDocument().blockEntryIds includes the slot child in DFS
    // order, so the projection keeps it (and overlays its draft) even though
    // no top-level layout node references it directly.
    expect(result?.data.blocks).toEqual([
      { id: hostId, schemaApiId: 'hero', data: { heading: 'Published hero' } },
      { id: ctaId, schemaApiId: 'cta', data: { label: 'Draft cta' } },
    ]);
    // The projected page keeps the v3 layout with its slot keys intact.
    expect(result?.data.layout).toEqual(page.data.layout);
  });

  it('retains draft-only slot children through the layout-driven projection', () => {
    // C14 drop-into-slot: the child entry is brand-new and unsaved, so it is
    // NOT part of the published blocks array (only its placement in the
    // layout's `slots` exists). The page-level draft does not carry it either.
    // Only the layout-driven blockEntryIds projection can keep it; the plain
    // pass-through branch would silently drop it.
    const hostId = '55555555-5555-4555-8555-555555555555';
    const newCtaId = '77777777-7777-4777-8777-777777777777';
    const page = {
      id: 'page-1',
      data: {
        layout: {
          version: 3,
          root: {
            id: 'root-layout',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              {
                id: 'hero-placement',
                type: 'block',
                entryId: hostId,
                slots: {
                  actions: [{ id: 'cta-placement', type: 'block', entryId: newCtaId }],
                },
              },
            ],
          },
        },
        blocks: [{ id: hostId, schemaApiId: 'hero', data: { heading: 'Published hero' } }],
      },
    };

    const result = overlayPreviewDrafts(
      page,
      {
        [newCtaId]: { label: 'Dropped CTA' },
      },
      { [newCtaId]: 'cta' }
    );

    expect(result).not.toBeNull();
    expect(result?.data.blocks).toEqual([
      { id: hostId, schemaApiId: 'hero', data: { heading: 'Published hero' } },
      { id: newCtaId, schemaApiId: 'cta', data: { label: 'Dropped CTA' } },
    ]);
    // The slot placement survives the projection untouched.
    const actions = result?.data.layout.root.children[0]?.slots?.actions;
    expect(actions).toEqual([{ id: 'cta-placement', type: 'block', entryId: newCtaId }]);
  });
});

interface EntryDocLike {
  data: Record<string, unknown>;
}
