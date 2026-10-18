import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EldraClient } from '@eldrajs/sdk';
import { localeHref, localePathFor, type EldraLocaleRouting } from './locales';

/**
 * The slice of an `@eldrajs/sdk` client this read needs. `GET /site/v1/redirects` is a
 * site-module read with no typed `features.*` method, so the client's generic `request` carries
 * it (the same shape as `CrawlReader`).
 */
export interface RedirectsReader {
  request: EldraClient['request'];
}

/** One rule of `GET /site/v1/redirects`. */
export interface RedirectRule {
  /** A path starting with `/`, no query or fragment; a trailing `*` makes it a wildcard. */
  source: string;
  /** A path starting with `/` (`:splat` allowed after a wildcard source) or an absolute http(s) URL. */
  destination: string;
  status: 301 | 302;
  /** Also applies under every locale prefix; this build expands it into one rule per locale. */
  applyToLocales: boolean;
}

/** `GET /site/v1/redirects` as the platform answers it. */
export interface RedirectsSetting {
  revision: number;
  rules: RedirectRule[];
}

/** The one line a build prints when it could not read the platform's redirects. */
export const REDIRECTS_WARNING =
  '[eldra] could not read the platform’s redirects — the site ships only the theme’s own public/_redirects';

/** How long the build waits for the answer; see `READ_TIMEOUT_MS` in `./designTokens.ts`. */
export const READ_TIMEOUT_MS = 10_000;

/** Cloudflare Pages' limits on one `_redirects` file: 2,000 static rules and 100 dynamic ones. */
export const MAX_STATIC_REDIRECTS = 2000;
export const MAX_DYNAMIC_REDIRECTS = 100;
/** …and 1,000 characters per line. */
const MAX_LINE_LENGTH = 1000;

export const REDIRECTS_BEGIN = '# BEGIN eldra platform redirects (generated, edit them in Studio)';
export const REDIRECTS_END = '# END eldra platform redirects';

/**
 * The platform's redirect rules, or `null`.
 *
 * Fail-soft exactly like `readCrawlSettings`: no client, an unreachable gateway, a timeout and a
 * response that is not the documented shape all end in `null` and **one** warning, so the theme
 * keeps deploying. A site without rules answers `rules: []`, which is an answer, not a failure.
 */
