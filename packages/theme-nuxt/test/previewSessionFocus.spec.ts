// @vitest-environment jsdom
/**
 * Focus a page asks for while a session covers it is given once the draft is shown (WS-1358): the
 * app is inert under the veil, so a component that focuses on mount would otherwise never be
 * focused in a session, where on the published page it is. Its own file because the session state
 * is one per page. jsdom does not make an inert element unfocusable, so the test takes the focus
 * away again, as the browser would never have given it.
 */
import type { EldraClient } from '@eldrajs/theme-core';
import { describe, expect, it, vi } from 'vitest';
import {
  markPreviewSessionDraftShown,
  startPreviewSession,
  usePreviewSession,
} from '../src/runtime/previewSession';

describe('focus asked for under the veil', () => {
  it('is given to the element once the draft is on screen, and focus() is restored', () => {
    const original = HTMLElement.prototype.focus;
    document.head.innerHTML = '<meta name="eldra-preview" content="session">';
    document.body.innerHTML =
      '<div id="__nuxt"><input id="search"><input id="other"></div><input id="outside">';
    const client = { enableSessionPreview: vi.fn() } as unknown as EldraClient;
    expect(startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(true);
    expect(usePreviewSession().status).toBe('pending');

    const search = document.getElementById('search')!;
    search.focus({ preventScroll: true });
    // What an inert app does with that request.
    search.blur();
    // Outside the app: not the page's own focus, not remembered.
    document.getElementById('outside')!.focus();
    document.getElementById('outside')!.blur();
    expect(document.activeElement).toBe(document.body);

    markPreviewSessionDraftShown();
    expect(document.activeElement).toBe(search);
    expect(HTMLElement.prototype.focus).toBe(original);
  });
});
