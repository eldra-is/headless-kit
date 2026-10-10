import type { EldraClient } from '@eldrajs/sdk';
import {
  isForbiddenLocaleTag,
  resolveMessageCatalogue,
  type ThemeMessages,
} from '@eldrajs/theme-core/i18n';
import type { StoreLocales } from './locales';

/**
 * What `virtual:eldra/messages` reaches a theme as, on `context.messages`: the manifest's own
 * message catalogue (or the fallback catalogue, for a theme with no `i18n/` directory), merged
 * with the platform's theme-message overrides and resolved over the organisation's locales — see
 * `resolveSiteMessages` below, the one place this module calls the theme-core helper.
 *
 * Re-exported from `@eldrajs/theme-core/i18n` under the name this package's own reads use, the
 * same way `./commerce.ts`/`./locales.ts` alias the SDK's organisation types.
 */
export type { ThemeMessages };

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it.
 * Narrow on purpose, like `StoreCommerceReader`/`StoreLocalesReader`: it is what lets this read's
 * own tests hand it a client that answers, omits or throws with no gateway anywhere near them.
 *
 * `request` rather than a `features.*` method: the public route this reads
 * (`GET /site/v1/theme-messages`) is a **site**-module read, not an organisation-feature one, so
 * there is no typed `EldraFeatureClient` method for it to call through — the client's own generic
 * escape hatch carries the same base URL, org header and retry policy every other read here uses.
 */
export interface ThemeMessagesReader {
  request: EldraClient['request'];
}

/**
 * The one line a build prints when it could not read the platform's theme-message overrides. Said
 * unconditionally whenever the read comes back `null` — absent gateway credentials included — the
 * same discipline `commerce.ts`'s `NO_CURRENCY_WARNING` follows and for the same reason: "serving
 * the theme's own defaults" is the real, useful thing to know happened, not a fault to hide.
 */
export const THEME_MESSAGES_WARNING =
  '[eldra] could not read the platform’s theme-message overrides — serving the theme’s own defaults';

/**
 * How long the build waits for the answer. A bound rather than none, for the same reason
 * `commerce.ts`/`locales.ts` have one: this read is optional, and a theme-message override nobody
 * can fetch must not be the reason a deploy never finishes.
 *
 * Exported so the test that proves the bound can assert the value rather than restate it.
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The platform's theme-message overrides for the build-time merge, or `null`.
 *
 * Fail-soft by construction, exactly like `readStoreCommerce`: a gateway that cannot be reached, a
 * read that times out, a response that is not the shape the gateway documents, and a site built
 * with no gateway credentials at all end the same way — `null` and **one** warning — so a theme
 * keeps deploying while serving its own default texts.
 */
export async function readThemeMessages(
  reader: ThemeMessagesReader | null,
  warn: (message: string) => void = console.warn
): Promise<ThemeMessages | null> {
  const read = reader === null ? { messages: null, cause: null } : await readOrNull(reader);
  if (read.messages === null) {
    warn(
      read.cause === null ? THEME_MESSAGES_WARNING : `${THEME_MESSAGES_WARNING} (${read.cause})`
    );
    return null;
  }
  return read.messages;
}

async function readOrNull(
  reader: ThemeMessagesReader
): Promise<{ messages: ThemeMessages | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/theme-messages',
      signal: controller.signal,
    });
    const messages = toThemeMessages(response);
    return {
      messages,
      cause: messages === null ? 'the platform published an unusable response' : null,
    };
  } catch (error) {
    return { messages: null, cause: describe(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accepts only a whole answer: a non-empty `defaultLocale` string and a `locales` record of
 * records of strings, none of them keyed by a forbidden locale tag (`isForbiddenLocaleTag` —
 * `__proto__`/`prototype`/`constructor`, which a plain `locales[tag] = …` write would turn into a
 * prototype reassignment instead of an own property). A partial or malformed response is treated
 * as no answer at all, exactly like `toStoreCommerce`/`toStoreLocales` — half of an untrusted
 * network response must never reach the merge as if it were real theme content.
 */
function toThemeMessages(value: unknown): ThemeMessages | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { defaultLocale?: unknown; locales?: unknown };
  if (typeof record.defaultLocale !== 'string' || record.defaultLocale === '') return null;
  if (typeof record.locales !== 'object' || record.locales === null) return null;
  const locales: Record<string, Record<string, string>> = {};
  for (const tag of Object.keys(record.locales)) {
    if (isForbiddenLocaleTag(tag)) return null;
    const entry = (record.locales as Record<string, unknown>)[tag];
    if (typeof entry !== 'object' || entry === null) return null;
    const flat: Record<string, string> = {};
    for (const key of Object.keys(entry)) {
      const text = (entry as Record<string, unknown>)[key];
      if (typeof text !== 'string') return null;
      flat[key] = text;
    }
    locales[tag] = flat;
  }
  return { defaultLocale: record.defaultLocale, locales };
}

/**
 * Calls `@eldrajs/theme-core/i18n`'s `resolveMessageCatalogue` with the build-time inputs this
 * module's `resolveMessages` option needs: the theme's own manifest messages, the platform's
 * overrides (or `null`), and the organisation's locales — falling back to the theme's own
 * locales/default locale when the organisation's are unknown (no gateway, or the locales read
 * itself failed), which is what lets a **credential-less build** still produce a full key set for
 * every locale from the manifest alone.
 */
export function resolveSiteMessages(
  themeMessages: ThemeMessages,
  platform: ThemeMessages | null,
  locales: StoreLocales | null
): ThemeMessages {
  const orgLocales = locales?.supported ?? Object.keys(themeMessages.locales);
  const orgDefaultLocale = locales?.default ?? themeMessages.defaultLocale;
  return resolveMessageCatalogue(themeMessages, platform, orgLocales, orgDefaultLocale);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
