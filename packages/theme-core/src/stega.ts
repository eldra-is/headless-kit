const BIT_0 = '​'; // ZERO WIDTH SPACE
const BIT_1 = '‌'; // ZERO WIDTH NON-JOINER
const DELIM = '﻿'; // ZERO WIDTH NO-BREAK SPACE
/**
 * A payload run: U+FEFF, the bits, U+FEFF.
 *
 * The closing delimiter may be missing, because U+FEFF is whitespace to
 * `String.prototype.trim()` while the bit characters U+200B/U+200C are not: a
 * theme that renders `value.trim()` hands on a run that ends at its last bit.
 * That form is only recognised when at least one bit is present and nothing
 * but whitespace (or the end of the string) follows, which is exactly the
 * shape trimming leaves behind. A lone U+FEFF is therefore never a run, so a
 * merchant's own text keeps any U+FEFF it happens to contain instead of
 * having it read as an empty payload and deleted.
 */
const STEGA_RUN = /﻿[​‌]*﻿|﻿[​‌]+(?=\s|$)/g;

export interface StegaMeta {
  entryId: string;
  /** Dot path within entry data, e.g. "title" or "cta.label". List indices numeric: "items.2.title". */
  fieldPath: string;
  locale: string | null; // null for non-localized fields
}

/** value + zero-width payload suffix. Bits are emitted MSB-first per UTF-8 byte. */
export function encodeStega(value: string, meta: StegaMeta): string {
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  let bits = '';
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits += (byte >> bit) & 1 ? BIT_1 : BIT_0;
    }
  }
  return value + DELIM + bits + DELIM;
}

/** cleaned only, fast path — removes any U+FEFF…U+FEFF zero-width run (the
 * closing delimiter may be missing when the run ends the string). */
export function stripStega(value: string): string {
  STEGA_RUN.lastIndex = 0;
  return value.replace(STEGA_RUN, '');
}

export function decodeStega(value: string): { cleaned: string; meta: StegaMeta | null } {
  STEGA_RUN.lastIndex = 0;
  const match = STEGA_RUN.exec(value);
  if (match === null) return { cleaned: value, meta: null };
  const cleaned = stripStega(value);
  const run = match[0];
  const bits = run.endsWith(DELIM) && run.length > 1 ? run.slice(1, -1) : run.slice(1);
  if (bits.length === 0 || bits.length % 8 !== 0) return { cleaned, meta: null };
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i += 1) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (bits.charAt(i * 8 + j) === BIT_1 ? 1 : 0);
    }
    bytes[i] = byte;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (isStegaMeta(parsed)) return { cleaned, meta: parsed };
  } catch {
    // fall through: treat as no metadata
  }
  return { cleaned, meta: null };
}

function isStegaMeta(v: unknown): v is StegaMeta {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.entryId === 'string' &&
    typeof m.fieldPath === 'string' &&
    (m.locale === null || typeof m.locale === 'string')
  );
}
