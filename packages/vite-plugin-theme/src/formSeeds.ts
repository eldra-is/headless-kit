import type {
  DeclaredFormSeed,
  ManifestFormSeed,
  ManifestFormSeedField,
  ManifestFormSeedFieldType,
} from './types';
import { codePointLength, isRecord, stripPlainTextControls } from './util';

const MAX_FORM_SEEDS = 8;
const MAX_FIELDS = 30;
const MAX_OPTIONS = 50;
const MAX_NAME_LENGTH = 80;
const MAX_TEXT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1000;
/** Core's form key rule: a URL segment, and never the reserved `subscriptions` route. */
const FORM_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const RESERVED_FORM_KEY = 'subscriptions';
/** A field id is the key of a submission value, so it stays a plain identifier. */
const FIELD_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const OPTION_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const LOCALE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const LIST_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
/** A field id Core reserves (it names the whole submission in its own routes). */
const RESERVED_FIELD_ID = 'all';
/** Core's cap on `minLength` / `maxLength`. */
const MAX_VALIDATION_LENGTH = 8000;
/** The field types that take a `validation` block; Core refuses it on the rest. */
const VALIDATION_TYPES: ReadonlySet<string> = new Set(['text', 'email', 'phone', 'textarea']);
const FIELD_TYPES: ReadonlySet<string> = new Set<ManifestFormSeedFieldType>([
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
  'consent',
]);

const SEED_KEYS = new Set(['key', 'name', 'fields', 'actions', 'success']);
const FIELD_KEYS = new Set([
  'id',
  'type',
  'required',
  'label',
  'placeholder',
  'options',
  'validation',
]);
const ACTION_KEYS = new Set(['notify', 'confirm', 'subscribe']);
const SUCCESS_KEYS = new Set(['message', 'redirect']);
const VALIDATION_KEYS = new Set(['minLength', 'maxLength', 'pattern']);

