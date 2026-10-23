import type { UiMessages } from '../../messages/en-US';
import { isBooleanField } from './localize';
import type { SiteFormField, SiteFormValue } from './types';

type ValidationMessages = Pick<
  UiMessages,
  | 'formRequired'
  | 'formRequiredCheckbox'
  | 'formInvalidEmail'
  | 'formInvalidNumber'
  | 'formInvalidUrl'
  | 'formInvalidOption'
  | 'formInvalidFormat'
  | 'formTooShort'
  | 'formTooLong'
>;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const NUMBER = /^[+-]?(?:\d+[.,]?\d*|[.,]\d+)(?:[eE][+-]?\d+)?$/;
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** The platform's own ceilings per type; a field's `maxLength` can only lower them. */
const DEFAULT_MAX_LENGTH: Partial<Record<SiteFormField['type'], number>> = {
  email: 254,
  phone: 50,
  textarea: 8000,
};
const DEFAULT_TEXT_MAX_LENGTH = 500;

// Go's unicode.IsSpace (strings.Fields, strings.TrimSpace): JavaScript's \s adds U+FEFF and lacks U+0085.
const SPACE =
  '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const SPACES = new RegExp(`[${SPACE}]+`, 'g');
const EDGE_SPACES = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, 'g');
// Characters RE2 and JavaScript read differently in `.` and `\s`; a value holding one is left to the platform's pattern check.
const ENGINES_DISAGREE =
  /[\r\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;
const NON_ASCII = /[^ -~]/;

/** The text the platform validates: control characters dropped, spaces collapsed outside a textarea, trimmed. */
export function normalizeSiteFormText(field: Pick<SiteFormField, 'type'>, value: string): string {
  const cleaned = value.replace(CONTROL_CHARACTERS, '');
  const spaced = field.type === 'textarea' ? cleaned : cleaned.replace(SPACES, ' ');
  return spaced.replace(EDGE_SPACES, '');
}

/** What the platform matches the pattern against: an email lowercased, a number with a decimal point. */
function patternSubject(field: SiteFormField, text: string): string | null {
  if (field.type === 'email') return NON_ASCII.test(text) ? null : text.toLowerCase();
  const subject = field.type === 'number' ? text.replace(',', '.') : text;
  return ENGINES_DISAGREE.test(subject) ? null : subject;
}

function isNumber(text: string): boolean {
  return NUMBER.test(text) && Number.isFinite(Number(text.replace(',', '.')));
}

function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    // Without the u flag RE2-only syntax still compiles with another meaning (`\pL` as "pL"), so the platform decides.
    return null;
  }
}

/** The first reason the platform would refuse `value`, by its rules in its order, or `null`. */
export function validateSiteFormValue(
  field: SiteFormField,
  value: SiteFormValue | undefined,
  messages: ValidationMessages
): string | null {
  if (isBooleanField(field)) {
    return field.required && value !== true ? messages.formRequiredCheckbox : null;
  }
  const text = normalizeSiteFormText(field, typeof value === 'string' ? value : '');
  if (text === '') return field.required ? messages.formRequired : null;

  const length = Array.from(text).length;
  const ceiling = DEFAULT_MAX_LENGTH[field.type] ?? DEFAULT_TEXT_MAX_LENGTH;
  const { minLength, maxLength, pattern } = field.validation ?? {};
  const max = maxLength === undefined ? ceiling : Math.min(ceiling, maxLength);
  if (length > max) return messages.formTooLong(max);

  if (field.type === 'email' && (text.length > 254 || !EMAIL.test(text))) {
    return messages.formInvalidEmail;
  }
  if (field.type === 'number' && !isNumber(text)) return messages.formInvalidNumber;
  if (field.type === 'url' && !isHttpUrl(text)) return messages.formInvalidUrl;
  if (field.type === 'select' && !(field.options ?? []).some((option) => option.value === text)) {
    return messages.formInvalidOption;
  }

  if (minLength !== undefined && length < minLength) return messages.formTooShort(minLength);
  const subject = pattern ? patternSubject(field, text) : null;
  if (pattern && subject !== null) {
    const expression = compilePattern(pattern);
    if (expression !== null && !expression.test(subject)) return messages.formInvalidFormat;
  }
  return null;
}
