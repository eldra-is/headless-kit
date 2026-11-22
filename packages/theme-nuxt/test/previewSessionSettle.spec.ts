// @vitest-environment jsdom
/**
 * The end of a session's start: the re-reads settle and the veil comes down, or they do not within
 * the bound and the session is unavailable (never the published page). And when the UI chunk
 * cannot be loaded, a plain built-in notice still says what is happening.
 */
import type { EldraClient } from '@eldrajs/theme-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/runtime/previewSessionUi', () => {
  throw new Error('the chunk is gone');
});

type Session = typeof import('../src/runtime/previewSession');

async function startSession(lang = 'en'): Promise<Session> {
  vi.resetModules();
  const session = await import('../src/runtime/previewSession');
  document.documentElement.lang = lang;
  document.head.innerHTML = '<meta name="eldra-preview" content="session">';
  document.body.innerHTML = '<div id="__nuxt"><p>Published</p></div>';
  const client = { enableSessionPreview: vi.fn() } as unknown as EldraClient;
  expect(session.startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(
    true
  );
  return session;
}

const fallback = () =>
  document
    .querySelector('[data-eldra-preview-session]')
    ?.shadowRoot?.querySelector<HTMLElement>('[role="alert"]') ?? null;

describe('settling the drafts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('brings the veil down once the re-reads have settled and rendered', async () => {
    const session = await startSession();
    const order: string[] = [];
    await session.settlePreviewSessionDrafts(
      async () => order.push('reads'),
      async () => order.push('render')
    );
    expect(order).toEqual(['reads', 'render']);
    expect(session.usePreviewSession().status).toBe('ready');
  });

  it('ends in the unavailable notice when the re-reads do not settle in time', async () => {
    vi.useFakeTimers();
    const session = await startSession();
    const afterRender = vi.fn(async () => undefined);
    const settling = session.settlePreviewSessionDrafts(
      () => new Promise(() => undefined),
      afterRender
    );
    await vi.advanceTimersByTimeAsync(session.PREVIEW_SESSION_DRAFT_TIMEOUT_MS);
    await settling;
    expect(session.usePreviewSession().status).toBe('unavailable');
    expect(afterRender).not.toHaveBeenCalled();
    // Late drafts do not bring the page back.
    session.markPreviewSessionDraftShown();
    expect(session.usePreviewSession().status).toBe('unavailable');
  });

  it('falls back to a plain notice when the UI chunk cannot be loaded', async () => {
    const session = await startSession();
    await vi.waitFor(() => expect(fallback()).not.toBeNull());
    const box = fallback()!;
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('Loading draft…');
    expect(box.querySelector('a')?.getAttribute('href')).toBe('/__eldra/preview/exit');
    expect(console.warn).toHaveBeenCalled();
    session.markPreviewSessionDraftShown();
    expect(box.hidden).toBe(true);
  });

  it('the fallback shows a refusal, in the page’s language, and takes focus', async () => {
    vi.useFakeTimers();
    const session = await startSession('is');
    await vi.waitFor(() => expect(fallback()).not.toBeNull());
    const host = document.querySelector<HTMLElement>('[data-eldra-preview-session]')!;
    void session.settlePreviewSessionDrafts(
      () => new Promise(() => undefined),
      async () => undefined
    );
    await vi.advanceTimersByTimeAsync(session.PREVIEW_SESSION_DRAFT_TIMEOUT_MS);
    const box = host.shadowRoot!.querySelector<HTMLElement>('[role="alert"]')!;
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('Forskoðun er ekki tiltæk.');
    expect(host.shadowRoot!.activeElement).toBe(box);
  });
});
