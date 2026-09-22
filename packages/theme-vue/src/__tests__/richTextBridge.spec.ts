import { flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvelope } from '@eldrajs/theme-core/bridge';
import { createPreviewMessageRouter } from '@eldrajs/theme-core/preview-router';
import { createEldraPreviewState, type EldraContext } from '../context';
import { startEldraPreview } from '../useEldraPreview';

const overlay = {
  start: vi.fn(),
  stop: vi.fn(),
  setMode: vi.fn(),
  setSelected: vi.fn(),
  acceptExternalUpdate: vi.fn(),
  reconcileExternalDrafts: vi.fn(),
  rescan: vi.fn(),
  setDragPayload: vi.fn(),
  setFramingMode: vi.fn(),
  setFramingEnabled: vi.fn(),
  setRichTextEnabled: vi.fn(),
  setRichTextEditing: vi.fn(),
  acceptRichTextApplied: vi.fn(),
  locateRichText: vi.fn(),
  isRichTextRenderDeferred: vi.fn(() => false),
  onRichTextRenderState: vi.fn(() => () => {}),
  chromeStyles: vi.fn(),
  chromeState: vi.fn(),
};

// Only the DOM chrome is stubbed. `createPreviewMessageRouter` is handed
// through from the real module (statically imported above, so the mock
// factory stays synchronous and the composable's dynamic import still
// resolves within the two microtask flushes `flushStart` does): these tests
// exercise theme-core's actual routing against a stub overlay.
vi.mock('@eldrajs/theme-core/overlay', () => ({
  createOverlayRuntime: vi.fn(() => overlay),
  createPreviewMessageRouter,
}));

const ALLOWED_ORIGIN = 'https://studio.example.com';

function context(): EldraContext {
  return {
    client: {
      disablePreview: vi.fn(),
      enablePreview: vi.fn(),
    } as unknown as EldraContext['client'],
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: createEldraPreviewState(),
  } as unknown as EldraContext;
}

function dispatch(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: makeEnvelope(type, payload as never),
      origin: ALLOWED_ORIGIN,
    })
  );
}

/** Lets the two dynamic import()s inside startEldraPreview settle before dispatching messages. */
async function flushStart(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

/**
 * §18 v3: the theme SDK hosts no rich-text editor. All the behaviour lives in
 * theme-core (the overlay reports geometry; `createPreviewMessageRouter` maps
 * the two editor messages onto it), so what this file pins is the Vue
 * binding's side of that contract: it delegates, it keeps no rich-text state
 * of its own, and the I16 registry is really gone. The behaviour itself is
 * covered by theme-core's overlay and preview-router suites.
 */
describe('rich-text bridge wiring (theme-vue, §18 v3)', () => {
  let originalParent: Window;

  beforeEach(() => {
    originalParent = window.parent;
    Object.defineProperty(window, 'parent', {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    for (const fn of Object.values(overlay)) fn.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
  });

  it('the preview state carries no in-theme editor registry, poster or capability flag', () => {
    const preview = createEldraPreviewState() as unknown as Record<string, unknown>;
    for (const removed of [
      'richTextEditors',
      'richTextPoster',
      'activeRichTextKey',
      'editorSupportsRichText',
      // §18 v3 / §17: both gates live on the overlay, negotiated once by
      // theme-core's router, so the Vue context mirrors neither.
      'editorSupportsFraming',
    ]) {
      expect(preview, removed).not.toHaveProperty(removed);
    }
    // The one negotiated capability a Vue component reads (EldraLayout's
    // editor-only slot markers) is still here.
    expect(preview).toHaveProperty('editorSupportsSlots', false);
  });

  it('an editor:hello negotiates through theme-core and forwards the rich-text gate', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();

    dispatch('editor:hello', {
      capabilities: ['block-slots', 'image-framing', 'rich-text-inline'],
    });

    // `block-slots` is the one flag theme-vue's own components read; the
    // other two gates go straight to the overlay.
    expect(ctx.preview.editorSupportsSlots).toBe(true);
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(true);
    expect(overlay.setRichTextEnabled).toHaveBeenLastCalledWith(true);
    // No per-framework copy of the capability: the gate lives on the overlay.
    expect(ctx.preview as unknown as Record<string, unknown>).not.toHaveProperty(
      'editorSupportsRichText'
    );

    runtime.destroy();

    expect(ctx.preview.editorSupportsSlots).toBe(false);
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);
    expect(overlay.setRichTextEnabled).toHaveBeenLastCalledWith(false);
  });

  it('delegates the three editor rich-text messages to the overlay', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: ['rich-text-inline'] });

    const target = { entryId: 'entry-1', fieldPath: 'body', locale: 'en-US' };
    dispatch('editor:rich-text-editing', { ...target, active: true });
    expect(overlay.setRichTextEditing).toHaveBeenCalledWith(target, true);

    dispatch('editor:rich-text-editing', { ...target, active: false });
    expect(overlay.setRichTextEditing).toHaveBeenLastCalledWith(target, false);

    dispatch('editor:rich-text-applied', {
      ...target,
      revision: 3,
      anchor: 7,
      head: 7,
      rerender: false,
    });
    expect(overlay.acceptRichTextApplied).toHaveBeenCalledWith({
      ...target,
      revision: 3,
      anchor: 7,
      head: 7,
      rerender: false,
    });

    dispatch('editor:rich-text-locate', { ...target, locale: null });
    expect(overlay.locateRichText).toHaveBeenCalledWith({ ...target, locale: null });

    // theme-vue routes and nothing else: §18 v3's native editing — the
    // contenteditable surface, the selection reports, the beforeinput
    // classification — lives entirely in theme-core's overlay runtime, so
    // there is one implementation for every framework binding.
    runtime.destroy();
  });

  it('contract §18 v3: a hello without rich-text-inline leaves every message unrouted', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: ['content-update'] });

    dispatch('editor:rich-text-editing', {
      entryId: 'entry-1',
      fieldPath: 'body',
      locale: null,
      active: true,
    });
    dispatch('editor:rich-text-locate', { entryId: 'entry-1', fieldPath: 'body', locale: null });
    dispatch('editor:rich-text-applied', {
      entryId: 'entry-1',
      fieldPath: 'body',
      locale: null,
      revision: 1,
      anchor: 0,
      head: 0,
      rerender: true,
    });

    expect(overlay.setRichTextEditing).not.toHaveBeenCalled();
    expect(overlay.locateRichText).not.toHaveBeenCalled();
    expect(overlay.acceptRichTextApplied).not.toHaveBeenCalled();
    expect(overlay.setRichTextEnabled).toHaveBeenLastCalledWith(false);

    runtime.destroy();
  });
});
