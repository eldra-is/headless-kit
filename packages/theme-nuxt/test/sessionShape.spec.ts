/**
 * A draft preview session renders its drafts in the public read's shape (WS-1358): the preview
 * read's reusable placements and projection are expanded the way Core expands a published page,
 * so the session's DOM is the published page's. The proof in a real browser is the starter's
 * `test/previewParity.browser.spec.ts`.
 */
import { layoutRenderNodeId } from '@eldrajs/theme-core';
import { describe, expect, it } from 'vitest';
import { EMPTY_ELDRA_ROUTE, type ResolvedEldraRoute } from '../src/runtime/resolveRoute';
import { asPublishedRoute } from '../src/runtime/sessionShape';

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

function route(page: unknown): ResolvedEldraRoute {
  return {
    ...EMPTY_ELDRA_ROUTE,
    page: page as ResolvedEldraRoute['page'],
    links: {
      pages: [page as NonNullable<ResolvedEldraRoute['page']>],
      templates: [],
      targets: new Map(),
    },
  };
}

describe('asPublishedRoute', () => {
  it('turns the preview read of a page into the public read of it', () => {
    const shaped = asPublishedRoute(route(draftPage()));
    expect(shaped.page).toEqual(publishedPage);
    expect(shaped.links.pages).toEqual([publishedPage]);
    expect(JSON.stringify(shaped)).not.toContain(COMPONENT);
  });

  it('leaves a document with no projection as it is', () => {
    const plain = route(publishedPage);
    const shaped = asPublishedRoute(plain);
    expect(shaped.page).toBe(publishedPage);
  });

  it('leaves a projection that does not expand to fail closed in the render', () => {
    const stale = draftPage({ bindings: [], revisions: [] });
    expect(asPublishedRoute(route(stale)).page).toBe(stale);
  });
});
