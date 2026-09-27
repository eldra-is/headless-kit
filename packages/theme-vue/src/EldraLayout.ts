import {
  Fragment,
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onMounted,
  onUpdated,
  type PropType,
  type VNode,
} from 'vue';
import {
  buildTemplateBlockRenames,
  createLayoutRenderModel,
  createReusableLayoutRenderModel,
  createTemplateLayoutRenderModel,
  designTokenRevisionHash,
  DEFAULT_LAYOUT_BREAKPOINTS,
  generateDesignTokenCss,
  normalizeThemeDesignTokens,
  type BlockSlotDefinition,
  type EntryDoc,
  type LayoutBreakpoints,
  type LayoutRenderModel,
  type LayoutRenderNode,
  type ReusableComponentProjection,
  type ReusableLayoutRenderModel,
  type ReusableLayoutRenderNode,
  type SlotValidationContext,
  type TemplateBlockDefinition,
  type TemplateLayoutRenderModel,
  type TemplateLayoutRenderNode,
} from '@eldrajs/theme-core';
import { getBlockComponent, getBlockSchemaApiId } from './EldraBlockZone';
import { ELDRA_KEY, type SlotGeometry } from './context';
import themeManifest from 'virtual:eldra/manifest';
import themeBreakpoints from 'virtual:eldra/breakpoints';

/**
 * Marker-mode-only styling for editor slot markers. Injected as a style
 * element only while an editor with the `block-slots` capability is active;
 * static output never emits it, so public layout is unaffected. Markers
 * themselves are inert (pointer-events:none) and aria-hidden.
 */
const SLOT_MARKER_CSS = [
  '.eldra-slot-marker{',
  'display:inline-block;',
  'max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;',
  'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
  'color:#3f3f46;background:#fafafa;',
  'border:1px dashed #b6dfff;border-radius:3px;',
  'padding:0 6px;margin:4px 0;',
  '}',
].join('');

type LayoutState =
  | {
      model: LayoutRenderModel | ReusableLayoutRenderModel | TemplateLayoutRenderModel;
      entries: ReadonlyMap<string, EntryDoc>;
    }
  | { model: null; entries: ReadonlyMap<string, EntryDoc> };

type RenderBlockNode = Extract<LayoutRenderNode | ReusableLayoutRenderNode, { type: 'block' }>;

/**
 * Module-scope catalog of every block's declared slots, derived once from the
 * theme manifest. Keys are the same apiIds `getBlockSchemaApiId` resolves, so
 * a rendered block can look up the slot ids its author actually declared.
 */
function buildSlotCatalog(): Record<string, ReadonlyArray<BlockSlotDefinition>> {
  const blocks =
    (themeManifest as { blocks?: Array<{ apiId?: string; slots?: BlockSlotDefinition[] }> })
      .blocks ?? [];
  const out: Record<string, ReadonlyArray<BlockSlotDefinition>> = {};
  for (const block of blocks) {
    if (block.apiId && Array.isArray(block.slots)) out[block.apiId] = block.slots;
  }
  return out;
}
const SLOT_CATALOG = buildSlotCatalog();

function buildTemplateBlockCatalog(): Record<string, TemplateBlockDefinition> {
  const blocks =
    (
      themeManifest as {
        blocks?: Array<{
          apiId?: string;
          fields?: Array<{ fieldId?: string; default?: unknown }>;
          migrations?: unknown;
        }>;
      }
    ).blocks ?? [];
  const out: Record<string, TemplateBlockDefinition> = {};
  for (const block of blocks) {
    if (typeof block.apiId !== 'string' || getBlockComponent(block.apiId) === null) continue;
    const renames = buildTemplateBlockRenames(block.migrations);
    out[block.apiId] = {
      apiId: block.apiId,
      fields: (block.fields ?? [])
        .filter(
          (field): field is { fieldId: string; default?: unknown } =>
            typeof field.fieldId === 'string'
        )
        .map((field) => ({
          fieldId: field.fieldId,
          ...(Object.hasOwn(field, 'default') ? { default: field.default } : {}),
        })),
      ...(Object.keys(renames).length === 0 ? {} : { renames }),
    };
  }
  return out;
}
const TEMPLATE_BLOCK_CATALOG = buildTemplateBlockCatalog();

