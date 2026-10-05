import { flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EldraClientError } from '@eldrajs/theme-core';
import { makeEnvelope } from '@eldrajs/theme-core/bridge';
import { createPreviewMessageRouter } from '@eldrajs/theme-core/preview-router';
import { createEldraPreviewState, type EldraContext } from '../context';
import { startEldraPreview } from '../useEldraPreview';

/**
 * Preview-token recovery: a preview token is one hash per organization, so
 * minting one anywhere else invalidates the one this preview is using and
 * every draft read comes back 401. The editor cannot see the gateway's answer
 * to a theme-side read, so `startEldraPreview` forwards the client's failures
 * as `theme:request-failed` — the message the editor recovers from.
 */
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

interface FakeClient {
  previewEnabled: boolean;
  listeners: Set<(error: EldraClientError) => void>;
  fail: (error: EldraClientError) => void;
}

function context(): { ctx: EldraContext; client: FakeClient } {
  const listeners = new Set<(error: EldraClientError) => void>();
  const client: FakeClient = {
    previewEnabled: true,
    listeners,
    fail: (error) => {
      for (const listener of [...listeners]) listener(error);
    },
  };
  const ctx = {
    client: {
      disablePreview: vi.fn(),
      enablePreview: vi.fn(),
      get previewEnabled() {
        return client.previewEnabled;
      },
      onRequestError: (listener: (error: EldraClientError) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as EldraContext['client'],
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: createEldraPreviewState(),
  } as unknown as EldraContext;
  return { ctx, client };
}

function dispatch(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: makeEnvelope(type, payload as never),
      origin: ALLOWED_ORIGIN,
    })
  );
}

async function flushStart(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

const requestFailures = () =>
  (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls
    .map(([envelope]) => envelope as { type: string; payload: unknown })
    .filter((message) => message.type === 'theme:request-failed');

describe('theme:request-failed', () => {
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

  it('posts the status and path of a failed preview read', async () => {
    const { ctx, client } = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: [] });

    client.fail(new EldraClientError(401, 'Unauthorized', '/api/cms/v1/schema/page/entry'));

    expect(requestFailures()).toHaveLength(1);
    expect(requestFailures()[0]!.payload).toEqual({
      status: 401,
      path: '/api/cms/v1/schema/page/entry',
    });
    runtime.destroy();
  });

  it('says nothing about a 404 — a miss the theme resolves itself', async () => {
    const { ctx, client } = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: [] });

    client.fail(new EldraClientError(404, 'Not Found', '/api/cms/v1/schema/page/entry'));

    expect(requestFailures()).toEqual([]);
    runtime.destroy();
  });

  it('says nothing while no preview token is in use', async () => {
    const { ctx, client } = context();
    client.previewEnabled = false;
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: [] });

    client.fail(new EldraClientError(401, 'Unauthorized', '/api/cms/v1/schema/page/entry'));

    expect(requestFailures()).toEqual([]);
    runtime.destroy();
  });

  it('unsubscribes on destroy', async () => {
    const { ctx, client } = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: [] });
    runtime.destroy();

    client.fail(new EldraClientError(401, 'Unauthorized', '/api/cms/v1/schema/page/entry'));

    expect(requestFailures()).toEqual([]);
    expect(client.listeners.size).toBe(0);
  });

  it('truncates a pathological path', async () => {
    const { ctx, client } = context();
    const runtime = startEldraPreview(ctx, { allowedOrigins: [ALLOWED_ORIGIN] });
    await flushStart();
    dispatch('editor:hello', { capabilities: [] });

    client.fail(new EldraClientError(401, 'Unauthorized', `/${'x'.repeat(5_000)}`));

    const [failure] = requestFailures();
    expect((failure!.payload as { path: string }).path).toHaveLength(256);
    runtime.destroy();
  });
});
