import type { BlockDefinition, BlockField, BlockMigrationLinkConversion } from './types';

// Core cms/field.IsValidFieldType, including types only used by descendants.
const STORED_FIELD_TYPES = new Set([
  'bool',
  'color',
  'composite',
  'datetime',
  'float',
  'int',
  'json',
  'layout',
  'link',
  'list',
  'lucide-icon',
  'markdown',
  'media',
  'reference',
  'rich-text',
  'select',
  'seo',
  'slug',
  'string',
  'styling',
  'tabler-icon',
  'text',
  'uuid',
]);
const STORED_FIELD_KEYS = [
  'fieldId',
  'groupId',
  'presetId',
  'name',
  'isTitle',
  'type',
  'description',
  'default',
  'localized',
  'helpText',
  'validators',
  'metadata',
  'relation',
];
// Keys the kit's field grammar carries that Core's stored `Field` does not —
// dropped before any storage comparison, so a change to one can never be read
// as a change to what is stored. `showWhen` is authoring-only visibility:
// adding, changing or removing it is not a breaking field change and must
// never demand a version bump. Listed here explicitly rather than merely left
// out of STORED_FIELD_KEYS, so the omission reads as a decision.
const IGNORED_FIELD_KEYS = ['showWhen'];
const STORED_RELATION_KEYS = [
  'multiple',
  'allowProducts',
  'allowCollections',
  'allowedTagIds',
  'allowedSchemaIds',
];

// Called only after the closed AJV schema accepts the declaration. Without
// local history, Core alone can decide which source schemas and steps apply.
export function migrationChecks(
  file: string,
  block: BlockDefinition,
  previous: BlockDefinition | undefined,
  errors: string[]
): void {
  const next = new Map(block.fields.map((field) => [field.fieldId, field]));
  const versions = new Set<number>();
  for (const [index, step] of (block.migrations ?? []).entries()) {
    const at = `${file}: migrations[${index}]`;
    if (step.version > block.version) errors.push(`${at}.version — must be a block version bump`);
    if (versions.has(step.version))
      errors.push(`${at}.version — migration versions must be unique`);
    versions.add(step.version);
    const renames = step.renames ?? [];
    const conversions = step.convertToLink ?? [];
    // A step that carries neither key says nothing at all; an empty `renames`
    // stays legal, because it is how a step that only bumps a version has
    // always been written.
    if (step.renames === undefined && step.convertToLink === undefined) {
      errors.push(`${at} — a migration step must declare renames or convertToLink`);
    }
    for (const conversion of conversions) {
      checkConversionTarget(at, conversion, next, errors);
    }
    const sources = new Set<string>();
    const targets = new Set<string>();
    for (const rename of renames) {
      if (rename.from === rename.to)
        errors.push(`${at} — renames require distinct top-level field IDs`);
      if (!next.has(rename.to))
        errors.push(`${at} — migration destination does not exist in incoming fields`);
      if (sources.has(rename.from) || targets.has(rename.to))
        errors.push(`${at} — rename pairs must be unique; splitting and merging are unsupported`);
      sources.add(rename.from);
      targets.add(rename.to);
    }
  }
  if (previous === undefined) return;
  const old = new Map(previous.fields.map((field) => [field.fieldId, field]));
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (const step of [...(block.migrations ?? [])].sort((a, b) => a.version - b.version)) {
    // Skipped once the step has been applied, exactly as a rename is: the
    // conversion leaves `from` behind for the retirement pass, so on the next
    // deploy the previous local manifest no longer describes the old shape —
    // and re-checking it against the new one would refuse a step that has
    // already run.
    if (step.version > previous.version) {
      for (const conversion of step.convertToLink ?? []) {
        checkConversionSource(
          `${file}: migrations (version ${step.version})`,
          conversion,
          old,
          next,
          errors
        );
      }
    }
    for (const rename of step.renames ?? []) {
      const prior = old.get(rename.from);
      const at = `${file}: migrations (version ${step.version})`;
      if (step.version <= previous.version) {
        if (prior !== undefined && !next.has(rename.from))
          errors.push(`${at} — destructive rename requires a new version bump`);
        continue;
      }
      if (prior === undefined) {
        errors.push(`${at} — migration source does not exist in the previous local schema`);
        continue;
      }
      if (
        sources.has(rename.from) ||
        targets.has(rename.to) ||
        targets.has(rename.from) ||
        sources.has(rename.to)
      ) {
        errors.push(`${at} — pending steps require unavailable intermediate schema history`);
      }
      const destination = next.get(rename.to);
      if (destination !== undefined && !storageCompatible(prior, destination)) {
        errors.push(`${at} — field type, cardinality, and storage shape changes are unsupported`);
      }
      sources.add(rename.from);
      targets.add(rename.to);
    }
  }
  requireVersionBumpForRetirement(file, block, previous, old, next, errors);
}

