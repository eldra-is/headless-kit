import { describe, expect, it } from 'vitest';
import {
  LayoutValidationError,
  ReusableComponentSnapshotCache,
  createLayoutRenderModel,
  createReusableLayoutRenderModel,
  layoutRenderNodeId,
  type ReusableComponentProjection,
  type ReusableLayoutRenderNode,
} from '../index';

const SITE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN_SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMPONENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BLOCK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const componentDocument = {
  version: 1 as const,
  root: {
    id: 'FooterRoot',
    type: 'flex' as const,
    layout: { direction: { normal: 'column' as const } },
    children: [
      { id: 'FooterBlock', type: 'block' as const, entryId: BLOCK },
      { id: 'FooterBlockRepeat', type: 'block' as const, entryId: BLOCK },
    ],
  },
};

function page(...placementIds: string[]) {
  return {
    version: 2,
    root: {
      id: 'PageRoot',
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children: placementIds.map((id) => ({ id, type: 'reusable', componentId: COMPONENT })),
    },
  };
}

function projection(...placementIds: string[]): ReusableComponentProjection {
  return {
    bindings: placementIds.map((placementId) => ({
      placementId,
      componentId: COMPONENT,
      siteId: SITE,
      revision: 7,
    })),
    revisions: [{ componentId: COMPONENT, siteId: SITE, revision: 7, document: componentDocument }],
  };
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

describe('reusable layout expansion', () => {
  it('expands repeated placements with stable internal identity and distinct render identity', () => {
    const model = createReusableLayoutRenderModel(page('FooterA', 'FooterB'), {
      projection: projection('FooterA', 'FooterB'),
      allowedEntryIds: new Set([BLOCK]),
    });
    // FooterRoot is a flex node (componentDocument, above) — narrow the render
    // node union so `.children` (flex/grid-only) type-checks below.
    const [first, second] = model.root.children as Array<
      Extract<ReusableLayoutRenderNode, { type: 'flex' | 'grid' }>
    >;
    expect(first?.id).toBe('FooterRoot');
    expect(second?.id).toBe('FooterRoot');
    expect(first?.placementId).toBe('FooterA');
    expect(second?.placementId).toBe('FooterB');
    expect(first?.renderId).not.toBe(second?.renderId);
    expect(first?.renderId).toBe('FooterA');
    expect(first?.children[0]?.renderId).toBe(layoutRenderNodeId('FooterA\0FooterBlock'));
    expect(first?.children[0]?.renderId.startsWith('r')).toBe(true);
    expect(model.document.root.children[0]?.id).toBe('FooterA');
    expect(first?.className).not.toBe(second?.className);
    expect(model.blockEntryIds).toEqual([BLOCK, BLOCK, BLOCK, BLOCK]);
    expect(model.dependencyKey).toContain(`${COMPONENT}:7`);
    expect(
      createReusableLayoutRenderModel(page('FooterA', 'FooterB'), {
        projection: projection('FooterA', 'FooterB'),
        allowedEntryIds: new Set([BLOCK]),
      })
    ).toEqual(model);
    expect(createLayoutRenderModel(model.document, new Set([BLOCK])).css).toBe(model.css);
  });

  it('renders detached version-1 content through the same entrypoint without a special case', () => {
    const detached = structuredClone(componentDocument);
    const model = createReusableLayoutRenderModel(detached, {
      projection: { bindings: [], revisions: [] },
      allowedEntryIds: new Set([BLOCK]),
    });
    expect(model.root.id).toBe('FooterRoot');
    expect(model.root.placementId).toBeUndefined();
    expect(model.blockEntryIds).toEqual([BLOCK, BLOCK]);
  });

  it.each([
    ['missing binding', () => ({ bindings: [], revisions: [] }), 'COMPONENT_NOT_FOUND'],
    [
      'missing revision',
      () => ({ bindings: projection('FooterA').bindings, revisions: [] }),
      'COMPONENT_NOT_FOUND',
    ],
    [
      'foreign binding',
      () => ({
        ...projection('FooterA'),
        bindings: [{ ...projection('FooterA').bindings[0]!, siteId: FOREIGN_SITE }],
      }),
      'COMPONENT_FOREIGN',
    ],
    [
      'stale tuple',
      () => ({
        ...projection('FooterA'),
        bindings: [{ ...projection('FooterA').bindings[0]!, revision: 8 }],
      }),
      'COMPONENT_NOT_FOUND',
    ],
  ])('fails closed for %s', (_name, makeProjection, code) => {
    expect(
      issue(() =>
        createReusableLayoutRenderModel(page('FooterA'), {
          projection: makeProjection() as ReusableComponentProjection,
          allowedEntryIds: new Set([BLOCK]),
        })
      )?.code
    ).toBe(code);
  });

  it('rejects nested/recursive definitions and excessive placements before rendering', () => {
    const nested = structuredClone(componentDocument) as unknown as Record<string, unknown>;
    const root = nested.root as { children: unknown[] };
    root.children = [{ id: 'Nested', type: 'reusable', componentId: COMPONENT }];
    const nestedProjection = projection('FooterA');
    nestedProjection.revisions[0]!.document = nested as never;
    expect(
      issue(() =>
        createReusableLayoutRenderModel(page('FooterA'), {
          projection: nestedProjection,
        })
      )?.code
    ).toBe('INVALID_VALUE');

    const cyclic = structuredClone(componentDocument) as unknown as Record<string, unknown>;
    cyclic.root = cyclic;
    const cyclicProjection = projection('FooterA');
    cyclicProjection.revisions[0]!.document = cyclic as never;
    expect(
      issue(() =>
        createReusableLayoutRenderModel(page('FooterA'), {
          projection: cyclicProjection,
        })
      )?.code
    ).toBe('INVALID_VALUE');

    const ids = Array.from({ length: 101 }, (_, index) => `Placement${index}`);
    expect(
      issue(() =>
        createReusableLayoutRenderModel(page(...ids), {
          projection: projection(...ids),
        })
      )?.code
    ).toBe('LIMIT_EXCEEDED');
  });

  it('counts the fully expanded page against the existing node bound', () => {
    const largeDocument = structuredClone(componentDocument);
    largeDocument.root.children = Array.from({ length: 499 }, (_, index) => ({
      id: `Block${index}`,
      type: 'block' as const,
      entryId: BLOCK,
    }));
    const value = projection('FooterA', 'FooterB');
    value.revisions[0]!.document = largeDocument;
    expect(
      issue(() =>
        createReusableLayoutRenderModel(page('FooterA', 'FooterB'), {
          projection: value,
          allowedEntryIds: new Set([BLOCK]),
        })
      )?.code
    ).toBe('LIMIT_EXCEEDED');
  });

  it('counts canonical bytes after expansion, not just each valid definition', () => {
    const spacing = {
      normal: {
        top: '4096px' as const,
        right: '4096px' as const,
        bottom: '4096px' as const,
        left: '4096px' as const,
      },
      tablet: {
        top: '256rem' as const,
        right: '256rem' as const,
        bottom: '256rem' as const,
        left: '256rem' as const,
      },
      mobile: {
        top: '100%' as const,
        right: '100%' as const,
        bottom: '100%' as const,
        left: '100%' as const,
      },
    };
    const largeDocument = structuredClone(componentDocument);
    largeDocument.root.children = Array.from({ length: 200 }, (_, index) => ({
      id: `Styled${index}`,
      type: 'block' as const,
      entryId: BLOCK,
      style: {
        margin: spacing,
        padding: spacing,
        width: { normal: '4096px' as const, tablet: '256rem' as const, mobile: '100%' as const },
        minWidth: { normal: '4096px' as const, tablet: '256rem' as const, mobile: '100%' as const },
        maxWidth: { normal: '4096px' as const, tablet: '256rem' as const, mobile: '100%' as const },
        minHeight: {
          normal: '4096px' as const,
          tablet: '256rem' as const,
          mobile: '100%' as const,
        },
        alignSelf: {
          normal: 'stretch' as const,
          tablet: 'center' as const,
          mobile: 'auto' as const,
        },
        visible: { normal: true, tablet: false, mobile: true },
      },
    }));
    expect(() => createLayoutRenderModel(largeDocument, new Set([BLOCK]))).not.toThrow();
    const value = projection('FooterA', 'FooterB');
    value.revisions[0]!.document = largeDocument;
    expect(
      issue(() =>
        createReusableLayoutRenderModel(page('FooterA', 'FooterB'), {
          projection: value,
          allowedEntryIds: new Set([BLOCK]),
        })
      )?.code
    ).toBe('LIMIT_EXCEEDED');
  });
});

describe('reusable component revision cache', () => {
  it('isolates draft/published snapshots and invalidates all tracked consumers atomically', () => {
    const cache = new ReusableComponentSnapshotCache();
    const published = projection('FooterA').revisions[0]!;
    const draft = { ...published, revision: 8 };
    expect(cache.put('published', published).size).toBe(0);
    expect(cache.put('draft', draft).size).toBe(0);
    cache.trackPage('published', '/home', projection('FooterA').bindings);
    cache.trackPage('published', '/about', projection('FooterB').bindings);
    cache.trackPage('draft', '/home', [{ ...projection('FooterA').bindings[0]!, revision: 8 }]);

    expect(
      cache.resolve('published')({ componentId: COMPONENT, siteId: SITE, revision: 7 })?.revision
    ).toBe(7);
    expect(
      cache.resolve('draft')({ componentId: COMPONENT, siteId: SITE, revision: 8 })?.revision
    ).toBe(8);
    expect(
      cache.resolve('published')({ componentId: COMPONENT, siteId: SITE, revision: 8 })
    ).toBeNull();

    const changed = { ...published, revision: 9 };
    expect([...cache.put('published', changed)].sort()).toEqual(['/about', '/home']);
    expect(
      cache.resolve('published')({ componentId: COMPONENT, siteId: SITE, revision: 7 })
    ).toBeNull();
    expect(
      cache.resolve('draft')({ componentId: COMPONENT, siteId: SITE, revision: 8 })?.revision
    ).toBe(8);
  });

  it('preserves the prior snapshot when replacement validation fails', () => {
    const cache = new ReusableComponentSnapshotCache();
    const valid = projection('FooterA').revisions[0]!;
    cache.put('published', valid);
    expect(() =>
      cache.put('published', { ...valid, revision: 8, document: { version: 2 } })
    ).toThrow();
    expect(
      cache.resolve('published')({ componentId: COMPONENT, siteId: SITE, revision: 7 })
    ).toEqual(valid);
  });
});
