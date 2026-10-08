/**
 * Framework-free message-catalogue helpers shared by `@eldrajs/vite-plugin-theme` (the manifest
 * scanner), `@eldrajs/theme-nuxt` (the build-time merge over the public platform read) and the
 * starter's `vue-i18n` wiring.
 *
 * `ThemeMessages` mirrors `@eldrajs/vite-plugin-theme`'s own type of the same name byte for byte —
 * `{ defaultLocale, locales: Record<tag, Record<key, string>> }`, flat dotted keys — but this
 * package cannot import that one (`vite-plugin-theme` depends on `theme-core`, never the other way
 * round), so it declares its own. The two are structurally interchangeable; nothing here converts
 * between them because nothing needs to.
 */

/** The theme's own message catalogue, or the result of merging/resolving one — flat dotted keys,
 * one record per locale tag. See the module doc comment for why this is declared here rather than
 * imported from `@eldrajs/vite-plugin-theme`. */
export interface ThemeMessages {
  defaultLocale: string;
  locales: Record<string, Record<string, string>>;
}

/** The fallback catalogue: what a theme with no `i18n/` directory (or no messages at all) serves
 * on `virtual:eldra/messages`. Matches `@eldrajs/vite-plugin-theme`'s own `EMPTY_MESSAGES`
 * literal. */
export const EMPTY_THEME_MESSAGES: ThemeMessages = { defaultLocale: 'en-US', locales: {} };

// Never let a flattened/unflattened key, or a locale tag, touch the prototype chain — the same
// concern `designTokens.ts`'s own `FORBIDDEN_KEYS` guards against, for the same reason: these
// records originate in theme/platform data this package does not control the validation of.
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Whether `tag` is one of the three names (`__proto__`, `prototype`, `constructor`) that, used as
 * an object key, reassigns something other than an own property — a locale tag's own obvious risk,
 * since it is written straight through to a record keyed by it. Exported so every consumer of an
 * untrusted locale tag (a platform's JSON response, a Studio `postMessage` payload) shares the one
 * definition instead of hand-rolling the same three-name set again.
 */
export function isForbiddenLocaleTag(tag: string): boolean {
  return FORBIDDEN_KEYS.has(tag);
}

/**
 * Sanitizes one locale's raw message record from an untrusted source: `null` when `tag` itself is
 * forbidden (`isForbiddenLocaleTag`) — the caller drops the whole locale rather than let a write
 * through it corrupt an object's prototype — otherwise a copy holding only `value`'s own
 * string-valued keys, sorted, with any of the same forbidden names dropped at that level too.
 * Shared by `@eldrajs/theme-vue` (`applyThemeMessages`, a live bridge payload) and
 * `@eldrajs/theme-nuxt` (`toThemeMessages`, a platform response) instead of each re-implementing
 * the same guard with its own, possibly drifting, level of protection.
 */
export function sanitizeLocaleMessages(
  tag: string,
  value: Record<string, unknown>
): Record<string, string> | null {
  if (isForbiddenLocaleTag(tag)) return null;
  return sortedStringRecord(value);
}

/**
 * Flattens a nested object of strings (vue-i18n's own on-disk shape) into dotted keys
 * (`header.menu`, `cart.empty.title`) — the manifest's and the platform's own wire shape.
 *
 * Lenient, not validating: a leaf that is not a string (a number, a boolean, `null`, an array) is
 * skipped rather than thrown on, and so is any segment named `__proto__`/`prototype`/`constructor`.
 * Key grammar/length and value-length bounds are `@eldrajs/vite-plugin-theme`'s `scanTheme` job, at
 * the one place theme content is first accepted; this helper is a pure structural transform over
 * data that has already passed (or is about to be re-serialized from) that boundary.
 */
export function flattenMessages(nested: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  flattenInto(nested, '', out);
  return out;
}

function flattenInto(node: Record<string, unknown>, prefix: string, out: Record<string, string>): void {
  for (const key of Object.keys(node)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const value = node[key];
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') {
      out[path] = value;
    } else if (isPlainObject(value)) {
      flattenInto(value, path, out);
    }
    // Any other leaf type (number, boolean, null, array) is silently dropped: see the doc comment.
  }
}

/**
 * The inverse of `flattenMessages`: dotted keys back into vue-i18n's nested shape, so a consumer
 * (the starter's `vue-i18n` plugin) can hand `setLocaleMessage` an object it understands rather
 * than a flat `virtual:eldra/messages` record.
 *
 * Keys are applied in sorted order, so a would-be conflict between a shallower and a deeper key
 * (`"a"` and `"a.b"`, which cannot both come from one real nested JSON file but could in principle
 * meet here after a merge) resolves deterministically: the deeper key's object wins, replacing
 * whatever the shallower one wrote. Round-trips with `flattenMessages` for any catalogue that has
 * no such conflict, which every catalogue `@eldrajs/vite-plugin-theme` has validated satisfies.
 */
export function unflattenMessages(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(flat).sort((a, b) => a.localeCompare(b))) {
    const parts = key.split('.');
    if (parts.some((part) => FORBIDDEN_KEYS.has(part) || part === '')) continue;
    let node = out;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index]!;
      if (!isPlainObject(node[part])) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = flat[key];
  }
  return out;
}

