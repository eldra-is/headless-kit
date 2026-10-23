import type { EldraFormDefinition, EldraFormFieldType, EldraFormLocalized } from '@eldrajs/sdk';
import type { SiteFormDefinition, SiteFormField } from './types';

/** One locale's text: exact tag, same language, first sorted tag, `''`, as the platform's `formLabel`. */
export function pickLocalized(map: EldraFormLocalized | undefined, locale: string): string {
  if (map === undefined) return '';
  const exact = map[locale];
  if (exact !== undefined) return exact;
  const tags = Object.keys(map).sort();
  const language = locale.split('-')[0]?.toLowerCase();
  const sameLanguage = tags.find((tag) => tag.split('-')[0]?.toLowerCase() === language);
  if (language && sameLanguage !== undefined) return map[sameLanguage] ?? '';
  const first = tags[0];
  return first === undefined ? '' : (map[first] ?? '');
}

const FIELD_TYPES: ReadonlySet<string> = new Set<EldraFormFieldType>([
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

export function isBooleanField(field: Pick<SiteFormField, 'type'>): boolean {
  return field.type === 'checkbox' || field.type === 'consent';
}

/** A `/` path or an absolute http(s) URL, the two shapes the platform accepts for a redirect. */
export function safeRedirect(target: string): string | null {
  const trimmed = target.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Every per-locale text resolved for `locale`; throws on a field type it cannot draw. */
export function localizeSiteForm(raw: EldraFormDefinition, locale: string): SiteFormDefinition {
  const fields = raw.fields.map((field): SiteFormField => {
    if (!FIELD_TYPES.has(field.type)) {
      throw new Error(`form "${raw.key}": unsupported field type "${String(field.type)}"`);
    }
    const out: SiteFormField = {
      id: field.id,
      type: field.type,
      required: field.required,
      label: pickLocalized(field.label, locale),
    };
    const placeholder = pickLocalized(field.placeholder, locale);
    if (placeholder !== '') out.placeholder = placeholder;
    if (field.options !== undefined) {
      out.options = field.options.map((option) => ({
        value: option.value,
        label: pickLocalized(option.label, locale) || option.value,
      }));
    }
    if (field.validation !== undefined) out.validation = { ...field.validation };
    return out;
  });
  const redirect = pickLocalized(raw.success?.redirect, locale);
  return {
    key: raw.key,
    name: raw.name,
    fields,
    honeypotField: raw.honeypotField,
    turnstileSiteKey: raw.turnstileSiteKey ?? null,
    successMessage: pickLocalized(raw.success?.message, locale),
    successRedirect: redirect === '' ? null : safeRedirect(redirect),
    consentText: pickLocalized(raw.consentText, locale).trim(),
  };
}