/**
 * The theme's own tablet/normal layout breakpoints, already resolved and
 * validated by Core (`resolveLayoutBreakpoints`) at build time — this
 * binding only reads it through. Carried by the separate
 * `virtual:eldra/breakpoints` module, not `virtual:eldra/manifest`: the
 * manifest is exactly what is persisted/uploaded, and Core's ingest rejects
 * an unrecognized top-level key on that file. Falls back to the defaults for
 * a build whose plugin predates this virtual module (an unresolved import
 * would throw, not silently omit the field the way an optional manifest key
 * would have).
 */
const MANIFEST_BREAKPOINTS: LayoutBreakpoints =
  (themeBreakpoints as LayoutBreakpoints | undefined) ?? DEFAULT_LAYOUT_BREAKPOINTS;

function indexEntries(entries: readonly EntryDoc[]): Map<string, EntryDoc> {
  const indexed = new Map<string, EntryDoc>();
  for (const entry of entries) {
    // Gateway entry lists are unique. Keeping the first occurrence also makes a
    // malformed duplicate input deterministic without changing layout order.
    if (!indexed.has(entry.id)) indexed.set(entry.id, entry);
  }
  return indexed;
}

function renderIdentity(node: { id: string; renderId?: string }): string {
  return node.renderId ?? node.id;
}

function reusablePlacement(node: object): string | undefined {
  if (!('placementId' in node)) return undefined;
  return typeof node.placementId === 'string' ? node.placementId : undefined;
}

function renderBlock(
  node: RenderBlockNode,
  entries: ReadonlyMap<string, EntryDoc>,
  markerMode: boolean
): VNode {
  const entry = entries.get(node.entryId);
  const apiId = entry === undefined ? null : getBlockSchemaApiId(entry);
  const component = apiId === null ? null : getBlockComponent(apiId);

  if (entry === undefined || apiId === null || component === null) {
    return h('div', {
      key: renderIdentity(node),
      class: node.className,
      hidden: true,
      'data-eldra-layout-node': node.id,
      'data-eldra-reusable-placement': reusablePlacement(node),
      'data-eldra-missing-block': apiId ?? 'unknown',
    });
  }

  const children: VNode[] = [blockWithSlots(node, apiId, entries, markerMode)];
  if (markerMode) {
    // Editor-only markers: one per declared slot of this host, inside the host
    // wrapper after the block component. They are aria-hidden and inert to
    // pointer events, so they cannot change public layout or interactivity.
    for (const def of SLOT_CATALOG[apiId] ?? []) {
      children.push(
        h(
          'div',
          {
            key: `slot-marker-${renderIdentity(node)}-${def.id}`,
            class: 'eldra-slot-marker',
            'data-eldra-slot-marker': '',
            'data-eldra-slot-id': def.id,
            'data-eldra-layout-node-id': node.id,
            'aria-hidden': 'true',
            style: 'pointer-events:none',
          },
          `${def.label} · ${node.slots?.[def.id]?.length ?? 0}/${def.maxItems}`
        )
      );
    }
  }

  return h(
    'div',
    {
      key: renderIdentity(node),
      class: node.className,
      'data-eldra-layout-node': node.id,
      'data-eldra-reusable-placement': reusablePlacement(node),
      'data-eldra-block': entry.id,
      'data-eldra-schema': apiId,
    },
    children
  );
}

function renderSlotChildren(
  host: RenderBlockNode,
  slotId: string,
  slotChildren: RenderBlockNode[],
  entries: ReadonlyMap<string, EntryDoc>,
  markerMode: boolean
): VNode[] {
  const hostIdentity = renderIdentity(host);
  return slotChildren.map((child) => {
    // NUL-separated so host/slot/child ids cannot collide with each other.
    const identity = [hostIdentity, slotId, renderIdentity(child)].join('\u0000');
    return h(
      'div',
      {
        key: identity,
        class: child.className,
        'data-eldra-layout-node': child.id,
        'data-eldra-slot-id': slotId,
        'data-eldra-block': child.entryId,
      },
      [renderBlock(child, entries, markerMode)]
    ); // nested slots recurse here
  });
}

