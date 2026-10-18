import type { EldraFormDefinition, EldraFormSubmitResult } from '@eldrajs/sdk';
import type {
  StorefrontFormDefinition,
  StorefrontFormField,
  StorefrontFormSubmitResult,
} from './types';

/**
 * Picks the text for `locale` out of a per-locale map the platform publishes
 * (`{ 'en-US': 'Name', 'is-IS': 'Nafn' }`): the exact tag, then the same language
 * (`is` for `is-IS`), then the map's first entry, then `''`. The platform never guesses a
 * fallback for the page, so this is the one place the page does.
 */
export function pickLocalized(
  map: Record<string, string> | undefined,
  locale: string | undefined
): string {
  if (map === undefined) return '';
  const entries = Object.entries(map);
  if (entries.length === 0) return '';
  if (locale !== undefined) {
    const exact = map[locale];
    if (exact !== undefined) return exact;
    const language = locale.split('-')[0]?.toLowerCase();
    const sameLanguage = entries.find(([tag]) => tag.split('-')[0]?.toLowerCase() === language);
    if (sameLanguage !== undefined) return sameLanguage[1];
  }
  return entries[0]?.[1] ?? '';
}

/** A definition as the platform serves it, with every per-locale text resolved for `locale`. */
export function localizeFormDefinition(
  raw: EldraFormDefinition,
  locale: string | undefined
): StorefrontFormDefinition {
  const fields = raw.fields.map((field): StorefrontFormField => {
    const out: StorefrontFormField = {
      id: field.id,
      type: field.type,
      required: field.required,
      label: pickLocalized(field.label, locale),
    };
    if (field.placeholder !== undefined) {
      const placeholder = pickLocalized(field.placeholder, locale);
      if (placeholder !== '') out.placeholder = placeholder;
    }
    if (field.options !== undefined) {
      out.options = field.options.map((option) => ({
        value: option.value,
        label: pickLocalized(option.label, locale),
      }));
    }
    if (field.validation !== undefined) out.validation = field.validation;
    return out;
  });
  const redirect = pickLocalized(raw.success.redirect, locale);
  return {
    key: raw.key,
    name: raw.name,
    fields,
    honeypotField: raw.honeypotField,
    turnstileSiteKey: raw.turnstileSiteKey,
    successMessage: pickLocalized(raw.success.message, locale),
    successRedirect: redirect === '' ? null : redirect,
  };
}

/** The SDK's submit answer in the storefront's own shape. */
export function toSubmitResult(result: EldraFormSubmitResult): StorefrontFormSubmitResult {
  return result.status === 'ok'
    ? { ok: true, pending: result.pending }
    : { ok: false, reason: 'invalid', errors: result.errors, form: result.form };
}

/** What a rejected submit (`EldraHttpError`, a network failure) means to a visitor. */
export function submitFailure(error: unknown): StorefrontFormSubmitResult {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status: unknown }).status
      : undefined;
  if (status === 429) return { ok: false, reason: 'rate-limited' };
  if (status === 413) return { ok: false, reason: 'too-large' };
  return { ok: false, reason: 'unavailable' };
}

/**
 * Posts a submission to the theme's own `formsEndpoint` (the override that predates the platform
 * forms API, kept for a site that already has a form backend). `{ kind: 'form', key, values,
 * locale, pagePath }` as JSON; any 2xx is a success, anything else — or no network — is
 * `unavailable`. `unsupported` is what a call with neither the platform nor an endpoint gets.
 */
export async function postToFormsEndpoint(
  endpoint: string,
  body: Record<string, unknown>
): Promise<StorefrontFormSubmitResult> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'form', ...body }),
    });
    if (response.ok) return { ok: true, pending: false };
    if (response.status === 429) return { ok: false, reason: 'rate-limited' };
    if (response.status === 413) return { ok: false, reason: 'too-large' };
    return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
