import { flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvelope } from '@eldrajs/theme-core/bridge';
import { createPreviewMessageRouter } from '@eldrajs/theme-core/preview-router';
import { createEldraPreviewState, type EldraContext } from '../context';
import { startEldraPreview } from '../useEldraPreview';

/**
 * A theme-configured breakpoints pair, distinct from the defaults (768/1024)
 * the shared `test/mocks/breakpoints.ts` fixture used elsewhere resolves to
 * — so a test asserting on these exact numbers can only pass if the
 * theme's own configuration actually reached `theme:ready`, never the
 * fallback. `vi.hoisted` so the `vi.mock` factory below (itself hoisted
 * above this file's other top-level statements) can reference it.
 *
 * Mocking `virtual:eldra/breakpoints` alone (not `virtual:eldra/manifest`,
 * which `useEldraPreview.ts` no longer imports at all) — breakpoints are
 * carried separately from the manifest precisely because the manifest is
 * exactly what is persisted/uploaded, and Core's ingest rejects an
 * unrecognized top-level key on that file.
 */
const { CUSTOM_BREAKPOINTS } = vi.hoisted(() => ({
  CUSTOM_BREAKPOINTS: { tablet: 600, normal: 900 },
}));

vi.mock('virtual:eldra/breakpoints', () => ({ default: CUSTOM_BREAKPOINTS }));

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
  setBlockHoverEnabled: vi.fn(),
  setRichTextEditing: vi.fn(),
  locateRichText: vi.fn(),
  isRichTextRenderDeferred: vi.fn(() => false),
  onRichTextRenderState: vi.fn(() => () => {}),
  chromeStyles: vi.fn(),
  chromeState: vi.fn(),
};

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

describe('theme-configured breakpoints reach theme:ready (§ breakpoints negotiation)', () => {
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

  it('posts the theme-configured breakpoints pair — not the defaults — in theme:ready', async () => {
    const ctx = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();

    dispatch('editor:hello', { capabilities: [] });

    const posted = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(
      ([envelope]) => envelope as { type: string; payload: { breakpoints?: unknown } }
    );
    const ready = posted.find((m) => m.type === 'theme:ready')!;
    expect(ready.payload.breakpoints).toEqual(CUSTOM_BREAKPOINTS);
    expect(ready.payload.breakpoints).not.toEqual({ tablet: 768, normal: 1024 });

    runtime.destroy();
  });
});
