import type { EldraClient } from '@eldrajs/sdk';
import { normalizeThemeDesignTokens, type ThemeDesignTokens } from '@eldrajs/theme-core';

/**
 * Re-exported from `@eldrajs/theme-core` under the name this package's own reads use, the same way
 * `./commerce.ts`/`./locales.ts` alias the SDK's organisation types and `./messages.ts` aliases
 * `ThemeMessages`.
 */
export type { ThemeDesignTokens };

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it.
 * Narrow on purpose, like `ThemeMessagesReader`: it is what lets this read's own tests hand it a
 * client that answers, omits or throws with no gateway anywhere near them.
 *
 * `request` rather than a `features.*` method: the public route this reads
 * (`GET /site/v1/design-tokens`) is a **site**-module read, not an organisation-feature one, so
 * there is no typed `EldraFeatureClient` method for it to call through — the client's own generic
 * escape hatch carries the same base URL, org header and retry policy every other read here uses.
 */
export interface DesignTokensReader {
  request: EldraClient['request'];
}

/**
 * The one line a build prints when it could not read the platform's design-token overrides. Said
 * unconditionally whenever the read comes back `null` — absent gateway credentials included — the
 * same discipline `THEME_MESSAGES_WARNING`/`NO_CURRENCY_WARNING` follow and for the same reason:
 * "serving the theme's own tokens" is the real, useful thing to know happened, not a fault to hide.
 */
export const DESIGN_TOKENS_WARNING =
  '[eldra] could not read the platform’s design-token overrides — serving the theme’s own tokens';

/**
 * How long the build waits for the answer. A bound rather than none, for the same reason
 * `messages.ts`/`commerce.ts`/`locales.ts` have one: this read is optional, and a design-token
 * override nobody can fetch must not be the reason a deploy never finishes.
 *
 * Exported so the test that proves the bound can assert the value rather than restate it.
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The platform's resolved design-token catalog for the build-time merge, or `null`.
 *
 * Fail-soft by construction, exactly like `readThemeMessages`: a gateway that cannot be reached, a
 * read that times out, a response that is not the shape the gateway documents and a site built with
 * no gateway credentials at all end the same way — `null` and **one** warning — so a theme keeps
 * deploying while serving its own tokens.
 */
export async function readDesignTokens(
  reader: DesignTokensReader | null,
  warn: (message: string) => void = console.warn
): Promise<ThemeDesignTokens | null> {
  const read = reader === null ? { tokens: null, cause: null } : await readOrNull(reader);
  if (read.tokens === null) {
    warn(read.cause === null ? DESIGN_TOKENS_WARNING : `${DESIGN_TOKENS_WARNING} (${read.cause})`);
    return null;
  }
  return read.tokens;
}

async function readOrNull(
  reader: DesignTokensReader
): Promise<{ tokens: ThemeDesignTokens | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.request<unknown>({
      path: '/site/v1/design-tokens',
      signal: controller.signal,
    });
    const tokens = toResolvedDesignTokens(response);
    return {
      tokens,
      cause: tokens === null ? 'the platform published an unusable response' : null,
    };
  } catch (error) {
    return { tokens: null, cause: describe(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accepts only a whole answer: the contract shape `{ revision, resolved }`, `resolved` normalized
 * through `normalizeThemeDesignTokens` the same way a theme's own `tokens.json` is. A partial or
 * malformed response — a missing `revision`, a `resolved` that fails the theme's own validation —
 * is treated as no answer at all, exactly like `toThemeMessages`/`toStoreCommerce`: half of an
 * untrusted network response must never reach the generated CSS or the runtime context as if it
 * were real theme content.
 */
function toResolvedDesignTokens(value: unknown): ThemeDesignTokens | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { revision?: unknown; resolved?: unknown };
  if (typeof record.revision !== 'number' || !Number.isFinite(record.revision)) return null;
  if (typeof record.resolved !== 'object' || record.resolved === null) return null;
  try {
    return normalizeThemeDesignTokens(record.resolved);
  } catch {
    return null;
  }
}

/**
 * The platform's design-token catalog as it reaches the running site on
 * `runtimeConfig.public.eldra.designTokens` — already `normalizeThemeDesignTokens`'d at build time
 * (this is `readDesignTokens`'s own answer, round-tripped through the runtime config payload), or
 * `null`.
 *
 * Re-validates rather than trusting the payload outright, for the same reason
 * `toStoreLocales`/`resolveStoreLocales` do: this is also what reads the value back out in the
 * browser, where it arrives as whatever Nitro serialised — `''` for an absent one, same as
 * `commerce`/`locale`. A value that fails the theme's own validation is treated exactly like an
 * absent one, so the runtime plugin's own fallback to the manifest's tokens is the only thing that
 * ever reaches `context.designTokens`.
 */
export function resolveSiteDesignTokens(value: unknown): ThemeDesignTokens | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    return normalizeThemeDesignTokens(value);
  } catch {
    return null;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
