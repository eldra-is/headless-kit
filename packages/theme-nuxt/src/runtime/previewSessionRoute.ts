import { defineNuxtPlugin } from 'nuxt/app';
import { detectPreviewSession } from './previewSession';

/**
 * In a draft preview session, a page only the draft has resolves the address bar's path, never
 * the not-found document's (WS-1358).
 *
 * A page that exists only as a draft is not in the pinned build, so the host answers its path with
 * the build's not-found document. When that document is a prerendered page (the starter copies its
 * styled `/404` over `404.html`, so a static host shows it), Nuxt's router starts at the path the
 * document was **rendered** for (`payload.path`, here `/404`) rather than the one in the address
 * bar, and the session then resolves `/404`: it shows "Page not found" for a draft that exists,
 * where Publish puts the page live. So in a session, and only then, the payload's path is set to
 * the address bar's before the router reads it, and the route resolves the draft.
 *
 * Only the not-found document is rewritten (`/404`, the path Nuxt prerenders for a static host's
 * `404.html`): any other document served under another address (an alias, a host's rewrite) keeps
 * the path it was rendered for, as Nuxt would start it. The paths are compared the way Nuxt's
 * router compares them (`createCurrentLocation`): the address bar's without the app's `baseURL`,
 * a trailing slash and percent-encoding aside.
 *
 * Ordered between Nuxt's payload revival (`order: -30`) and its router (`enforce: 'pre'`, -20).
 * Outside a session nothing changes.
 */
export default defineNuxtPlugin({
  name: 'eldra-preview-session-route',
  order: -25,
  setup(nuxtApp) {
    if (import.meta.server || typeof window === 'undefined') return;
    if (!detectPreviewSession(window)) return;
    const path = sessionStartPath(
      nuxtApp.payload.path,
      window.location.pathname,
      nuxtApp.$config.app.baseURL
    );
    if (path !== undefined) nuxtApp.payload.path = path;
  },
});

/** The path the not-found document is rendered for, which a static host serves as `404.html`. */
const NOT_FOUND_PATH = '/404';

/**
 * The path a session's router should start at, when it is not the one the document was rendered
 * for: the address bar's (`pathname`, without `baseURL`) when the document is the not-found page
 * rendered for another path. `undefined` leaves the payload as it is.
 */
export function sessionStartPath(
  rendered: unknown,
  pathname: string,
  baseURL = '/'
): string | undefined {
  if (typeof rendered !== 'string' || rendered === '') return undefined;
  // A hash-mode router reads the path from the hash, not the address bar's path.
  if (baseURL.includes('#')) return undefined;
  const renderedPath = rendered.split('?')[0] ?? rendered;
  if (!isSamePath(renderedPath, NOT_FOUND_PATH)) return undefined;
  const displayed = withoutBase(pathname, baseURL);
  if (isSamePath(displayed, renderedPath)) return undefined;
  return displayed;
}

/** `ufo`'s `withoutBase`, which Nuxt's router applies to the address bar's path. */
function withoutBase(input: string, base: string): string {
  if (base === '' || base === '/') return input;
  const prefix = base.replace(/\/+$/, '');
  if (!input.startsWith(prefix)) return input;
  const next = input[prefix.length];
  if (next !== undefined && next !== '/' && next !== '?') return input;
  const trimmed = input.slice(prefix.length);
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** `ufo`'s `isSamePath`: equal apart from a trailing slash and percent-encoding. */
function isSamePath(a: string, b: string): boolean {
  const bare = (path: string): string => {
    let decoded = path;
    try {
      decoded = decodeURI(path);
    } catch {
      // A malformed escape compares as written.
    }
    return decoded.replace(/\/+$/, '') || '/';
  };
  return bare(a) === bare(b);
}
