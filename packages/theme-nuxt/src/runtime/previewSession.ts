import { EldraClientError, type EldraClient } from '@eldrajs/theme-core';
import { reactive, watch } from 'vue';

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

/** Whether the document carries the router's session marker (`<meta name="eldra-preview" content="session">`). */
export function hasPreviewSessionMarker(doc: Pick<Document, 'querySelectorAll'>): boolean {
  for (const meta of doc.querySelectorAll(`meta[name="${PREVIEW_SESSION_META_NAME}"]`)) {
    if (meta.getAttribute('content')?.trim().toLowerCase() === PREVIEW_SESSION_META_CONTENT) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this page is a draft preview session: the router's marker on the document, or a session
 * host. Browser only; a server render is never one.
 */
export function detectPreviewSession(
  win: { location: { hostname: string }; document: Pick<Document, 'querySelectorAll'> } | undefined
): boolean {
  if (win === undefined) return false;
  return hasPreviewSessionMarker(win.document) || isPreviewSessionHost(win.location.hostname);
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
 * Turn the page into a draft preview session when it is one: the client's CMS reads go to the
 * router's proxy, a refusal on any of them ends the session on screen, and the veil, the exit
 * banner and the notices are mounted. Returns whether it did. Browser only.
 */
export function startPreviewSession(
  client: EldraClient,
  options: {
    win?: Window;
    /** Called once with a callback to run when the published prerender is hydrated. */
    onHydrated: (done: () => void) => void;
  }
): boolean {
  const win = options.win ?? (typeof window === 'undefined' ? undefined : window);
  if (win === undefined || !detectPreviewSession(win)) return false;
  // A client without session support (a hand-written one) cannot read drafts this way, and the
  // published page is not an answer either.
  if (typeof client.enableSessionPreview !== 'function') {
    state.active = true;
    state.status = 'unavailable';
    mountPreviewSessionUi(win.document, state);
    return true;
  }
  client.enableSessionPreview({ proxyBase: `${win.location.origin}${PREVIEW_SESSION_PROXY_PATH}` });
  state.active = true;
  state.status = 'pending';
  client.onRequestError?.((error) => {
    const refusal = previewSessionRefusal(error);
    if (refusal !== null) refuse(refusal);
  });
  options.onHydrated(markPreviewSessionHydrated);
  mountPreviewSessionUi(win.document, state);
  return true;
}

// ---- the copy, in Icelandic and English.

export type PreviewSessionLocale = 'is' | 'en';

export interface PreviewSessionMessages {
  banner: string;
  exit: string;
  loading: string;
  expiredTitle: string;
  expiredInvalid: string;
  expiredRevoked: string;
  expiredExpired: string;
  expiredHint: string;
  unavailableTitle: string;
  unavailableBody: string;
  retry: string;
}

export const PREVIEW_SESSION_MESSAGES: Record<PreviewSessionLocale, PreviewSessionMessages> = {
  is: {
    banner: 'Forskoðun á drögum',
    exit: 'Hætta í forskoðun',
    loading: 'Sæki drög…',
    expiredTitle: 'Forskoðuninni er lokið',
    expiredInvalid: 'Þessi forskoðunartengill er ekki gildur.',
    expiredRevoked: 'Þessi forskoðunartengill hefur verið afturkallaður.',
    expiredExpired: 'Þessi forskoðunartengill er útrunninn.',
    expiredHint: 'Opnaðu nýja forskoðun úr Studio.',
    unavailableTitle: 'Forskoðun er ekki tiltæk',
    unavailableBody: 'Ekki tókst að sækja drögin núna. Reyndu aftur eftir smástund.',
    retry: 'Reyna aftur',
  },
  en: {
    banner: 'Draft preview',
    exit: 'Exit preview',
    loading: 'Loading draft…',
    expiredTitle: 'This preview has ended',
    expiredInvalid: 'This preview link is not valid.',
    expiredRevoked: 'This preview link has been revoked.',
    expiredExpired: 'This preview link has expired.',
    expiredHint: 'Open a new preview from Studio.',
    unavailableTitle: 'The preview is unavailable',
    unavailableBody: 'The draft could not be loaded right now. Try again in a moment.',
    retry: 'Try again',
  },
};

/** The page's own language when it is Icelandic, else the browser's, else English. */
export function previewSessionLocale(
  doc: Pick<Document, 'documentElement'>,
  languages: readonly string[] = []
): PreviewSessionLocale {
  const tags = [doc.documentElement.lang, ...languages];
  for (const tag of tags) {
    const language = tag?.trim().toLowerCase().split('-')[0];
    if (language === 'is') return 'is';
    if (language === 'en') return 'en';
  }
  return 'en';
}

function expiredDetail(messages: PreviewSessionMessages, errorId: string | null): string {
  if (errorId === 'SITE_PREVIEW_SESSION_REVOKED') return messages.expiredRevoked;
  if (errorId === 'SITE_PREVIEW_SESSION_EXPIRED') return messages.expiredExpired;
  return messages.expiredInvalid;
}

// ---- the veil, the banner and the notices.

/**
 * Outside the Vue app on purpose: it is mounted before hydration and must not be part of the tree
 * the prerender is hydrated against, and a shadow root keeps the theme's styles off it (and its
 * styles off the theme).
 *
 * The veil covers the published prerender, marks the app `aria-busy`, and only shows its
 * "loading" line after a moment, so a draft that arrives fast never flashes it. It traps nothing:
 * focus is never moved or held, the banner's exit stays reachable. A refusal replaces it with an
 * opaque notice and makes the (by then emptied) app inert.
 */
const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
.veil,.notice{position:fixed;inset:0;z-index:2147483646;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.veil{background:rgba(255,255,255,.88);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);transition:opacity .15s ease,visibility 0s linear .15s}
.veil[hidden]{display:block;opacity:0;visibility:hidden;pointer-events:none}
.loading{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);margin:0;padding:8px 16px;border-radius:999px;background:#fff;color:#1f2328;box-shadow:0 1px 3px rgba(0,0,0,.15);opacity:0;animation:appear .2s ease .5s forwards}
.notice{display:flex;align-items:center;justify-content:center;padding:16px;background:#fff;color:#1f2328}
.notice[hidden]{display:none}
.card{max-width:32rem}
h2{font-size:1.25rem;line-height:1.3;margin:0 0 .5rem}
p{margin:0 0 .75rem}
.banner{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:12px;align-items:center;max-width:calc(100vw - 32px);padding:8px 8px 8px 16px;border-radius:999px;background:#1f2328;color:#fff;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.banner a{color:inherit;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.14);text-decoration:underline;white-space:nowrap}
a{color:#0b57d0}
a:focus-visible{outline:2px solid #0b57d0;outline-offset:2px}
.banner a:focus-visible{outline-color:#fff}
@keyframes appear{to{opacity:1}}
@media (prefers-color-scheme:dark){
.veil{background:rgba(13,17,23,.88)}
.loading{background:#161b22;color:#e6edf3}
.notice{background:#0d1117;color:#e6edf3}
a{color:#7aa7ff}
}
@media (prefers-reduced-motion:reduce){.veil{transition:none}.loading{animation:none;opacity:1}}
`;

export interface PreviewSessionUi {
  host: HTMLElement;
  destroy(): void;
}

export function mountPreviewSessionUi(
  doc: Document,
  session: Readonly<PreviewSessionState>,
  locale: PreviewSessionLocale = previewSessionLocale(
    doc,
    typeof navigator === 'undefined' ? [] : navigator.languages
  )
): PreviewSessionUi {
  const text = PREVIEW_SESSION_MESSAGES[locale];
  const host = doc.createElement('div');
  host.setAttribute('data-eldra-preview-session', '');
  const root = host.attachShadow({ mode: 'open' });
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Record<string, string> = {},
    content?: string
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const style = element('style', {}, STYLE);
  const veil = element('div', { class: 'veil', part: 'veil' });
  // The line is the veil's only content and the only thing a screen reader needs from it.
  const loading = element('p', { class: 'loading', role: 'status' }, text.loading);
  veil.append(loading);

  const notice = element('div', { class: 'notice', part: 'notice', role: 'alert', lang: locale });
  const card = element('div', { class: 'card' });
  const title = element('h2');
  const detail = element('p');
  const hint = element('p');
  const retry = element('a', { href: '' }, text.retry);
  card.append(title, detail, hint);
  notice.append(card);

  const banner = element('div', {
    class: 'banner',
    part: 'banner',
    role: 'region',
    'aria-label': text.banner,
    lang: locale,
  });
  const exit = element('a', { href: PREVIEW_SESSION_EXIT_PATH }, text.exit);
  banner.append(element('span', {}, text.banner), exit);

  root.append(style, veil, notice, banner);
  doc.body.append(host);

  const appRoot = (): HTMLElement | null =>
    doc.getElementById('__nuxt') ??
    (doc.body.firstElementChild instanceof HTMLElement && doc.body.firstElementChild !== host
      ? doc.body.firstElementChild
      : null);

  const render = (): void => {
    const pending = session.status === 'pending';
    const refused = isPreviewSessionRefused(session.status);
    veil.hidden = !pending;
    notice.hidden = !refused;
    const app = appRoot();
    if (app !== null) {
      if (pending) app.setAttribute('aria-busy', 'true');
      else app.removeAttribute('aria-busy');
      // What is behind a notice is not the draft; nothing there is to be read or reached.
      app.toggleAttribute('inert', refused);
    }
    if (session.status === 'expired') {
      title.textContent = text.expiredTitle;
      detail.textContent = expiredDetail(text, session.errorId);
      hint.textContent = text.expiredHint;
      retry.remove();
    } else if (session.status === 'unavailable') {
      title.textContent = text.unavailableTitle;
      detail.textContent = text.unavailableBody;
      hint.textContent = '';
      hint.append(retry);
      retry.setAttribute('href', `${doc.location?.pathname ?? '/'}${doc.location?.search ?? ''}`);
    }
  };
  render();
  const stop = watch(() => [session.status, session.errorId], render, { flush: 'post' });
  return {
    host,
    destroy() {
      stop();
      host.remove();
    },
  };
}