/**
 * Merges a platform's theme-message overrides over the theme's own manifest defaults: **platform
 * wins per key**, and a locale the theme never shipped is added **whole** — Studio may translate a
 * key set the theme only declared for its own locales into a locale nobody on the theme side ever
 * wrote a file for.
 *
 * `themeDefaults.defaultLocale` is carried through unchanged: it names the theme's own default
 * locale, the last tier of `resolveMessageCatalogue`'s fallback chain, and merging never changes
 * which locale that is (the platform's own response, when one exists, carries the *organisation's*
 * default locale under the same field name — a different concept, threaded separately into
 * `resolveMessageCatalogue` as `orgDefaultLocale`).
 *
 * `platform: null` (no gateway, or the read failed) is the identity merge: a clone of
 * `themeDefaults`, unchanged.
 */
export function mergeMessageCatalogues(
  themeDefaults: ThemeMessages,
  platform: ThemeMessages | null
): ThemeMessages {
  if (platform === null) {
    return { defaultLocale: themeDefaults.defaultLocale, locales: cloneLocales(themeDefaults.locales) };
  }
  const tags = new Set([...Object.keys(themeDefaults.locales), ...Object.keys(platform.locales)]);
  const locales: Record<string, Record<string, string>> = {};
  for (const tag of [...tags].sort((a, b) => a.localeCompare(b))) {
    if (isForbiddenLocaleTag(tag)) continue;
    const theme = themeDefaults.locales[tag];
    const override = platform.locales[tag];
    // One expression covers both cases: a locale the theme never shipped has no `theme` object to
    // spread, so `override` alone survives — added whole, exactly as a locale both sides ship has
    // `override`'s keys win per key, since its spread runs *after* `theme`'s.
    locales[tag] = sortedStringRecord({ ...theme, ...override });
  }
  return { defaultLocale: themeDefaults.defaultLocale, locales };
}

/**
 * Implements the contract's five-tier per-key fallback, to the letter:
 * `override(locale) → theme(locale) → override(orgDefault) → theme(orgDefault) → theme(themeDefault)`.
 *
 * Takes `themeDefaults` and `platform` **separately** — not only a pre-merged catalogue — because
 * tier 5 is explicitly `theme(themeDefault)` with **no** accompanying override tier: every other
 * locale gets both an override and a theme tier, but the terminal safety net deliberately does
 * not, so an override on the theme's own default locale must never leak into a key that falls all
 * the way through to tier 5 for an unrelated locale. Tiers 1–4 *do* collapse into two
 * locale-level lookups, since `mergeMessageCatalogues(themeDefaults, platform)` already fuses
 * override and theme per locale:
 *
 *  1. `merged.locales[orgLocale]` — tiers 1+2 (the organisation's own locale, platform override or
 *     theme default, whichever the merge kept);
 *  2. `merged.locales[orgDefaultLocale]` — tiers 3+4;
 *  3. `themeDefaults.locales[themeDefaults.defaultLocale]` — tier 5, the theme's own shipped
 *     default-locale value, read from the **unmerged** input, never the platform's override of it.
 *
 * The full key set is the theme's own default-locale keys: every override is validated (Core's
 * `UNKNOWN_KEY`) against that set before it can reach this function, so no key anywhere in the
 * merged catalogue ever falls outside it. Every `orgLocale` — plus `orgDefaultLocale` itself, added
 * even if the caller's list omitted it — comes back with that full key set, which is what lets a
 * **credential-less build** (`platform: null` going in) still produce a complete catalogue for
 * every locale from the manifest alone.
 */
export function resolveMessageCatalogue(
  themeDefaults: ThemeMessages,
  platform: ThemeMessages | null,
  orgLocales: readonly string[],
  orgDefaultLocale: string
): ThemeMessages {
  const merged = mergeMessageCatalogues(themeDefaults, platform);
  const themeDefault = sortedStringRecord(themeDefaults.locales[themeDefaults.defaultLocale] ?? {});
  const keys = Object.keys(themeDefault).sort((a, b) => a.localeCompare(b));
  const orgDefault = merged.locales[orgDefaultLocale];
  const tags = new Set(orgLocales);
  tags.add(orgDefaultLocale); // every organisation carries at least its own default locale
  const locales: Record<string, Record<string, string>> = {};
  for (const tag of [...tags].sort((a, b) => a.localeCompare(b))) {
    if (isForbiddenLocaleTag(tag)) continue;
    const own = merged.locales[tag];
    const resolved: Record<string, string> = {};
    for (const key of keys) {
      const value = own?.[key] ?? orgDefault?.[key] ?? themeDefault[key];
      if (value !== undefined) resolved[key] = value;
    }
    locales[tag] = resolved;
  }
  return { defaultLocale: orgDefaultLocale, locales };
}

function cloneLocales(
  locales: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const tag of Object.keys(locales).sort((a, b) => a.localeCompare(b))) {
    if (isForbiddenLocaleTag(tag)) continue;
    out[tag] = sortedStringRecord(locales[tag] ?? {});
  }
  return out;
}

function sortedStringRecord(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const entry = value[key];
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
