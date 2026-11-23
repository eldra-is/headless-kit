// @vitest-environment jsdom
/**
 * The session UI chunk arrives but mounting it throws: the same as a chunk that could not be
 * loaded — the built-in fallback notice, and the router's early hide lifted (WS-1376).
 */
import type { EldraClient } from '@eldrajs/theme-core';
import { describe, expect, it, vi } from 'vitest';
import { startPreviewSession } from '../src/runtime/previewSession';

vi.mock('../src/runtime/previewSessionUi', () => ({
  mountPreviewSessionUi: () => {
    throw new Error('attachShadow refused');
  },
}));

describe('a session UI that cannot be mounted', () => {
  it('falls back to the plain notice and lifts the early hide', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    document.head.innerHTML = '<meta name="eldra-preview" content="session">';
    document.body.innerHTML = '<div id="__nuxt"><p>Published</p></div>';
    const client = { enableSessionPreview: vi.fn() } as unknown as EldraClient;
    expect(startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(true);
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('[data-eldra-preview-session]')
          ?.shadowRoot?.querySelector('[role="alert"]')
      ).toBeTruthy()
    );
    expect(document.documentElement.hasAttribute('data-eldra-preview-ready')).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      '[eldra] the draft preview UI could not be loaded',
      expect.any(Error)
    );
  });
});
