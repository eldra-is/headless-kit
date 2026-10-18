import type { EldraClient } from '@eldrajs/sdk';
import { siteOrigin } from '@eldrajs/theme-core';

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it. The
 * same narrow shape as `SiteIconsReader`: `GET /site/v1/crawl` is a site-module read with no typed
 * `features.*` method, so the client's generic `request` carries it.
 */
export interface CrawlReader {
  request: EldraClient['request'];
}

/** `GET /site/v1/crawl` as the platform answers it. */
export interface CrawlSetting {
  revision: number;
  /** The site's public origin (Core's production URL), or `null` when none is set. */
  siteUrl: string | null;
  /** The merchant's own `robots.txt` lines; `''` when none. */
  robotsExtra: string;
}

/** The one line a build prints when it could not read the platform's crawl settings. */
export const CRAWL_WARNING =
  '[eldra] could not read the platform’s crawl settings — robots.txt has no merchant lines and the site URL comes from ELDRA_SITE_URL';

/** How long the build waits for the answer; see `READ_TIMEOUT_MS` in `./designTokens.ts`. */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The platform's crawl settings, or `null`.
 *
 * Fail-soft exactly like `readSiteIcons`: no client, an unreachable gateway, a timeout and a
 * response that is not the documented shape all end in `null` and **one** warning, so the theme
 * keeps deploying.
 */
export async function readCrawlSettings(
  reader: CrawlReader | null,
  warn: (message: string) => void = console.warn
): Promise<CrawlSetting | null> {
  const read = reader === null ? { setting: null, cause: null } : await readOrNull(reader);
  if (read.setting === null) {
    warn(read.cause === null ? CRAWL_WARNING : `${CRAWL_WARNING} (${read.cause})`);
    return null;
  }
  return read.setting;
}

async function readOrNull(
  reader: CrawlReader
): Promise<{ setting: CrawlSetting | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/crawl',
      signal: controller.signal,
    });
    const setting = toCrawlSetting(response);
    return {
      setting,
      cause: setting === null ? 'the platform published an unusable response' : null,
    };
  } catch (error) {
    return {
      setting: null,
      cause: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Accepts only a whole answer; half of an untrusted response never reaches `robots.txt`. */
function toCrawlSetting(value: unknown): CrawlSetting | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.revision !== 'number' || !Number.isFinite(record.revision)) return null;
  let siteUrl: string | null = null;
  if (record.siteUrl !== null && record.siteUrl !== undefined) {
    if (typeof record.siteUrl !== 'string') return null;
    siteUrl = record.siteUrl.trim() === '' ? null : siteOrigin(record.siteUrl);
    if (record.siteUrl.trim() !== '' && siteUrl === null) return null;
  }
  const extra = record.robotsExtra;
  if (extra !== null && extra !== undefined && typeof extra !== 'string') return null;
  return { revision: record.revision, siteUrl, robotsExtra: extra ?? '' };
}
