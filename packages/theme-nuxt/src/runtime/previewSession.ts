import { EldraClientError, type EldraClient } from '@eldrajs/theme-core';
import { reactive, watch } from 'vue';
import type { PreviewSessionUi } from './previewSessionUi';

/**
 * Draft preview sessions (WS-1293, WS-1303): the page is the theme's own deployment, served by
 * Eldra's preview router on a host of its own (`p-<session id>.previews-{env}.eldra.dev`), and it
 * renders the organisation's **drafts**, read client-side through the router.
 *
 * The router is the only holder of the credential: it keeps the session in an HttpOnly cookie, so
 * the page never sees one and never sends one. Draft reads go same-origin to `/__eldra/gateway/*`,
 * and the router adds `X-Org-Id` and `X-Preview-Session` itself (`@eldrajs/theme-core`'s
 * `enableSessionPreview`). What the browser paints first is the published prerender — the
 * deployment is the ordinary build — so it is covered by a veil until the first draft is on screen,
 * and a session the router refuses is a notice, never the published page.
 *
 * Nothing here runs outside a session: a storefront, a build and Studio's canvas preview (the
 * bridge's `X-Preview-Token`) are exactly what they were.
 */

/** The `<meta name>` the preview router puts in every page it serves for a session. */
export const PREVIEW_SESSION_META_NAME = 'eldra-preview';
export const PREVIEW_SESSION_META_CONTENT = 'session';
/** Where the router serves the draft read proxy on a session host. */
export const PREVIEW_SESSION_PROXY_PATH = '/__eldra/gateway';
/** The router's exit: clears the session's cookies and says so. */
export const PREVIEW_SESSION_EXIT_PATH = '/__eldra/preview/exit';
/**
 * The attribute the page sets on `<html>` once the session no longer needs the router's early hide
 * (WS-1376). The router puts `html:not([data-eldra-preview-ready]) body { visibility: hidden }` at
 * the top of every document it serves for a session, so the published prerender is never painted
 * before the kit's own veil covers it. The page sets this as soon as its veil (or the built-in
 * fallback notice) is mounted and covering the page, and on every way the session leaves the veil
 * (the draft shown, a refusal, the timeout, a failure) in case it never mounted. The router's rule
 * reveals the body after 12 s on its own, which is shorter than the 15 s the drafts may take: that
 * is why it is the mounted veil, not the dropped one, that lifts it.
 */
export const PREVIEW_SESSION_READY_ATTRIBUTE = 'data-eldra-preview-ready';

/**
 * A session host, as the router serves one: the label `p-` and the session id (Core's
 * `uuid.String()`, lower-case with hyphens) directly under the environment's preview domain
 * (`previews-dev.eldra.dev`, `previews-staging.eldra.dev`, `previews.eldra.dev`). Nothing but the
 * preview router answers those names, so a host of this shape is a session.
 */
const SESSION_HOST =
  /^p-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.previews(?:-[a-z0-9]+)?\.eldra\.dev$/;

export function isPreviewSessionHost(hostname: string): boolean {
  return SESSION_HOST.test(hostname.toLowerCase());
}

/**
 * A local development host: where a theme developer (or a test) runs a stand-in for the router.
 * Only there is the router's marker trusted on its own — see `detectPreviewSession`.
 */
export function isLocalDevelopmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test')
  );
}

/**
 * Whether the document's **head** carries the router's session marker
 * (`<meta name="eldra-preview" content="session">`). A marker anywhere else — in the body, where
 * merchant-authored content can end up — is not the router's.
 */
