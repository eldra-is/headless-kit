import { formatPrice, numberFormat } from './format/number';

/**
 * **Price tokens**: a price inside any CMS text field, held as one merchant-entered amount per
 * currency and written in the shopper's currency when the page renders (WS-1474), or a store
 * setting such as the free-shipping threshold, whose amounts live in the store's own settings
 * (WS-1473).
 *
 * A token sits inside an ordinary string between U+27E6 `⟦` and U+27E7 `⟧`, characters reserved for
 * tokens so they can never collide with Studio's `{{variable}}` syntax:
 *
 * ```text
 * ⟦price#a3f ISK=1500000 EUR=10000⟧   one price, amounts in minor units per currency
 * ⟦store freeShippingThreshold⟧       a store setting
 * ```
 *
 * - `#a3f` is a short id (`[a-z0-9]{3,8}`) tying one price's copies across a field's locales.
 * - Each amount is an ISO 4217 code and a non-negative integer in that currency's **minor units**,
 *   entered by the merchant for that currency: never converted from another one.
 * - Exactly one space separates the parts; there is no escaping. Studio writes tokens, merchants
 *   never type them, and Core refuses a malformed one on write.
 *
 * Rich text carries the same price as an inline `price` node (`@eldrajs/rich-text`), not bracket
 * text; {@link resolvePriceNode} resolves its attributes with the same rules.
 *
 * **What a page shows**: the amount for the shopper's currency, formatted like every other price.
 * When it cannot (no amount in that currency, an unknown setting, a malformed token), the
 * **sentence** holding the token is left out, never converted, never another currency's amount,
 * never a raw token: {@link resolveTokens}.
 *
 * Framework-free and side-effect free; the shared contract is
 * `side-session-notes/…/price-tokens-spec.md` until it lands in `docs/themes.md`.
 */

export const TOKEN_OPEN = '⟦';
export const TOKEN_CLOSE = '⟧';

/** The store settings a `⟦store …⟧` token may name. */
export const STORE_TOKEN_NAMES = ['freeShippingThreshold'] as const;
export type StoreTokenName = (typeof STORE_TOKEN_NAMES)[number];

/** A price: amounts in minor units, keyed by ISO 4217 code. */
export interface PriceToken {
  kind: 'price';
  id: string;
  amounts: Record<string, number>;
}

/** A store setting the site fills in from the store's own settings. */
export interface StoreToken {
  kind: 'store';
  name: string;
}

/** Bracketed text that is not a well-formed token; it never resolves. */
export interface InvalidToken {
  kind: 'invalid';
  raw: string;
}

export type Token = PriceToken | StoreToken;
export type TokenSegment = string | Token | InvalidToken;

/**
 * Amounts the store publishes for its settings, in minor units per currency:
 * `{ freeShippingThreshold: { ISK: 1500000, EUR: 10000 } }`.
 */
export type StoreAmounts = Partial<Record<string, Record<string, number>>>;

export interface ResolveTokensOptions {
  /** The shopper's currency, ISO 4217. Absent: nothing resolves, every token's sentence hides. */
  currency: string | null | undefined;
  /** The locale money is written in: the organisation's regional format. */
  locale: string;
  /** The store's own amounts, for `⟦store …⟧` tokens. */
  storeAmounts?: StoreAmounts | null;
  /**
   * Writes a major-unit amount. Default `formatPrice` (`@eldrajs/sdk/format`); a theme passes its
   * own so a token and a `<Price>` beside it can never disagree.
   */
  format?: (amount: number, currency: string, locale: string) => string;
}

const ID = /^[a-z0-9]{3,8}$/;
const CURRENCY = /^[A-Z]{3}$/;
const AMOUNT = /^(0|[1-9][0-9]*)$/;
const NAME = /^[a-z][A-Za-z0-9]*$/;
/** A bracket pair with no bracket inside it. */
const TOKEN_RUN = /⟦([^⟦⟧]*)⟧/g;
/** Studio's preview payload (`@eldrajs/theme-core/stega`): kept when its sentence is left out. */
const STEGA_CHARS = /[﻿​‌]/g;

