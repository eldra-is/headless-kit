import type { EldraClient } from '@eldrajs/sdk';
import { SEO_SYNTAX, type SeoLocaleMap, type SeoSetting } from '@eldrajs/theme-core';

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it. The
 * same narrow shape as `SiteIconsReader`: `GET /site/v1/seo` is a site-module read with no typed
 * `features.*` method, so the client's generic `request` carries it.
 */
export interface SeoReader {
  request: EldraClient['request'];
}

/** The one line a build prints when it could not read the platform's SEO settings. */
export const SEO_WARNING =
  '[eldra] could not read the platform’s SEO settings — page titles use the default pattern';

/** How long the build waits for the answer; see `READ_TIMEOUT_MS` in `./designTokens.ts`. */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The platform's SEO setting, or `null`.
 *
 * Fail-soft exactly like `readSiteIcons`: no client, an unreachable gateway, a timeout and a
 * response that is not the documented shape (including a pattern syntax this kit does not know)
 * all end in `null` and **one** warning, so the theme keeps deploying with the default title
 * pattern.
 */
export async function readSeo(
  reader: SeoReader | null,
  warn: (message: string) => void = console.warn
): Promise<SeoSetting | null> {
  const read = reader === null ? { setting: null, cause: null } : await readOrNull(reader);
  if (read.setting === null) {
    warn(read.cause === null ? SEO_WARNING : `${SEO_WARNING} (${read.cause})`);
    return null;
  }
  return read.setting;
}

async function readOrNull(
  reader: SeoReader
): Promise<{ setting: SeoSetting | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/seo',
      signal: controller.signal,
    });
    const setting = toSeoSetting(response);
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

/** Accepts only a whole answer; half of an untrusted response never reaches a page's head. */
function toSeoSetting(value: unknown): SeoSetting | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (typeof record.revision !== 'number' || !Number.isFinite(record.revision)) return null;
  if (record.syntax !== SEO_SYNTAX) return null;
  const site = asRecord(record.site);
  const templates = asRecord(record.templates);
  if (site === null || templates === null) return null;

  const titlePattern = toLocaleMap(site.titlePattern);
  const description = toLocaleMap(site.description);
  if (titlePattern === null || description === null) return null;
  const name = optionalText(site.name);
  const imageAssetId = optionalText(site.imageAssetId);
  const imageUrl = optionalText(site.imageUrl);
  const twitterHandle = optionalText(site.twitterHandle);
  if (
    name === undefined ||
    imageAssetId === undefined ||
    imageUrl === undefined ||
    twitterHandle === undefined
  ) {
    return null;
  }

  const byContext: SeoSetting['templates'] = Object.create(null) as SeoSetting['templates'];
  for (const [context, raw] of Object.entries(templates)) {
    const entry = asRecord(raw);
    if (entry === null) return null;
    const patterns: SeoSetting['templates'][string] = {};
    if (entry.titlePattern !== undefined) {
      const map = toLocaleMap(entry.titlePattern);
      if (map === null) return null;
      patterns.titlePattern = map;
    }
    if (entry.descriptionPattern !== undefined) {
      const map = toLocaleMap(entry.descriptionPattern);
      if (map === null) return null;
      patterns.descriptionPattern = map;
    }
    byContext[context] = patterns;
  }

  return {
    revision: record.revision,
    syntax: SEO_SYNTAX,
    site: { name, titlePattern, description, imageAssetId, imageUrl, twitterHandle },
    templates: byContext,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** `null` is a valid answer (unset) and becomes `null`; anything else but a string is `undefined` (refused). */
function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? null : text;
}

function toLocaleMap(value: unknown): SeoLocaleMap | null {
  if (value === null || value === undefined) return {};
  const record = asRecord(value);
  if (record === null) return null;
  const map: SeoLocaleMap = Object.create(null) as SeoLocaleMap;
  for (const [locale, text] of Object.entries(record)) {
    if (typeof text !== 'string') return null;
    map[locale] = text;
  }
  return map;
}
