const BIT_0 = '​'; // ZERO WIDTH SPACE
const BIT_1 = '‌'; // ZERO WIDTH NON-JOINER
const DELIM = '﻿'; // ZERO WIDTH NO-BREAK SPACE
const STEGA_RUN = /﻿[​‌]*﻿/g;

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

/** cleaned only, fast path — removes any U+FEFF…U+FEFF zero-width run. */
export function stripStega(value: string): string {
  STEGA_RUN.lastIndex = 0;
  return value.replace(STEGA_RUN, '');
}

export function decodeStega(value: string): { cleaned: string; meta: StegaMeta | null } {
  STEGA_RUN.lastIndex = 0;
  const match = STEGA_RUN.exec(value);
  if (match === null) return { cleaned: value, meta: null };
  const cleaned = stripStega(value);
  const bits = match[0].slice(1, -1);
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
