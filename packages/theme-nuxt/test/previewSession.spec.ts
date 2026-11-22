// @vitest-environment jsdom
/**
 * `./runtime/previewSession.ts` on its own: how a session is recognised, which failures end one,
 * the copy, and the veil/notice/banner it mounts. The whole flow, through a real build and a real
 * browser, is `previewSession.browser.spec.ts`.
 */
import { EldraClientError } from '@eldrajs/theme-core';
import { describe, expect, it } from 'vitest';
import { nextTick, reactive } from 'vue';
import {
  PREVIEW_SESSION_MESSAGES,
  detectPreviewSession,
  hasPreviewSessionMarker,
  isPreviewSessionHost,
  mountPreviewSessionUi,
  previewSessionLocale,
  previewSessionRefusal,
  type PreviewSessionState,
} from '../src/runtime/previewSession';

const SESSION = 'p-0f8c2a6e-1b2c-4d3e-8f90-123456789abc';

describe('recognising a session', () => {
  it('accepts exactly the router’s session hosts', () => {
    expect(isPreviewSessionHost(`${SESSION}.previews-staging.eldra.dev`)).toBe(true);
    expect(isPreviewSessionHost(`${SESSION}.previews-dev.eldra.dev`)).toBe(true);
    expect(isPreviewSessionHost(`${SESSION}.previews.eldra.dev`)).toBe(true);
    expect(isPreviewSessionHost(`${SESSION.toUpperCase()}.PREVIEWS.ELDRA.DEV`)).toBe(true);
    // An organisation's own preview host, a merchant's domain, look-alikes.
    expect(isPreviewSessionHost('0f8c2a6e-1b2c-4d3e-8f90-123456789abc.previews.eldra.dev')).toBe(
      false
    );
    expect(isPreviewSessionHost(`${SESSION}.shop.example.com`)).toBe(false);
    expect(isPreviewSessionHost(`${SESSION}.previews.eldra.dev.evil.example`)).toBe(false);
    expect(isPreviewSessionHost(`x.${SESSION}.previews.eldra.dev`)).toBe(false);
    expect(isPreviewSessionHost('p-1234.previews.eldra.dev')).toBe(false);
  });

  it('accepts the router’s marker on the document', () => {
    const doc = document.implementation.createHTMLDocument('x');
    expect(hasPreviewSessionMarker(doc)).toBe(false);
    doc.head.insertAdjacentHTML('beforeend', '<meta name="eldra-preview" content="other">');
    expect(hasPreviewSessionMarker(doc)).toBe(false);
    doc.head.insertAdjacentHTML('beforeend', '<meta name="eldra-preview" content="session">');
    expect(hasPreviewSessionMarker(doc)).toBe(true);
    expect(
      detectPreviewSession({ location: { hostname: 'shop.example.com' }, document: doc })
    ).toBe(true);
    expect(detectPreviewSession(undefined)).toBe(false);
  });
});

describe('which failures end a session', () => {
  const session = (status: number, errorId: string | null = null) =>
    new EldraClientError(status, 'x', '/__eldra/gateway/cms/v1/schema/page/entry', {
      errorId,
      sessionPreview: true,
    });

  it('401 is expired; 403, 502 and 503 are unavailable', () => {
    expect(previewSessionRefusal(session(401, 'SITE_PREVIEW_SESSION_REVOKED'))).toEqual({
      status: 'expired',
      errorId: 'SITE_PREVIEW_SESSION_REVOKED',
    });
    for (const status of [403, 502, 503]) {
      expect(previewSessionRefusal(session(status))?.status).toBe('unavailable');
    }
  });

  it('a page the drafts do not have, and a commerce read, are not refusals', () => {
    expect(previewSessionRefusal(session(404))).toBeNull();
    expect(
      previewSessionRefusal(new EldraClientError(503, 'x', '/catalog/v1/products'))
    ).toBeNull();
    expect(previewSessionRefusal(new Error('network'))).toBeNull();
  });
});

describe('the copy', () => {
  it('has every message in Icelandic and English', () => {
    expect(Object.keys(PREVIEW_SESSION_MESSAGES.is).sort()).toEqual(
      Object.keys(PREVIEW_SESSION_MESSAGES.en).sort()
    );
  });

  it('follows the page’s language, then the browser’s, else English', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.documentElement.lang = 'is-IS';
    expect(previewSessionLocale(doc, ['en-US'])).toBe('is');
    doc.documentElement.lang = '';
    expect(previewSessionLocale(doc, ['is'])).toBe('is');
    expect(previewSessionLocale(doc, ['de-DE'])).toBe('en');
  });
});

describe('the veil, the notice and the banner', () => {
  const mount = (status: PreviewSessionState['status'], errorId: string | null = null) => {
    document.body.innerHTML = '<div id="__nuxt"><p>Published</p></div>';
    const state = reactive<PreviewSessionState>({ active: true, status, errorId, hydrated: true });
    const ui = mountPreviewSessionUi(document, state, 'en');
    const part = (selector: string) => ui.host.shadowRoot!.querySelector<HTMLElement>(selector)!;
    return { state, ui, part, app: document.getElementById('__nuxt')! };
  };

  it('veils the app as busy until the draft is shown, trapping nothing', async () => {
    const { state, part, app } = mount('pending');
    expect(part('.veil').hidden).toBe(false);
    expect(part('.loading').getAttribute('role')).toBe('status');
    expect(app.getAttribute('aria-busy')).toBe('true');
    expect(app.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(document.body);
    state.status = 'ready';
    await nextTick();
    expect(part('.veil').hidden).toBe(true);
    expect(app.hasAttribute('aria-busy')).toBe(false);
    expect(part('.notice').hidden).toBe(true);
  });

  it('shows the expired notice for the errorId, and makes the app inert', async () => {
    const { state, part, app } = mount('pending');
    state.status = 'expired';
    state.errorId = 'SITE_PREVIEW_SESSION_REVOKED';
    await nextTick();
    expect(part('.notice').hidden).toBe(false);
    expect(part('.notice').getAttribute('role')).toBe('alert');
    expect(part('.notice h2').textContent).toBe(PREVIEW_SESSION_MESSAGES.en.expiredTitle);
    expect(part('.notice').textContent).toContain(PREVIEW_SESSION_MESSAGES.en.expiredRevoked);
    expect(part('.veil').hidden).toBe(true);
    expect(app.hasAttribute('inert')).toBe(true);
  });

  it('offers a retry when the preview is unavailable', () => {
    const { part } = mount('unavailable');
    expect(part('.notice h2').textContent).toBe(PREVIEW_SESSION_MESSAGES.en.unavailableTitle);
    expect(part('.notice a').textContent).toBe(PREVIEW_SESSION_MESSAGES.en.retry);
  });

  it('always carries the exit, to the router’s exit path', () => {
    const { part, ui } = mount('ready');
    const exit = part('.banner a');
    expect(exit.getAttribute('href')).toBe('/__eldra/preview/exit');
    expect(exit.textContent).toBe('Exit preview');
    expect(part('.banner').getAttribute('aria-label')).toBe('Draft preview');
    ui.destroy();
    expect(document.querySelector('[data-eldra-preview-session]')).toBeNull();
  });
});
