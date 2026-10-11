import { makeEnvelope, parseEnvelope } from './envelope';
import { THEME_CAPABILITIES } from './protocol';
import type { BridgeEnvelope, BridgeHandler, BridgeMessageType, BridgePayloads } from './protocol';

const PRE_LOCK_QUEUE_LIMIT = 50;

export function createThemeBridge(opts: {
  allowedOrigins: string[];
  onMessage: BridgeHandler;
  /** Editor capabilities from each editor:hello (reconnects re-fire it). */
  onEditorHello?: (capabilities: string[]) => void;
  /** Breakpoints negotiation: included in every theme:ready this bridge
   * sends when given. The caller (theme-vue's startEldraPreview) resolves
   * and defaults this — @eldrajs/theme-core's resolveLayoutBreakpoints — before
   * it ever reaches here; the bridge itself does no validation. */
  breakpoints?: BridgePayloads['theme:ready']['breakpoints'];
}): {
  post<T extends BridgeMessageType>(type: T, payload: BridgePayloads[T]): void;
  readonly connected: boolean;
  destroy(): void;
} {
  const { allowedOrigins, onMessage } = opts;
  let lockedOrigin: string | null = null; // set by first editor:hello from an allowed origin
  let initReceived = false;
  let destroyed = false;
  const preLockQueue: BridgeEnvelope[] = [];

  function deliver(env: BridgeEnvelope): void {
    if (lockedOrigin === null) return; // never post before the origin lock
    window.parent.postMessage(env, lockedOrigin); // explicit targetOrigin, never "*"
  }

  // Generic wrapper so `env.type` and `env.payload` share one bound type variable T; a direct
  // onMessage(env.type, env.payload) on a BridgeEnvelope<BridgeMessageType> loses the correlation.
  function forward<T extends BridgeMessageType>(env: BridgeEnvelope<T>): void {
    onMessage(env.type, env.payload);
  }

  function sendReady(): void {
    deliver(
      makeEnvelope('theme:ready', {
        manifestVersion: 1,
        themeVersion: readMeta('eldra-theme-version'),
        sdkVersion: readMeta('eldra-sdk-version'),
        path: window.location.pathname,
        capabilities: [...THEME_CAPABILITIES],
        ...(opts.breakpoints === undefined ? {} : { breakpoints: opts.breakpoints }),
      })
    );
  }

  /** semantics 2: lock the first allowed origin as the sole reply target, then flush queued posts. */
  function lockAndFlush(origin: string): void {
    lockedOrigin = origin;
    for (const queued of preLockQueue.splice(0)) deliver(queued);
  }

  function handleMessage(event: MessageEvent): void {
    if (destroyed) return;
    if (
      lockedOrigin !== null ? event.origin !== lockedOrigin : !allowedOrigins.includes(event.origin)
    ) {
      return; // silent drop per contracts §1
    }
    const env = parseEnvelope(event.data);
    if (env === null) return;
    if (!env.type.startsWith('editor:')) return;
    if (env.type === 'editor:hello') {
      // hello always (re)answers theme:ready; lock on the first allowed origin, ready before flush.
      opts.onEditorHello?.((env.payload as { capabilities: string[] }).capabilities);
      if (lockedOrigin === null) {
        lockedOrigin = event.origin;
        sendReady();
        for (const queued of preLockQueue.splice(0)) deliver(queued);
      } else {
        sendReady(); // idempotent re-answer (Studio may retry hello)
      }
      return;
    }
    // Any other allowed editor message locks the origin too (semantics 3 reconnection: a theme that
    // remounts without a fresh iframe load only ever receives editor:ping — it must still be able to
    // pong so Studio's heartbeat re-connects). Locking here never posts theme:ready.
    if (lockedOrigin === null) lockAndFlush(event.origin);
    if (env.type === 'editor:ping') {
      deliver(makeEnvelope('theme:pong', {}));
      return;
    }
    if (env.type === 'editor:init') initReceived = true;
    forward(env);
  }

  window.addEventListener('message', handleMessage);

  return {
    post(type, payload) {
      if (destroyed) return;
      const env = makeEnvelope(type, payload);
      if (lockedOrigin === null) {
        if (preLockQueue.length < PRE_LOCK_QUEUE_LIMIT) preLockQueue.push(env);
        return;
      }
      deliver(env);
    },
    get connected() {
      return initReceived;
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('message', handleMessage);
    },
  };
}

/** theme/sdk versions are stamped as <meta> tags by @eldrajs/theme-nuxt (B7); '0.0.0' outside it. */
function readMeta(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? '0.0.0';
}
