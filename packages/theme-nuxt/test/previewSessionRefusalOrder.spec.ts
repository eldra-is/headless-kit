// @vitest-environment jsdom
/**
 * The first refusal is the one shown (WS-1376 review). The router clears the session's cookies when
 * it refuses one as expired or revoked — a site settings read included — so every read after it can
 * only come back `SITE_PREVIEW_SESSION_INVALID`; the notice must still say why the session ended.
 */
import { EldraClientError, type EldraClient } from '@eldrajs/theme-core';
import { describe, expect, it, vi } from 'vitest';
import {
  reportPreviewSessionSiteSettingError,
  startPreviewSession,
  usePreviewSession,
} from '../src/runtime/previewSession';

const refusal = (status: number, errorId: string): EldraClientError =>
  new EldraClientError(status, 'refused', '/__eldra/gateway/cms/v1/schema/page/entry', {
    errorId,
    sessionPreview: true,
  });

describe('which refusal is shown', () => {
  it('an expired session read by a site setting, then invalid CMS reads, shows the expired notice', async () => {
    document.documentElement.lang = 'en';
    document.head.innerHTML = '<meta name="eldra-preview" content="session">';
    document.body.innerHTML = '<div id="__nuxt"><p>Published</p></div>';
    let listener: ((error: EldraClientError) => void) | undefined;
    const client = {
      enableSessionPreview: vi.fn(),
      onRequestError: (fn: (error: EldraClientError) => void) => {
        listener = fn;
        return () => undefined;
      },
    } as unknown as EldraClient;
    expect(startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(true);
    const session = usePreviewSession();

    // A site setting the router does not forward says nothing about the session.
    reportPreviewSessionSiteSettingError(refusal(404, 'PREVIEW_GATEWAY_PATH_NOT_ALLOWED'));
    reportPreviewSessionSiteSettingError(refusal(503, 'PREVIEW_UNAVAILABLE'));
    expect(session.status).toBe('pending');

    reportPreviewSessionSiteSettingError(refusal(401, 'SITE_PREVIEW_SESSION_EXPIRED'));
    listener?.(refusal(401, 'SITE_PREVIEW_SESSION_INVALID'));
    listener?.(refusal(401, 'SITE_PREVIEW_SESSION_INVALID'));
    expect(session.status).toBe('expired');
    expect(session.errorId).toBe('SITE_PREVIEW_SESSION_EXPIRED');

    const notice = () =>
      document
        .querySelector('[data-eldra-preview-session]')
        ?.shadowRoot?.querySelector<HTMLElement>('.notice');
    await vi.waitFor(() => expect(notice()?.hidden).toBe(false));
    expect(notice()?.textContent).toContain('This preview link has expired.');
    expect(notice()?.textContent).not.toContain('not valid');
  });

  it('a token read refused as expired while the texts read is pending wins over a later invalid CMS read', async () => {
    vi.resetModules();
    const session = await import('../src/runtime/previewSession');
    const { readSessionSiteSettings } = await import('../src/runtime/previewSessionSite');
    const { EldraClientError: ClientError } = await import('@eldrajs/theme-core');
    const refused = (errorId: string) =>
      new ClientError(401, 'Unauthorized', '/__eldra/gateway/site/v1/design-tokens', {
        errorId,
        sessionPreview: true,
      });
    document.documentElement.lang = 'en';
    document.head.innerHTML = '<meta name="eldra-preview" content="session">';
    document.body.innerHTML = '<div id="__nuxt"><p>Published</p></div>';
    let listener: ((error: EldraClientError) => void) | undefined;
    const client = {
      enableSessionPreview: vi.fn(),
      onRequestError: (fn: (error: EldraClientError) => void) => {
        listener = fn;
        return () => undefined;
      },
      getSiteSetting: (path: string) =>
        path === '/site/v1/design-tokens'
          ? Promise.reject(refused('SITE_PREVIEW_SESSION_EXPIRED'))
          : new Promise(() => undefined), // the texts read is still pending
    } as unknown as EldraClient;
    expect(session.startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(
      true
    );
    const reading = readSessionSiteSettings(
      client,
      {
        designTokens: { colors: {}, containers: {} },
        messages: { defaultLocale: 'en-US', locales: {} },
      },
      {
        themeMessages: undefined,
        locales: null,
        onError: session.reportPreviewSessionSiteSettingError,
        warn: () => undefined,
      }
    );
    void reading;
    // The token refusal is heard as soon as it fails, before the texts read has settled …
    await vi.waitFor(() => expect(session.usePreviewSession().status).toBe('expired'));
    // … so the CMS read that the router then refuses as invalid does not replace it.
    listener?.(
      new ClientError(401, 'Unauthorized', '/__eldra/gateway/cms/v1/schema/page/entry', {
        errorId: 'SITE_PREVIEW_SESSION_INVALID',
        sessionPreview: true,
      })
    );
    expect(session.usePreviewSession().errorId).toBe('SITE_PREVIEW_SESSION_EXPIRED');
    const notice = () =>
      [...document.querySelectorAll('[data-eldra-preview-session]')]
        .map((host) => host.shadowRoot?.querySelector<HTMLElement>('.notice'))
        .find((node) => node?.hidden === false);
    await vi.waitFor(() => expect(notice()).toBeTruthy());
    expect(notice()?.textContent).toContain('This preview link has expired.');
  });
});
