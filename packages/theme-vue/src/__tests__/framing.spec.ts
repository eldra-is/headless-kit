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

describe('image framing wiring (theme-vue)', () => {
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

  it('negotiates image-framing from editor:hello capabilities, on the overlay alone', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();

    dispatch('editor:hello', { capabilities: ['content-update', 'select-block'] });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);

    dispatch('editor:hello', { capabilities: ['content-update', 'image-framing'] });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(true);

    // The gate has one owner: theme-core's router forwards it to the overlay
    // and the Vue context keeps no copy of it.
    expect(ctx.preview as unknown as Record<string, unknown>).not.toHaveProperty(
      'editorSupportsFraming'
    );

    runtime.destroy();
  });

  it("includes the manifest's resolved breakpoints (defaults, since the test fixture configures none) in theme:ready", async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();

    dispatch('editor:hello', { capabilities: [] });

    const posted = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(
      ([envelope]) => envelope as { type: string; payload: { breakpoints?: unknown } }
    );
    const ready = posted.find((m) => m.type === 'theme:ready')!;
    expect(ready.payload.breakpoints).toEqual({ tablet: 768, normal: 1024 });

    runtime.destroy();
  });

  it('routes editor:framing-mode to the overlay runtime', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: ['image-framing'] });

    dispatch('editor:framing-mode', { entryId: 'e1', fieldPath: 'image' });
    expect(overlay.setFramingMode).toHaveBeenCalledWith({ entryId: 'e1', fieldPath: 'image' });

    dispatch('editor:framing-mode', { entryId: null });
    expect(overlay.setFramingMode).toHaveBeenCalledWith(null);

    runtime.destroy();
  });

  it('contract §17: a hello without image-framing leaves editor:framing-mode unrouted and disables the overlay', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();

    dispatch('editor:hello', { capabilities: ['content-update', 'select-block'] });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);

    dispatch('editor:framing-mode', { entryId: 'e1', fieldPath: 'image' });
    expect(overlay.setFramingMode).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('passes the negotiated capability to the overlay via setFramingEnabled', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();

    dispatch('editor:hello', { capabilities: ['content-update'] });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);

    dispatch('editor:hello', { capabilities: ['content-update', 'image-framing'] });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(true);

    runtime.destroy();
  });

  it('closes the framing gate on destroy', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: ['image-framing'] });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(true);

    runtime.destroy();
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);
  });
});