/**
 * What a conversion must be true of in the *incoming* fields: it writes a link,
 * so `to` has to be one — or, for `shape: "list"`, a list of links, or a list
 * of composites each carrying one list of links (the footer's link groups,
 * where the group's own title stays a string beside the converted rows). It
 * descends at most that one level, and never more. Checked without any
 * history, because it is a statement about the block being deployed rather
 * than about what came before it.
 */
function checkConversionTarget(
  at: string,
  conversion: BlockMigrationLinkConversion,
  next: Map<string, BlockField>,
  errors: string[]
): void {
  const destination = next.get(conversion.to);
  if (destination === undefined) {
    errors.push(
      `${at} — conversion destination "${conversion.to}" does not exist in incoming fields`
    );
    return;
  }
  if (conversion.shape !== 'list') {
    if (destination.type !== 'link') {
      errors.push(`${at} — conversion destination "${conversion.to}" must be a link field`);
    }
    return;
  }
  if (linkListRows(destination) === null) {
    errors.push(
      `${at} — conversion destination "${conversion.to}" must be a list of links, or a list of composites each carrying one list of links`
    );
  }
}

/**
 * Where the link rows sit inside a `shape: "list"` destination.
 *
 * `{}`                  — the list's own items are links.
 * `{ childId: "<id>" }` — the list's item is a composite whose child `<id>` is
 *                         the list of links; the composite's other children are
 *                         untouched by the conversion.
 * `null`                — neither, so the destination cannot hold the converted
 *                         values at all.
 */
function linkListRows(field: BlockField): { childId?: string } | null {
  if (field.type !== 'list') return null;
  const item = listItem(field);
  if (item === null) return null;
  if (item.type === 'link') return {};
  if (item.type !== 'composite') return null;
  const nested = compositeFields(item).filter(
    (child) => child.type === 'list' && listItem(child)?.type === 'link'
  );
  return nested.length === 1 ? { childId: nested[0]!.fieldId } : null;
}

/**
 * What a conversion must be true of in the *previous local manifest*: the field
 * it reads has to exist, in the shape the step says it has, carrying the
 * children it names. Advisory, like every other history check here — Core owns
 * the installed schema and re-validates the same rules at ingest.
 */
function checkConversionSource(
  at: string,
  conversion: BlockMigrationLinkConversion,
  old: Map<string, BlockField>,
  next: Map<string, BlockField>,
  errors: string[]
): void {
  const prior = old.get(conversion.from);
  if (prior === undefined) {
    errors.push(`${at} — conversion source does not exist in the previous local schema`);
    return;
  }
  if (conversion.shape === 'string') {
    if (prior.type !== 'string') {
      errors.push(`${at} — conversion source "${conversion.from}" must be a string field`);
    }
    if (conversion.label !== undefined) {
      const label = old.get(conversion.label);
      if (conversion.label === conversion.from || label === undefined || label.type !== 'string') {
        errors.push(
          `${at} — conversion label "${conversion.label}" must name another string field of the previous block`
        );
      }
    }
    return;
  }
  // The destination says how deep the rows sit; the source has to match it,
  // level for level, so one walk finds a row on both sides.
  const destination = next.get(conversion.to);
  const rows = destination === undefined ? null : linkListRows(destination);
  let item = listItem(prior);
  if (prior.type !== 'list' || item === null || item.type !== 'composite') {
    errors.push(`${at} — conversion source "${conversion.from}" must be a list of composites`);
    return;
  }
  if (rows?.childId !== undefined) {
    const child = compositeFields(item).find((field) => field.fieldId === rows.childId);
    const nested = child === undefined ? null : listItem(child);
    if (child?.type !== 'list' || nested === null || nested.type !== 'composite') {
      errors.push(
        `${at} — conversion source "${conversion.from}" must carry a list of composites at "${rows.childId}"`
      );
      return;
    }
    item = nested;
  }
  // A conversion names the same four keys at both levels: the item's own
  // composite carries the top row's label, href and its nested list, and that
  // nested list's item composite carries a child's label, href and the column
  // heading a top row never has. So a named key is satisfied by either.
  const own = compositeFields(item).map((child) => child.fieldId);
  const nested =
    conversion.children === undefined
      ? []
      : nestedItemFields(item, conversion.children).map((child) => child.fieldId);
  const known = new Set([...own, ...nested]);
  for (const key of ['label', 'url', 'group'] as const) {
    const named = conversion[key];
    if (named !== undefined && !known.has(named)) {
      errors.push(
        `${at} — conversion ${key} "${named}" is not a child of "${conversion.from}"'s item`
      );
    }
  }
  if (conversion.children !== undefined && !own.includes(conversion.children)) {
    errors.push(
      `${at} — conversion children "${conversion.children}" is not a child of "${conversion.from}"'s item`
    );
  }
}

