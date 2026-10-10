import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutNodeClass, type EntryDoc } from '@eldrajs/theme-core';
import { ELDRA_KEY, type EldraContext } from '../context';
import { EldraLayout } from '../EldraLayout';
import { sanitizeSlotGeometry } from '../useEldraPreview';

const heroId = '11111111-1111-4111-8111-111111111111';
const innerHeroId = '33333333-3333-4333-8333-333333333333';
const ctaId = '22222222-2222-4222-8222-222222222222';
const missingId = '44444444-4444-4444-8444-444444444444';

const hero = { id: heroId, schemaApiId: 'hero', data: { heading: 'Hero heading' } };
const innerHero = { id: innerHeroId, schemaApiId: 'hero', data: { heading: 'Inner hero' } };
const cta = { id: ctaId, schemaApiId: 'cta', data: { label: 'Shop now' } };
const missing = { id: missingId, schemaApiId: 'missing-component', data: {} };

const context = {
  designTokens: reactive({ colors: {}, containers: {} }),
  preview: reactive({
    active: false,
    mode: 'preview',
    locale: 'en-US',
    sourceDrafts: {},
    drafts: {} as Record<string, Record<string, unknown>>,
    draftSchemaApiIds: {},
    refreshRevision: 0,
    revision: 0,
    designTokensRevision: 0,
    tokenRevision: 0,
  }),
} as unknown as EldraContext;

function block(
  id: string,
  entryId: string,
  slots?: Record<string, unknown[]>
): Record<string, unknown> {
  const node: Record<string, unknown> = { id, type: 'block', entryId };
  if (slots !== undefined) node.slots = slots;
  return node;
}

function v3Layout(children: unknown[]): Record<string, unknown> {
  return {
    version: 3,
    root: {
      id: 'PageRoot',
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children,
    },
  };
}

async function mountLayout(
  layout: unknown,
  blocks: unknown[],
  ctx: EldraContext = context,
  attachToBody = false
): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(EldraLayout, {
    props: { layout, blocks: blocks as EntryDoc[] },
    attachTo: attachToBody ? document.body : undefined,
    global: { provide: { [ELDRA_KEY as symbol]: ctx } },
  });
  await flushPromises();
  return wrapper;
}

/** Preview-active context for marker tests (the shared `context` is static). */
function previewContext(overrides: Partial<EldraContext['preview']> = {}): EldraContext {
  return {
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: reactive({
      active: false,
      mode: 'preview',
      locale: 'en-US',
      sourceDrafts: {},
      drafts: {},
      draftSchemaApiIds: {},
      refreshRevision: 0,
      revision: 0,
      designTokensRevision: 0,
      tokenRevision: 0,
      editorSupportsSlots: false,
      ...overrides,
    }),
  } as unknown as EldraContext;
}

