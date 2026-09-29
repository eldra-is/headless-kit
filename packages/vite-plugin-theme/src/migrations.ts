import type { BlockDefinition, BlockField } from './types';

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
    const sources = new Set<string>();
    const targets = new Set<string>();
    for (const rename of step.renames) {
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
    for (const rename of step.renames) {
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
    for (const rename of step.renames) renamedFrom.add(rename.from);
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
