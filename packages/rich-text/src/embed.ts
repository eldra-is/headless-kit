export type SupportedEmbedProvider =
  | 'youtube'
  | 'twitch'
  | 'vimeo'
  | 'soundcloud'
  | 'spotify'
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'facebook'
  | 'googleMaps'
  | 'appleMusic'
  | 'applePodcasts'
  | 'reddit'
  | 'pinterest'
  | 'linkedin';

export type EmbedRenderMode = 'iframe' | 'script';
export type EmbedWidth = number | `${number}%`;

export interface NormalizedEmbedAttributes {
  provider: SupportedEmbedProvider;
  render: EmbedRenderMode;
  src: string;
  width: EmbedWidth;
  height: number;
  title: string;
  allow?: string;
  variant?: string;
}

const DEFAULT_EMBED_DIMENSIONS: Record<
  SupportedEmbedProvider,
  { width: EmbedWidth; height: number }
> = {
  youtube: { width: 640, height: 360 },
  twitch: { width: 640, height: 480 },
  vimeo: { width: 640, height: 360 },
  soundcloud: { width: '100%', height: 166 },
  spotify: { width: '100%', height: 352 },
  instagram: { width: 540, height: 658 },
  tiktok: { width: 325, height: 740 },
  x: { width: 550, height: 400 },
  facebook: { width: 500, height: 680 },
  googleMaps: { width: 600, height: 450 },
  appleMusic: { width: '100%', height: 450 },
  applePodcasts: { width: '100%', height: 450 },
  reddit: { width: 640, height: 420 },
  pinterest: { width: 400, height: 480 },
  linkedin: { width: 504, height: 459 },
};

const DEFAULT_EMBED_ALLOW: Record<SupportedEmbedProvider, string | undefined> = {
  youtube:
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
  twitch: undefined,
  vimeo: 'autoplay; fullscreen; picture-in-picture',
  soundcloud: 'autoplay',
  spotify: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
  instagram: undefined,
  tiktok: 'fullscreen',
  x: undefined,
  facebook: 'encrypted-media',
  googleMaps: 'fullscreen',
  appleMusic: 'autoplay *; encrypted-media *; fullscreen *; clipboard-write *;',
  applePodcasts: 'encrypted-media *; fullscreen *; clipboard-write *;',
  reddit: 'clipboard-write',
  pinterest: undefined,
  linkedin: 'fullscreen',
};

const DEFAULT_EMBED_TITLE: Record<SupportedEmbedProvider, string> = {
  youtube: 'YouTube video',
  twitch: 'Twitch embed',
  vimeo: 'Vimeo video',
  soundcloud: 'SoundCloud player',
  spotify: 'Spotify player',
  instagram: 'Instagram embed',
  tiktok: 'TikTok video',
  x: 'X post',
  facebook: 'Facebook embed',
  googleMaps: 'Google Map',
  appleMusic: 'Apple Music player',
  applePodcasts: 'Apple Podcasts player',
  reddit: 'Reddit embed',
  pinterest: 'Pinterest embed',
  linkedin: 'LinkedIn post',
};

