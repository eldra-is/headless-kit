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

/**
 * Resolves the manifest `type` of a block field from its dot-separated data
 * path, descending into `list` (via `metadata.item`, projected verbatim by
 * `blockFieldsModuleSource`) and `composite` (via `metadata.fields`) field
 * definitions as the path requires. A path segment that is purely digits
 * (`"0"`, `"12"`, ...) is a list array index, not a field id, and is skipped
 * rather than matched — `"items.0.variant"` resolves `variant` inside the
 * `items` list's item definition, the same shape `stegaWalk.ts`'s `walk`
 * produces for a `select` nested inside a `list`'s composite item. Trailing
 * numeric segments past a field of any other type (notably a `multiple`
 * `select`, whose resolved value is an array of `{value,label}` rather than
 * a nested `list` item schema) resolve to that field's own type — repeated
 * selected values, not a nested field. A path that runs out of matching
 * fields, or that tries to descend through non-numeric segments past a field
 * type other than `list`/`composite`, resolves to `undefined` — never a
 * guess.
 */
function resolveBlockFieldType(
  fields: BlockFieldDefinition[] | undefined,
  segments: string[]
): string | undefined {
  const [head, ...rest] = segments;
  if (head === undefined) return undefined;
  const field = fields?.find((f) => f.fieldId === head);
  if (field === undefined) return undefined;
  if (rest.length === 0) return field.type;

  if (field.type === 'list') {
    const item = field.metadata?.item;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const itemDef = item as { type?: unknown; metadata?: { fields?: unknown } };
    // The array-index segment (e.g. "0") belongs to the data shape, not the
    // field-definition tree, so it is consumed here without being matched.
    const afterIndex = /^\d+$/.test(rest[0] ?? '') ? rest.slice(1) : rest;
    if (afterIndex.length === 0) {
      return typeof itemDef.type === 'string' ? itemDef.type : undefined;
    }
    if (itemDef.type !== 'composite') return undefined;
    const itemFields = Array.isArray(itemDef.metadata?.fields)
      ? (itemDef.metadata.fields as BlockFieldDefinition[])
      : undefined;
    return resolveBlockFieldType(itemFields, afterIndex);
  }

  if (field.type === 'composite') {
    const metaFields = field.metadata?.fields;
    const compositeFields = Array.isArray(metaFields)
      ? (metaFields as BlockFieldDefinition[])
      : undefined;
    return resolveBlockFieldType(compositeFields, rest);
  }

  // Any other field type — notably a `select` with `metadata.multiple`,
  // whose resolved value is an array of `{value,label}` rather than a
  // nested `list` item schema — repeats its own leaf type across
  // purely-numeric trailing segments: those are selected-value indices, not
  // a nested field, so e.g. "tags.0" still resolves to "select".
  if (rest.every((segment) => /^\d+$/.test(segment))) return field.type;

  return undefined;
}

/**
 * Whether the manifest marks the block field at `path` (a top-level field
 * id, or a dot-separated data path reaching into a `list`'s composite item —
 * see `resolveBlockFieldType`) `type: "select"`. `encodeEntryDataStega` and
 * the public/preview read path's `{value,label}` unwrap both use this to
 * recognize a select field's resolved value (a plain string like
 * `"primary"`/`"subtle"`, or `{value,label}` before unwrapping): a
 * `Block.vue` compares that value with `===` against literal option
 * strings, so it must never be stega-encoded, and any two-string-key
 * `{value,label}` object that is *not* a registered select (an ordinary
 * composite field a theme author happens to name `value`/`label`) must
 * never be unwrapped. Returns false for an unknown block/field, a path that
 * does not resolve, and outside a themed build (or for any schema with no
 * registered block fields at all, e.g. a non-block entry such as a page) —
 * absence of a registration is never treated as permission to unwrap or to
 * skip encoding.
 */
export function isBlockFieldSelect(apiId: string | undefined, path: string): boolean {
  if (apiId === undefined) return false;
  return resolveBlockFieldType(registeredBlockFields[apiId], path.split('.')) === 'select';
}