export function hasPreviewSessionMarker(doc: Pick<Document, 'head'>): boolean {
  const head = doc.head;
  if (head === null || head === undefined) return false;
  for (const meta of head.querySelectorAll(`meta[name="${PREVIEW_SESSION_META_NAME}"]`)) {
    if (meta.getAttribute('content')?.trim().toLowerCase() === PREVIEW_SESSION_META_CONTENT) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this page is a draft preview session. Browser only; a server render is never one.
 *
 * The session host's shape decides on its own (only the router answers those names). The router's
 * marker in the head is honoured only together with that shape, or on a local development host
 * (`isLocalDevelopmentHost`), so a marker that reaches a storefront's own page never turns it into
 * a session.
 */
export function detectPreviewSession(
  win: { location: { hostname: string }; document: Pick<Document, 'head'> } | undefined
): boolean {
  if (win === undefined) return false;
  const { hostname } = win.location;
  if (isPreviewSessionHost(hostname)) return true;
  return isLocalDevelopmentHost(hostname) && hasPreviewSessionMarker(win.document);
}

/**
 * Where a session is.
 *  * `off`: not a session (every storefront, every build, Studio's canvas).
 *  * `pending`: a session whose first draft is not on screen yet — the veil is up.
 *  * `ready`: the draft is on screen.
 *  * `expired`: the router refused the session (401: invalid, revoked or expired). Final.
 *  * `unavailable`: the router could not check it or read the draft (403, 502, 503).
 */
export type PreviewSessionStatus = 'off' | 'pending' | 'ready' | 'expired' | 'unavailable';

export interface PreviewSessionState {
  active: boolean;
  status: PreviewSessionStatus;
  /** The refusal's `errorId`, when it named one. */
  errorId: string | null;
  /** The published prerender has been hydrated, so the page may now be replaced. */
  hydrated: boolean;
}

/**
 * The one session state of this page. A module-level value on purpose: it is written only in the
 * browser (`startPreviewSession`), where there is one app per page, and a server render — which
 * shares modules between requests — only ever reads it as `off`.
 */
const state: PreviewSessionState = reactive({
  active: false,
  status: 'off',
  errorId: null,
  hydrated: false,
});

export function usePreviewSession(): Readonly<PreviewSessionState> {
  return state;
}

export function isPreviewSessionRefused(status: PreviewSessionStatus): boolean {
  return status === 'expired' || status === 'unavailable';
}

/** The draft is on screen: the veil comes down. A refusal stays. */
export function markPreviewSessionDraftShown(): void {
  if (state.status === 'pending') state.status = 'ready';
}

/** The page has been hydrated with the published prerender. */
export function markPreviewSessionHydrated(): void {
  if (state.active) state.hydrated = true;
}

/**
 * What a failed read says about the session, or `null` when it says nothing about it (a page the
 * drafts do not have is a `404` from Core, which is the theme's own not-found, not a refusal).
 * Only a session read through the proxy counts: a commerce read failing is the storefront's own
 * business.
 */
export function previewSessionRefusal(
  error: unknown
): { status: 'expired' | 'unavailable'; errorId: string | null } | null {
  if (!(error instanceof EldraClientError) || !error.sessionPreview) return null;
  if (error.status === 401) return { status: 'expired', errorId: error.errorId };
  if (error.status === 403 || error.status === 502 || error.status === 503) {
    return { status: 'unavailable', errorId: error.errorId };
  }
  if (error.errorId === 'PREVIEW_GATEWAY_PATH_NOT_ALLOWED') {
    return { status: 'unavailable', errorId: error.errorId };
  }
  return null;
}

function refuse(refusal: { status: 'expired' | 'unavailable'; errorId: string | null }): void {
  if (state.status === 'expired') return;
  state.status = refusal.status;
  state.errorId = refusal.errorId;
}

/**
 * The app root's own state while a session is not showing the draft: busy and inert under the veil
 * (nothing behind it is the draft, so nothing there is to be reached), inert under a notice. Kept
 * here rather than in the lazily loaded UI so it holds from the first moment.
 */
function trackAppRoot(doc: Document): void {
  watch(
    () => state.status,
    (status) => {
      const app = doc.getElementById('__nuxt');
      if (app === null) return;
      const pending = status === 'pending';
      if (pending) app.setAttribute('aria-busy', 'true');
      else app.removeAttribute('aria-busy');
      app.toggleAttribute('inert', pending || isPreviewSessionRefused(status));
    },
    { immediate: true, flush: 'sync' }
  );
}

/** Lifts the router's early hide (`PREVIEW_SESSION_READY_ATTRIBUTE`). Never removed again. */
function liftEarlyHide(doc: Document): void {
  doc.documentElement.setAttribute(PREVIEW_SESSION_READY_ATTRIBUTE, '');
}

/**
 * The give-up paths: the moment the session leaves the veil — the draft is shown, or the session is
 * refused or unavailable — the early hide is lifted, whether or not the veil ever mounted (the UI
 * chunk still loading). Synchronous, so it is the same moment the state changes.
 */
function liftEarlyHideOnLeavingVeil(doc: Document): void {
  const stop = watch(
    () => state.status,
    (status) => {
      if (status !== 'ready' && !isPreviewSessionRefused(status)) return;
      liftEarlyHide(doc);
      // `stop` is not assigned yet when the first run (immediate) already lifts it.
      queueMicrotask(() => stop());
    },
    { immediate: true, flush: 'sync' }
  );
}

/**
 * Focus the page asks for while it is covered, given to it once the draft is shown (WS-1358).
 *
 * The app is inert under the veil, and an inert element cannot take focus: a component that
 * focuses on mount (the starter's search results page focuses its search field) is hydrated in a
 * session while the app is inert, so its `focus()` does nothing — where on the published page the
 * field is focused, its suggestions open and the page scrolls to it. So while the session is
 * pending, the last `focus()` asked of an element inside the app is remembered, and once the draft
 * is on screen it is asked again, if the element is still in the document and nothing else has
 * taken focus since — and not if the page blurred that element itself while covered. HTML and SVG
 * elements alike. Nothing changes outside a pending session: the original `focus` and `blur` are
 * restored the moment the session leaves `pending`, whichever way it leaves it, unless something
 * patched them again after us, which then keeps its own.
 */
function replayCoveredFocus(doc: Document): void {
  const win = doc.defaultView;
  if (win === null) return;
  type Focusable = HTMLElement | SVGElement;
  const protos = [win.HTMLElement?.prototype, win.SVGElement?.prototype].filter(
    (proto): proto is HTMLElement | SVGElement => proto !== undefined
  );
  let requested: { element: Focusable; options: FocusOptions | undefined } | null = null;
  const inApp = (element: Element): boolean =>
    doc.getElementById('__nuxt')?.contains(element) ?? false;
  const patches = protos.map((proto) => {
    const original = { focus: proto.focus, blur: proto.blur };
    const focus = function focus(this: Focusable, options?: FocusOptions): void {
      if (state.status === 'pending' && inApp(this)) requested = { element: this, options };
      original.focus.call(this, options);
    };
    // A focus the page itself took back while covered is not one to give later.
    const blur = function blur(this: Focusable): void {
      if (state.status === 'pending' && requested?.element === this) requested = null;
      original.blur.call(this);
    };
    proto.focus = focus;
    proto.blur = blur;
    return { proto, original, focus, blur };
  });
  const stop = watch(
    () => state.status,
    (status) => {
      if (status === 'pending') return;
      stop();
      // Put back only what is still ours: anything that patched `focus` after us keeps its own.
      for (const { proto, original, focus, blur } of patches) {
        if (proto.focus === focus) proto.focus = original.focus;
        if (proto.blur === blur) proto.blur = original.blur;
      }
      const target = requested;
      requested = null;
      if (status !== 'ready' || target === null || !target.element.isConnected) return;
      if (doc.activeElement !== null && doc.activeElement !== doc.body) return;
      target.element.focus(target.options);
    },
    { flush: 'sync' }
  );
}

/**
 * Loads and mounts the veil, banner and notices. The module is only ever fetched in a session. Once
 * the veil (or, without the chunk, the fallback notice) is in the document and covering the page,
 * the router's early hide is lifted: from then on the kit's own veil is what covers the page.
 */
function loadUi(doc: Document): Promise<PreviewSessionUi | undefined> {
  return import('./previewSessionUi').then(
    ({ mountPreviewSessionUi }) => {
      const ui = mountPreviewSessionUi(doc, state);
      liftEarlyHide(doc);
      return ui;
    },
    (cause: unknown) => {
      console.warn('[eldra] the draft preview UI could not be loaded', cause);
      mountFallbackNotice(doc);
      liftEarlyHide(doc);
      return undefined;
    }
  );
}

/** The fallback's words: what the session is doing, in Icelandic or English. */
const FALLBACK_TEXT = {
  is: {
    pending: 'Sæki drög…',
    expired: 'Forskoðuninni er lokið. Opnaðu nýja forskoðun úr Studio.',
    unavailable: 'Forskoðun er ekki tiltæk. Reyndu aftur eftir smástund.',
    exit: 'Hætta í forskoðun',
  },
  en: {
    pending: 'Loading draft…',
    expired: 'This preview has ended. Open a new preview from Studio.',
    unavailable: 'The preview is unavailable. Try again in a moment.',
    exit: 'Exit preview',
  },
} as const;

/**
 * When the UI chunk cannot be loaded (a deployment pruned under an open page, a network that
 * dropped it): a plain line of text over the page, so a veiled or refused session is never an empty,
 * inert page with nothing said. Deliberately bare — no styling beyond what keeps it readable.
 */
export function mountFallbackNotice(doc: Document): HTMLElement {
  const lang = doc.documentElement.lang?.trim().toLowerCase().startsWith('is') ? 'is' : 'en';
  const text = FALLBACK_TEXT[lang];
  const host = doc.createElement('div');
  host.setAttribute('data-eldra-preview-session', '');
  const root = host.attachShadow({ mode: 'open' });
  const box = doc.createElement('div');
  box.setAttribute('role', 'alert');
  box.setAttribute('lang', lang);
  box.setAttribute('tabindex', '-1');
  box.setAttribute(
    'style',
    // `visibility:visible`: the router's early hide keeps the body hidden while the veil is up.
    'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;gap:12px;' +
      'visibility:visible;' +
      'align-items:center;justify-content:center;padding:16px;background:#fff;color:#1f2328;' +
      'font:16px/1.5 system-ui,sans-serif;text-align:center'
  );
  const line = doc.createElement('p');
  const exit = doc.createElement('a');
  exit.href = PREVIEW_SESSION_EXIT_PATH;
  exit.textContent = text.exit;
  box.append(line, exit);
  root.append(box);
  doc.body.append(host);
  watch(
    () => state.status,
    (status) => {
      const shown = status === 'pending' || isPreviewSessionRefused(status);
      box.hidden = !shown;
      if (status === 'pending' || status === 'expired' || status === 'unavailable') {
        line.textContent = text[status];
      }
      if (isPreviewSessionRefused(status)) box.focus();
    },
    { immediate: true, flush: 'sync' }
  );
  return host;
}

/** How long the drafts may take to arrive before the session says it is unavailable. */
export const PREVIEW_SESSION_DRAFT_TIMEOUT_MS = 15_000;

/**
 * Wait for the session's re-reads to settle, then bring the veil down — or, when they have not
 * settled within `timeoutMs`, end in the unavailable notice. Never the published page either way.
 */
export async function settlePreviewSessionDrafts(
  reads: () => Promise<unknown>,
  afterRender: () => Promise<unknown>,
  timeoutMs: number = PREVIEW_SESSION_DRAFT_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  // A read that throws before it returns a promise is settled too, as one that rejects is.
  const settled = Promise.resolve()
    .then(reads)
    .then(
      () => 'settled' as const,
      () => 'settled' as const
    );
  const outcome = await Promise.race([settled, timedOut]);
  clearTimeout(timer);
  if (outcome === 'timeout') {
    refuse({ status: 'unavailable', errorId: null });
    return;
  }
  try {
    await afterRender();
  } catch (cause) {
    // Not knowing whether the draft is on screen is not showing it: the unavailable notice.
    console.warn('[eldra] the draft preview could not be rendered', cause);
    refuse({ status: 'unavailable', errorId: null });
    return;
  }
  markPreviewSessionDraftShown();
}

/**
 * Turn the page into a draft preview session when it is one: the client's CMS reads go to the
 * router's proxy, a refusal on any of them ends the session on screen, and the veil, the exit
 * banner and the notices are mounted. Returns whether it did. Browser only.
 *
 * `onHydrated` is handed what to run once the published prerender is hydrated: it marks the state,
 * then the caller re-reads every async data entry through the session and calls
 * `markPreviewSessionDraftShown` when they have settled.
 */
export function startPreviewSession(
  client: EldraClient,
  options: {
    win?: Window;
    onHydrated: (done: () => void) => void;
  }
): boolean {
  const win = options.win ?? (typeof window === 'undefined' ? undefined : window);
  if (win === undefined || !detectPreviewSession(win)) return false;
  state.active = true;
  trackAppRoot(win.document);
  liftEarlyHideOnLeavingVeil(win.document);
  // A client without session support (a hand-written one) cannot read drafts this way, and the
  // published page is not an answer either.
  if (typeof client.enableSessionPreview !== 'function') {
    state.status = 'unavailable';
    void loadUi(win.document);
    return true;
  }
  client.enableSessionPreview({ proxyBase: `${win.location.origin}${PREVIEW_SESSION_PROXY_PATH}` });
  state.status = 'pending';
  replayCoveredFocus(win.document);
  client.onRequestError?.((error) => {
    const refusal = previewSessionRefusal(error);
    if (refusal !== null) refuse(refusal);
  });
  options.onHydrated(markPreviewSessionHydrated);
  void loadUi(win.document);
  return true;
}