const URL_CANDIDATE_REGEX_GLOBAL = /https?:\/\/[^\s<>"']+/gi;
export const SUPPORTED_EMBED_URL_REGEX_GLOBAL = URL_CANDIDATE_REGEX_GLOBAL;

type PartialEmbedInput = Partial<NormalizedEmbedAttributes> & {
  src?: string;
};

type BaseNormalizedEmbed = Omit<NormalizedEmbedAttributes, 'width' | 'height' | 'title' | 'allow'>;

const toUrl = (url: string) => {
  try {
    return new URL(url);
  } catch {
    return new URL(`https://${url}`);
  }
};

const readDimension = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readWidth = (value: unknown, fallback: EmbedWidth): EmbedWidth => {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (/^\d+(\.\d+)?%$/.test(trimmedValue)) {
      return trimmedValue as EmbedWidth;
    }

    if (/^\d+(\.\d+)?px$/i.test(trimmedValue)) {
      const parsedPixels = Number.parseFloat(trimmedValue);
      return Number.isFinite(parsedPixels) && parsedPixels > 0 ? parsedPixels : fallback;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getEmbedParentHost = () => {
  if (typeof globalThis.location?.hostname === 'string' && globalThis.location.hostname) {
    return globalThis.location.hostname;
  }

  return 'localhost';
};

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const normalizeRichUrl = (url: URL) => {
  url.hash = '';
  return stripTrailingSlash(url.toString());
};

const finalizeNormalizedEmbed = (
  normalized: BaseNormalizedEmbed,
  iframeAttrs?: PartialEmbedInput | null
): NormalizedEmbedAttributes => {
  const defaults =
    normalized.provider === 'spotify' && normalized.variant === 'track'
      ? { width: '100%' as const, height: 152 }
      : DEFAULT_EMBED_DIMENSIONS[normalized.provider];

  return {
    ...normalized,
    width: readWidth(iframeAttrs?.width, defaults.width),
    height: readDimension(iframeAttrs?.height, defaults.height),
    title:
      (typeof iframeAttrs?.title === 'string' && iframeAttrs.title.trim()) ||
      DEFAULT_EMBED_TITLE[normalized.provider],
    allow:
      (typeof iframeAttrs?.allow === 'string' && iframeAttrs.allow.trim()) ||
      DEFAULT_EMBED_ALLOW[normalized.provider],
  };
};

const normalizeYoutubeUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  const nocookie = hostname === 'youtube-nocookie.com' || hostname === 'www.youtube-nocookie.com';

  const isPlaylistEmbed =
    (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) &&
    parsedUrl.pathname === '/embed' &&
    parsedUrl.searchParams.get('listType') === 'playlist' &&
    parsedUrl.searchParams.get('list');
  if (isPlaylistEmbed) {
    const embedUrl = new URL(
      `https://${nocookie ? 'www.youtube-nocookie.com' : 'www.youtube.com'}/embed`
    );
    embedUrl.searchParams.set('listType', 'playlist');
    embedUrl.searchParams.set('list', parsedUrl.searchParams.get('list') ?? '');
    return { provider: 'youtube', render: 'iframe', src: embedUrl.toString(), variant: 'playlist' };
  }

  const playlistId =
    parsedUrl.searchParams.get('list') && !parsedUrl.searchParams.get('v')
      ? parsedUrl.searchParams.get('list')
      : null;
  if (
    playlistId &&
    (hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'youtube-nocookie.com' ||
      hostname === 'www.youtube-nocookie.com')
  ) {
    const embedUrl = new URL(
      `https://${nocookie ? 'www.youtube-nocookie.com' : 'www.youtube.com'}/embed`
    );
    embedUrl.searchParams.set('listType', 'playlist');
    embedUrl.searchParams.set('list', playlistId);
    return { provider: 'youtube', render: 'iframe', src: embedUrl.toString(), variant: 'playlist' };
  }

  let videoId = '';
  if (hostname === 'youtu.be') {
    videoId = parsedUrl.pathname.replace('/', '');
  } else if (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) {
    if (parsedUrl.pathname === '/watch') {
      videoId = parsedUrl.searchParams.get('v') ?? '';
    } else {
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') {
        videoId = segments[1] ?? '';
      } else {
        videoId = segments.at(-1) ?? '';
      }
    }
  }

  if (!videoId) {
    return null;
  }

  const embedUrl = new URL(
    `https://${nocookie ? 'www.youtube-nocookie.com' : 'www.youtube.com'}/embed/${videoId}`
  );
  const start = parsedUrl.searchParams.get('t') ?? parsedUrl.searchParams.get('start');

  if (start) {
    const numericStart = Number.parseInt(start, 10);
    if (Number.isFinite(numericStart) && numericStart > 0) {
      embedUrl.searchParams.set('start', String(numericStart));
    }
  }

  return {
    provider: 'youtube',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: 'video',
  };
};

type ParsedVimeoUrl = { type: 'event'; id: string } | { type: 'video'; id: string; hash?: string };

const parseVimeoUrl = (raw: string): ParsedVimeoUrl | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'vimeo.com' && hostname !== 'player.vimeo.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (hostname === 'player.vimeo.com') {
    const [, id] = segments;
    if (segments[0] !== 'video' || !/^\d+$/.test(id ?? '')) {
      return null;
    }
    return { type: 'video', id, hash: parsedUrl.searchParams.get('h') ?? undefined };
  }

  if (segments[0] === 'event' && /^\d+$/.test(segments[1] ?? '')) {
    return { type: 'event', id: segments[1] };
  }

  const idIndex = segments.findIndex((segment) => /^\d+$/.test(segment));
  if (idIndex === -1) {
    return null;
  }

  const hash = segments[idIndex + 1] || parsedUrl.searchParams.get('h') || undefined;
  return { type: 'video', id: segments[idIndex], hash };
};

