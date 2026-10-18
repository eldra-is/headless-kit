import type { EldraClient } from '@eldrajs/sdk';

/**
 * The site's icon setting exactly as `GET /site/v1/site-icons` answers it (and Studio's
 * `PUT /sites/{siteId}/site-icons` stores it). `iconUrl: null` means "no icons set": the theme's
 * own `public/` files and head tags stay. The colour and short-name defaults (the theme's primary
 * token, the site name) are resolved by the **build** — `resolveSiteIcons` below — never by Core.
 */
export interface SiteIconsSetting {
  revision: number;
  /** The media-library asset URL (`{media}/public/{orgId}/assets/{assetId}`), or `null` when no icon is set. */
  iconUrl: string | null;
  /** `#rrggbb`. Paints the iOS icon and the maskable Android icon, which cannot be transparent. */
  backgroundColor: string;
  /** `#rrggbb`, or `null` for the theme's primary design token. */
  themeColor: string | null;
  /** 1–12 characters, or `null` for the site name. */
  shortName: string | null;
  /**
   * The rendered variants, built by Core (the only place that knows the media worker's icon
   * suffixes) — `null` exactly when `iconUrl` is `null`. The build links to these, never renders.
   */
  icons: SiteIconUrls | null;
}

/** Absolute media URLs of the icon variants the media worker renders (always `image/png`). */
export interface SiteIconUrls {
  favicon32: string;
  appleTouch180: string;
  icon192: string;
  icon512: string;
  maskable512: string;
}

const ICON_URL_KEYS = ['favicon32', 'appleTouch180', 'icon192', 'icon512', 'maskable512'] as const;

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it. The
 * same narrow shape, for the same reasons, as `DesignTokensReader`: `GET /site/v1/site-icons` is a
 * site-module read with no typed `features.*` method, so the client's generic `request` carries it.
 */
export interface SiteIconsReader {
  request: EldraClient['request'];
}

/** The one line a build prints when it could not read the platform's site icons. */
export const SITE_ICONS_WARNING =
  '[eldra] could not read the platform’s site icons — keeping the theme’s own icon files';

/** How long the build waits for the answer; see `READ_TIMEOUT_MS` in `./designTokens.ts`. */
export const READ_TIMEOUT_MS = 10_000;

/** Android's launcher shows at most about this many characters of `short_name`. */
export const SHORT_NAME_MAX = 12;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The platform's site-icon setting, or `null`.
 *
 * Fail-soft exactly like `readDesignTokens`: no client, an unreachable gateway, a timeout and a
 * response that is not the documented shape all end in `null` and **one** warning, so a theme keeps
 * deploying with the icon files it ships. A well-formed answer with `iconUrl: null` is **not** a
 * failure — it is the normal "nothing set" state — and warns nothing.
 */
export async function readSiteIcons(
  reader: SiteIconsReader | null,
  warn: (message: string) => void = console.warn
): Promise<SiteIconsSetting | null> {
  const read = reader === null ? { setting: null, cause: null } : await readOrNull(reader);
  if (read.setting === null) {
    warn(read.cause === null ? SITE_ICONS_WARNING : `${SITE_ICONS_WARNING} (${read.cause})`);
    return null;
  }
  return read.setting;
}

async function readOrNull(
  reader: SiteIconsReader
): Promise<{ setting: SiteIconsSetting | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/site-icons',
      signal: controller.signal,
    });
    const setting = toSiteIconsSetting(response);
    return {
      setting,
      cause: setting === null ? 'the platform published an unusable response' : null,
    };
  } catch (error) {
    return { setting: null, cause: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Accepts only a whole answer; half of an untrusted response never reaches a generated file. */
function toSiteIconsSetting(value: unknown): SiteIconsSetting | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.revision !== 'number' || !Number.isFinite(record.revision)) return null;
  const { iconUrl, backgroundColor, themeColor, shortName } = record;
  if (iconUrl !== null && typeof iconUrl !== 'string') return null;
  if (typeof backgroundColor !== 'string' || !HEX_COLOR.test(backgroundColor)) return null;
  if (themeColor !== null && (typeof themeColor !== 'string' || !HEX_COLOR.test(themeColor))) {
    return null;
  }
  if (shortName !== null && typeof shortName !== 'string') return null;
  const icons = toSiteIconUrls(record.icons);
  if (icons === undefined) return null;
  // An icon URL with no variants (or the reverse) is half an answer: treat it as unusable.
  if ((iconUrl === null || iconUrl === '') !== (icons === null)) return null;
  return {
    revision: record.revision,
    iconUrl: iconUrl === '' ? null : iconUrl,
    backgroundColor: backgroundColor.toLowerCase(),
    themeColor: themeColor === null ? null : themeColor.toLowerCase(),
    shortName: shortName === null ? null : truncateRunes(shortName.trim(), SHORT_NAME_MAX) || null,
    icons,
  };
}

/** `null` for "no icons", the URLs for a whole set of https (or loopback http) strings, `undefined` otherwise. */
function toSiteIconUrls(value: unknown): SiteIconUrls | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const urls: Partial<SiteIconUrls> = {};
  for (const key of ICON_URL_KEYS) {
    const url = record[key];
    if (typeof url !== 'string' || !isAbsoluteHttpUrl(url)) return undefined;
    urls[key] = url;
  }
  return urls as SiteIconUrls;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    if (protocol === 'https:') return true;
    // Plain http would be blocked as mixed content on an https storefront; loopback is for dev/mocks.
    return (
      protocol === 'http:' &&
      (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

/** The values the generated files and tags are made from, defaults filled in. */
export interface ResolvedSiteIcons {
  iconUrl: string;
  icons: SiteIconUrls;
  backgroundColor: string;
  /** `null` when neither the setting nor the theme gives one — the meta tag is then omitted. */
  themeColor: string | null;
  /** `null` when neither the setting nor a site name gives one. */
  shortName: string | null;
  name: string | null;
}

/**
 * Fills in the defaults Core deliberately does not store: the theme colour falls back to the
 * theme's primary design token, the short name to the site name (cut to Android's limit). `null`
 * when no icon is set, which is the signal to leave the theme's own files alone.
 */
export function resolveSiteIcons(
  setting: SiteIconsSetting | null,
  defaults: { siteName?: string | null; primaryToken?: string | null }
): ResolvedSiteIcons | null {
  if (setting === null || setting.iconUrl === null || setting.icons === null) return null;
  const siteName = defaults.siteName?.trim() || null;
  const primary = defaults.primaryToken ?? null;
  const name = siteName ?? setting.shortName;
  return {
    iconUrl: setting.iconUrl,
    icons: setting.icons,
    backgroundColor: setting.backgroundColor,
    themeColor:
      setting.themeColor ?? (primary !== null && HEX_COLOR.test(primary) ? primary : null),
    shortName: setting.shortName ?? (siteName === null ? null : truncateRunes(siteName, 12)),
    name,
  };
}

function truncateRunes(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('').trim();
}
