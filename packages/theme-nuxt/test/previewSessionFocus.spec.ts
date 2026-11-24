// @vitest-environment jsdom
/**
 * Focus a page asks for while a session covers it is given once the draft is shown (WS-1358): the
 * app is inert under the veil, so a component that focuses on mount would otherwise never be
 * focused in a session, where on the published page it is. jsdom does not make an inert element
 * unfocusable, so each test takes the focus away again, as the browser would never have given it.
 * The session state is one per page, so each test starts a fresh module.
 */
import type { EldraClient } from '@eldrajs/theme-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Session = typeof import('../src/runtime/previewSession');

const original = {
  htmlFocus: HTMLElement.prototype.focus,
  htmlBlur: HTMLElement.prototype.blur,
  svgFocus: SVGElement.prototype.focus,
  svgBlur: SVGElement.prototype.blur,
};

async function startSession(body: string): Promise<Session> {
  vi.resetModules();
  const session = await import('../src/runtime/previewSession');
  document.head.innerHTML = '<meta name="eldra-preview" content="session">';
  document.body.innerHTML = body;
  const client = { enableSessionPreview: vi.fn() } as unknown as EldraClient;
  expect(session.startPreviewSession(client, { win: window, onHydrated: () => undefined })).toBe(
    true
  );
  expect(session.usePreviewSession().status).toBe('pending');
  return session;
}

/** What an inert app does with a focus request: nothing is focused (no blur() of the page's). */
function inertSwallows(): void {
  const active = document.activeElement as HTMLElement | null;
  if (active !== null) original.htmlBlur.call(active);
  expect(document.activeElement).toBe(document.body);
}

afterEach(() => {
  HTMLElement.prototype.focus = original.htmlFocus;
  HTMLElement.prototype.blur = original.htmlBlur;
  SVGElement.prototype.focus = original.svgFocus;
  SVGElement.prototype.blur = original.svgBlur;
});

describe('focus asked for under the veil', () => {
  it('is given to the element once the draft is shown, and focus/blur are put back', async () => {
    const session = await startSession(
      '<div id="__nuxt"><input id="search"></div><input id="outside">'
    );
    const search = document.getElementById('search')!;
    search.focus({ preventScroll: true });
    inertSwallows();
    // Outside the app: not the page's own focus, not remembered.
    document.getElementById('outside')!.focus();
    document.getElementById('outside')!.blur();

    session.markPreviewSessionDraftShown();
    expect(document.activeElement).toBe(search);
    expect(HTMLElement.prototype.focus).toBe(original.htmlFocus);
    expect(HTMLElement.prototype.blur).toBe(original.htmlBlur);
    expect(SVGElement.prototype.focus).toBe(original.svgFocus);
    expect(SVGElement.prototype.blur).toBe(original.svgBlur);
  });

  it('remembers an SVG element too', async () => {
    // A recorder under the session's patch, so the replay can be seen in jsdom.
    const calls: Element[] = [];
    SVGElement.prototype.focus = function record(this: SVGElement): void {
      calls.push(this);
    };
    const recorder = SVGElement.prototype.focus;
    const session = await startSession(
      '<div id="__nuxt"><svg><a id="icon" href="#x"><text>x</text></a></svg></div>'
    );
    const icon = document.getElementById('icon') as unknown as SVGElement;
    icon.focus();
    expect(calls).toEqual([icon]);
    session.markPreviewSessionDraftShown();
    expect(calls).toEqual([icon, icon]);
    expect(SVGElement.prototype.focus).toBe(recorder);
  });

  it('does not give a focus the page blurred while covered', async () => {
    const session = await startSession('<div id="__nuxt"><input id="search"></div>');
    const search = document.getElementById('search')!;
    search.focus();
    search.blur();
    expect(document.activeElement).toBe(document.body);
    session.markPreviewSessionDraftShown();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves a focus() patched after its own in place', async () => {
    const session = await startSession('<div id="__nuxt"><input id="search"></div>');
    const ours = HTMLElement.prototype.focus;
    const theirs = function theirFocus(this: HTMLElement, options?: FocusOptions): void {
      ours.call(this, options);
    };
    HTMLElement.prototype.focus = theirs;
    session.markPreviewSessionDraftShown();
    expect(HTMLElement.prototype.focus).toBe(theirs);
    expect(HTMLElement.prototype.blur).toBe(original.htmlBlur);
  });
});