/** Whether the text holds any token bracket at all; the cheap test before anything else. */
export function hasTokens(text: string): boolean {
  return text.includes(TOKEN_OPEN) || text.includes(TOKEN_CLOSE);
}

/** The token inside one pair of brackets, or `null` when it is not well formed. */
export function parseToken(body: string): Token | null {
  const parts = body.split(' ');
  const head = parts[0] ?? '';
  if (head === 'store') {
    const name = parts[1] ?? '';
    return parts.length === 2 && NAME.test(name) ? { kind: 'store', name } : null;
  }
  if (!head.startsWith('price#')) return null;
  const id = head.slice('price#'.length);
  if (!ID.test(id)) return null;
  const amounts: Record<string, number> = {};
  for (const part of parts.slice(1)) {
    const [code, amount, extra] = part.split('=');
    if (extra !== undefined || code === undefined || amount === undefined) return null;
    if (!CURRENCY.test(code) || !AMOUNT.test(amount) || code in amounts) return null;
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) return null;
    amounts[code] = value;
  }
  return { kind: 'price', id, amounts };
}

/**
 * The text split into plain runs and tokens, in order. A stray bracket, or a bracket pair that is
 * not a well-formed token, becomes an `invalid` segment.
 */
export function parseTokens(text: string): TokenSegment[] {
  if (!hasTokens(text)) return text === '' ? [] : [text];
  const segments: TokenSegment[] = [];
  let at = 0;
  const pushText = (run: string): void => {
    if (run === '') return;
    // A bracket left over between tokens is never a token.
    const stray = run.search(/[⟦⟧]/);
    if (stray === -1) {
      segments.push(run);
      return;
    }
    if (stray > 0) segments.push(run.slice(0, stray));
    segments.push({ kind: 'invalid', raw: run.slice(stray) });
  };
  TOKEN_RUN.lastIndex = 0;
  for (let match = TOKEN_RUN.exec(text); match !== null; match = TOKEN_RUN.exec(text)) {
    pushText(text.slice(at, match.index));
    segments.push(parseToken(match[1] ?? '') ?? { kind: 'invalid', raw: match[0] });
    at = match.index + match[0].length;
  }
  pushText(text.slice(at));
  return segments;
}

/** The token as Studio writes it: `⟦price#a3f EUR=10000 ISK=1500000⟧`, codes sorted. */
export function serializeToken(token: Token): string {
  if (token.kind === 'store') return `${TOKEN_OPEN}store ${token.name}${TOKEN_CLOSE}`;
  const amounts = Object.keys(token.amounts)
    .sort()
    .map((code) => ` ${code}=${token.amounts[code]}`)
    .join('');
  return `${TOKEN_OPEN}price#${token.id}${amounts}${TOKEN_CLOSE}`;
}

/** How many minor units a major unit of the currency has: `ISK` 0, `EUR` 2, `KWD` 3. */
export function minorUnitDigits(currency: string): number {
  try {
    return numberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits as number;
  } catch {
    return 2;
  }
}

/** A minor-unit amount in major units: `toMajorUnits(10050, 'EUR')` is `100.5`. */
export function toMajorUnits(amount: number, currency: string): number {
  return amount / 10 ** minorUnitDigits(currency);
}

