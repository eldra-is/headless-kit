/**
 * The buy box's stock line, derived — not stored. Spec `02-blocks.md` "Product detail" → States
 * gives four mutually exclusive states, each with its own tone, icon and words, and one of them
 * (low stock) is allowed to appear *only* when real inventory is at or below the author's
 * threshold. Keeping that decision in one pure function is what lets `__tests__/stock.spec.ts`
 * prove the whole matrix — including the combinations the Northwind demo catalogue cannot reach —
 * without mounting anything, and keeps `Block.vue` free of branching over four states in its
 * template.
 *
 * Every string is returned as a `MessageKey` plus its interpolation params, never as text: the
 * block renders it through `useT()` so both locales stay in step (Global Constraints, "Strings").
 */

/** The four states, in the order `deriveStockLine` tests them. */
export type StockState = 'out' | 'backorder' | 'low' | 'in';

/** `lowStockThreshold`'s stored values. `off` never shows "only N left" at all. */
export type LowStockThreshold = 'off' | '3' | '5' | '10';

export interface StockLineInput {
  /**
   * The product-level signal from the storefront source (`StorefrontProductListItem.stock`).
   * `preorder` is what makes a product a back-order; `out` marks the whole product sold out.
   */
  stock: 'in' | 'low' | 'out' | 'preorder';
  /** Real units of the variant the buy box is selling, or `null` when they are not known for it
   *  (`StorefrontProduct.inventory`). */
  inventory: number | null;
  /** Whether the selected combination of options can be bought at all. */
  variantAvailable: boolean;
  /** The selected combination, already joined for display ("Oat / M"). Empty for an option-less product. */
  variantLabel: string;
  /** The author's threshold. Anything but `off` arms the low-stock line. Required, not optional:
   *  the field's own default (`3`) belongs to the block, so this function never invents one. */
  threshold: LowStockThreshold;
  /** The date the next batch ships, for the back-order line (`StorefrontProduct.shipsBy`). */
  shipsBy?: string | null;
}

export interface StockLine {
  state: StockState;
  /** Drives the colour of the words and the icon. */
  tone: 'success' | 'warning' | 'danger';
  /** A Tabler outline icon name — one per state, so the state is never colour alone (1.4.1). */
  icon: 'circle-check' | 'alert-triangle' | 'circle-x' | 'clock';
  /** `@eldrajs/ui`'s own `StockBadge` level this state draws through. */
  level: 'in' | 'low' | 'out' | 'preorder';
  key: MessageKey;
  params?: Record<string, string | number>;
  /** The explanatory line under the status, when the state has one. */
  noteKey?: MessageKey;
  /** The quantity stepper's own maximum: real inventory when the store tracks it. */
  max: number;
}

/** Spec's own wording for an option-less product, where "Sold out in Oat / M" has no variant to
 *  name: the params are still passed, so the message keys below are chosen per case instead. */
const NO_VARIANT = '';

const THRESHOLD_COUNT: Record<Exclude<LowStockThreshold, 'off'>, number> = {
  '3': 3,
  '5': 5,
  '10': 10,
};

/** `QuantityStepper`'s own default maximum, for a store that does not track units. */
const UNTRACKED_MAX = 99;

function thresholdCount(threshold: LowStockThreshold): number | null {
  return threshold === 'off' ? null : (THRESHOLD_COUNT[threshold] ?? null);
}

/**
 * Tested in order, so a sold-out variant never also reads "low stock", and a back-order never
 * reads "in stock":
 *
 * 1. **Sold out** — the selected combination is unavailable, the whole product is out, or real
 *    inventory has reached zero. `danger`, circle-x, plus the restock note.
 * 2. **Back-order** — the product is made to order (`preorder`). `warning`, clock, plus the
 *    reserve-one note. Deliberately above the low-stock rule: spec States, Low stock row —
 *    "Never shown for made-to-order items".
 * 3. **Low stock** — real, tracked inventory at or below the author's threshold. `warning`,
 *    alert-triangle. Never without a threshold, never from the coarse `stock: 'low'` flag alone:
 *    spec Do — "show 'Only N left' only from live inventory".
 * 4. **In stock** — everything else. `success`, circle-check.
 */
export function deriveStockLine(input: StockLineInput): StockLine {
  const { stock, inventory, variantAvailable, variantLabel } = input;
  const named = variantLabel !== NO_VARIANT;
  const max = inventory !== null && inventory > 0 ? inventory : UNTRACKED_MAX;

  // A made-to-order product legitimately tracks zero units on hand: `preorder` is decided before
  // the zero-inventory rule so it never reads as sold out.
  if (!variantAvailable || stock === 'out' || (inventory === 0 && stock !== 'preorder')) {
    return {
      state: 'out',
      tone: 'danger',
      icon: 'circle-x',
      level: 'out',
      key: named ? 'product.soldOutIn' : 'product.soldOut',
      params: named ? { variant: variantLabel } : undefined,
      noteKey: 'product.restockNote',
      max: 1,
    };
  }

  if (stock === 'preorder') {
    const shipsBy = (input.shipsBy ?? '').trim();
    return {
      state: 'backorder',
      tone: 'warning',
      icon: 'clock',
      level: 'preorder',
      key: shipsBy === '' ? 'product.backorderPending' : 'product.backorderShips',
      params: shipsBy === '' ? undefined : { date: shipsBy },
      noteKey: 'product.backorderNote',
      max,
    };
  }

  const limit = thresholdCount(input.threshold);
  if (limit !== null && inventory !== null && inventory <= limit) {
    return {
      state: 'low',
      tone: 'warning',
      icon: 'alert-triangle',
      level: 'low',
      key: lowStockKey(inventory, named),
      params: named ? { count: inventory, variant: variantLabel } : { count: inventory },
      max,
    };
  }

  return {
    state: 'in',
    tone: 'success',
    icon: 'circle-check',
    level: 'in',
    key: 'product.inStock',
    params: undefined,
    max,
  };
}

/** Pluralised the way `header.cartOne`/`cartMany` are, and split again by whether there is a
 *  variant to name — Icelandic inflects the noun, so neither can be a `{count}`-only template. */
function lowStockKey(count: number, named: boolean): MessageKey {
  if (named) return count === 1 ? 'product.lowStockOneIn' : 'product.lowStockManyIn';
  return count === 1 ? 'product.lowStockOne' : 'product.lowStockMany';
}
