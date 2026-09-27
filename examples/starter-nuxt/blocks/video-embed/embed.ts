/**
 * Pure URL -> embed resolution for the `video-embed` block (spec `02-blocks.md` "Video embed",
 * 1894-1997). No Vue, no DOM, no network — `Block.vue` calls this with the result of `safeHref()`
 * (never the raw field value) and gets back either a provider it recognises, or `null` for
 * anything else: an unsupported host, a malformed URL, or a scheme `safeHref` would already have
 * rejected. `null` is what puts the block into its `EmptyState variant="error"` state — the block
 * never builds an `<iframe src>` from an unrecognised or unsafe string.
 *
 * The returned `src` already carries the "start playing" parameter (YouTube/Vimeo's `autoplay=1`)
 * even though nothing reads it until the visitor activates play — `Block.vue` only ever mounts the
 * `<iframe>`/`<video>` after that click, so building the URL eagerly here costs nothing and keeps
 * this module a plain, ambiguity-free string transform.
 */

export type VideoEmbedKind = 'youtube' | 'vimeo' | 'mp4';

export interface VideoEmbed {
  kind: VideoEmbedKind;
  /** `youtube`/`vimeo`: the provider's iframe `src`, rewritten to the privacy-respecting host
   * (`youtube-nocookie.com`) with the autoplay parameter already appended. `mp4`: the direct file
   * URL, used as the `<video>` element's `src`. */
  src: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_SHORT_HOST = 'youtu.be';
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

function youtubeEmbedSrc(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
}

function vimeoEmbedSrc(id: string): string {
  return `https://player.vimeo.com/video/${id}?autoplay=1`;
}

/**
 * `url` must already have passed `safeHref` (`app/utils/links.ts`) — this only narrows further, to
 * the handful of hosts/shapes the block actually knows how to embed. Returns `null` for anything
 * else, including a URL string `safeHref` would reject (defence in depth: this module makes no
 * assumption about its caller).
 */
export function resolveVideoEmbed(url: string): VideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (path.toLowerCase().endsWith('.mp4')) {
    return { kind: 'mp4', src: url };
  }

  if (host === YOUTUBE_SHORT_HOST) {
    const id = path.slice(1).split('/')[0];
    return id ? { kind: 'youtube', src: youtubeEmbedSrc(id) } : null;
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (path === '/watch') {
      const id = parsed.searchParams.get('v');
      return id ? { kind: 'youtube', src: youtubeEmbedSrc(id) } : null;
    }
    const embedMatch = /^\/embed\/([^/]+)/.exec(path);
    if (embedMatch?.[1]) return { kind: 'youtube', src: youtubeEmbedSrc(embedMatch[1]) };
    return null;
  }

  if (VIMEO_HOSTS.has(host)) {
    const match = /^\/(?:video\/)?(\d+)/.exec(path);
    if (match?.[1]) return { kind: 'vimeo', src: vimeoEmbedSrc(match[1]) };
    return null;
  }

  return null;
}