/** The fields of the composite inside the named child list, when the child is a
 *  list of composites at all. */
function nestedItemFields(item: BlockField, childId: string): BlockField[] {
  const child = compositeFields(item).find((field) => field.fieldId === childId);
  if (child === undefined || child.type !== 'list') return [];
  const nested = listItem(child);
  return nested === null || nested.type !== 'composite' ? [] : compositeFields(nested);
}

function listItem(field: BlockField): BlockField | null {
  const item = field.metadata?.item;
  return isRecord(item) ? (item as unknown as BlockField) : null;
}

function compositeFields(field: BlockField): BlockField[] {
  const fields = field.metadata?.fields;
  return Array.isArray(fields) ? (fields as BlockField[]).filter(isRecord) : [];
}

// Fields whose id is unchanged across a redeploy (no declared rename) never go
// through the renamed-field compatibility check above, and a field dropped
// from `fields` entirely never appears in `next` at all. Core retires either
// case into a `<fieldId>__vN` legacy field, but only when the incoming block
// bumped its version — otherwise a deploy without local history to compare
// against would silently discard content. This is advisory only: the plugin
// cannot see installed entries, so it requires a bump whenever the shape
// could have changed, whether or not any entry actually held a value.
function requireVersionBumpForRetirement(
  file: string,
  block: BlockDefinition,
  previous: BlockDefinition,
  old: Map<string, BlockField>,
  next: Map<string, BlockField>,
  errors: string[]
): void {
  const bumped = block.version > previous.version;
  const renamedFrom = new Set<string>();
  for (const step of block.migrations ?? []) {
    for (const rename of step.renames ?? []) renamedFrom.add(rename.from);
  }
  for (const [fieldId, prior] of old) {
    if (renamedFrom.has(fieldId)) continue;
    const current = next.get(fieldId);
    if (bumped) continue;
    if (current === undefined) {
      errors.push(
        `${file}: field ${fieldId} was removed; bump "version" to ${previous.version + 1} so Core retires the previous content`
      );
      continue;
    }
    if (!storageCompatible(prior, current)) {
      // Three advisory reasons: the type itself changed; a pure localization
      // flip (type unchanged); or the type and localized flag both held but
      // storageCompatible still refused — cardinality (media/select/reference
      // multiplicity) or a nested composite/list child changed underneath an
      // unchanged top-level type/localized pair.
      const reason =
        prior.type !== current.type
          ? `changed type (${prior.type} → ${current.type})`
          : (prior.localized === true) !== (current.localized === true)
            ? 'changed localization'
            : 'changed storage shape (media multiplicity / nested field)';
      errors.push(
        `${file}: field ${fieldId} ${reason}; bump "version" to ${previous.version + 1} so Core retires the previous content`
      );
    }
  }
}

function storageCompatible(oldValue: BlockField, nextValue: BlockField): boolean {
  const old = storedMigrationField(oldValue);
  const next = storedMigrationField(nextValue);
  if (old === null || next === null) return false;
  if (old.type !== next.type || (old.localized === true) !== (next.localized === true))
    return false;
  switch (old.type) {
    case 'media':
      return multiple(old, true) === multiple(next, true);
    case 'select':
      return multiple(old, false) === multiple(next, false);
    case 'reference':
      return (old.relation?.multiple === true) === (next.relation?.multiple === true);
    case 'composite':
    case 'list': {
      const oldChildren = childFields(old)!;
      const nextChildren = childFields(next)!;
      if (oldChildren.length !== nextChildren.length) return false;
      const byId = new Map(nextChildren.map((field) => [field.fieldId, field]));
      return oldChildren.every((field) => {
        const other = byId.get(field.fieldId);
        return other !== undefined && storageCompatible(field, other);
      });
    }
    default:
      return true;
  }
}

function multiple(field: BlockField, fallback: boolean): boolean {
  return typeof field.metadata?.multiple === 'boolean' ? field.metadata.multiple : fallback;
}

function childFields(field: BlockField): BlockField[] | null {
  if (field.type === 'list') {
    const item = field.metadata?.item;
    return isRecord(item) ? [item as unknown as BlockField] : null;
  }
  const fields = field.metadata?.fields;
  return Array.isArray(fields) && fields.length > 0 ? fields : null;
}

