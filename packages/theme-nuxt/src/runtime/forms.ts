import type { EldraClient, EldraFormDefinition, EldraFormField } from '@eldrajs/sdk';

/**
 * The slice of an `@eldrajs/sdk` client the build-time form read needs: the typed `forms.get`. A
 * whole `EldraClient` satisfies it.
 */
export interface FormDefinitionsReader {
  forms: Pick<EldraClient['forms'], 'get'>;
}

/** The form definitions a build baked, by form key; a key that could not be read is absent. */
export type FormDefinitions = Record<string, EldraFormDefinition>;

/** The one line a build prints per form it could not read; the cause follows in parentheses. */
export const FORM_DEFINITION_WARNING = (key: string): string =>
  `[eldra] could not read the platform’s form “${key}” — the site fetches it when a visitor opens the page`;

/** How long the build waits for one form; see `READ_TIMEOUT_MS` in `./designTokens.ts`. */
export const READ_TIMEOUT_MS = 10_000;

const FIELD_TYPES = new Set([
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
  'consent',
  'number',
  'url',
]);
const ACTION_KINDS = new Set(['store', 'notify', 'confirm', 'subscribe']);

/**
 * The definitions of `keys`, read in parallel at build time, **each independently fail-soft**: no
 * client, an unreachable gateway, a `404` (the form is not seeded yet), a timeout and a response
 * that is not the documented shape all leave that one key out and print **one** warning, so a
 * theme keeps deploying and one form's failure never costs another its definition. A form left out
 * is not a broken form: the storefront fetches it in the visitor's browser instead
 * (`forms.definition` in the starter's gateway storefront).
 */
export async function readFormDefinitions(
  reader: FormDefinitionsReader | null,
  keys: readonly string[],
  warn: (message: string) => void = console.warn
): Promise<FormDefinitions> {
  const unique = [...new Set(keys)];
  if (reader === null || unique.length === 0) {
    if (reader === null) for (const key of unique) warn(FORM_DEFINITION_WARNING(key));
    return {};
  }
  const read = await Promise.all(unique.map((key) => readOne(reader, key)));
  const definitions: FormDefinitions = {};
  for (const [index, result] of read.entries()) {
    const key = unique[index] as string;
    if (result.definition === null) {
      warn(
        result.cause === null
          ? FORM_DEFINITION_WARNING(key)
          : `${FORM_DEFINITION_WARNING(key)} (${result.cause})`
      );
    } else definitions[key] = result.definition;
  }
  return definitions;
}

async function readOne(
  reader: FormDefinitionsReader,
  key: string
): Promise<{ definition: EldraFormDefinition | null; cause: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    const response = await reader.forms.get(key, { signal: controller.signal });
    const definition = toFormDefinition(response, key);
    return {
      definition,
      cause: definition === null ? 'the platform published an unusable response' : null,
    };
  } catch (error) {
    return { definition: null, cause: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `{ <locale>: text }` with at least one entry; anything else is half an answer. */
function toLocalized(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== 'string') return null;
    out[locale] = text;
  }
  return out;
}

function toField(value: unknown): EldraFormField | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.type !== 'string' || !FIELD_TYPES.has(value.type)) return null;
  if (typeof value.required !== 'boolean') return null;
  const label = toLocalized(value.label);
  if (label === null) return null;
  const field: EldraFormField = {
    id: value.id,
    type: value.type as EldraFormField['type'],
    required: value.required,
    label,
  };
  if (value.placeholder !== undefined) {
    const placeholder = toLocalized(value.placeholder);
    if (placeholder === null) return null;
    field.placeholder = placeholder;
  }
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) return null;
    const options: NonNullable<EldraFormField['options']> = [];
    for (const option of value.options) {
      if (!isRecord(option) || typeof option.value !== 'string') return null;
      const optionLabel = toLocalized(option.label);
      if (optionLabel === null) return null;
      options.push({ value: option.value, label: optionLabel });
    }
    field.options = options;
  }
  if (value.validation !== undefined) {
    if (!isRecord(value.validation)) return null;
    const { minLength, maxLength, pattern } = value.validation;
    const validation: NonNullable<EldraFormField['validation']> = {};
    if (minLength !== undefined) {
      if (typeof minLength !== 'number') return null;
      validation.minLength = minLength;
    }
    if (maxLength !== undefined) {
      if (typeof maxLength !== 'number') return null;
      validation.maxLength = maxLength;
    }
    if (pattern !== undefined) {
      if (typeof pattern !== 'string') return null;
      validation.pattern = pattern;
    }
    field.validation = validation;
  }
  return field;
}

/**
 * Accepts only a whole answer for `key`: half of an untrusted response never reaches a payload
 * every visitor downloads. A definition whose own `key` differs from the one asked for is refused
 * too, since the starter looks definitions up by the key a block names.
 */
export function toFormDefinition(value: unknown, key: string): EldraFormDefinition | null {
  if (!isRecord(value)) return null;
  if (value.key !== key || typeof value.name !== 'string') return null;
  if (!Array.isArray(value.fields)) return null;
  const fields: EldraFormField[] = [];
  for (const raw of value.fields) {
    const field = toField(raw);
    if (field === null) return null;
    fields.push(field);
  }
  if (typeof value.honeypotField !== 'string' || value.honeypotField === '') return null;
  const turnstile = value.turnstileSiteKey;
  if (turnstile !== undefined && turnstile !== null && typeof turnstile !== 'string') return null;
  if (!isRecord(value.success)) return null;
  const message = toLocalized(value.success.message);
  if (message === null) return null;
  const success: EldraFormDefinition['success'] = { message };
  if (value.success.redirect !== undefined) {
    const redirect = toLocalized(value.success.redirect);
    if (redirect === null) return null;
    success.redirect = redirect;
  }
  if (!Array.isArray(value.kinds)) return null;
  const kinds = value.kinds.filter(
    (kind): kind is EldraFormDefinition['kinds'][number] =>
      typeof kind === 'string' && ACTION_KINDS.has(kind)
  );
  return {
    key,
    name: value.name,
    fields,
    honeypotField: value.honeypotField,
    turnstileSiteKey: turnstile ?? null,
    success,
    kinds,
  };
}
