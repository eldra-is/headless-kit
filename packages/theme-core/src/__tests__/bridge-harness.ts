import type { BridgeEnvelope } from '../bridge/protocol';

export const STUDIO_ORIGIN = 'https://acme.eldracms.com';
export const THEME_ORIGIN = 'https://acme-site.pages.dev';

export interface FakeIframe extends Pick<HTMLIFrameElement, never> {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  dispatchLoad(): void;
  contentWindow: { postMessage(data: unknown, targetOrigin: string): void };
  /** every envelope the editor posted, with the targetOrigin it used */
  sent: Array<{ data: BridgeEnvelope; targetOrigin: string }>;
}

/**
 * Wires editor->theme: editor posts to iframe.contentWindow; the harness re-dispatches
 * it on the shared jsdom window with origin=STUDIO_ORIGIN (what the theme bridge sees).
 * Wires theme->editor: theme posts to window.parent (stubbed); the harness re-dispatches
 * with origin=THEME_ORIGIN (what the editor bridge sees). Loopback is inert because each
 * bridge drops the origin it itself sends from.
 */
export function installHarness(opts?: { studioOrigin?: string; themeOrigin?: string }) {
  const studioOrigin = opts?.studioOrigin ?? STUDIO_ORIGIN;
  const themeOrigin = opts?.themeOrigin ?? THEME_ORIGIN;

  const iframe: FakeIframe = (() => {
    const loadListeners: Array<() => void> = [];
    const self: FakeIframe = {
      sent: [],
      addEventListener: (type, fn) => {
        if (type === 'load') loadListeners.push(fn);
      },
      removeEventListener: (type, fn) => {
        const i = loadListeners.indexOf(fn);
        if (type === 'load' && i >= 0) loadListeners.splice(i, 1);
      },
      dispatchLoad: () => loadListeners.slice().forEach((fn) => fn()),
      contentWindow: {
        postMessage: (data, targetOrigin) => {
          self.sent.push({ data: data as BridgeEnvelope, targetOrigin });
          if (targetOrigin !== themeOrigin) return; // wrong-targetOrigin messages never arrive
          window.dispatchEvent(
            new MessageEvent('message', {
              data,
              origin: studioOrigin,
              source: parentStub as unknown as MessageEventSource,
            })
          );
        },
      },
    };
    return self;
  })();

  const parentStub = {
    posted: [] as Array<{ data: BridgeEnvelope; targetOrigin: string }>,
    postMessage(data: unknown, targetOrigin: string) {
      parentStub.posted.push({ data: data as BridgeEnvelope, targetOrigin });
      if (targetOrigin !== studioOrigin) return;
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: themeOrigin,
          source: iframe.contentWindow as unknown as MessageEventSource,
        })
      );
    },
  };
  const originalParent = window.parent;
  Object.defineProperty(window, 'parent', { value: parentStub, configurable: true });

  return {
    iframe: iframe as unknown as HTMLIFrameElement & FakeIframe,
    parentStub,
    /** dispatch a raw message as if from an arbitrary origin (attack simulation) */
    inject(data: unknown, origin: string, source: MessageEventSource | null = null) {
      window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
    },
    restore() {
      Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    },
  };
}
