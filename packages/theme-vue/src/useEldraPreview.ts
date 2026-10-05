import { onBeforeUnmount, readonly, ref, type Ref } from 'vue';
import type {
  DraftEntryPayload,
  EditorMode,
  ResolvedDesignTokensPayload,
} from '@eldrajs/theme-core/bridge';
import {
  DEFAULT_LAYOUT_BREAKPOINTS,
  generateDesignTokenCss,
  normalizeThemeDesignTokens,
  projectEntryDataLocale,
  type LayoutBreakpoints,
} from '@eldrajs/theme-core';
import { useEldra, type EldraContext, type SlotGeometry } from './context';
import themeBreakpoints from 'virtual:eldra/breakpoints';

/**
 * The theme's own tablet/normal layout breakpoints, already resolved and
 * validated by Core (`resolveLayoutBreakpoints`) at build time — included in
 * every `theme:ready` (see below) so Studio's UI can react to the theme's
 * actual ranges rather than a value it may not share. Carried by the
 * separate `virtual:eldra/breakpoints` module, not `virtual:eldra/manifest`:
 * the manifest is exactly what is persisted/uploaded, and Core's ingest
 * rejects an unrecognized top-level key on that file.
 */
const MANIFEST_BREAKPOINTS: LayoutBreakpoints =
  (themeBreakpoints as LayoutBreakpoints | undefined) ?? DEFAULT_LAYOUT_BREAKPOINTS;

/**
 * Bounds theme:slots-rendered reports, mirroring Studio's sanitizeRenderedBlocks
 * (contracts C14): at most 500 entries, finite rect numbers, and width/height
 * within 0..100_000. The editor-side sanitizer is the authority; stay in sync.
 */
export function sanitizeSlotGeometry(slots: unknown): SlotGeometry[] {
  if (!Array.isArray(slots)) return [];
  const out: SlotGeometry[] = [];
  for (const candidate of slots.slice(0, 500)) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const entry = candidate as Record<string, unknown>;
    if (typeof entry.layoutNodeId !== 'string' || entry.layoutNodeId.length > 128) continue;
    if (typeof entry.slotId !== 'string' || entry.slotId.length > 128) continue;
    const rect = entry.rect;
    if (rect === null || typeof rect !== 'object') continue;
    const r = rect as Record<string, unknown>;
    const x = r.x;
    const y = r.y;
    const width = r.width;
    const height = r.height;
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    if (typeof width !== 'number' || !Number.isFinite(width) || width < 0 || width > 100_000)
      continue;
    if (typeof height !== 'number' || !Number.isFinite(height) || height < 0 || height > 100_000)
      continue;
    out.push({
      layoutNodeId: entry.layoutNodeId,
      slotId: entry.slotId,
      rect: { x, y, width, height },
    });
  }
  return out;
}

/**
 * Exported for `previewDrafts.spec.ts`: proving a draft's own top-level
 * select field unwraps the same way a select nested in an embedded block
 * does (SF-2) needs to call this directly, without standing up the whole
 * `startEldraPreview` bridge/overlay runtime that owns every other call site.
 */
export function projectDrafts(context: EldraContext): void {
  for (const [entryId, draftDoc] of Object.entries(context.preview.sourceDrafts)) {
    context.preview.drafts[entryId] = context.client.encodeEntryDataStega(
      entryId,
      projectEntryDataLocale(
        draftDoc,
        context.preview.locale,
        context.preview.draftSchemaApiIds[entryId]
      ),
      context.preview.locale,
      context.preview.draftSchemaApiIds[entryId]
    );
  }
}

