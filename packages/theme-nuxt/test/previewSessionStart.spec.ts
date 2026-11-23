// @vitest-environment jsdom
/**
 * `startPreviewSession` on a page that is a session (jsdom's `localhost`, with the router's marker
 * in the head): the client is switched over, the app is busy and inert under the veil, a refusal
 * ends the session, and the UI module arrives on its own. Its own file because the session state is
 * one per page, as in a browser.
 */
import { EldraClientError, type EldraClient } from '@eldrajs/theme-core';
import { describe, expect, it, vi } from 'vitest';
import {
  markPreviewSessionDraftShown,
  startPreviewSession,
  usePreviewSession,
} from '../src/runtime/previewSession';

describe('startPreviewSession', () => {
  it('turns the page into a session and keeps the app unreachable until the draft is shown', async () => {
    document.head.innerHTML = '<meta name="eldra-preview" content="session">';
    document.body.innerHTML = '<div id="__nuxt"><a href="/x">Published</a></div>';
    expect(document.documentElement.hasAttribute('data-eldra-preview-ready')).toBe(false);
    let listener: ((error: EldraClientError) => void) | undefined;
    const client = {
      enableSessionPreview: vi.fn(),
      onRequestError: (fn: (error: EldraClientError) => void) => {
        listener = fn;
        return () => undefined;
      },
    } as unknown as EldraClient;
    const onHydrated = vi.fn();

    expect(startPreviewSession(client, { win: window, onHydrated })).toBe(true);
    expect(client.enableSessionPreview).toHaveBeenCalledWith({
      proxyBase: `${location.origin}/__eldra/gateway`,
    });
    const app = document.getElementById('__nuxt')!;
    const session = usePreviewSession();
    expect(session.status).toBe('pending');
    expect(app.getAttribute('aria-busy')).toBe('true');
    expect(app.hasAttribute('inert')).toBe(true);
    expect(onHydrated).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-eldra-preview-session]')).not.toBeNull()
    );
    // The veil is mounted and covering the page: the router's early hide is lifted while the
    // session is still pending (WS-1376).
    expect(document.documentElement.hasAttribute('data-eldra-preview-ready')).toBe(true);
    expect(session.status).toBe('pending');

    markPreviewSessionDraftShown();
    expect(app.hasAttribute('aria-busy')).toBe(false);
    expect(app.hasAttribute('inert')).toBe(false);

    listener?.(
      new EldraClientError(401, 'Unauthorized', '/__eldra/gateway/cms/v1/schema/page/entry', {
        errorId: 'SITE_PREVIEW_SESSION_REVOKED',
        sessionPreview: true,
      })
    );
    expect(session.status).toBe('expired');
    expect(session.errorId).toBe('SITE_PREVIEW_SESSION_REVOKED');
    expect(app.hasAttribute('inert')).toBe(true);
    // A later, lesser refusal does not replace it, and the draft never brings the page back.
    listener?.(
      new EldraClientError(503, 'x', '/__eldra/gateway/cms/v1/schema/page/entry', {
        sessionPreview: true,
      })
    );
    markPreviewSessionDraftShown();
    expect(session.status).toBe('expired');
  });
});
