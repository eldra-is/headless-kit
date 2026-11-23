import type { EldraClient } from '@eldrajs/theme-core';
import { EMPTY_THEME_MESSAGES, type ThemeMessages } from '@eldrajs/theme-core/i18n';
import type { EldraContext } from '@eldrajs/theme-vue';
import { toResolvedDesignTokens, type ThemeDesignTokens } from './designTokens';
import type { StoreLocales } from './locales';
import { resolveSiteMessages, toThemeMessages } from './messages';

/**
 * A draft preview session shows the site's **saved** design tokens and theme texts (WS-1394; the
 * owner's decision, 2026-11-23: a preview shows them as soon as they are saved). A build reads both
 * once and bakes them in (`readDesignTokens`, `readThemeMessages`), so a session's pinned build
 * carries whatever was saved when it was built. Once the published prerender is hydrated the session
 * reads both again, through the router like its CMS reads (`getSiteSetting`), and puts them where
 * the build put its own: the tokens into `context.designTokens` (which `EldraLayout`'s
 * `<style data-eldra-design-token-styles>` renders), the texts, resolved exactly as the build
 * resolves them, into `context.messages` (which the theme's i18n reads). Before the veil comes
 * down, inside the same bounded settle.
 *
 * Its own module, loaded only by a session, so a storefront's JavaScript carries none of it. Never
 * fatal: a read that fails, answers something unusable, or takes longer than
 * `SESSION_SITE_SETTINGS_TIMEOUT_MS` leaves the build's values as they are, and an answer that
 * arrives after that is dropped, so nothing changes after the veil.
 */

/** How long a session waits for the site settings before it keeps the build's. */
export const SESSION_SITE_SETTINGS_TIMEOUT_MS = 10_000;

export interface SessionSiteSettingsOptions {
  /** The theme's own catalogue (`virtual:eldra/manifest`'s `messages`), as the build merged over. */
  themeMessages: ThemeMessages | undefined;
  /** The organisation's locales the build resolved the texts over (`null`: unknown). */
  locales: StoreLocales | null;
  timeoutMs?: number;
  warn?: (message: string, cause?: unknown) => void;
}

export async function readSessionSiteSettings(
  client: Pick<EldraClient, 'getSiteSetting'>,
  context: Pick<EldraContext, 'designTokens' | 'messages'>,
  options: SessionSiteSettingsOptions
): Promise<void> {
  const read = client.getSiteSetting;
  if (typeof read !== 'function') return;
  const warn =
    options.warn ??
    ((message: string, cause?: unknown) => console.warn(`[eldra] ${message}`, cause ?? ''));
  let open = true;
  const settings = Promise.allSettled([
    read('/site/v1/design-tokens').then((answer) => {
      const tokens = toResolvedDesignTokens(answer);
      if (tokens === null) throw new Error('the platform published an unusable response');
      if (open) assignDesignTokens(context.designTokens, tokens);
    }),
    read('/site/v1/theme-messages').then((answer) => {
      const platform = toThemeMessages(answer);
      if (platform === null) throw new Error('the platform published an unusable response');
      const resolved = resolveSiteMessages(
        options.themeMessages ?? EMPTY_THEME_MESSAGES,
        platform,
        options.locales
      );
      if (open) assignMessages(context.messages, resolved);
    }),
  ]).then(([tokens, messages]) => {
    if (tokens.status === 'rejected') {
      warn('the saved design tokens could not be read; showing the build’s', tokens.reason);
    }
    if (messages.status === 'rejected') {
      warn('the saved theme texts could not be read; showing the build’s', messages.reason);
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      warn('the saved design tokens and theme texts took too long; showing the build’s');
      resolve();
    }, options.timeoutMs ?? SESSION_SITE_SETTINGS_TIMEOUT_MS);
  });
  try {
    await Promise.race([settings, bound]);
  } finally {
    open = false;
    clearTimeout(timer);
  }
}

/**
 * The saved catalog into the reactive one, in place (the context's object is the one `EldraLayout`
 * renders), in the answer's own key order, which is the order a build made from it would render.
 * An equal catalog is left alone, so a session whose tokens did not change renders nothing new.
 */
export function assignDesignTokens(target: ThemeDesignTokens, source: ThemeDesignTokens): boolean {
  if (JSON.stringify(target) === JSON.stringify(source)) return false;
  replaceRecord(target.colors, source.colors);
  replaceRecord(target.containers, source.containers);
  if (source.allowCustomColors === undefined) delete target.allowCustomColors;
  else target.allowCustomColors = source.allowCustomColors;
  return true;
}

/**
 * The resolved texts into the reactive catalogue, a locale's whole record at a time (as Studio's
 * live `editor:theme-messages` push replaces one), only where it changed. A locale the answer does
 * not resolve is left as the build had it.
 */
export function assignMessages(target: ThemeMessages, source: ThemeMessages): boolean {
  let changed = false;
  if (target.defaultLocale !== source.defaultLocale) {
    target.defaultLocale = source.defaultLocale;
    changed = true;
  }
  for (const tag of Object.keys(source.locales)) {
    const record = source.locales[tag]!;
    if (JSON.stringify(target.locales[tag]) === JSON.stringify(record)) continue;
    target.locales[tag] = record;
    changed = true;
  }
  return changed;
}

function replaceRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) delete target[key];
  for (const key of Object.keys(source)) target[key] = source[key]!;
}