function unknownKeys(
  at: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  errors: string[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${at}.${key} — unknown key`);
  }
}

/** A `{ <locale>: text }` map: at least one locale, every tag well-formed, every text non-empty. */
function localizedText(
  at: string,
  value: unknown,
  maxLength: number,
  errors: string[]
): Record<string, string> | null {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    errors.push(`${at} — must map at least one locale tag to text`);
    return null;
  }
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (!LOCALE_TAG_PATTERN.test(locale)) {
      errors.push(`${at}.${locale} — not a locale tag (expected something like "en-US")`);
      continue;
    }
    const clean = stripPlainTextControls(text).trim();
    if (clean === '' || codePointLength(clean) > maxLength) {
      errors.push(`${at}.${locale} — must contain 1..${maxLength} characters`);
      continue;
    }
    out[locale] = clean;
  }
  return out;
}

/**
 * Core compiles `pattern` as RE2 (`^(?:pattern)$`), which has no lookaround and no
 * backreferences; a JS `RegExp` accepts both, so they are refused here by scanning for them
 * outside character classes and escapes. Returns what was found, or `null`.
 */
function nonRe2Construct(pattern: string): string | null {
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;
    if (char === '\\') {
      const next = pattern[i + 1] ?? '';
      if (!inClass && (/[1-9]/.test(next) || next === 'k')) return 'a backreference';
      i += 1;
    } else if (inClass) {
      if (char === ']') inClass = false;
    } else if (char === '[') {
      inClass = true;
      if (pattern[i + 1] === '^') i += 1;
      if (pattern[i + 1] === ']') i += 1;
    } else if (char === '(' && pattern[i + 1] === '?') {
      const rest = pattern.slice(i + 2, i + 4);
      if (rest.startsWith('=') || rest.startsWith('!') || rest === '<=' || rest === '<!') {
        return 'a lookaround';
      }
      if (rest.startsWith('>')) return 'an atomic group';
    }
  }
  return null;
}

function validateField(at: string, entry: unknown, errors: string[]): ManifestFormSeedField | null {
  if (!isRecord(entry)) {
    errors.push(`${at} — must be a field object`);
    return null;
  }
  unknownKeys(at, entry, FIELD_KEYS, errors);
  const id = typeof entry.id === 'string' ? entry.id : '';
  if (id.toLowerCase() === RESERVED_FIELD_ID) {
    errors.push(`${at}.id — "${RESERVED_FIELD_ID}" is reserved`);
  } else if (!FIELD_ID_PATTERN.test(id)) {
    errors.push(
      `${at}.id — invalid id ${JSON.stringify(entry.id)} (expected ${FIELD_ID_PATTERN.source})`
    );
  }
  const type = typeof entry.type === 'string' ? entry.type : '';
  if (!FIELD_TYPES.has(type)) {
    errors.push(`${at}.type — must be one of ${[...FIELD_TYPES].join(', ')}`);
  }
  if (typeof entry.required !== 'boolean') errors.push(`${at}.required — must be true or false`);
  const label = localizedText(`${at}.label`, entry.label, MAX_TEXT_LENGTH, errors);
  const field: ManifestFormSeedField = {
    id,
    type: type as ManifestFormSeedFieldType,
    required: entry.required === true,
    label: label ?? {},
  };
  if (entry.placeholder !== undefined) {
    const placeholder = localizedText(
      `${at}.placeholder`,
      entry.placeholder,
      MAX_TEXT_LENGTH,
      errors
    );
    if (placeholder !== null) field.placeholder = placeholder;
  }

  if (type === 'select') {
    const options = Array.isArray(entry.options) ? entry.options : [];
    if (options.length < 1 || options.length > MAX_OPTIONS) {
      errors.push(`${at}.options — a select declares 1..${MAX_OPTIONS} options`);
    }
    const seen = new Set<string>();
    field.options = [];
    for (const [index, option] of options.slice(0, MAX_OPTIONS).entries()) {
      const optionAt = `${at}.options[${index}]`;
      if (!isRecord(option)) {
        errors.push(`${optionAt} — must be { value, label }`);
        continue;
      }
      unknownKeys(optionAt, option, new Set(['value', 'label']), errors);
      const value = typeof option.value === 'string' ? option.value : '';
      if (!OPTION_VALUE_PATTERN.test(value)) {
        errors.push(`${optionAt}.value — invalid value ${JSON.stringify(option.value)}`);
      } else if (seen.has(value)) {
        errors.push(`${optionAt}.value — duplicate value ${JSON.stringify(value)}`);
      }
      seen.add(value);
      const optionLabel = localizedText(`${optionAt}.label`, option.label, MAX_TEXT_LENGTH, errors);
      field.options.push({ value, label: optionLabel ?? {} });
    }
  } else if (entry.options !== undefined) {
    errors.push(`${at}.options — only a select field takes options`);
  }

  if (entry.validation !== undefined) {
    if (!VALIDATION_TYPES.has(type)) {
      errors.push(`${at}.validation — a ${type || 'this'} field takes no validation`);
    } else if (!isRecord(entry.validation)) {
      errors.push(`${at}.validation — must be an object`);
    } else {
      const rules = entry.validation;
      unknownKeys(`${at}.validation`, rules, VALIDATION_KEYS, errors);
      const validation: NonNullable<ManifestFormSeedField['validation']> = {};
      for (const key of ['minLength', 'maxLength'] as const) {
        const value = rules[key];
        if (value === undefined) continue;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_VALIDATION_LENGTH) {
          errors.push(`${at}.validation.${key} — must be an integer 0..${MAX_VALIDATION_LENGTH}`);
        } else validation[key] = value;
      }
      if (
        validation.minLength !== undefined &&
        validation.maxLength !== undefined &&
        validation.minLength > validation.maxLength
      ) {
        errors.push(`${at}.validation — minLength exceeds maxLength`);
      }
      if (rules.pattern !== undefined) {
        if (typeof rules.pattern !== 'string' || rules.pattern.length > 200) {
          errors.push(
            `${at}.validation.pattern — must be a regular expression of at most 200 characters`
          );
        } else {
          try {
            new RegExp(rules.pattern);
            const unsupported = nonRe2Construct(rules.pattern);
            if (unsupported === null) validation.pattern = rules.pattern;
            else {
              errors.push(
                `${at}.validation.pattern — ${unsupported} is not supported (the platform matches with RE2)`
              );
            }
          } catch {
            errors.push(`${at}.validation.pattern — not a valid regular expression`);
          }
        }
      }
      field.validation = validation;
    }
  }
  return field;
}

/**
 * Validates the declared `formSeeds`: the forms a site is created with, ingested by Core's
 * `site_forms` seeding. It rejects an unknown key outright and enforces the wire contract
 * agreed for WS-386 (key and field-id grammar, field types, option and length caps). It mirrors
 * Core's `normalizeFormInput` exactly — anything Core refuses fails the whole manifest sync, so a
 * rule changed on the Core side must be changed here too. A merchant-edited form is never
 * overwritten by a later version of a seed (Core's `editedByMerchant` flag).
 *
 * Absent (`undefined`) and empty both mean "this theme seeds no forms".
 */
export function validateFormSeeds(
  seeds: ReadonlyArray<DeclaredFormSeed> | undefined,
  errors: string[]
): ManifestFormSeed[] {
  if (seeds === undefined) return [];
  if (!Array.isArray(seeds)) {
    errors.push('formSeeds — must be an array');
    return [];
  }
  if (seeds.length > MAX_FORM_SEEDS) {
    errors.push(`formSeeds: contains ${seeds.length} seeds — exceeds ${MAX_FORM_SEEDS}`);
  }
  const normalized: ManifestFormSeed[] = [];
  const keys = new Set<string>();
  for (const [index, entry] of seeds.slice(0, MAX_FORM_SEEDS).entries()) {
    const at = `formSeeds[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${at} — must be a form seed object`);
      continue;
    }
    unknownKeys(at, entry, SEED_KEYS, errors);
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (!FORM_KEY_PATTERN.test(key) || key === RESERVED_FORM_KEY) {
      errors.push(
        `${at}.key — invalid key ${JSON.stringify(entry.key)} (expected ${FORM_KEY_PATTERN.source}, and "${RESERVED_FORM_KEY}" is reserved)`
      );
    } else if (keys.has(key)) {
      errors.push(`${at}.key — duplicate key ${JSON.stringify(key)}`);
    } else keys.add(key);

    const name = stripPlainTextControls(entry.name).trim();
    if (codePointLength(name) < 1 || codePointLength(name) > MAX_NAME_LENGTH) {
      errors.push(`${at}.name — must contain 1..${MAX_NAME_LENGTH} characters`);
    }

    const rawFields = Array.isArray(entry.fields) ? entry.fields : [];
    if (rawFields.length < 1 || rawFields.length > MAX_FIELDS) {
      errors.push(`${at}.fields — must declare 1..${MAX_FIELDS} fields`);
    }
    const fields: ManifestFormSeedField[] = [];
    const ids = new Set<string>();
    for (const [fieldIndex, rawField] of rawFields.slice(0, MAX_FIELDS).entries()) {
      const field = validateField(`${at}.fields[${fieldIndex}]`, rawField, errors);
      if (field === null) continue;
      if (ids.has(field.id.toLowerCase())) {
        errors.push(
          `${at}.fields[${fieldIndex}].id — duplicate id ${JSON.stringify(field.id)} (ids are compared ignoring case)`
        );
      }
      ids.add(field.id.toLowerCase());
      fields.push(field);
    }

    const actions = validateActions(at, entry.actions, fields, errors);
    const success = validateSuccess(at, entry.success, errors);
    normalized.push({ key, name, fields, actions, success });
  }
  return normalized;
}

function validateActions(
  at: string,
  value: unknown,
  fields: ManifestFormSeedField[],
  errors: string[]
): ManifestFormSeed['actions'] {
  const actions: ManifestFormSeed['actions'] = { notify: false, confirm: false };
  if (!isRecord(value)) {
    errors.push(`${at}.actions — must be an object`);
    return actions;
  }
  unknownKeys(`${at}.actions`, value, ACTION_KEYS, errors);
  const hasEmailField = fields.some((field) => field.type === 'email');
  for (const key of ['notify', 'confirm'] as const) {
    const flag = value[key];
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') errors.push(`${at}.actions.${key} — must be true or false`);
    else actions[key] = flag;
  }
  if (actions.confirm && !hasEmailField) {
    errors.push(`${at}.actions.confirm — needs an email field to send the confirmation to`);
  }
  if (value.subscribe !== undefined) {
    const subscribe = value.subscribe;
    if (!isRecord(subscribe)) {
      errors.push(`${at}.actions.subscribe — must be { list }`);
    } else {
      unknownKeys(`${at}.actions.subscribe`, subscribe, new Set(['list']), errors);
      const list = typeof subscribe.list === 'string' ? subscribe.list : '';
      if (!LIST_KEY_PATTERN.test(list)) {
        errors.push(
          `${at}.actions.subscribe.list — invalid list ${JSON.stringify(subscribe.list)}`
        );
      } else actions.subscribe = { list };
      if (!hasEmailField) {
        errors.push(`${at}.actions.subscribe — needs an email field to subscribe`);
      }
    }
  }
  return actions;
}

/** Core's `checkFormRedirect`: a site path, or an absolute http(s) URL. */
function isFormRedirect(target: string): boolean {
  if (target.startsWith('/')) return true;
  try {
    const url = new URL(target);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateSuccess(
  at: string,
  value: unknown,
  errors: string[]
): ManifestFormSeed['success'] {
  if (!isRecord(value)) {
    errors.push(`${at}.success — must be { message }`);
    return { message: {} };
  }
  unknownKeys(`${at}.success`, value, SUCCESS_KEYS, errors);
  const message = localizedText(`${at}.success.message`, value.message, MAX_MESSAGE_LENGTH, errors);
  const success: ManifestFormSeed['success'] = { message: message ?? {} };
  if (value.redirect !== undefined) {
    const redirect = localizedText(`${at}.success.redirect`, value.redirect, 500, errors);
    if (redirect !== null) {
      for (const [locale, target] of Object.entries(redirect)) {
        if (!isFormRedirect(target)) {
          errors.push(
            `${at}.success.redirect.${locale} — must be a path starting with "/" or an http(s) URL`
          );
        }
      }
      success.redirect = redirect;
    }
  }
  return success;
}