function blockWithSlots(
  host: RenderBlockNode,
  apiId: string,
  entries: ReadonlyMap<string, EntryDoc>,
  markerMode: boolean
): VNode {
  const declared = SLOT_CATALOG[apiId] ?? [];
  const named: Record<string, () => VNode[]> = {};
  for (const def of declared) {
    const children = host.slots?.[def.id];
    if (children === undefined || children.length === 0) continue; // block author fallback shows
    // The render model's slot children are render nodes carrying `className`
    // (theme-core's renderNode decorates them), though the declared slot type
    // is the pre-render LayoutBlockNode — cast to the runtime truth.
    named[def.id] = () =>
      renderSlotChildren(host, def.id, children as RenderBlockNode[], entries, markerMode);
  }
  const entry = entries.get(host.entryId)!;
  const component = getBlockComponent(apiId)!;
  return h(component, { entry }, named);
}

function renderNode(
  node: LayoutRenderNode | ReusableLayoutRenderNode | TemplateLayoutRenderNode,
  entries: ReadonlyMap<string, EntryDoc>,
  markerMode: boolean
): VNode {
  if (node.type === 'template-block') {
    const component = getBlockComponent(node.apiId);
    if (component === null) {
      return h('div', { hidden: true, 'data-eldra-invalid-layout': '' });
    }
    return h(
      'div',
      {
        key: `${node.id}\u0000${node.entry.id}`,
        class: node.className,
        'data-eldra-layout-node': node.id,
        'data-eldra-template-block': node.id,
        'data-eldra-block': node.entry.id,
        'data-eldra-schema': node.apiId,
      },
      [h(component, { entry: node.entry })]
    );
  }
  if (node.type === 'block') return renderBlock(node, entries, markerMode);

  return h(
    'div',
    {
      key: renderIdentity(node),
      class: node.className,
      'data-eldra-layout-node': node.id,
      'data-eldra-reusable-placement': reusablePlacement(node),
      'data-eldra-layout-container': node.type,
    },
    node.children.map((child) => renderNode(child, entries, markerMode))
  );
}

/**
 * Render a validated responsive layout with the same model and stylesheet used
 * by static generation. Invalid documents and unresolved entry references fail
 * closed before any customer block component is mounted.
 */