export function startEldraPreview(
  context: EldraContext,
  opts: { allowedOrigins: string[]; onNavigate?: (path: string) => void }
): { active: Readonly<Ref<boolean>>; destroy: () => void } {
  const active = ref(false);
  if (typeof window === 'undefined' || window.parent === window) {
    return { active: readonly(active), destroy: () => undefined };
  }

  let destroyRuntime: (() => void) | null = null;
  let disposed = false;

  void (async () => {
    const [{ createThemeBridge }, { createOverlayRuntime, createPreviewMessageRouter }] =
      await Promise.all([
        import('@eldrajs/theme-core/bridge'),
        import('@eldrajs/theme-core/overlay'),
      ]);
    if (disposed) return;

    // `router` and `bridge`'s `onMessage` closures capture `overlay` before it
    // can be assigned: `createOverlayRuntime` needs `bridge.post`, so the
    // assignment below cannot move to this declaration.
    // eslint-disable-next-line prefer-const
    let overlay: ReturnType<typeof createOverlayRuntime>;
    // Every editor:* message whose only effect is an overlay call is owned by
    // theme-core's router, so the behaviour is not re-implemented per
    // framework binding. This composable keeps only the messages that touch
    // Vue-side reactive state.
    const router = createPreviewMessageRouter(() => overlay);
    const bridge = createThemeBridge({
      allowedOrigins: opts.allowedOrigins,
      breakpoints: MANIFEST_BREAKPOINTS,
      // Editor capabilities are (re)negotiated on every hello, including
      // reconnects. The router forwards the framing and rich-text gates
      // straight to the overlay; `block-slots` is the only one mirrored into
      // the Vue context, because EldraLayout reads it to render the
      // editor-only slot markers.
      onEditorHello(capabilities) {
        context.preview.editorSupportsSlots = router.negotiate(capabilities).slots;
      },
      onMessage(type, payload) {
        if (router.route(type, payload)) return;
        if (type === 'editor:init') {
          const init = payload as {
            mode: EditorMode;
            previewToken: string;
            locale: string;
            path: string;
          };
          context.client.enablePreview(init.previewToken);
          context.preview.active = true;
          context.preview.mode = init.mode;
          context.preview.locale = init.locale;
          projectDrafts(context);
          active.value = true;
          overlay.setMode(init.mode);
          overlay.start();
          context.preview.refreshRevision += 1;
          context.preview.revision += 1;
          if (init.path !== window.location.pathname) opts.onNavigate?.(init.path);
        } else if (type === 'editor:content-update') {
          const entries = (payload as { entries: DraftEntryPayload[] }).entries;
          // The editor payload is the authoritative accepted draft. Release
          // matching inline-edit preservation before Vue applies it so a
          // focused contenteditable cannot restore its stale pre-update text.
          overlay.acceptExternalUpdate(entries.map(({ entryId }) => entryId));
          for (const update of entries) {
            context.preview.sourceDrafts[update.entryId] = update.draftDoc;
            context.preview.draftSchemaApiIds[update.entryId] = update.schemaApiId;
          }
          projectDrafts(context);
          // Page draft updates can introduce or replace reusable placements.
          // Their exact-revision projection is gateway-owned and is not part
          // of editor:content-update, so refresh the active page alongside the
          // in-memory draft overlay. This also closes the initialization order
          // where the first authenticated projection fetch preceded the v2
          // page draft delivered by Studio.
          context.preview.refreshRevision += 1;
          context.preview.revision += 1;
          queueMicrotask(() => {
            overlay.rescan();
            // Vue normally owns this text update. A focused contenteditable
            // can nevertheless retain its pre-update DOM even after the
            // reactive draft advances, so finish the accepted external update
            // at the overlay boundary without replacing renderer-owned nodes.
            overlay.reconcileExternalDrafts(
              context.preview.drafts,
              entries.map(({ entryId }) => entryId)
            );
          });
        } else if (type === 'editor:design-tokens') {
          const update = payload as ResolvedDesignTokensPayload;
          applyResolvedDesignTokens(context, update);
        } else if (type === 'editor:set-mode') {
          // Not routed: the mode is Vue-side reactive state too (components
          // read `preview.mode`), so the binding owns it and hands the
          // overlay its half.
          const mode = (payload as { mode: EditorMode }).mode;
          context.preview.mode = mode;
          overlay.setMode(mode);
        } else if (type === 'editor:navigate') {
          opts.onNavigate?.((payload as { path: string }).path);
        } else if (type === 'editor:refresh') {
          // Keep the authenticated preview bridge alive while the active page
          // refetches its draft-only reusable projection. A hard reload starts
          // from the static published payload and can receive the editor's v2
          // draft before that projection is available, causing a valid layout
          // to fail closed transiently.
          context.preview.refreshRevision += 1;
        }
      },
    });
    overlay = createOverlayRuntime({
      post: (type, payload) => bridge.post(type, payload),
      // The same numbers the generated layout CSS and `theme:ready` carry, so
      // the overlay's "hidden at this breakpoint?" verdict cannot drift from
      // what the stylesheet is actually doing.
      breakpoints: MANIFEST_BREAKPOINTS,
    });
    // The reporter is only reachable while the preview bridge exists; static
    // output never installs it, so marker geometry never leaves the theme.
    context.preview.slotGeometryReporter = (slots) => {
      const safe = sanitizeSlotGeometry(slots);
      if (safe.length === 0) return; // keep the channel quiet when nothing survived the bounds
      bridge.post('theme:slots-rendered', { slots: safe });
    };
    // §18 v3: the whole of the binding's share of deferred rendering — hand
    // EldraRichText core's predicate, and turn core's notifications into the
    // one reactive value Vue needs to re-evaluate it. Every decision about
    // when a field is deferred stays in theme-core.
    context.preview.isRichTextRenderDeferred = (identity) =>
      overlay.isRichTextRenderDeferred(identity);
    const stopRichTextRenderState = overlay.onRichTextRenderState(() => {
      context.preview.richTextRenderRevision += 1;
    });
    // A preview token is one hash per organization: minting one anywhere else
    // (another browser, another device, a test run) invalidates the one this
    // preview is using and the gateway answers every draft read with 401. The
    // editor can mint a fresh one and hand it back through `editor:init`, but
    // only if it is told — so every failed gateway request made *with* a
    // preview token is reported as `theme:request-failed`. A 404 is left out:
    // it is a miss the theme resolves itself (an unknown route, a link target
    // that no longer exists), not a preview that stopped working.
    const stopRequestErrors =
      context.client.onRequestError?.((error) => {
        if (!context.client.previewEnabled || error.status === 404) return;
        bridge.post('theme:request-failed', {
          status: error.status,
          path: error.path.slice(0, 256),
        });
      }) ?? (() => undefined);
    destroyRuntime = () => {
      context.client.disablePreview();
      context.preview.active = false;
      context.preview.editorSupportsSlots = false;
      context.preview.slotGeometryReporter = undefined;
      stopRichTextRenderState();
      stopRequestErrors();
      context.preview.isRichTextRenderDeferred = undefined;
      active.value = false;
      // Closes the framing and rich-text gates on the overlay (exiting any
      // live framing and clearing any rich-text editing mark) before stop().
      router.reset();
      overlay.stop();
      bridge.destroy();
      document.querySelector('style[data-eldra-live-design-token-styles]')?.remove();
    };
  })();

  return {
    active: readonly(active),
    destroy: () => {
      disposed = true;
      destroyRuntime?.();
    },
  };
}