// Validate recursive storage definitions before compatibility comparisons so
// malformed advisory history cannot masquerade as an absent source schema.
export function validMigrationFieldShape(value: unknown, depth = 1): boolean {
  return storedMigrationField(value, depth) !== null;
}

function storedMigrationField(raw: unknown, depth = 1): BlockField | null {
  const value = storedObject(raw, STORED_FIELD_KEYS);
  if (value !== null) {
    for (const key of IGNORED_FIELD_KEYS) delete value[key];
  }
  if (
    value === null ||
    typeof value.fieldId !== 'string' ||
    !/^[a-zA-Z0-9_]+$/.test(value.fieldId) ||
    typeof value.name !== 'string' ||
    value.name === '' ||
    typeof value.type !== 'string' ||
    !STORED_FIELD_TYPES.has(value.type) ||
    (value.localized != null && typeof value.localized !== 'boolean') ||
    depth > 5
  )
    return null;
  // Match Core's typed Field decoding before comparing storage. Null optional
  // objects/scalars decode as absent/zero; arbitrary metadata/options and default
  // values remain opaque. Do not apply today's presentation or validator rules.
  if (
    ['groupId', 'presetId', 'description', 'helpText'].some(
      (key) => value[key] != null && typeof value[key] !== 'string'
    ) ||
    (value.isTitle != null && typeof value.isTitle !== 'boolean') ||
    (value.metadata != null && !isRecord(value.metadata)) ||
    !validStoredValidators(value.validators)
  )
    return null;
  if (value.relation != null) {
    const relation = storedObject(value.relation, STORED_RELATION_KEYS);
    if (relation === null || !validStoredRelation(relation)) return null;
    value.relation = relation;
  }
  if (value.type !== 'composite' && value.type !== 'list') return value as unknown as BlockField;
  if (!isRecord(value.metadata)) return null;
  const children = childFields(value as unknown as BlockField);
  if (children === null) return null;
  const normalized = children.map((child) => storedMigrationField(child, depth + 1));
  if (normalized.some((child) => child === null)) return null;
  const fields = normalized as BlockField[];
  if (new Set(fields.map((child) => child.fieldId)).size !== fields.length) return null;
  value.metadata = {
    ...value.metadata,
    ...(value.type === 'list' ? { item: fields[0] } : { fields }),
  };
  return value as unknown as BlockField;
}

function validStoredRelation(value: unknown): boolean {
  if (value == null) return true;
  if (!isRecord(value)) return false;
  return (
    ['multiple', 'allowProducts', 'allowCollections'].every(
      (key) => value[key] == null || typeof value[key] === 'boolean'
    ) &&
    ['allowedTagIds', 'allowedSchemaIds'].every(
      (key) =>
        value[key] == null ||
        (Array.isArray(value[key]) &&
          value[key].every((id) => id === null || typeof id === 'string'))
    )
  );
}

function validStoredValidators(value: unknown): boolean {
  if (value == null) return true;
  if (!isRecord(value)) return false;
  // Core Validators.UnmarshalJSON rejects unknown keys but leaves value-policy
  // checks (ranges, supported presets, regex syntax) to incoming validation.
  return Object.entries(value).every(([key, item]) => {
    switch (key) {
      case 'min':
      case 'max':
      case 'minLength':
      case 'maxLength':
        return item == null || (typeof item === 'number' && Number.isFinite(item));
      case 'unique':
      case 'required':
        return item == null || typeof item === 'boolean';
      case 'match':
      case 'prohibit': {
        if (item == null) return true;
        const pattern = storedObject(item, ['preset', 'custom']);
        return (
          pattern !== null &&
          ['preset', 'custom'].every(
            (name) => pattern[name] == null || typeof pattern[name] === 'string'
          )
        );
      }
      default:
        return false;
    }
  });
}

// encoding/json matches struct keys with Unicode simple folding. For ASCII
// field names, the extra equivalents are long s and the Kelvin sign. Metadata
// maps stay case-sensitive. Reject alias collisions instead of guessing which
// historical spelling wins; never mutate the caller's advisory manifest.
function storedObject(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const normalized: Record<string, unknown> = { ...value };
  const seen = new Set<string>();
  for (const [key, item] of Object.entries(value)) {
    const folded = key.toLowerCase().replace(/ſ/g, 's');
    const canonical = keys.find((name) => name.toLowerCase() === folded);
    if (canonical === undefined) continue;
    if (seen.has(canonical)) return null;
    seen.add(canonical);
    delete normalized[key];
    normalized[canonical] = item;
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
