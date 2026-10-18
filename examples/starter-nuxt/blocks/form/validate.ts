import type { StorefrontFormField } from '../../app/storefront/types';

/** The message catalogue lookup a block hands in: `useI18n()`'s `t`. */
type Translate = (key: string, params?: Record<string, unknown>) => string;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A finite decimal number, the way `<input type="number">` accepts one (a `.` separator). */
function isNumber(text: string): boolean {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) && Number.isFinite(Number(text));
}

/** An absolute http(s) URL: what a `url` field collects. */
function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The first reason `value` is not an acceptable answer to `field`, in the visitor's language, or
 * `null`. The same rules the platform enforces (required, shape, length, pattern), checked first
 * so an obvious mistake never costs a round trip; the platform still decides, and its own message
 * replaces ours for anything it refuses.
 *
 * An empty optional field is always fine, whatever its shape rules say: shape and length rules
 * describe an answer, and no answer was given.
 */
export function validateField(
  field: StorefrontFormField,
  value: string | boolean | undefined,
  t: Translate
): string | null {
  if (field.type === 'checkbox' || field.type === 'consent') {
    return field.required && value !== true
      ? t('form.requiredCheckbox', { field: field.label })
      : null;
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return field.required ? t('form.required', { field: field.label }) : null;

  if (field.type === 'email' && !EMAIL_PATTERN.test(text)) return t('form.invalidEmail');
  if (field.type === 'number' && !isNumber(text)) return t('form.invalidNumber');
  if (field.type === 'url' && !isHttpUrl(text)) return t('form.invalidUrl');
  if (field.type === 'select' && field.options && !field.options.some((o) => o.value === text)) {
    return t('form.required', { field: field.label });
  }

  const length = Array.from(text).length;
  const { minLength, maxLength, pattern } = field.validation ?? {};
  if (minLength !== undefined && length < minLength) return t('form.tooShort', { min: minLength });
  if (maxLength !== undefined && length > maxLength) return t('form.tooLong', { max: maxLength });
  if (pattern !== undefined) {
    try {
      if (!new RegExp(`^(?:${pattern})$`).test(text)) return t('form.invalidFormat');
    } catch {
      // A pattern this browser cannot compile is the platform's to enforce, not a reason to block.
    }
  }
  return null;
}