/** A major-unit amount in minor units, rounded: what Studio stores from what a merchant types. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorUnitDigits(currency));
}

/** The minor-unit amount a token stands for in the currency, or `null` when it has none. */
export function tokenAmount(
  token: Token,
  currency: string | null | undefined,
  storeAmounts?: StoreAmounts | null
): number | null {
  if (currency === null || currency === undefined || currency === '') return null;
  const amounts = token.kind === 'price' ? token.amounts : storeAmounts?.[token.name];
  const amount = amounts?.[currency];
  return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** One token written in the shopper's currency, or `null` when it cannot be. */
export function formatToken(token: Token, options: ResolveTokensOptions): string | null {
  const amount = tokenAmount(token, options.currency, options.storeAmounts);
  if (amount === null) return null;
  const currency = options.currency as string;
  const format = options.format ?? formatPrice;
  try {
    return format(toMajorUnits(amount, currency), currency, options.locale);
  } catch {
    return null;
  }
}

/**
 * A rich-text `price` node's attributes as a token: `{ id, amounts }` is a price, `{ setting }` a
 * store setting. `null` for attributes that are neither.
 */
export function priceNodeToken(attrs: unknown): Token | null {
  if (attrs === null || typeof attrs !== 'object') return null;
  const { id, amounts, setting } = attrs as {
    id?: unknown;
    amounts?: unknown;
    setting?: unknown;
  };
  if (typeof setting === 'string' && NAME.test(setting)) return { kind: 'store', name: setting };
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (amounts === null || typeof amounts !== 'object' || Array.isArray(amounts)) return null;
  const clean: Record<string, number> = {};
  for (const [code, amount] of Object.entries(amounts as Record<string, unknown>)) {
    if (!CURRENCY.test(code)) return null;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return null;
    clean[code] = amount;
  }
  return { kind: 'price', id, amounts: clean };
}

/** A rich-text `price` node written in the shopper's currency, or `null` when it cannot be. */
export function resolvePriceNode(attrs: unknown, options: ResolveTokensOptions): string | null {
  const token = priceNodeToken(attrs);
  return token === null ? null : formatToken(token, options);
}

/**
 * How many characters one token counts as toward a field's `maxLength`: about what a written price
 * is ("15.000 kr.", "€100.00"), not the length of its bracket text, which grows with every
 * currency and would refuse "Free delivery over ⟦store freeShippingThreshold⟧" in a 40-character
 * field.
 */
export const TOKEN_TEXT_LENGTH = 10;

/**
 * The text a `maxLength` validator counts: each well-formed token replaced by
 * {@link TOKEN_TEXT_LENGTH} characters, everything else as it is, so the validator keeps counting
 * the way it already does. Core and Studio count this, never the raw value.
 */
export function lengthText(text: string): string {
  if (!hasTokens(text)) return text;
  return parseTokens(text)
    .map((segment) =>
      typeof segment === 'string'
        ? segment
        : segment.kind === 'invalid'
          ? segment.raw
          : '0'.repeat(TOKEN_TEXT_LENGTH)
    )
    .join('');
}

/** The text's sentences, by `Intl.Segmenter` where the runtime has it, else the whole text. */
function sentences(text: string, locale: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter === undefined) return [text];
  try {
    return Array.from(
      new Segmenter(locale, { granularity: 'sentence' }).segment(text),
      (s) => s.segment
    );
  } catch {
    return [text];
  }
}

/** One sentence with its tokens written out, or `null` when any of them cannot be. */
function resolveSentence(sentence: string, options: ResolveTokensOptions): string | null {
  let out = '';
  for (const segment of parseTokens(sentence)) {
    if (typeof segment === 'string') {
      out += segment;
      continue;
    }
    if (segment.kind === 'invalid') return null;
    const written = formatToken(segment, options);
    if (written === null) return null;
    out += written;
  }
  return out;
}

/**
 * The text with every token written in the shopper's currency. A sentence holding a token that
 * cannot be written is left out whole, keeping any preview payload it carried (see `STEGA_CHARS`),
 * so a missing amount reads as a shorter text, never as a broken one. Text without tokens is
 * returned as it is.
 */
export function resolveTokens(text: string, options: ResolveTokensOptions): string {
  if (!hasTokens(text)) return text;
  const whole = resolveSentence(text, options);
  if (whole !== null) return whole;
  let kept = '';
  let payload = '';
  for (const sentence of sentences(text, options.locale)) {
    const written = resolveSentence(sentence, options);
    if (written !== null) kept += written;
    else payload += (sentence.match(STEGA_CHARS) ?? []).join('');
  }
  return kept.trimEnd() + payload;
}