function boundedPayload(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 64 * 1024;
  } catch {
    return false;
  }
}

function replaceRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) delete target[key];
  for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b)))
    target[key] = source[key]!;
}

interface StaticDesignTokenIds {
  colors: string[];
  containers: string[];
}

const staticDesignTokenIds = new WeakMap<EldraContext, StaticDesignTokenIds>();

function getStaticDesignTokenIds(context: EldraContext): StaticDesignTokenIds {
  const existing = staticDesignTokenIds.get(context);
  if (existing !== undefined) return existing;
  const captured = {
    colors: Object.keys(context.designTokens.colors),
    containers: Object.keys(context.designTokens.containers),
  };
  staticDesignTokenIds.set(context, captured);
  return captured;
}

export function applyResolvedDesignTokens(
  context: EldraContext,
  update: ResolvedDesignTokensPayload
): boolean {
  if (!boundedPayload(update)) return false;
  try {
    const resolved = normalizeThemeDesignTokens(update.resolved);
    if (
      !Number.isSafeInteger(update.revision) ||
      update.revision <= context.preview.designTokensRevision
    ) {
      return false;
    }
    const staticIds = getStaticDesignTokenIds(context);
    const removedColors = staticIds.colors.filter((id) => resolved.colors[id] === undefined);
    const removedContainers = staticIds.containers.filter(
      (id) => resolved.containers[id] === undefined
    );
    replaceRecord(context.designTokens.colors, resolved.colors);
    replaceRecord(context.designTokens.containers, resolved.containers);
    if (resolved.allowCustomColors === true) context.designTokens.allowCustomColors = true;
    else delete context.designTokens.allowCustomColors;
    context.preview.designTokensRevision = update.revision;
    if (typeof document !== 'undefined') {
      syncDesignTokenStyle(context, { colors: removedColors, containers: removedContainers });
    }
    return true;
  } catch {
    return false;
  }
}

function syncDesignTokenStyle(
  context: EldraContext,
  removed: { colors: string[]; containers: string[] }
): void {
  let style = document.querySelector<HTMLStyleElement>(
    'style[data-eldra-live-design-token-styles]'
  );
  if (style === null) {
    style = document.createElement('style');
    style.dataset.eldraLiveDesignTokenStyles = '';
    const nonce = document.querySelector<HTMLStyleElement>(
      'style[data-eldra-layout-styles][nonce]'
    )?.nonce;
    if (nonce) style.nonce = nonce;
    document.head.append(style);
  }
  const removedDeclarations = [
    ...removed.colors
      .sort((a, b) => a.localeCompare(b))
      .flatMap((id) => [`--eldra-color-${id}:initial;`, `--color-${id}:initial;`]),
    ...removed.containers
      .sort((a, b) => a.localeCompare(b))
      .flatMap((id) => [
        `--eldra-container-${id}-max-width:initial;`,
        `--eldra-container-${id}-gutter-normal:initial;`,
        `--eldra-container-${id}-gutter-tablet:initial;`,
        `--eldra-container-${id}-gutter-mobile:initial;`,
      ]),
  ].join('');
  const tombstones = removedDeclarations === '' ? '' : `:root{${removedDeclarations}}`;
  style.textContent = `${tombstones}${generateDesignTokenCss(context.designTokens)}`;
  style.dataset.eldraDesignTokenRevision = String(context.preview.designTokensRevision);
}

export function useEldraPreview(opts: {
  allowedOrigins: string[];
  onNavigate?: (path: string) => void;
}): { active: Readonly<Ref<boolean>> } {
  const active = ref(false);
  if (typeof window === 'undefined' || window.parent === window) {
    return { active: readonly(active) };
  }

  const runtime = startEldraPreview(useEldra(), opts);

  onBeforeUnmount(() => {
    runtime.destroy();
  });
  return { active: runtime.active };
}
