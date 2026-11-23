import { defineNuxtPlugin } from 'nuxt/app';
import { detectPreviewSession } from './previewSession';

/**
 * In a draft preview session, the route is the address bar's, never the document's (WS-1358).
 *
 * A page that exists only as a draft is not in the pinned build, so the host answers its path with
 * the build's not-found document. When that document is a prerendered page (the starter copies its
 * styled `/404` over `404.html`, so a static host shows it), Nuxt's router starts at the path the
 * document was **rendered** for (`payload.path`, here `/404`) rather than the one in the address
 * bar, and the session then resolves `/404`: it shows "Page not found" for a draft that exists,
 * where Publish puts the page live. So in a session, and only when the two differ, the payload's
 * path is set to the address bar's before the router reads it, and the route resolves the draft.
 *
 * Ordered between Nuxt's payload revival (`order: -30`) and its router (`enforce: 'pre'`, -20).
 * Outside a session, and wherever the two paths agree, nothing changes.
 */
export default defineNuxtPlugin({
  name: 'eldra-preview-session-route',
  order: -25,
  setup(nuxtApp) {
    if (!import.meta.client) return;
    const rendered = nuxtApp.payload.path;
    if (typeof rendered !== 'string' || rendered === '') return;
    if (!detectPreviewSession(window)) return;
    const shown = window.location.pathname;
    const bare = (path: string): string => path.replace(/\/+$/, '') || '/';
    if (bare(shown) === bare(rendered.split('?')[0] ?? rendered)) return;
    nuxtApp.payload.path = shown;
  },
});
