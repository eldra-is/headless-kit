import { watch } from 'vue';
import {
  PREVIEW_SESSION_EXIT_PATH,
  isPreviewSessionRefused,
  type PreviewSessionState,
} from './previewSession';

/**
 * The draft preview session's veil, exit banner and notices (`./previewSession.ts`). Its own module
 * so that only a session loads it: `startPreviewSession` imports it dynamically, and an ordinary
 * storefront's JavaScript carries the detection alone.
 */

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
 * The veil covers the published prerender (the app under it is `aria-busy` and inert, set by
 * `./previewSession.ts`), and only shows its "loading" line — and only then makes it a live
 * region — after a moment, so a draft that arrives fast never flashes or announces it. Focus is
 * never held: the banner's exit stays reachable. A refusal replaces the veil with an opaque notice
 * and moves focus to it once, so a keyboard or screen-reader user lands on what happened.
 */
const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
.veil,.notice{position:fixed;inset:0;z-index:2147483646;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.veil{background:rgba(255,255,255,.88);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);transition:opacity .15s ease,visibility 0s linear .15s}
.veil[hidden]{display:block;opacity:0;visibility:hidden;pointer-events:none}
.loading{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);margin:0;padding:8px 16px;border-radius:999px;background:#fff;color:#1f2328;box-shadow:0 1px 3px rgba(0,0,0,.15);animation:appear .2s ease both}
.loading[hidden]{display:none}
.notice:focus{outline:none}
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
@keyframes appear{from{opacity:0}to{opacity:1}}
@media (prefers-color-scheme:dark){
.veil{background:rgba(13,17,23,.88)}
.loading{background:#161b22;color:#e6edf3}
.notice{background:#0d1117;color:#e6edf3}
a{color:#7aa7ff}
}
@media (prefers-reduced-motion:reduce){.veil{transition:none}.loading{animation:none}}
`;

/** How long the veil stays silent before it says it is loading. */
export const PREVIEW_SESSION_LOADING_DELAY_MS = 500;

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
  // The line is the veil's only content and the only thing a screen reader needs from it. It is
  // not a live region until it is shown: a draft that arrives fast says nothing at all.
  const loading = element('p', { class: 'loading', hidden: '' });
  veil.append(loading);
  const announce = setTimeout(() => {
    if (session.status !== 'pending') return;
    loading.setAttribute('role', 'status');
    loading.hidden = false;
    // The text after the region exists, so it is announced.
    setTimeout(() => {
      loading.textContent = text.loading;
    }, 0);
  }, PREVIEW_SESSION_LOADING_DELAY_MS);

  const notice = element('div', {
    class: 'notice',
    part: 'notice',
    role: 'alert',
    lang: locale,
    tabindex: '-1',
  });
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

  let noticeShown = false;
  const render = (): void => {
    const pending = session.status === 'pending';
    const refused = isPreviewSessionRefused(session.status);
    veil.hidden = !pending;
    notice.hidden = !refused;
    if (!pending) {
      loading.hidden = true;
      loading.removeAttribute('role');
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
    if (refused && !noticeShown) {
      noticeShown = true;
      notice.focus();
    }
  };
  render();
  const stop = watch(() => [session.status, session.errorId], render, { flush: 'post' });
  return {
    host,
    destroy() {
      clearTimeout(announce);
      stop();
      host.remove();
    },
  };
}