const normalizeVimeoUrl = (raw: string): BaseNormalizedEmbed | null => {
  const parsed = parseVimeoUrl(raw);
  if (!parsed) {
    return null;
  }

  const embedUrl =
    parsed.type === 'event'
      ? new URL(`https://vimeo.com/event/${parsed.id}/embed`)
      : new URL(`https://player.vimeo.com/video/${parsed.id}`);

  if (parsed.type === 'video' && parsed.hash) {
    embedUrl.searchParams.set('h', parsed.hash);
  }

  return {
    provider: 'vimeo',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: parsed.type,
  };
};

const normalizeTwitchUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (
    hostname !== 'twitch.tv' &&
    hostname !== 'clips.twitch.tv' &&
    hostname !== 'player.twitch.tv'
  ) {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  const autoplay = parsedUrl.searchParams.get('autoplay');
  const muted = parsedUrl.searchParams.get('muted');
  const time = parsedUrl.searchParams.get('time');

  if (hostname === 'clips.twitch.tv' || segments[0] === 'clip') {
    const clip = hostname === 'clips.twitch.tv' ? segments[0] : segments[1];
    if (!clip) {
      return null;
    }

    const embedUrl = new URL('https://clips.twitch.tv/embed');
    embedUrl.searchParams.set('clip', clip);
    embedUrl.searchParams.set('parent', getEmbedParentHost());
    if (autoplay) {
      embedUrl.searchParams.set('autoplay', autoplay);
    }
    if (muted) {
      embedUrl.searchParams.set('muted', muted);
    }

    return {
      provider: 'twitch',
      render: 'iframe',
      src: embedUrl.toString(),
      variant: 'clip',
    };
  }

  const embedUrl = new URL('https://player.twitch.tv/');

  if (segments[0] === 'videos' && /^\d+$/.test(segments[1] ?? '')) {
    embedUrl.searchParams.set('video', `v${segments[1]}`);
  } else {
    const channel = segments[0] || parsedUrl.searchParams.get('channel');
    if (!channel) {
      return null;
    }
    embedUrl.searchParams.set('channel', channel);
  }

  embedUrl.searchParams.set('parent', getEmbedParentHost());

  if (autoplay) {
    embedUrl.searchParams.set('autoplay', autoplay);
  }
  if (muted) {
    embedUrl.searchParams.set('muted', muted);
  }
  if (time) {
    embedUrl.searchParams.set('time', time);
  }

  return {
    provider: 'twitch',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: embedUrl.searchParams.has('video') ? 'video' : 'channel',
  };
};

const normalizeSoundCloudUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname === 'w.soundcloud.com' && parsedUrl.pathname.startsWith('/player')) {
    return {
      provider: 'soundcloud',
      render: 'iframe',
      src: parsedUrl.toString(),
      variant: 'widget',
    };
  }

  if (hostname !== 'soundcloud.com' && hostname !== 'on.soundcloud.com') {
    return null;
  }

  const embedUrl = new URL('https://w.soundcloud.com/player/');
  embedUrl.searchParams.set('url', stripTrailingSlash(parsedUrl.toString()));

  return {
    provider: 'soundcloud',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: 'trackOrPlaylist',
  };
};

const normalizeSpotifyUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'open.spotify.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const offset = segments[0] === 'embed' ? 1 : 0;
  const type = segments[offset];
  const id = segments[offset + 1];

  if (!type || !id) {
    return null;
  }

  const supportedTypes = new Set(['track', 'album', 'playlist', 'artist', 'show', 'episode']);
  if (!supportedTypes.has(type)) {
    return null;
  }

  const embedUrl = new URL(`https://open.spotify.com/embed/${type}/${id}`);
  const startAt = parsedUrl.searchParams.get('t') ?? parsedUrl.searchParams.get('start_at');
  if (startAt && type === 'episode') {
    embedUrl.searchParams.set('t', startAt);
  }

  return {
    provider: 'spotify',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: type,
  };
};

const normalizeInstagramUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'instagram.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (!segments.length) {
    return null;
  }

  if (['p', 'reel', 'reels', 'tv'].includes(segments[0]) && segments[1]) {
    const normalizedPath = segments[0] === 'reels' ? 'reel' : segments[0];
    return {
      provider: 'instagram',
      render: 'script',
      src: normalizeRichUrl(new URL(`https://www.instagram.com/${normalizedPath}/${segments[1]}/`)),
      variant: normalizedPath,
    };
  }

  if (segments.length === 1) {
    return {
      provider: 'instagram',
      render: 'script',
      src: normalizeRichUrl(new URL(`https://www.instagram.com/${segments[0]}/`)),
      variant: 'profile',
    };
  }

  return null;
};

const normalizeTikTokUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'tiktok.com' && hostname !== 'm.tiktok.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  const embedVideoId =
    segments[0] === 'embed' || (segments[0] === 'player' && segments[1] === 'v1')
      ? segments.at(-1)
      : null;
  const canonicalVideoId =
    segments[0]?.startsWith('@') && segments[1] === 'video' ? segments[2] : null;
  const videoId = embedVideoId ?? canonicalVideoId;

  if (!videoId || !/^\d+$/.test(videoId)) {
    return null;
  }

  return {
    provider: 'tiktok',
    render: 'iframe',
    src: `https://www.tiktok.com/player/v1/${videoId}`,
    variant: 'video',
  };
};

const normalizeXUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'x.com' && hostname !== 'twitter.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment === 'status');
  if (statusIndex === -1 || !segments[statusIndex + 1]) {
    return null;
  }

  const username = statusIndex > 0 ? segments[statusIndex - 1] : 'i';
  const prefix = username === 'i' ? '/i/web' : `/${username}`;

  return {
    provider: 'x',
    render: 'script',
    src: `https://x.com${prefix}/status/${segments[statusIndex + 1]}`,
    variant: 'post',
  };
};

const normalizeFacebookUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'facebook.com' && hostname !== 'fb.watch' && hostname !== 'm.facebook.com') {
    return null;
  }

  const normalizedUrl = new URL(parsedUrl.toString());
  normalizedUrl.hash = '';
  const normalizedPath = normalizedUrl.pathname.replace(/\/+$/, '');
  const isPluginPath =
    normalizedPath === '/plugins/post.php' || normalizedPath === '/plugins/video.php';
  const variant =
    hostname === 'fb.watch' ||
    normalizedPath.includes('/videos/') ||
    normalizedUrl.searchParams.has('v') ||
    normalizedPath === '/plugins/video.php'
      ? 'video'
      : 'post';

  if (isPluginPath) {
    return {
      provider: 'facebook',
      render: 'iframe',
      src: normalizedUrl.toString(),
      variant,
    };
  }

  const pluginUrl = new URL(
    `https://www.facebook.com/plugins/${variant === 'video' ? 'video' : 'post'}.php`
  );
  pluginUrl.searchParams.set('href', normalizeRichUrl(normalizedUrl));
  pluginUrl.searchParams.set('width', String(DEFAULT_EMBED_DIMENSIONS.facebook.width));

  if (variant === 'post') {
    pluginUrl.searchParams.set('show_text', 'true');
  }

  return {
    provider: 'facebook',
    render: 'iframe',
    src: pluginUrl.toString(),
    variant,
  };
};

const normalizeGoogleMapsUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  const isEmbedHost = hostname === 'google.com' || hostname === 'maps.google.com';
  if (!isEmbedHost) {
    return null;
  }

  const pathname = parsedUrl.pathname;
  const isOfficialEmbed =
    pathname.startsWith('/maps/embed') ||
    pathname.startsWith('/maps/embed/v1') ||
    parsedUrl.searchParams.get('output') === 'embed';
  if (!isOfficialEmbed) {
    return null;
  }

  return {
    provider: 'googleMaps',
    render: 'iframe',
    src: parsedUrl.toString(),
    variant: 'map',
  };
};

const normalizeAppleMusicUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'music.apple.com' && hostname !== 'embed.music.apple.com') {
    return null;
  }

  const embedUrl = new URL(parsedUrl.toString());
  embedUrl.hostname = 'embed.music.apple.com';
  embedUrl.hash = '';

  return {
    provider: 'appleMusic',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: 'player',
  };
};

const normalizeApplePodcastsUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'podcasts.apple.com' && hostname !== 'embed.podcasts.apple.com') {
    return null;
  }

  const embedUrl = new URL(parsedUrl.toString());
  embedUrl.hostname = 'embed.podcasts.apple.com';
  embedUrl.hash = '';

  return {
    provider: 'applePodcasts',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: 'player',
  };
};

const normalizeRedditUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (
    hostname !== 'reddit.com' &&
    hostname !== 'old.reddit.com' &&
    hostname !== 'embed.reddit.com'
  ) {
    return null;
  }

  const embedUrl = new URL(parsedUrl.toString());
  embedUrl.hostname = 'embed.reddit.com';
  embedUrl.hash = '';

  return {
    provider: 'reddit',
    render: 'iframe',
    src: embedUrl.toString(),
    variant: parsedUrl.pathname.includes('/comments/') ? 'thread' : 'content',
  };
};

const normalizePinterestUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'pinterest.com') {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (!segments.length) {
    return null;
  }

  if (segments[0] === 'pin' && segments[1]) {
    return {
      provider: 'pinterest',
      render: 'script',
      src: normalizeRichUrl(new URL(`https://www.pinterest.com/pin/${segments[1]}/`)),
      variant: 'pin',
    };
  }

  if (segments.length >= 2) {
    return {
      provider: 'pinterest',
      render: 'script',
      src: normalizeRichUrl(new URL(`https://www.pinterest.com/${segments[0]}/${segments[1]}/`)),
      variant: 'board',
    };
  }

  return {
    provider: 'pinterest',
    render: 'script',
    src: normalizeRichUrl(new URL(`https://www.pinterest.com/${segments[0]}/`)),
    variant: 'profile',
  };
};

const normalizeLinkedInUrl = (raw: string): BaseNormalizedEmbed | null => {
  let parsedUrl: URL;

  try {
    parsedUrl = toUrl(raw);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  if (hostname !== 'linkedin.com') {
    return null;
  }

  const match = parsedUrl.pathname.match(
    /^\/(?:embed\/)?feed\/update\/(urn:li:(?:activity|share):[A-Za-z0-9-]+)\/?$/
  );

  if (!match) {
    return null;
  }

  return {
    provider: 'linkedin',
    render: 'iframe',
    src: `https://www.linkedin.com/embed/feed/update/${match[1]}`,
    variant: 'post',
  };
};

const normalizeProviderUrl = (raw: string) =>
  normalizeYoutubeUrl(raw) ??
  normalizeTwitchUrl(raw) ??
  normalizeVimeoUrl(raw) ??
  normalizeSoundCloudUrl(raw) ??
  normalizeSpotifyUrl(raw) ??
  normalizeInstagramUrl(raw) ??
  normalizeTikTokUrl(raw) ??
  normalizeXUrl(raw) ??
  normalizeFacebookUrl(raw) ??
  normalizeGoogleMapsUrl(raw) ??
  normalizeAppleMusicUrl(raw) ??
  normalizeApplePodcastsUrl(raw) ??
  normalizeRedditUrl(raw) ??
  normalizePinterestUrl(raw) ??
  normalizeLinkedInUrl(raw);

const extractIframeAttributes = (input: string): PartialEmbedInput | null => {
  if (!/<iframe[\s>]/i.test(input)) {
    return null;
  }

  const match = input.match(/<iframe\b([^>]*)>/i);
  if (!match) {
    return null;
  }

  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let attrMatch: RegExpExecArray | null;

  while ((attrMatch = attrRegex.exec(match[1])) !== null) {
    attrs[attrMatch[1].toLowerCase()] = attrMatch[2] ?? attrMatch[3] ?? '';
  }

  return {
    src: attrs.src,
    width: attrs.width ? readWidth(attrs.width, '100%') : undefined,
    height: readDimension(attrs.height, 0),
    title: attrs.title,
    allow: attrs.allow,
  };
};

const extractFirstSupportedUrl = (input: string) => {
  SUPPORTED_EMBED_URL_REGEX_GLOBAL.lastIndex = 0;

  for (const match of input.matchAll(SUPPORTED_EMBED_URL_REGEX_GLOBAL)) {
    const candidate = match[0];
    if (normalizeProviderUrl(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const normalizeEmbedInput = (input: string): NormalizedEmbedAttributes | null => {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return null;
  }

  const iframeAttrs = extractIframeAttributes(trimmedInput);
  const source = iframeAttrs?.src ?? trimmedInput;
  const normalized =
    normalizeProviderUrl(source) ??
    (source === trimmedInput ? null : normalizeProviderUrl(trimmedInput)) ??
    (source === trimmedInput
      ? null
      : normalizeProviderUrl(extractFirstSupportedUrl(trimmedInput) ?? '')) ??
    normalizeProviderUrl(extractFirstSupportedUrl(trimmedInput) ?? '');

  if (!normalized) {
    return null;
  }

  return finalizeNormalizedEmbed(normalized, iframeAttrs);
};

export const extractSupportedEmbedUrl = (input: string): string | null =>
  extractFirstSupportedUrl(input);

// Every host the normalisers above can emit as an embed `src`. A stored embed whose source is not
// on this list did not come through the editor and is not rendered.
export const EMBED_SOURCE_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'player.twitch.tv',
  'clips.twitch.tv',
  'w.soundcloud.com',
  'open.spotify.com',
  'tiktok.com',
  'facebook.com',
  'google.com',
  'maps.google.com',
  'embed.music.apple.com',
  'embed.podcasts.apple.com',
  'embed.reddit.com',
  'linkedin.com',
  'x.com',
  'instagram.com',
  'pinterest.com',
]);

export const isTrustedEmbedSource = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && EMBED_SOURCE_HOSTS.has(url.hostname.replace(/^www\./, ''));
};
