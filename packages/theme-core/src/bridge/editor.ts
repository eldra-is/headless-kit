import { makeEnvelope, parseEnvelope } from './envelope';
import {
  EDITOR_CAPABILITIES,
  type BridgeHandler,
  type BridgeMessageType,
  type BridgePayloads,
} from './protocol';

const HELLO_INTERVAL_MS = 500;
const HELLO_MAX_ATTEMPTS = 20;
const PING_INTERVAL_MS = 5000;
const MAX_MISSED_PONGS = 3;

export function createEditorBridge(opts: {
  iframe: HTMLIFrameElement;
  targetOrigin: string;
  onMessage: BridgeHandler;
  onDisconnected: () => void;
  onConnected: () => void;
}): {
  post<T extends BridgeMessageType>(type: T, payload: BridgePayloads[T]): void;
  destroy(): void;
} {
  const { iframe, targetOrigin, onMessage, onDisconnected, onConnected } = opts;
  if (targetOrigin === '*')
    throw new Error('createEditorBridge: targetOrigin must be an exact origin, never "*"');

  let state: 'hello' | 'connected' | 'destroyed' = 'hello';
  let helloTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let helloAttempts = 0;
  let missedPongs = 0;
  let pongSinceLastPing = true;
  let disconnectedNotified = false;

  function send<T extends BridgeMessageType>(type: T, payload: BridgePayloads[T]): void {
    iframe.contentWindow?.postMessage(makeEnvelope(type, payload), targetOrigin);
  }

  function stopHello(): void {
    if (helloTimer !== null) {
      clearInterval(helloTimer);
      helloTimer = null;
    }
  }
  function stopPing(): void {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function startHello(): void {
    stopHello();
    stopPing();
    state = 'hello';
    helloAttempts = 1;
    send('editor:hello', { capabilities: [...EDITOR_CAPABILITIES] });
    helloTimer = setInterval(() => {
      if (helloAttempts >= HELLO_MAX_ATTEMPTS) {
        stopHello();
        if (!disconnectedNotified) {
          disconnectedNotified = true;
          onDisconnected();
        }
        return;
      }
      helloAttempts += 1;
      send('editor:hello', { capabilities: [...EDITOR_CAPABILITIES] });
    }, HELLO_INTERVAL_MS);
  }

  function startPing(): void {
    stopPing();
    missedPongs = 0;
    // Seed false: the first ping interval after connect counts as awaiting a pong, so a theme
    // that never answers reaches MAX_MISSED_PONGS misses in MAX_MISSED_PONGS intervals
    // (contracts §1.3). A live theme's pong resets this on the same/next cycle.
    pongSinceLastPing = false;
    pingTimer = setInterval(() => {
      if (!pongSinceLastPing) {
        missedPongs += 1;
        if (missedPongs >= MAX_MISSED_PONGS && !disconnectedNotified) {
          disconnectedNotified = true;
          onDisconnected(); // keep pinging: a later pong re-connects (semantics 3)
        }
      }
      pongSinceLastPing = false;
      send('editor:ping', {});
    }, PING_INTERVAL_MS);
  }

  function handleMessage(event: MessageEvent): void {
    if (state === 'destroyed') return;
    // Origin alone is insufficient: another window on the same theme origin could otherwise
    // spoof bridge traffic. Accept messages only from the iframe this bridge instance owns.
    if (event.origin !== targetOrigin || event.source !== iframe.contentWindow) return;
    const env = parseEnvelope(event.data);
    if (env === null) return;
    if (!env.type.startsWith('theme:')) return; // editor only accepts theme->editor traffic
    if (env.type === 'theme:pong') {
      missedPongs = 0;
      pongSinceLastPing = true;
      if (disconnectedNotified) {
        disconnectedNotified = false;
        onConnected();
      }
      return; // heartbeat is bridge-internal, not forwarded
    }
    if (env.type === 'theme:ready') {
      if (state === 'hello') {
        stopHello();
        state = 'connected';
        disconnectedNotified = false;
        onConnected(); // host posts editor:init here (see B2 interface note)
        startPing();
      }
      // theme:ready is also forwarded so the host can read manifest/sdk versions
    }
    onMessage(env.type, env.payload);
  }

  const onLoad = (): void => {
    startHello();
  }; // iframe (re)navigation (re)starts the handshake
  window.addEventListener('message', handleMessage);
  iframe.addEventListener('load', onLoad);
  // Handshake is driven by the iframe `load` event (contracts §1.1); the hello loop is not started
  // here at construction so that exactly one hello cycle runs per load (the 20-attempt cap is
  // per-handshake, and the loop must (re)send hello after the theme mounts on load).

  return {
    post(type, payload) {
      if (state === 'destroyed') return;
      send(type, payload);
    },
    destroy() {
      state = 'destroyed';
      stopHello();
      stopPing();
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', onLoad);
    },
  };
}
