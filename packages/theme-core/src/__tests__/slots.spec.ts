import { describe, expect, it } from 'vitest';
import {
  createLayoutRenderModel,
  createReusableLayoutRenderModel,
  normalizeLayoutDocument,
  validateLayoutDocument,
  type BlockSlotDefinition,
  type ReusableComponentProjection,
  type SlotValidationContext,
} from '../index';

const HOST_ENTRY = '123e4567-e89b-42d3-a456-426614174000';
const CHILD_A = '223e4567-e89b-42d3-a456-426614174000';
const CHILD_B = '323e4567-e89b-42d3-a456-426614174000';
const CHILD_C = '423e4567-e89b-42d3-a456-426614174000';
const CHILD_D = '523e4567-e89b-42d3-a456-426614174000';

const API_HOST = 'hero-block';
const API_A = 'text-block';
const API_B = 'image-block';
const API_C = 'cta-block';
const API_D = 'newsletter-block';

const SITE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPONENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const entryApiIds = new Map<string, string>([
  [HOST_ENTRY, API_HOST],
  [CHILD_A, API_A],
  [CHILD_B, API_B],
  [CHILD_C, API_C],
  [CHILD_D, API_D],
]);

// Catalog declaration order: sidebar, body, footer.
const HOST_CATALOG: readonly BlockSlotDefinition[] = [
  { id: 'sidebar', label: 'Sidebar', maxItems: 1, allowedBlockApiIds: [API_A] },
  { id: 'body', label: 'Body', maxItems: 20, allowedBlockApiIds: [API_A, API_B, API_C] },
  { id: 'footer', label: 'Footer', maxItems: 2 },
];

const NESTED_CATALOG: readonly BlockSlotDefinition[] = [{ id: 'body', label: 'Body', maxItems: 5 }];

function slotContext(): SlotValidationContext {
  return {
    slotCatalog: {
      [API_HOST]: HOST_CATALOG,
      [API_B]: NESTED_CATALOG,
    },
    entryApiId: (entryId) => entryApiIds.get(entryId),
  };
}

function block(id: string, entryId: string, slots?: unknown): Record<string, unknown> {
  const node: Record<string, unknown> = { id, type: 'block', entryId };
  if (slots !== undefined) node.slots = slots;
  return node;
}

/** v3 document whose root children are [extraChildren..., Host]. */
function rawV3(
  slots?: Record<string, unknown>,
  extraChildren: unknown[] = []
): Record<string, unknown> {
  return {
    version: 3,
    root: {
      id: 'Root',
      type: 'flex',
      children: [...extraChildren, block('Host', HOST_ENTRY, slots)],
      layout: { direction: { normal: 'column' } },
    },
  };
}

