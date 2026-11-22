// @vitest-environment jsdom
/**
 * `./runtime/previewSession.ts` on its own: how a session is recognised, which failures end one,
 * the copy, and the veil/notice/banner it mounts. The whole flow, through a real build and a real
 * browser, is `previewSession.browser.spec.ts`.
 */
import { EldraClientError } from '@eldrajs/theme-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import {
  detectPreviewSession,
  hasPreviewSessionMarker,
  isLocalDevelopmentHost,
  isPreviewSessionHost,
  previewSessionRefusal,
  type PreviewSessionState,
} from '../src/runtime/previewSession';
import {
  PREVIEW_SESSION_LOADING_DELAY_MS,
  PREVIEW_SESSION_MESSAGES,
  mountPreviewSessionUi,
  previewSessionLocale,
} from '../src/runtime/previewSessionUi';

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

  it('reads the router’s marker in the head only', () => {
    const doc = document.implementation.createHTMLDocument('x');
    expect(hasPreviewSessionMarker(doc)).toBe(false);
    doc.body.insertAdjacentHTML('beforeend', '<meta name="eldra-preview" content="session">');
    expect(hasPreviewSessionMarker(doc)).toBe(false);
    doc.head.insertAdjacentHTML('beforeend', '<meta name="eldra-preview" content="other">');
    expect(hasPreviewSessionMarker(doc)).toBe(false);
    doc.head.insertAdjacentHTML('beforeend', '<meta name="eldra-preview" content="session">');
    expect(hasPreviewSessionMarker(doc)).toBe(true);
  });

  it('honours the marker only on a session host or a local development host', () => {
    const marked = document.implementation.createHTMLDocument('x');
    marked.head.insertAdjacentHTML('beforeend', '<meta name="eldra-preview" content="session">');
    const plain = document.implementation.createHTMLDocument('x');
    const at = (hostname: string, doc: Document) =>
      detectPreviewSession({ location: { hostname }, document: doc });
    // A storefront's own page carrying the marker is still a storefront.
    expect(at('shop.example.com', marked)).toBe(false);
    expect(at('0f8c2a6e-1b2c-4d3e-8f90-123456789abc.previews.eldra.dev', marked)).toBe(false);
    for (const host of ['127.0.0.1', 'localhost', 'theme.localhost', 'shop.test', '[::1]']) {
      expect(isLocalDevelopmentHost(host), host).toBe(true);
      expect(at(host, marked), host).toBe(true);
      expect(at(host, plain), host).toBe(false);
    }
    expect(isLocalDevelopmentHost('localhost.example.com')).toBe(false);
    expect(isLocalDevelopmentHost('shop.testing.example')).toBe(false);
    // The session host's shape decides on its own: the router does not inject the marker yet.
    expect(at(`${SESSION}.previews.eldra.dev`, plain)).toBe(true);
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
  afterEach(() => {
    vi.useRealTimers();
  });

  const mount = (status: PreviewSessionState['status'], errorId: string | null = null) => {
    document.body.innerHTML = '<div id="__nuxt"><a href="/x">Published</a></div>';
    const state = reactive<PreviewSessionState>({ active: true, status, errorId, hydrated: true });
    const ui = mountPreviewSessionUi(document, state, 'en');
    const part = (selector: string) => ui.host.shadowRoot!.querySelector<HTMLElement>(selector)!;
    return { state, ui, part };
  };

  it('says it is loading only after a moment, and only then as a live region', async () => {
    vi.useFakeTimers();
    const { state, part } = mount('pending');
    expect(part('.veil').hidden).toBe(false);
    expect(part('.loading').hidden).toBe(true);
    expect(part('.loading').hasAttribute('role')).toBe(false);
    expect(part('.loading').textContent).toBe('');
    vi.advanceTimersByTime(PREVIEW_SESSION_LOADING_DELAY_MS);
    expect(part('.loading').getAttribute('role')).toBe('status');
    expect(part('.loading').hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(part('.loading').textContent).toBe(PREVIEW_SESSION_MESSAGES.en.loading);
    state.status = 'ready';
    await nextTick();
    expect(part('.veil').hidden).toBe(true);
    expect(part('.loading').hasAttribute('role')).toBe(false);
    expect(part('.notice').hidden).toBe(true);
  });

  it('a draft that arrives fast never shows or announces the loading line', async () => {
    vi.useFakeTimers();
    const { state, part } = mount('pending');
    state.status = 'ready';
    await nextTick();
    vi.advanceTimersByTime(PREVIEW_SESSION_LOADING_DELAY_MS * 2);
    expect(part('.loading').hidden).toBe(true);
    expect(part('.loading').hasAttribute('role')).toBe(false);
  });

  it('shows the expired notice for the errorId and moves focus to it once', async () => {
    const { state, part, ui } = mount('pending');
    state.status = 'expired';
    state.errorId = 'SITE_PREVIEW_SESSION_REVOKED';
    await nextTick();
    const notice = part('.notice');
    expect(notice.hidden).toBe(false);
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.getAttribute('tabindex')).toBe('-1');
    expect(ui.host.shadowRoot!.activeElement).toBe(notice);
    expect(part('.notice h2').textContent).toBe(PREVIEW_SESSION_MESSAGES.en.expiredTitle);
    expect(notice.textContent).toContain(PREVIEW_SESSION_MESSAGES.en.expiredRevoked);
    expect(part('.veil').hidden).toBe(true);
    // Focus is not held there: the exit can be reached, and a later render does not take it back.
    part('.banner a').focus();
    state.errorId = 'SITE_PREVIEW_SESSION_EXPIRED';
    await nextTick();
    expect(ui.host.shadowRoot!.activeElement).toBe(part('.banner a'));
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
