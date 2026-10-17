/**
 * Theme ownership of block schemas, as the kit sees it.
 *
 * Core stores a theme's block schemas under `<themeId>:<blockApiId>`
 * (`soley:hero`), so two themes in one organisation never clash and a
 * merchant's own schemas can never shadow a theme's. Everything the theme
 * itself authors stays **bare**: `block.json`, the manifest's block ids, a
 * layout node's `apiId`, a slot allowlist, `data-eldra-schema` and the
 * overlay's `theme:block-clicked`. Only the wire spelling of an entry's
 * `schemaApiId` carries the prefix, so these two helpers are the whole
 * boundary.
 *
 * The prefix stripped is the one of the theme *this build is for* (injected at
 * build from the manifest's `theme.id`), never "any prefix": `catalog:product`
 * and another theme's `starter:hero` are not this theme's blocks and pass
 * through untouched.
 */

/** The grammar of a theme id (and of a block apiId): lower-case, 2 to 49 characters. */
export const THEME_ID_PATTERN = /^[a-z][a-z0-9-]{1,48}$/;

/**
 * Ids a theme may not use. Core reserves `catalog:` for catalog route targets,
 * so a theme called `catalog` would claim that namespace for its block schemas.
 */
export const RESERVED_THEME_IDS: readonly string[] = ['catalog'];

/** Wire to bare: `soley:hero` to `hero` for theme `soley`; anything else is returned as given. */
export function blockApiIdOf(schemaApiId: string, themeId: string | undefined | null): string {
  if (typeof themeId !== 'string' || themeId === '') return schemaApiId;
  const prefix = `${themeId}:`;
  return schemaApiId.startsWith(prefix) && schemaApiId.length > prefix.length
    ? schemaApiId.slice(prefix.length)
    : schemaApiId;
}

/**
 * Bare to wire: `hero` to `soley:hero` for theme `soley`. A value that already
 * carries a colon (the wire spelling, or `catalog:product`) is returned as
 * given, so the call is idempotent.
 */
export function themeSchemaApiId(blockApiId: string, themeId: string | undefined | null): string {
  if (typeof themeId !== 'string' || themeId === '' || blockApiId.includes(':')) return blockApiId;
  return `${themeId}:${blockApiId}`;
}

let registeredThemeId: string | undefined;

/** Registers the theme's own id for the lookups inside theme-core. See `registerBlockFields`. */
export function registerThemeId(themeId: string | undefined): void {
  registeredThemeId = themeId;
}

/** The registered theme id, if the app registered one. */
export function getRegisteredThemeId(): string | undefined {
  return registeredThemeId;
}

/** `blockApiIdOf` for the registered theme id; a no-op before one is registered. */
export function registeredBlockApiId(schemaApiId: string): string {
  return blockApiIdOf(schemaApiId, registeredThemeId);
}