describe('EldraLayout version 3 named slots', () => {
  it('marks a hidden slot child on every element carrying its layout class', async () => {
    const child = block('CtaOne', ctaId);
    child.style = { visible: { normal: true, mobile: false } };
    const wrapper = await mountLayout(v3Layout([block('HeroNode', heroId, { actions: [child] })]), [
      hero,
      cta,
    ]);

    // The binding wraps a slot child and then renders the block inside that
    // wrapper, so the node's class lands on two nested elements. Both must
    // carry the marker: the `display:none` gate is per element, and an
    // unmarked inner element would be hidden inside a shown wrapper in edit
    // mode. The generated CSS is what stops the dimming compounding.
    const marked = wrapper.findAll('[data-eldra-layout-node="CtaOne"]');
    expect(marked).toHaveLength(2);
    expect(marked.map((element) => element.attributes('data-eldra-hidden'))).toEqual([
      'mobile',
      'mobile',
    ]);
    expect(marked.every((element) => element.classes(layoutNodeClass('CtaOne')))).toBe(true);
    expect(
      wrapper.get('[data-eldra-layout-node="HeroNode"]').attributes('data-eldra-hidden')
    ).toBeUndefined();
  });

  it('renders both slot children inside the actions slot in document order', async () => {
    const layout = v3Layout([
      block('HeroNode', heroId, {
        actions: [block('CtaOne', ctaId), block('CtaTwo', ctaId)],
      }),
    ]);
    const wrapper = await mountLayout(layout, [hero, cta]);

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.get('[data-eldra-layout-node="HeroNode"]').attributes('data-eldra-block')).toBe(
      heroId
    );
    wrapper.get('[data-test-hero]');

    const wrappers = wrapper.findAll('[data-eldra-slot-id="actions"]');
    expect(wrappers).toHaveLength(2);
    expect(wrappers.map((node) => node.attributes('data-eldra-layout-node'))).toEqual([
      'CtaOne',
      'CtaTwo',
    ]);
    expect(wrappers.map((node) => node.attributes('data-eldra-block'))).toEqual([ctaId, ctaId]);
    // Inner block markers carry the schema annotation.
    expect(
      wrappers.map((node) => node.get('[data-eldra-schema]').attributes('data-eldra-schema'))
    ).toEqual(['cta', 'cta']);
    expect(wrapper.findAll('[data-test-cta]').map((node) => node.text())).toEqual([
      'Shop now',
      'Shop now',
    ]);
    expect(wrapper.find('[data-test-fallback]').exists()).toBe(false);
  });

  it('omits the slot when it is empty so the block fallback renders', async () => {
    const layout = v3Layout([block('HeroNode', heroId, { actions: [] })]);
    const wrapper = await mountLayout(layout, [hero, cta]);

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.get('[data-test-fallback]').text()).toBe('default cta');
    expect(wrapper.findAll('[data-eldra-slot-id]')).toHaveLength(0);
  });

  it('fails closed before a block with no declared slots receives any slot content', async () => {
    const layout = v3Layout([block('CtaHost', ctaId, { actions: [block('CtaChild', ctaId)] })]);
    const wrapper = await mountLayout(layout, [hero, cta]);

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.find('[data-eldra-slot-id]').exists()).toBe(false);
    expect(wrapper.find('[data-test-cta]').exists()).toBe(false);
    expect(wrapper.find('[data-test-fallback]').exists()).toBe(false);
  });

  it('renders one repeated entry under two different slots with distinct wrappers', async () => {
    const layout = v3Layout([
      block('HeroNode', heroId, {
        actions: [block('CtaInActions', ctaId)],
        footer: [block('CtaInFooter', ctaId)],
      }),
    ]);
    const wrapper = await mountLayout(layout, [hero, cta]);

    const wrappers = wrapper.findAll('[data-eldra-slot-id]');
    expect(wrappers).toHaveLength(2);
    expect(wrappers.map((node) => node.attributes('data-eldra-slot-id'))).toEqual([
      'actions',
      'footer',
    ]);
    expect(wrappers.map((node) => node.attributes('data-eldra-layout-node'))).toEqual([
      'CtaInActions',
      'CtaInFooter',
    ]);
    expect(wrappers.map((node) => node.attributes('data-eldra-block'))).toEqual([ctaId, ctaId]);
    expect(wrapper.findAll('[data-test-cta]')).toHaveLength(2);
  });

  it('recurses into a nested slotted host', async () => {
    const layout = v3Layout([
      block('OuterHero', heroId, {
        actions: [block('InnerHero', innerHeroId, { actions: [block('DeepCta', ctaId)] })],
      }),
    ]);
    const wrapper = await mountLayout(layout, [hero, innerHero, cta]);

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test-hero]')).toHaveLength(2);

    const outerSlot = wrapper.get(
      '[data-eldra-layout-node="OuterHero"] [data-eldra-slot-id="actions"]'
    );
    expect(outerSlot.attributes('data-eldra-layout-node')).toBe('InnerHero');
    const deepSlot = outerSlot.get(
      '[data-eldra-layout-node="InnerHero"] [data-eldra-slot-id="actions"]'
    );
    expect(deepSlot.attributes('data-eldra-layout-node')).toBe('DeepCta');
    expect(deepSlot.get('[data-test-cta]').text()).toBe('Shop now');
    expect(wrapper.findAll('[data-test-cta]')).toHaveLength(1);
  });

  it('renders the missing-block fallback inside the slot wrapper when a child has no component', async () => {
    const layout = v3Layout([
      block('HeroNode', heroId, {
        footer: [block('MissingChild', missingId)],
      }),
    ]);
    const wrapper = await mountLayout(layout, [hero, cta, missing]);

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    const slotWrapper = wrapper.get('[data-eldra-slot-id="footer"]');
    const marker = slotWrapper.get('[data-eldra-missing-block="missing-component"]');
    expect(marker.attributes('hidden')).toBe('');
    expect(marker.attributes('data-eldra-layout-node')).toBe('MissingChild');
    wrapper.get('[data-test-hero]');
  });

  it('keeps the exact pre-change wrapper for non-slotted blocks', async () => {
    const v3 = v3Layout([block('CtaNode', ctaId)]);
    const wrapper = await mountLayout(v3, [hero, cta]);
    const marker = wrapper.get('[data-eldra-layout-node="CtaNode"]');

    expect(marker.attributes()).toMatchObject({
      'data-eldra-layout-node': 'CtaNode',
      'data-eldra-block': ctaId,
      'data-eldra-schema': 'cta',
    });
    expect(marker.attributes('class')).toBe(layoutNodeClass('CtaNode'));
    expect(marker.attributes('hidden')).toBeUndefined();
    expect(marker.attributes('data-eldra-slot-id')).toBeUndefined();
    expect(marker.attributes('data-eldra-reusable-placement')).toBeUndefined();
    expect(marker.element.childElementCount).toBe(1);
    expect(marker.get('[data-test-cta]').text()).toBe('Shop now');
    expect(wrapper.find('[data-eldra-slot-id]').exists()).toBe(false);

    // Identical wrapper attrs on the untouched version 1 path.
    const v1 = { ...v3, version: 1 };
    const wrapper1 = await mountLayout(v1, [hero, cta]);
    expect(wrapper1.get('[data-eldra-layout-node="CtaNode"]').attributes()).toEqual(
      marker.attributes()
    );
  });
});

