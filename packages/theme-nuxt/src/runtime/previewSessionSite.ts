import type { EldraClient, EldraSiteReadPath } from '@eldrajs/theme-core';
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
 * fatal: a read that fails or answers something unusable leaves the build's values as they are.
 * The bound is the caller's, around this chunk's load and these reads together
 * (`settlePreviewSessionSiteSettings`): past it, `isOpen` answers `false` and a late answer is
 * dropped, so nothing changes after the veil.
 */

export interface SessionSiteSettingsOptions {
  /** The theme's own catalogue (`virtual:eldra/manifest`'s `messages`), as the build merged over. */
  themeMessages: ThemeMessages | undefined;
  /** The organisation's locales the build resolved the texts over (`null`: unknown). */
  locales: StoreLocales | null;
  /**
   * Whether an answer may still be applied: `false` once the session's bound around this read has
   * passed (`settlePreviewSessionSiteSettings`), so a late answer changes nothing after the veil.
   */
  isOpen?: () => boolean;
  /**
   * Answers are applied only once this has settled: the reads start with the session, before the
   * published prerender is hydrated, and the context must not change under Vue's hydration.
   */
  applyAfter?: Promise<unknown>;
  /** Told of each read that failed (`reportPreviewSessionSiteSettingError`). */
  onError?: (error: unknown) => void;
  warn?: (message: string, cause?: unknown) => void;
}

export async function readSessionSiteSettings(
  client: Pick<EldraClient, 'getSiteSetting'>,
  context: Pick<EldraContext, 'designTokens' | 'messages'>,
  options: SessionSiteSettingsOptions
): Promise<void> {
  if (typeof client.getSiteSetting !== 'function') return;
  // Called on the client, never detached from it: a client may be a class that reads `this`.
  const read = (path: EldraSiteReadPath): Promise<unknown> => client.getSiteSetting!(path);
  const isOpen = options.isOpen ?? (() => true);
  const applyAfter = options.applyAfter ?? Promise.resolve();
  const warn =
    options.warn ??
    ((message: string, cause?: unknown) => console.warn(`[eldra] ${message}`, cause ?? ''));
  // Each read's failure is told the moment it fails, not once both have settled: a 401 here is
  // the router refusing the session and clearing its cookies, and the CMS reads after it can only
  // come back invalid, so it must be the first refusal the session hears. Never gated by `isOpen`:
  // a refusal after the bound still ends the session, as a CMS 401 while browsing does.
  const failed = (what: string) => (cause: unknown) => {
    try {
      options.onError?.(cause);
    } catch {
      // Observational: its failure must not hide the read's own.
    }
    warn(`the saved ${what} could not be read; showing the build’s`, cause);
  };
  await Promise.all([
    read('/site/v1/design-tokens')
      .then(async (answer) => {
        await applyAfter;
        const resolved = toResolvedDesignTokens(answer);
        if (resolved === null) throw new Error('the platform published an unusable response');
        if (isOpen()) assignDesignTokens(context.designTokens, resolved);
      })
      .catch(failed('design tokens')),
    read('/site/v1/theme-messages')
      .then(async (answer) => {
        await applyAfter;
        const platform = toThemeMessages(answer);
        if (platform === null) throw new Error('the platform published an unusable response');
        const resolved = resolveSiteMessages(
          options.themeMessages ?? EMPTY_THEME_MESSAGES,
          platform,
          options.locales
        );
        if (isOpen()) assignMessages(context.messages, resolved);
      })
      .catch(failed('theme texts')),
  ]);
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