export const EldraLayout = defineComponent({
  name: 'EldraLayout',
  props: {
    layout: { type: null as unknown as PropType<unknown>, required: true },
    blocks: { type: Array as PropType<EntryDoc[]>, required: true },
    nonce: { type: String, required: false, default: undefined },
    designTokens: {
      type: null as unknown as PropType<unknown>,
      required: false,
      default: undefined,
    },
    reusableComponentProjection: {
      type: null as unknown as PropType<ReusableComponentProjection | undefined>,
      required: false,
      default: undefined,
    },
    templateEntry: {
      type: null as unknown as PropType<EntryDoc | undefined>,
      required: false,
      default: undefined,
    },
  },
  setup(props) {
    const context = inject(ELDRA_KEY, undefined);
    // Editor-only slot markers are negotiated: they render only while the
    // preview bridge is active AND the editor advertised the block-slots
    // capability (editor:hello). Static output never reaches this state.
    const markerMode = computed(
      () => context?.preview.active === true && context?.preview.editorSupportsSlots === true
    );
    const resolvedTokens = () =>
      props.designTokens !== undefined
        ? normalizeThemeDesignTokens(props.designTokens)
        : (context?.designTokens ?? normalizeThemeDesignTokens({ colors: {} }));
    const state = computed<LayoutState>(() => {
      // The Nuxt page adapter normally projects preview drafts before passing
      // blocks here. Keep the renderer authoritative as well: an already
      // mounted async block tree can otherwise retain its prior prop while the
      // shared preview context has advanced to an accepted draft.
      void context?.preview.revision;
      const entries = indexEntries(
        props.blocks.map((entry) => {
          const draft = context?.preview.drafts[entry.id];
          return draft === undefined ? entry : { ...entry, data: draft };
        })
      );
      try {
        const tokens = resolvedTokens();
        if (props.templateEntry !== undefined) {
          const draft = context?.preview.drafts[props.templateEntry.id];
          const entry =
            draft === undefined ? props.templateEntry : { ...props.templateEntry, data: draft };
          return {
            model: createTemplateLayoutRenderModel(props.layout, {
              entry,
              blockEntries: [...entries.values()],
              blockCatalog: TEMPLATE_BLOCK_CATALOG,
              allowedContainerIds: new Set(Object.keys(tokens.containers)),
              breakpoints: MANIFEST_BREAKPOINTS,
            }),
            entries: new Map(),
          };
        }
        const allowedEntryIds = new Set(entries.keys());
        const allowedContainerIds = new Set(Object.keys(tokens.containers));
        const reusable = props.reusableComponentProjection;
        const layoutVersion =
          typeof props.layout === 'object' && props.layout !== null
            ? (props.layout as { version?: unknown }).version
            : undefined;
        const slotContext: SlotValidationContext = {
          slotCatalog: SLOT_CATALOG,
          entryApiId: (entryId: string) => {
            const entry = entries.get(entryId);
            return entry === undefined ? undefined : (getBlockSchemaApiId(entry) ?? undefined);
          },
        };
        // v3 = v2 + slots: reusable placements may still appear at the top
        // level, so v3 documents flow through the reusable model. Slot
        // children remain block-only and never appear inside expanded
        // component content.
        return {
          model:
            reusable === undefined && layoutVersion !== 2 && layoutVersion !== 3
              ? createLayoutRenderModel(
                  props.layout,
                  allowedEntryIds,
                  allowedContainerIds,
                  slotContext,
                  MANIFEST_BREAKPOINTS
                )
              : createReusableLayoutRenderModel(props.layout, {
                  projection: reusable ?? { bindings: [], revisions: [] },
                  allowedEntryIds,
                  allowedContainerIds,
                  slotContext,
                  breakpoints: MANIFEST_BREAKPOINTS,
                }),
          entries,
        };
      } catch {
        return { model: null, entries };
      }
    });

    // Report slot-marker geometry to the editor after mount and after every
    // re-render (draft updates, viewport changes, late preview activation).
    // EldraLayout renders a fragment root (style tags + layout tree), so the
    // measurement queries the preview document for the marker attribute rather
    // than a component root element; markers exist only in marker mode, which
    // keeps the query scoped to this layout.
    const reportSlotMarkers = async (): Promise<void> => {
      if (!markerMode.value) return;
      await nextTick();
      const reporter = context?.preview.slotGeometryReporter;
      if (reporter === undefined) return;
      const elements = document.querySelectorAll('[data-eldra-slot-marker]');
      if (elements.length === 0) return; // nothing to report; keep the channel quiet
      const slots: SlotGeometry[] = [];
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        slots.push({
          layoutNodeId: element.getAttribute('data-eldra-layout-node-id') ?? '',
          slotId: element.getAttribute('data-eldra-slot-id') ?? '',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }
      reporter(slots);
    };
    onMounted(() => {
      void reportSlotMarkers();
    });
    onUpdated(() => {
      void reportSlotMarkers();
    });

    return () => {
      const { model, entries } = state.value;
      if (model === null) {
        return h('div', { hidden: true, 'data-eldra-invalid-layout': '' });
      }

      return h(Fragment, [
        h(
          'style',
          {
            'data-eldra-design-token-styles': '',
            'data-eldra-design-token-revision': designTokenRevisionHash(resolvedTokens()),
            nonce: props.nonce,
          },
          generateDesignTokenCss(resolvedTokens())
        ),
        h(
          'style',
          {
            'data-eldra-layout-styles': '',
            nonce: props.nonce,
          },
          model.css
        ),
        markerMode.value
          ? h('style', { 'data-eldra-slot-marker-styles': '', nonce: props.nonce }, SLOT_MARKER_CSS)
          : null,
        renderNode(model.root, entries, markerMode.value),
      ]);
    };
  },
});
