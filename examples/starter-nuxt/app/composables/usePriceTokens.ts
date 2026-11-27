import { computed, inject, type ComputedRef, type InjectionKey } from 'vue';
import { useEldraUiCurrency, useEldraUiLocale } from '@eldrajs/ui';
import {
  formatToken,
  hasTokens,
  parseToken,
  resolvePriceNode,
  toMajorUnits,
  resolveTokens,
  type ResolveTokensOptions,
  type StoreAmounts,
} from '@eldrajs/sdk/tokens';
import { decodeStega, encodeStega, type StegaPricePart } from '@eldrajs/theme-core/stega';
import { formatMoney } from '../storefront/money';
import { STOREFRONT_KEY } from '../storefront/types';

/**
 * **Price tokens** (WS-1474, WS-1473): a merchant can put a price in any text field of any block —
 * `Free shipping over ⟦store freeShippingThreshold⟧!`, `⟦price#a3f ISK=4790 EUR=3200⟧ a box` — and
 * the page writes it in the shopper's currency, formatted exactly like every `<Price>` beside it.
 * Each currency's amount is the merchant's own, never converted; a sentence whose price has no
 * amount in the shopper's currency is left out (`@eldrajs/sdk/tokens`' `resolveTokens`).
 *
 * No block does anything for this: `useBlockData` hands every block its data with every string
 * already written out (`resolveBlockTokens`), and provides the rich-text resolver its
 * `EldraRichText` reads for a `price` node.
 */

/**
 * The store's own amounts for `⟦store …⟧` tokens, in minor units per currency —
 * `{ freeShippingThreshold: { ISK: 1500000 } }`. `@eldrajs/theme-nuxt` reads them from the
 * delivery methods once at build (`runtimeConfig.public.eldra.storeAmounts`) and
 * `app/plugins/eldra-ui-messages.ts` provides them; Storybook and the block tests provide the
 * Northwind demo's. Absent, every store-setting token's sentence is left out.
 */
export const STORE_AMOUNTS_KEY: InjectionKey<StoreAmounts | null> = Symbol.for(
  'eldra.starter.store-amounts'
) as InjectionKey<StoreAmounts | null>;

/** The store's own amounts for its settings, as `app/plugins/eldra-ui-messages.ts` provides them. */
export function useStoreAmounts(): StoreAmounts | null {
  return inject(STORE_AMOUNTS_KEY, null);
}

/**
 * One store setting's amount in one currency, in **major units** like every storefront amount
 * (`app/storefront/types.ts`): `freeShippingThreshold` in ISK is the lowest free-shipping threshold
 * among the store's delivery methods in ISK. `null` when the store has none in that currency —
 * never another currency's amount, never converted.
 */
export function storeAmountIn(
  amounts: StoreAmounts | null,
  name: string,
  currency: string | null | undefined
): number | null {
  if (currency === null || currency === undefined || currency === '') return null;
  const minor = amounts?.[name]?.[currency];
  return typeof minor === 'number' && Number.isFinite(minor) && minor > 0
    ? toMajorUnits(minor, currency)
    : null;
}

/** How this page writes a token: the shopper's currency, the regional format, the theme's money. */
export function usePriceTokenOptions(): ComputedRef<ResolveTokensOptions> {
  // The **shopper's** currency — what the picker chose, the one product cards price in — not the
  // store's base currency `CURRENCY_KEY` carries: a shopper in euros reads the euro amount.
  const shopperCurrency = inject(STOREFRONT_KEY, null)?.currency.active;
  const storeCurrency = useEldraUiCurrency();
  const locale = useEldraUiLocale();
  const storeAmounts = inject(STORE_AMOUNTS_KEY, null);
  return computed(() => ({
    currency: shopperCurrency?.value ?? storeCurrency.value,
    locale: locale.value,
    storeAmounts,
    format: formatMoney,
  }));
}

/** A rich-text `price` node's text, for `provideEldraPrices`. */
export function priceNodeResolver(
  options: ComputedRef<ResolveTokensOptions>
): (attrs: unknown) => string | null {
  return (attrs) => resolvePriceNode(attrs, options.value);
}

/** One string with its tokens written out. */
function resolveString(value: string, options: ResolveTokensOptions): string {
  if (!hasTokens(value)) return value;
  const { cleaned, meta } = decodeStega(value);
  const written = resolveTokens(cleaned, options);
  // Every sentence left out (no amount in this currency): the value is empty, and must read as
  // empty to the block — a payload alone is invisible but not blank to `trim()`, so an info item
  // or a heading would still draw its icon or its wrapper around nothing.
  if (written.trim() === '') return '';
  // The builder preview's payload names the field. The text the page shows is no longer the text
  // the field stores, so the payload also carries the stored text (`parts`): the overlay edits
  // that on the canvas, each price as a chip, and posts every edit with its tokens intact.
  return meta === null
    ? written
    : encodeStega(written, { ...meta, parts: storedParts(cleaned, options) });
}

/** A field's stored text as the overlay edits it: plain runs, and each token with its label. */
function storedParts(text: string, options: ResolveTokensOptions): StegaPricePart[] {
  return text
    .split(/(⟦[^⟦⟧]*⟧)/)
    .filter((run) => run !== '')
    .map((run): StegaPricePart => {
      const token = run.startsWith('⟦') ? parseToken(run.slice(1, -1)) : null;
      if (token === null) return run;
      const label = formatToken(token, options);
      if (label !== null) return { token: run, label };
      const currency = options.currency ?? '';
      const what = token.kind === 'store' ? 'threshold' : 'price';
      return { token: run, label: `No ${currency} ${what}`.replace('  ', ' '), missing: true };
    });
}

/** A rich-text document: its `price` nodes are `EldraRichText`'s to write, not this walk's. */
function isRichTextDocument(value: object): boolean {
  return (value as { type?: unknown }).type === 'doc';
}

/**
 * The block data with every token in every string written out, at any depth (list items, groups).
 * Returns the very same object when nothing held a token, so a block with no prices pays one walk
 * and keeps its identity.
 */
export function resolveBlockTokens<T>(value: T, options: ResolveTokensOptions): T {
  if (typeof value === 'string') return resolveString(value, options) as T;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item: unknown) => {
      const next = resolveBlockTokens(item, options);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  if (isRichTextDocument(value)) return value;
  let out: Record<string, unknown> | null = null;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const next = resolveBlockTokens(item, options);
    if (next === item) continue;
    out ??= { ...(value as Record<string, unknown>) };
    out[key] = next;
  }
  return (out ?? value) as T;
}