describe('EldraLayout editor slot markers (capability-negotiated)', () => {
  let mounted: Array<ReturnType<typeof mount>> = [];

  afterEach(() => {
    for (const wrapper of mounted) wrapper.unmount();
    mounted = [];
  });

  /**
   * Mount into document.body: marker geometry is measured against the
   * document (the overlay runtime convention), so tests must use the real
   * attachment path. Wrappers are unmounted after each test to keep the
   * shared document clean for the next one.
   */
  async function mountInBody(
    layout: unknown,
    blocks: unknown[],
    ctx: EldraContext
  ): Promise<ReturnType<typeof mount>> {
    const wrapper = await mountLayout(layout, blocks, ctx, true);
    mounted.push(wrapper);
    return wrapper;
  }

  it('renders one marker per declared slot and reports its geometry when block-slots is negotiated', async () => {
    const reporter = vi.fn();
    const layout = v3Layout([block('HeroNode', heroId, { actions: [block('CtaOne', ctaId)] })]);
    const wrapper = await mountInBody(
      layout,
      [hero, cta],
      previewContext({
        active: true,
        editorSupportsSlots: true,
        slotGeometryReporter: reporter,
      })
    );

    // hero declares two slots: `actions` (1 child) and `footer` (empty).
    const markers = wrapper.findAll('[data-eldra-slot-marker]');
    expect(markers).toHaveLength(2);
    const actions = markers.find((m) => m.attributes('data-eldra-slot-id') === 'actions')!;
    expect(actions.attributes('data-eldra-layout-node-id')).toBe('HeroNode');
    expect(actions.attributes('aria-hidden')).toBe('true');
    expect(actions.attributes('style')).toMatch(/pointer-events:\s*none/);
    expect(actions.text()).toBe('Actions · 1/2');
    const footer = markers.find((m) => m.attributes('data-eldra-slot-id') === 'footer')!;
    expect(footer.text()).toBe('Footer · 0/2');
    // The marker lives inside the host wrapper, after the block component.
    expect(actions.element.parentElement?.getAttribute('data-eldra-layout-node')).toBe('HeroNode');
    // Marker styling is injected only in marker mode.
    expect(wrapper.find('style[data-eldra-slot-marker-styles]').exists()).toBe(true);
    expect(wrapper.find('style[data-eldra-slot-marker-styles]').text()).toContain('#b6dfff');

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0]![0]).toEqual([
      { layoutNodeId: 'HeroNode', slotId: 'actions', rect: { x: 0, y: 0, width: 0, height: 0 } },
      { layoutNodeId: 'HeroNode', slotId: 'footer', rect: { x: 0, y: 0, width: 0, height: 0 } },
    ]);
  });

  it('marks nested slotted hosts too, in document order', async () => {
    const reporter = vi.fn();
    const layout = v3Layout([
      block('OuterHero', heroId, {
        actions: [block('InnerHero', innerHeroId, { actions: [block('DeepCta', ctaId)] })],
      }),
    ]);
    const wrapper = await mountInBody(
      layout,
      [hero, innerHero, cta],
      previewContext({
        active: true,
        editorSupportsSlots: true,
        slotGeometryReporter: reporter,
      })
    );

    // Document order is depth-first: the inner host's markers sit inside the
    // outer host's rendered block, so they precede the outer host's own
    // markers, which follow the block component.
    const markers = wrapper.findAll('[data-eldra-slot-marker]');
    expect(markers).toHaveLength(4);
    expect(markers.map((m) => m.attributes('data-eldra-layout-node-id'))).toEqual([
      'InnerHero',
      'InnerHero',
      'OuterHero',
      'OuterHero',
    ]);
    expect(markers.map((m) => m.attributes('data-eldra-slot-id'))).toEqual([
      'actions',
      'footer',
      'actions',
      'footer',
    ]);
    expect(markers.map((m) => m.text())).toEqual([
      'Actions · 1/2',
      'Footer · 0/2',
      'Actions · 1/2',
      'Footer · 0/2',
    ]);

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0]![0].map((s: { layoutNodeId: string }) => s.layoutNodeId)).toEqual(
      ['InnerHero', 'InnerHero', 'OuterHero', 'OuterHero']
    );
  });

  it('marks an empty declared slot with a 0 count while the block fallback still renders', async () => {
    const reporter = vi.fn();
    const layout = v3Layout([block('HeroNode', heroId, { actions: [] })]);
    const wrapper = await mountInBody(
      layout,
      [hero, cta],
      previewContext({
        active: true,
        editorSupportsSlots: true,
        slotGeometryReporter: reporter,
      })
    );

    expect(wrapper.get('[data-test-fallback]').text()).toBe('default cta');
    expect(wrapper.get('[data-eldra-slot-marker]').text()).toBe('Actions · 0/2');
  });

  it('renders zero markers and never reports when the editor lacks block-slots', async () => {
    const reporter = vi.fn();
    const layout = v3Layout([block('HeroNode', heroId, { actions: [block('CtaOne', ctaId)] })]);
    const wrapper = await mountInBody(
      layout,
      [hero, cta],
      previewContext({
        active: true,
        editorSupportsSlots: false,
        slotGeometryReporter: reporter,
      })
    );

    expect(wrapper.findAll('[data-eldra-slot-marker]')).toHaveLength(0);
    expect(wrapper.find('style[data-eldra-slot-marker-styles]').exists()).toBe(false);
    expect(reporter).not.toHaveBeenCalled();
  });

  it('renders zero markers and never reports in static (inactive preview) output', async () => {
    const reporter = vi.fn();
    const layout = v3Layout([block('HeroNode', heroId, { actions: [block('CtaOne', ctaId)] })]);
    const staticWrapper = await mountLayout(
      layout,
      [hero, cta],
      previewContext({
        active: false,
        editorSupportsSlots: true,
        slotGeometryReporter: reporter,
      })
    );

    expect(staticWrapper.findAll('[data-eldra-slot-marker]')).toHaveLength(0);
    expect(staticWrapper.find('style[data-eldra-slot-marker-styles]').exists()).toBe(false);
    expect(reporter).not.toHaveBeenCalled();
  });
});