describe('layout version 3 slots', () => {
  it('accepts a slotted v3 document and lists entries in catalog declaration order', () => {
    // Document order is body-then-sidebar; catalog order is sidebar-then-body.
    const doc = rawV3({
      body: [block('B1', CHILD_B)],
      sidebar: [block('A1', CHILD_A)],
    });
    expect(validateLayoutDocument(doc, undefined, undefined, slotContext())).toBeNull();
    const result = normalizeLayoutDocument(doc, undefined, undefined, slotContext());
    expect(result.blockEntryIds).toEqual([HOST_ENTRY, CHILD_A, CHILD_B]);
    const host = result.document.root.children[0];
    expect(host).toMatchObject({ id: 'Host', type: 'block', entryId: HOST_ENTRY });
    if (host.type === 'block') {
      expect(Object.keys(host.slots ?? {})).toEqual(['sidebar', 'body']);
      expect(host.slots?.sidebar?.map((child) => child.entryId)).toEqual([CHILD_A]);
      expect(host.slots?.body?.map((child) => child.entryId)).toEqual([CHILD_B]);
    }
  });

  it.each([1, 2])('rejects slots on version %i documents with SLOT_VERSION', (version) => {
    const doc = rawV3({ sidebar: [block('A1', CHILD_A)] });
    doc.version = version;
    expect(validateLayoutDocument(doc, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots',
      code: 'SLOT_VERSION',
    });
  });

  it('fails closed with SLOT_UNKNOWN when a slots key appears without a slotContext', () => {
    expect(validateLayoutDocument(rawV3({ sidebar: [] }))).toEqual({
      path: '/root/children/0/slots',
      code: 'SLOT_UNKNOWN',
    });
  });

  it('rejects a slot id present in the document but absent from the catalog at the slot path', () => {
    const doc = rawV3({ hero: [block('A1', CHILD_A)] });
    expect(validateLayoutDocument(doc, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/hero',
      code: 'SLOT_UNKNOWN',
    });
  });

  it('enforces the block apiId allowlist per slot', () => {
    // Child apiId outside an explicit allowlist.
    const excluded = rawV3({ body: [block('D1', CHILD_D)] });
    expect(validateLayoutDocument(excluded, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/body/0',
      code: 'SLOT_DISALLOWED',
    });
    // Host's own apiId with no allowlist on the slot.
    const hostChild = rawV3({ footer: [block('H1', HOST_ENTRY)] });
    expect(validateLayoutDocument(hostChild, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/footer/0',
      code: 'SLOT_DISALLOWED',
    });
    // Host's own apiId under an explicit allowlist listing other ids.
    const hostChildAllowed = rawV3({ sidebar: [block('H2', HOST_ENTRY)] });
    expect(validateLayoutDocument(hostChildAllowed, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/sidebar/0',
      code: 'SLOT_DISALLOWED',
    });
  });

  it('rejects slot children beyond the catalog maxItems with SLOT_FULL', () => {
    const doc = rawV3({
      footer: [block('F1', CHILD_A), block('F2', CHILD_B), block('F3', CHILD_C)],
    });
    expect(validateLayoutDocument(doc, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/footer',
      code: 'SLOT_FULL',
    });
  });

  it('requires slot children to be block nodes carrying only known keys', () => {
    const flexChild = rawV3({
      body: [
        { id: 'Flex', type: 'flex', children: [], layout: { direction: { normal: 'column' } } },
      ],
    });
    expect(validateLayoutDocument(flexChild, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/body/0/type',
      code: 'INVALID_TYPE',
    });

    const unknownKey = rawV3({
      body: [{ id: 'A1', type: 'block', entryId: CHILD_A, mystery: true }],
    });
    expect(validateLayoutDocument(unknownKey, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/body/0/mystery',
      code: 'UNKNOWN_KEY',
    });
  });

  it('applies structural caps to slot-expanded trees', () => {
    // 13 slot keys on one node.
    const manySlots: Record<string, unknown> = {};
    for (let index = 0; index < 13; index += 1) manySlots[`slot${index}`] = [];
    expect(validateLayoutDocument(rawV3(manySlots), undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots',
      code: 'LIMIT_EXCEEDED',
    });

    // 21 children in one slot.
    const manyChildren = rawV3({
      body: Array.from({ length: 21 }, (_, index) => block(`C${index}`, CHILD_A)),
    });
    expect(validateLayoutDocument(manyChildren, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots/body',
      code: 'LIMIT_EXCEEDED',
    });

    // Depth 12 host plus a slot child crosses MAX_DEPTH.
    const deep = rawV3({ sidebar: [block('A1', CHILD_A)] });
    const host = (deep.root as { children: unknown[] }).children[0]!;
    let container = deep.root as { children: unknown[] };
    for (let depth = 0; depth < 10; depth += 1) {
      const next = {
        id: `Node${depth}`,
        type: 'flex',
        children: [],
        layout: { direction: { normal: 'column' } },
      };
      container.children = [next];
      container = next as { children: unknown[] };
    }
    container.children = [host];
    expect(validateLayoutDocument(deep, undefined, undefined, slotContext())).toEqual({
      path: `/root${'/children/0'.repeat(11)}/slots/sidebar/0`,
      code: 'LIMIT_EXCEEDED',
    });

    // 500-node tree whose overflow lands inside a slot.
    const top = Array.from({ length: 480 }, (_, index) => block(`Top${index}`, CHILD_A));
    const slotted = rawV3(
      { body: Array.from({ length: 20 }, (_, index) => block(`S${index}`, CHILD_B)) },
      top
    );
    expect(validateLayoutDocument(slotted, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/480/slots/body/18',
      code: 'LIMIT_EXCEEDED',
    });

    // Canonical bytes count the slot-expanded tree.
    const spacing = {
      normal: {
        top: '4096.0000px',
        right: '4096.0000px',
        bottom: '4096.0000px',
        left: '4096.0000px',
      },
      tablet: {
        top: '4096.0000px',
        right: '4096.0000px',
        bottom: '4096.0000px',
        left: '4096.0000px',
      },
      mobile: {
        top: '4096.0000px',
        right: '4096.0000px',
        bottom: '4096.0000px',
        left: '4096.0000px',
      },
    } as const;
    const styled = (id: string): Record<string, unknown> => ({
      id,
      type: 'block',
      entryId: CHILD_A,
      style: {
        margin: spacing,
        padding: spacing,
        width: { normal: '4096.0000px', tablet: '256.0000rem', mobile: '100.0000%' },
        minWidth: { normal: '4096.0000px', tablet: '256.0000rem', mobile: '100.0000%' },
        maxWidth: { normal: '4096.0000px', tablet: '256.0000rem', mobile: '100.0000%' },
        minHeight: { normal: '4096.0000px', tablet: '256.0000rem', mobile: '100.0000%' },
        alignSelf: { normal: 'stretch', tablet: 'center', mobile: 'auto' },
        visible: { normal: true, tablet: false, mobile: true },
      },
    });
    const big = rawV3(
      { body: Array.from({ length: 20 }, (_, index) => styled(`S${index}`)) },
      Array.from({ length: 478 }, (_, index) => styled(`Top${index}`))
    );
    expect(validateLayoutDocument(big, undefined, undefined, slotContext())).toEqual({
      path: '',
      code: 'LIMIT_EXCEEDED',
    });
  });

  it('validates nested slotted hosts and lists entries in full DFS order', () => {
    const doc = rawV3({
      sidebar: [block('A1', CHILD_A)],
      body: [block('B1', CHILD_B, { body: [block('C1', CHILD_C)] })],
    });
    const result = normalizeLayoutDocument(doc, undefined, undefined, slotContext());
    expect(result.blockEntryIds).toEqual([HOST_ENTRY, CHILD_A, CHILD_B, CHILD_C]);
    const host = result.document.root.children[0];
    if (host.type === 'block') {
      expect(host.slots?.body?.[0]).toMatchObject({ id: 'B1', entryId: CHILD_B });
      expect(host.slots?.body?.[0]?.slots?.body?.[0]).toMatchObject({ id: 'C1', entryId: CHILD_C });
    }
  });

  it('lists a repeated entry once per slot at its DFS position', () => {
    const doc = rawV3({
      sidebar: [block('A1', CHILD_A)],
      body: [block('A2', CHILD_A)],
    });
    const result = normalizeLayoutDocument(doc, undefined, undefined, slotContext());
    expect(result.blockEntryIds).toEqual([HOST_ENTRY, CHILD_A, CHILD_A]);
  });

  it('assigns classNames to slot children in the render model', () => {
    const doc = rawV3({
      body: [block('B1', CHILD_B)],
      sidebar: [block('A1', CHILD_A)],
    });
    const model = createLayoutRenderModel(doc, undefined, undefined, slotContext());
    const host = model.root.children[0];
    expect(host).toMatchObject({ id: 'Host', type: 'block', entryId: HOST_ENTRY });
    expect(host.className).toMatch(/^eldra-layout-[0-9a-f]{64}$/);
    if (host.type === 'block' && host.slots) {
      expect(Object.keys(host.slots)).toEqual(['sidebar', 'body']);
      for (const children of Object.values(host.slots)) {
        expect(children).toHaveLength(1);
        expect(children[0]?.className).toMatch(/^eldra-layout-[0-9a-f]{64}$/);
        expect(children[0]?.type).toBe('block');
      }
    }
  });

  it('rejects duplicate node ids spanning the top level and slots', () => {
    const doc = rawV3({ sidebar: [block('Dup', CHILD_B)] }, [block('Dup', CHILD_A)]);
    expect(validateLayoutDocument(doc, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/1/slots/sidebar/0/id',
      code: 'DUPLICATE_ID',
    });
  });

  it('passes slotContext through reusable expansion for v3 pages', () => {
    const component = {
      version: 1 as const,
      root: {
        id: 'CRoot',
        type: 'flex' as const,
        layout: { direction: { normal: 'column' as const } },
        children: [{ id: 'CB', type: 'block' as const, entryId: CHILD_A }],
      },
    };
    const projection: ReusableComponentProjection = {
      bindings: [{ placementId: 'Footer', componentId: COMPONENT, siteId: SITE, revision: 7 }],
      revisions: [{ componentId: COMPONENT, siteId: SITE, revision: 7, document: component }],
    };
    const page = rawV3({ sidebar: [block('A1', CHILD_A)] }, [
      { id: 'Footer', type: 'reusable', componentId: COMPONENT },
    ]);
    const model = createReusableLayoutRenderModel(page, {
      projection,
      slotContext: slotContext(),
    });
    const host = model.root.children[1];
    expect(host).toMatchObject({ id: 'Host', type: 'block', entryId: HOST_ENTRY });
    if (host.type === 'block') {
      expect(host.slots?.sidebar?.[0]?.className).toMatch(/^eldra-layout-[0-9a-f]{64}$/);
      expect(host.slots?.sidebar?.[0]?.entryId).toBe(CHILD_A);
    }
  });

  it('emits CSS rules for slot children with style overrides', () => {
    const doc = rawV3({
      sidebar: [
        {
          id: 'A1',
          type: 'block',
          entryId: CHILD_A,
          style: { margin: { normal: { top: '1rem' } }, visible: { normal: true } },
        },
      ],
    });
    const model = createLayoutRenderModel(doc, undefined, undefined, slotContext());
    const host = model.root.children[0];
    expect(host.type).toBe('block');
    if (host.type === 'block' && host.slots?.sidebar) {
      const child = host.slots.sidebar[0]!;
      expect(child.className).toMatch(/^eldra-layout-[0-9a-f]{64}$/);
      expect(model.css).toContain(`.${child.className}{margin-top:1rem;display:block;}`);
    }
  });

  it.each([
    ['null', null],
    ['number', 42],
    ['string', 'oops'],
    ['array', ['nope']],
  ])('rejects non-object slots values (%s) with INVALID_TYPE', (_label, slotsValue) => {
    const doc = rawV3({ sidebar: [] });
    const root = doc.root as { children: Array<{ slots: unknown }> };
    root.children[0]!.slots = slotsValue;
    expect(validateLayoutDocument(doc, undefined, undefined, slotContext())).toEqual({
      path: '/root/children/0/slots',
      code: 'INVALID_TYPE',
    });
  });
});
