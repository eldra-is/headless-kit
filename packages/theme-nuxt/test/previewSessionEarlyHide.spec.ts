// @vitest-environment jsdom
/**
 * The preview router's early hide (WS-1376): it keeps a session document's body hidden until the kit
 * sets `data-eldra-preview-ready` on `<html>`. The kit sets it once its veil is mounted (see
 * `previewSessionStart.spec.ts` and the browser spec) — and, here, on every way the session leaves
 * the veil while the veil has **not** mounted (its chunk never arrives), so the router's rule never
 * keeps a page hidden.
 */
import type { EldraClient, EldraClientError } from '@eldrajs/theme-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The UI chunk never arrives: the veil is never mounted.
vi.mock('../src/runtime/previewSessionUi', () => new Promise(() => undefined));

type Session = typeof import('../src/runtime/previewSession');

const ready = (): boolean => document.documentElement.hasAttribute('data-eldra-preview-ready');

async function startSession(extra: Partial<EldraClient> = {}): Promise<Session> {
  vi.resetModules();
  const session = await import('../src/runtime/previewSession');
  document.documentElement.removeAttribute('data-eldra-preview-ready');
  document.head.innerHTML = '<meta name="eldra-preview" content="session">';
  document.body.innerHTML = '<div id="__nuxt"><p>Published</p></div>';
  const client = { enableSessionPreview: vi.fn(), ...extra } as unknown as EldraClient;
  expect(session.startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(
    true
  );
  return session;
}

describe('the router’s early hide, without the veil', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays while the session is pending, and lifts when the draft is shown', async () => {
    const session = await startSession();
    const seen: boolean[] = [];
    await session.settlePreviewSessionDrafts(
      async () => seen.push(ready()),
      async () => seen.push(ready())
    );
    expect(seen).toEqual([false, false]);
    expect(session.usePreviewSession().status).toBe('ready');
    expect(ready()).toBe(true);
  });

  it('lifts when the re-reads time out', async () => {
    vi.useFakeTimers();
    const session = await startSession();
    const settling = session.settlePreviewSessionDrafts(
      () => new Promise(() => undefined),
      async () => undefined
    );
    await vi.advanceTimersByTimeAsync(session.PREVIEW_SESSION_DRAFT_TIMEOUT_MS - 1);
    expect(ready()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await settling;
    expect(session.usePreviewSession().status).toBe('unavailable');
    expect(ready()).toBe(true);
  });

  it('lifts on a refusal', async () => {
    let listener: ((error: EldraClientError) => void) | undefined;
    const session = await startSession({
      onRequestError: (fn) => {
        listener = fn;
        return () => undefined;
      },
    });
    expect(ready()).toBe(false);
    // The class of the module graph the session itself was loaded with (`vi.resetModules`).
    const { EldraClientError: ClientError } = await import('@eldrajs/theme-core');
    listener?.(
      new ClientError(401, 'Unauthorized', '/__eldra/gateway/cms/v1/schema/page/entry', {
        errorId: 'SITE_PREVIEW_SESSION_EXPIRED',
        sessionPreview: true,
      })
    );
    expect(session.usePreviewSession().status).toBe('expired');
    expect(ready()).toBe(true);
  });

  it('lifts when the render fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = await startSession();
    await session.settlePreviewSessionDrafts(
      async () => undefined,
      async () => {
        throw new Error('head manager gone');
      }
    );
    expect(session.usePreviewSession().status).toBe('unavailable');
    expect(ready()).toBe(true);
  });

  it('lifts at once for a client that cannot read drafts', async () => {
    vi.resetModules();
    const session = await import('../src/runtime/previewSession');
    document.documentElement.removeAttribute('data-eldra-preview-ready');
    document.head.innerHTML = '<meta name="eldra-preview" content="session">';
    document.body.innerHTML = '<div id="__nuxt"></div>';
    expect(
      session.startPreviewSession({} as EldraClient, { win: window, onHydrated: () => undefined })
    ).toBe(true);
    expect(session.usePreviewSession().status).toBe('unavailable');
    expect(ready()).toBe(true);
  });

  it('a site settings chunk that never loads still lets the drafts show, the build’s values kept', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = await startSession();
    let isOpen: () => boolean = () => true;
    const settling = session.settlePreviewSessionDrafts(
      () =>
        Promise.allSettled([
          Promise.resolve('drafts'),
          session.settlePreviewSessionSiteSettings((open) => {
            isOpen = open;
            return new Promise(() => undefined); // the chunk never arrives
          }),
        ]),
      async () => undefined
    );
    await vi.advanceTimersByTimeAsync(session.PREVIEW_SESSION_SITE_SETTINGS_TIMEOUT_MS);
    await settling;
    expect(session.usePreviewSession().status).toBe('ready');
    // Past the bound: an answer that still arrives is not applied.
    expect(isOpen()).toBe(false);
    expect(session.PREVIEW_SESSION_SITE_SETTINGS_TIMEOUT_MS).toBeLessThan(
      session.PREVIEW_SESSION_DRAFT_TIMEOUT_MS
    );
  });

  it('a site settings read that fails never ends the session', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = await startSession();
    await session.settlePreviewSessionDrafts(
      () =>
        session.settlePreviewSessionSiteSettings(() => {
          throw new Error('chunk gone');
        }),
      async () => undefined
    );
    expect(session.usePreviewSession().status).toBe('ready');
  });
});