export async function readRedirects(
  reader: RedirectsReader | null,
  warn: (message: string) => void = console.warn
): Promise<RedirectsSetting | null> {
  if (reader === null) {
    warn(REDIRECTS_WARNING);
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/redirects',
      signal: controller.signal,
    });
    const setting = toRedirectsSetting(response);
    if (setting === null) {
      warn(`${REDIRECTS_WARNING} (the platform published an unusable response)`);
    }
    return setting;
  } catch (error) {
    warn(`${REDIRECTS_WARNING} (${error instanceof Error ? error.message : String(error)})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Accepts only a whole answer: one malformed rule makes the response unusable. */
function toRedirectsSetting(value: unknown): RedirectsSetting | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.revision !== 'number' || !Number.isFinite(record.revision)) return null;
  if (!Array.isArray(record.rules)) return null;
  const rules: RedirectRule[] = [];
  for (const raw of record.rules) {
    if (typeof raw !== 'object' || raw === null) return null;
    const rule = raw as Record<string, unknown>;
    if (typeof rule.source !== 'string' || typeof rule.destination !== 'string') return null;
    if (rule.status !== 301 && rule.status !== 302) return null;
    rules.push({
      source: rule.source,
      destination: rule.destination,
      status: rule.status,
      applyToLocales: rule.applyToLocales === true,
    });
  }
  return { revision: record.revision, rules };
}

/** A `_redirects` rule is dynamic (counts against the 100 cap) when it has a wildcard or placeholder. */
function isDynamic(source: string): boolean {
  return source.includes('*') || /:[A-Za-z]/.test(source);
}

/** A field of a `_redirects` line is whitespace-delimited, so none may hold whitespace. */
function isPlainField(value: string): boolean {
  return value !== '' && !/\s/.test(value);
}

function isDestination(value: string): boolean {
  if (!isPlainField(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A line of the theme's own `_redirects` file that is a rule (not blank, not a comment). */
function isRuleLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== '' && !trimmed.startsWith('#');
}

/** The path the deploy's post-deploy check fetches; a redirect matching it fails every deploy. */
export const MANIFEST_URL_PATH = '/.eldra/manifest.json';

/**
 * Whether a `_redirects` source would match `/.eldra/manifest.json`. Same semantics as the
 * deploy validator: `*` matches anything, `:name` matches one segment, the rest is literal.
 */
export function matchesManifestPath(source: string): boolean {
  if (!source.startsWith('/')) return false;
  const pattern = source
    .split(/(\*|:[A-Za-z_]\w*)/)
    .map((part) =>
      part === '*'
        ? '.*'
        : /^:[A-Za-z_]/.test(part)
          ? '[^/]*'
          : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('');
  return new RegExp(`^${pattern}$`).test(MANIFEST_URL_PATH);
}

export interface RedirectsFile {
  /** The whole file, ready to write; `null` when there is nothing to write. */
  content: string | null;
  /** Rules written (after locale expansion). */
  written: number;
  /** One line per thing dropped and why; empty when nothing was. */
  warnings: string[];
}

/**
 * The `_redirects` file a build writes: the platform's rules between two marker comments, first,
 * then the theme's own `public/_redirects` unchanged, so what a merchant sets in Studio is
 * evaluated before the theme's catch-alls.
 *
 *  * `applyToLocales` is expanded here, into one extra rule per **prefixed** locale (the default
 *    locale is the unprefixed rule itself); a destination that is a site path gets the same
 *    prefix, an absolute URL is left alone.
 *  * Exact rules go before wildcards, wildcards longest first (the order Core resolves them in),
 *    because Cloudflare Pages takes the first match.
 *  * Cloudflare Pages caps a file at 2,000 static and 100 dynamic rules; the theme's own rules
 *    count first, then the platform's expanded ones fill what is left, in that order, and every
 *    rule over a cap is dropped with one warning rather than failing the deploy.
 */
export function buildRedirectsFile(
  rules: readonly RedirectRule[],
  routing: EldraLocaleRouting,
  themeContent: string | null = null
): RedirectsFile {
  const warnings: string[] = [];
  let themeDropped = false;
  if (themeContent !== null) {
    const kept: string[] = [];
    for (const line of themeContent.split(/\r?\n/)) {
      const source = isRuleLine(line) ? (line.trim().split(/\s+/)[0] ?? '') : '';
      if (source !== '' && matchesManifestPath(source)) {
        themeDropped = true;
        warnings.push(
          `[eldra] theme redirect ${JSON.stringify(source)} dropped: it would match ${MANIFEST_URL_PATH}, which the deploy needs`
        );
      } else kept.push(line);
    }
    if (themeDropped) themeContent = kept.join('\n');
  }
  const themeLines = (themeContent ?? '').split(/\r?\n/).filter(isRuleLine);
  let staticLeft = MAX_STATIC_REDIRECTS;
  let dynamicLeft = MAX_DYNAMIC_REDIRECTS;
  for (const line of themeLines) {
    const source = line.trim().split(/\s+/)[0] ?? '';
    if (isDynamic(source)) dynamicLeft -= 1;
    else staticLeft -= 1;
  }

  const expanded: RedirectRule[] = [];
  const seen = new Set<string>();
  const push = (rule: RedirectRule): void => {
    if (seen.has(rule.source)) return;
    seen.add(rule.source);
    expanded.push(rule);
  };
  for (const rule of rules) {
    if (
      !rule.source.startsWith('/') ||
      !isPlainField(rule.source) ||
      !isDestination(rule.destination)
    ) {
      warnings.push(`[eldra] redirect ${JSON.stringify(rule.source)} skipped: not a valid rule`);
      continue;
    }
    if (matchesManifestPath(rule.source)) {
      warnings.push(
        `[eldra] redirect ${JSON.stringify(rule.source)} dropped: it would match ${MANIFEST_URL_PATH}, which the deploy needs`
      );
      continue;
    }
    push(rule);
    if (rule.applyToLocales) {
      for (const locale of routing.prefixed) {
        const source = localePathFor(rule.source, locale, routing);
        if (matchesManifestPath(source)) {
          warnings.push(
            `[eldra] redirect ${JSON.stringify(source)} dropped: it would match ${MANIFEST_URL_PATH}, which the deploy needs`
          );
          continue;
        }
        push({
          ...rule,
          source,
          destination: rule.destination.startsWith('/')
            ? localeHref(rule.destination, locale, routing)
            : rule.destination,
        });
      }
    }
  }

  const exact = expanded.filter((rule) => !isDynamic(rule.source));
  const wildcards = expanded
    .filter((rule) => isDynamic(rule.source))
    .sort((a, b) => b.source.length - a.source.length);
  const lines: string[] = [];
  let droppedStatic = 0;
  let droppedDynamic = 0;
  for (const rule of [...exact, ...wildcards]) {
    const line = `${rule.source} ${rule.destination} ${rule.status}`;
    if (line.length > MAX_LINE_LENGTH) {
      warnings.push(`[eldra] redirect ${JSON.stringify(rule.source)} skipped: line too long`);
    } else if (isDynamic(rule.source)) {
      if (dynamicLeft > 0) {
        dynamicLeft -= 1;
        lines.push(line);
      } else droppedDynamic += 1;
    } else if (staticLeft > 0) {
      staticLeft -= 1;
      lines.push(line);
    } else droppedStatic += 1;
  }
  if (droppedStatic > 0) {
    warnings.push(
      `[eldra] ${droppedStatic} static redirect(s) dropped: Cloudflare Pages allows ${MAX_STATIC_REDIRECTS} per site, including the theme’s own and the locale expansion`
    );
  }
  if (droppedDynamic > 0) {
    warnings.push(
      `[eldra] ${droppedDynamic} wildcard redirect(s) dropped: Cloudflare Pages allows ${MAX_DYNAMIC_REDIRECTS} per site, including the theme’s own and the locale expansion`
    );
  }

  if (lines.length === 0) {
    // The theme's own file only needs writing when a rule was stripped from it.
    const content =
      themeDropped && themeContent!.trim() !== '' ? `${themeContent!.trimEnd()}\n` : '';
    return { content: themeDropped ? content : null, written: 0, warnings };
  }
  const platform = [REDIRECTS_BEGIN, ...lines, REDIRECTS_END].join('\n');
  const theme = themeContent === null ? '' : `\n${themeContent.trimEnd()}\n`;
  return { content: `${platform}\n${theme}`, written: lines.length, warnings };
}

/** The theme's own `public/_redirects`, or `null` when it ships none. */
export function readThemeRedirects(themePublicDir: string): string | null {
  const path = join(themePublicDir, '_redirects');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
