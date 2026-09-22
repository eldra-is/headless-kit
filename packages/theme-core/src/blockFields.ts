/**
 * The theme's scanned `block.json` field metadata, as `virtual:eldra/block-fields`
 * projects it. Framework-neutral: a binding's composable is a thin wrapper
 * (`@eldrajs/theme-vue`'s `useEldraBlockField`), so the registry and the lookup
 * are not re-implemented per framework.
 */
export interface BlockFieldDefinition {
  fieldId: string;
  type: string;
  /** Present (and true) only for localized fields; the virtual module omits it otherwise. */
  localized?: boolean;
  metadata?: Record<string, unknown>;
}

export type BlockFieldsMap = Record<string, BlockFieldDefinition[]>;

let registeredBlockFields: BlockFieldsMap = {};

/**
 * Registers the theme's block field metadata so `isBlockFieldLocalized` can
 * resolve it without importing a virtual module id — the SDK packages are
 * published plain and cannot resolve `virtual:eldra/block-fields` at their
 * own build time the way an app entry bundled by `@eldrajs/vite-plugin-theme`
 * can. The themed app's bootstrap (theme-nuxt's runtime plugin, or an
 * equivalent entry for another adapter) imports `virtual:eldra/block-fields`
 * and calls this once at startup with the resolved map; call it again (e.g.
 * on the plugin's HMR rescan) to replace the registered map.
 */
export function registerBlockFields(fields: BlockFieldsMap): void {
  registeredBlockFields = fields;
}

/**
 * Whether the manifest marks this block field `localized`. A rich-text
 * renderer uses it to default an omitted `locale` to the preview's active
 * content locale — a localized field's draft is keyed per locale, so the
 * marking attributes (and therefore every §18 v3 rich-text report) must carry
 * the locale the render actually used. Returns false for an unknown
 * block/field and outside a themed build.
 *
 * `metadata.toolbar` is deliberately not read here: §18 v3 keeps the toolbar
 * to Studio, which gets the control list from Core's field definitions. The
 * vite plugin still validates the ids at build time.
 */
export function isBlockFieldLocalized(apiId: string | undefined, fieldId: string): boolean {
  if (apiId === undefined) return false;
  return (
    registeredBlockFields[apiId]?.find((field) => field.fieldId === fieldId)?.localized === true
  );
}
