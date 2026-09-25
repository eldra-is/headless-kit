/**
 * The design spec's three sizes (spec "Price" → Sizes). `md` is the odd one out: its current
 * price has no size of its own and inherits whatever the surrounding text sets (1rem by default),
 * which is why `PriceProps.size` defaults to `md` rather than to a fixed rem value.
 */
export type PriceSize = 'sm' | 'md' | 'lg';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them.
 * `srLabel` covers both hidden labels (the "Sale price" before `current` and the "Regular price"
 * before `compareAt`) — two elements sharing one part name, the same shape as a repeated part in
 * any list-like component. */
export type PricePart = 'root' | 'current' | 'compareAt' | 'from' | 'unit' | 'srLabel' | 'skeleton';

export interface PriceProps {
  /**
   * The current price, in minor units (cents) — for a zero-decimal currency like `ISK`, whole
   * units, since that currency has no minor unit to count in. Converted to major units with
   * `currencyFractionDigits(currency, locale)` before formatting.
   */
  amount: number;
  /**
   * The regular price, in minor units, same shape as `amount`. Sale state turns on automatically
   * only when this is greater than `amount`; a `compareAt` that is equal to or lower than `amount`
   * is ignored entirely (spec "Price" → Properties, `compareAt` row).
   */
  compareAt?: number | null;
  /** ISO 4217 currency code, e.g. `"USD"`, `"ISK"`. Defaults to `useEldraUiCurrency()`. */
  currency?: string;
  /** BCP 47 locale tag, e.g. `"en-US"`, `"is-IS"`. Defaults to `useEldraUiLocale()`. */
  locale?: string;
  /** See `PriceSize`. */
  size?: PriceSize;
  /** Shows the `labels.from` text before the price, for a product whose variants differ in price. */
  from?: boolean;
  /**
   * A per-unit price rendered on its own line ("$6.00 / 100 g"), required by law in some markets.
   * `amount` is in minor units, same conversion as the main price; `per` is rendered verbatim
   * after `messages.perUnit`'s separator (e.g. `"100 g"`).
   */
  unitPrice?: { amount: number; per: string } | null;
  /**
   * Overrides the three labels the component otherwise reads from `useMessages()`
   * (`salePrice`, `regularPrice`, `from`). Each key falls back to its message independently, so a
   * consumer overriding only `from` still gets the default hidden sale/regular labels.
   */
  labels?: Partial<{ sale: string; regular: string; from: string }>;
  /** Set on the root when the price's language differs from the page's, e.g. `"is"`. */
  lang?: string | null;
  /** Renders a text skeleton at 35% width instead of the price (spec "Price" → Properties). */
  loading?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<PricePart, string>>;
}
