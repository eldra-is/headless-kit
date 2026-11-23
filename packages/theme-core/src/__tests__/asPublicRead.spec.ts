/**
 * `asPublicRead` (WS-1358): a draft preview session renders its drafts in the public read's shape.
 * The preview read's reusable placements and projection are expanded the way Core expands a
 * published page, its blocks reordered and pruned the same way, wherever in an answer the projection
 * appears. Core's own recorded reads are `previewParityVectors.spec.ts`; the browser proof is the
 * starter's `test/previewParity.browser.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { asPublicRead, layoutRenderNodeId } from '../index';

const SITE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPONENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BLOCK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const componentRoot = {
  id: 'HeaderRoot',
  type: 'flex',
  layout: { direction: { normal: 'column' } },
  children: [{ id: 'HeaderNav', type: 'block', entryId: BLOCK }],
};

/** The preview read of a page placing the shared header. */
function draftPage(projection: unknown = undefined) {
  return {
    id: 'page-1',
    data: {
      title: 'Home',
      slug: 'home',
      layout: {
        version: 2,
        root: {
          id: 'root',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'SiteHeader', type: 'reusable', componentId: COMPONENT }],
        },
      },
      blocks: [{ id: BLOCK, schemaApiId: 'navigation', data: {} }],
    },
    reusableComponentProjection: projection ?? {
      bindings: [{ placementId: 'SiteHeader', componentId: COMPONENT, siteId: SITE, revision: 3 }],
      revisions: [
        {
          componentId: COMPONENT,
          siteId: SITE,
          revision: 3,
          document: { version: 1, root: componentRoot },
        },
      ],
    },
  };
}

/** What Core's public read answers for the same page. */
const publishedPage = {
  id: 'page-1',
  data: {
    title: 'Home',
    slug: 'home',
    layout: {
      version: 2,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            ...componentRoot,
            id: 'SiteHeader',
            children: [
              {
                id: layoutRenderNodeId('SiteHeader\u0000HeaderNav'),
                type: 'block',
                entryId: BLOCK,
              },
            ],
          },
        ],
      },
    },
    blocks: [{ id: BLOCK, schemaApiId: 'navigation', data: {} }],
  },
};

describe('asPublicRead', () => {
  it('turns the preview read of a page into the public read of it', () => {
    const shaped = asPublicRead(draftPage());
    expect(shaped).toEqual(publishedPage);
    expect(JSON.stringify(shaped)).not.toContain(COMPONENT);
  });

  it('reshapes every entry of a list answer', () => {
    expect(asPublicRead({ data: [draftPage(), draftPage()] })).toEqual({
      data: [publishedPage, publishedPage],
    });
  });

  it('leaves a document with no projection as it is', () => {
    expect(asPublicRead(publishedPage)).toEqual(publishedPage);
  });

  it('leaves a projection that does not expand to fail closed in the render', () => {
    const stale = draftPage({ bindings: [], revisions: [] });
    expect(asPublicRead(stale)).toEqual(stale);
  });

  const HERO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const GONE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  it('puts blocks in layout order and drops a node whose block does not resolve', () => {
    const page = draftPage();
    page.data.layout.root.children = [
      { id: 'SiteHeader', type: 'reusable', componentId: COMPONENT },
      { id: 'Hero', type: 'block', entryId: HERO } as never,
      { id: 'Gone', type: 'block', entryId: GONE } as never,
    ];
    // The relation as stored: the page's own block first, then the component's.
    page.data.blocks = [
      { id: HERO, schemaApiId: 'hero', data: {} },
      { id: BLOCK, schemaApiId: 'navigation', data: {} },
    ];
    const shaped = asPublicRead(page) as unknown as {
      data: {
        layout: { root: { children: Array<{ id: string }> } };
        blocks: Array<{ id: string }>;
      };
    };
    expect(shaped.data.layout.root.children.map((node) => node.id)).toEqual(['SiteHeader', 'Hero']);
    expect(shaped.data.blocks.map((one) => one.id)).toEqual([BLOCK, HERO]);
  });

  it('reshapes a nested entry: a page whose parent places a component', () => {
    const child = {
      id: 'page-2',
      data: { title: 'Child', slug: 'child', parent: { ...draftPage(), _type: 'entry_page' } },
    };
    expect(asPublicRead(child).data.parent).toEqual({ ...publishedPage, _type: 'entry_page' });
  });

  it('reshapes a route template, whose version-1 layout may place a component', () => {
    const template = draftPage();
    template.data.layout.version = 1;
    (template.data as Record<string, unknown>).routePattern = '/journal/:slug';
    expect(asPublicRead(template)).toEqual({
      ...publishedPage,
      data: {
        ...publishedPage.data,
        routePattern: '/journal/:slug',
        layout: { ...publishedPage.data.layout, version: 1 },
      },
    });
  });
});