describe('sanitizeSlotGeometry (reporter bounds, mirroring Studio)', () => {
  const rect = { x: 10, y: 20, width: 640, height: 48 };

  it('keeps valid entries and drops malformed ones', () => {
    const good = { layoutNodeId: 'HeroNode', slotId: 'actions', rect };
    const bad: unknown[] = [
      { layoutNodeId: 7, slotId: 'actions', rect }, // non-string id
      { layoutNodeId: 'HeroNode', slotId: 'actions' }, // missing rect
      { layoutNodeId: 'HeroNode', slotId: 'actions', rect: { ...rect, width: Number.NaN } },
      { layoutNodeId: 'HeroNode', slotId: 'actions', rect: { ...rect, height: -1 } },
      { layoutNodeId: 'HeroNode', slotId: 'actions', rect: { ...rect, width: 100_001 } },
      null,
      'nope',
    ];
    expect(sanitizeSlotGeometry([good, ...bad])).toEqual([good]);
    expect(sanitizeSlotGeometry(null)).toEqual([]);
    expect(
      sanitizeSlotGeometry([
        { layoutNodeId: 'a', slotId: 'b', rect: { x: Infinity, y: 0, width: 1, height: 1 } },
      ])
    ).toEqual([]);
  });

  it('caps reports at 500 entries', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      layoutNodeId: `node-${i}`,
      slotId: 'actions',
      rect,
    }));
    expect(sanitizeSlotGeometry(many)).toHaveLength(500);
  });
});
