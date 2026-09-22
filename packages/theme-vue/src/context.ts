import { inject, provide, reactive, type InjectionKey } from 'vue';
import type { BridgePayloads } from '@eldrajs/theme-core/bridge';
import {
  normalizeThemeDesignTokens,
  type EldraClient,
  type RichTextFieldIdentity,
  type ThemeDesignTokens,
} from '@eldrajs/theme-core';

/**
 * One rendered editor slot marker's geometry. Derives from the bridge payload
 * type so the wire format stays the single source of truth.
 */
export type SlotGeometry = BridgePayloads['theme:slots-rendered']['slots'][number];

export type SlotGeometryReporter = (slots: SlotGeometry[]) => void;

export interface EldraContext {
  client: EldraClient;
  preview: {
    active: boolean;
    mode: 'preview' | 'edit';
    locale: string | null;
    sourceDrafts: Record<string, Record<string, unknown>>;
    drafts: Record<string, Record<string, unknown>>;
    draftSchemaApiIds: Record<string, string>;
    refreshRevision: number;
    revision: number;
    designTokensRevision: number;
    /**
     * Negotiated from the editor's editor:hello capabilities (the
     * `block-slots` capability), re-negotiated on every hello. Gates the
     * editor-only slot markers, which `EldraLayout` renders — the one
     * negotiated capability a Vue component has to read.
     *
     * The `image-framing` and `rich-text-inline` gates are deliberately not
     * mirrored here: theme-core's preview message router negotiates them and
     * forwards them straight to the overlay runtime
     * (`setFramingEnabled`/`setRichTextEnabled`), so there is one owner per
     * capability rather than one per framework binding.
     */
    editorSupportsSlots: boolean;
    /**
     * §18 v3: bumped once for every change theme-core reports through
     * `onRichTextRenderState`, so a rich-text field re-evaluates whether its
     * render is deferred. It is only a change signal — the answer itself is
     * `isRichTextRenderDeferred`, which is core's, not a mirror of it.
     */
    richTextRenderRevision: number;
    /**
     * §18 v3: theme-core's predicate, installed by startEldraPreview. While it
     * answers true for a field, the browser owns that field's DOM (a native
     * text op is in flight) and the renderer must not replace it. Undefined in
     * static output and outside a preview, where nothing is ever deferred.
     */
    isRichTextRenderDeferred?: (identity: RichTextFieldIdentity) => boolean;
    /**
     * Installed by startEldraPreview; posts bounded theme:slots-rendered
     * geometry over the bridge. Undefined in static output.
     */
    slotGeometryReporter?: SlotGeometryReporter;
  };
  designTokens: ThemeDesignTokens;
}

export const ELDRA_KEY: InjectionKey<EldraContext> = Symbol.for(
  'eldra.themeContext'
) as InjectionKey<EldraContext>;

/**
 * The preview slice of a fresh theme context, reactive and complete. Every
 * adapter that assembles an `EldraContext` by hand — theme-nuxt's runtime
 * plugin, or an equivalent entry for another framework — must build it from
 * here: the hand-written literal had already drifted several fields behind
 * this interface, and a missing field is a runtime error rather than a type
 * error once the object is assembled elsewhere.
 */
export function createEldraPreviewState(): EldraContext['preview'] {
  return reactive({
    active: false,
    mode: 'preview',
    locale: null,
    sourceDrafts: {},
    drafts: {},
    draftSchemaApiIds: {},
    refreshRevision: 0,
    revision: 0,
    designTokensRevision: 0,
    editorSupportsSlots: false,
    richTextRenderRevision: 0,
    isRichTextRenderDeferred: undefined,
    slotGeometryReporter: undefined,
  });
}

export function provideEldra(opts: { client: EldraClient; designTokens?: unknown }): EldraContext {
  const context: EldraContext = {
    client: opts.client,
    designTokens: reactive(normalizeThemeDesignTokens(opts.designTokens ?? { colors: {} })),
    preview: createEldraPreviewState(),
  };
  provide(ELDRA_KEY, context);
  return context;
}

export function useEldra(): EldraContext {
  const context = inject(ELDRA_KEY);
  if (context === undefined) {
    throw new Error('[eldra] useEldra() called without provideEldra() in an ancestor');
  }
  return context;
}
