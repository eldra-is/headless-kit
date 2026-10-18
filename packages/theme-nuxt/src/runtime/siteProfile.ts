import type { EldraClient } from '@eldrajs/sdk';

/**
 * The site's public profile exactly as `GET /site/v1/site-profile` answers it (and Studio's
 * `PUT /sites/{siteId}/site-profile` stores it): what the structured data's `Organization` says
 * about the shop. Every field may be unset; the build fills the gaps (`resolveSiteProfile`).
 */
export interface SiteProfileSetting {
  revision: number;
  /** The organisation's display name, or `null` for the site name. */
  name: string | null;
  /** A logo override (absolute), or `null` for the site icon's 512 px rendering. */
  logoUrl: string | null;
  /** Social profile URLs (https). */
  sameAs: string[];
  contact: { email: string | null; telephone: string | null };
}

/** What a page's `Organization` is written from: gaps already filled, `name` never empty. */
export interface ResolvedSiteProfile {
  name: string;
  logoUrl: string | null;
  sameAs: string[];
  contact: { email: string | null; telephone: string | null };
}

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it. The
 * same narrow shape as `SiteIconsReader`: `GET /site/v1/site-profile` is a site-module read with no
 * typed `features.*` method, so the client's generic `request` carries it.
 */
export interface SiteProfileReader {
  request: EldraClient['request'];
}

/** The one line a build prints when it could not read the platform's site profile. */
export const SITE_PROFILE_WARNING =
  '[eldra] could not read the platform’s site profile — the Organization structured data uses the site name and icon only';

/** How long the build waits for the answer; see `READ_TIMEOUT_MS` in `./designTokens.ts`. */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The platform's site profile, or `null`. Fail-soft exactly like `readSiteIcons`: no client, an
 * unreachable gateway, a timeout and an answer that is not the documented shape all end in `null`
 * and **one** warning; the build still writes valid markup, from the site name and icon.
 */
export async function readSiteProfile(
  reader: SiteProfileReader | null,
  warn: (message: string) => void = console.warn
): Promise<SiteProfileSetting | null> {
  const read = reader === null ? { setting: null, cause: null } : await readOrNull(reader);
  if (read.setting === null) {
    warn(read.cause === null ? SITE_PROFILE_WARNING : `${SITE_PROFILE_WARNING} (${read.cause})`);
    return null;
  }
  return read.setting;
}

async function readOrNull(
  reader: SiteProfileReader
): Promise<{ setting: SiteProfileSetting | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/site-profile',
      signal: controller.signal,
    });
    const setting = toSiteProfile(response);
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

/** Accepts only a whole answer; half of an untrusted response never reaches a page's markup. */
function toSiteProfile(value: unknown): SiteProfileSetting | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.revision !== 'number' || !Number.isFinite(record.revision)) return null;
  const { name, logoUrl, sameAs, contact } = record;
  if (name !== null && typeof name !== 'string') return null;
  if (logoUrl !== null && typeof logoUrl !== 'string') return null;
  if (!Array.isArray(sameAs) || sameAs.some((url) => typeof url !== 'string')) return null;
  if (typeof contact !== 'object' || contact === null) return null;
  const { email, telephone } = contact as Record<string, unknown>;
  if (email !== null && typeof email !== 'string') return null;
  if (telephone !== null && typeof telephone !== 'string') return null;
  return {
    revision: record.revision,
    name: name === null ? null : name.trim() || null,
    logoUrl: logoUrl !== null && isHttpsUrl(logoUrl) ? logoUrl : null,
    // A profile link that is not https is dropped, not repaired: a wrong `sameAs` claims an
    // identity the shop may not hold.
    sameAs: (sameAs as string[]).map((url) => url.trim()).filter(isHttpsUrl),
    contact: { email: email?.trim() || null, telephone: telephone?.trim() || null },
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fills in what the profile leaves unset: the name falls back to the site name, the logo to the
 * site icon's 512 px rendering (`icon512`, not the maskable one: Google wants a logo, not a
 * padded launcher icon). Always answers, so a build whose read failed still has an Organization.
 */
export function resolveSiteProfile(
  setting: SiteProfileSetting | null,
  defaults: { siteName: string; iconLogoUrl: string | null }
): ResolvedSiteProfile {
  return {
    name: setting?.name ?? defaults.siteName,
    logoUrl: setting?.logoUrl ?? defaults.iconLogoUrl,
    sameAs: setting?.sameAs ?? [],
    contact: setting?.contact ?? { email: null, telephone: null },
  };
}
