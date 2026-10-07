/**
 * **How a variant option is displayed, and the one place that decision is made.**
 *
 * A merchant chooses it in Studio ("Display as": None / Color / Custom) and the platform stores it
 * on the option itself, so every storefront draws the same option the same way. Both storefront
 * sources go through these two functions — `gateway.ts` reading a live response, `demo.ts`
 * declaring its fixture — which is what keeps `StorefrontProductOption.type` derived from `kind`
 * rather than decided twice.
 *
 * Framework-free and dependency-free on purpose: `facets.ts`, `gateway.ts` and `demo.ts` all import
 * it, and a block may read it too (it is not a Nuxt global — see `CLAUDE.md`'s `blocks/**` rule).
 */
import type { StorefrontOptionKind } from './types';

/**
 * Every kind the platform stores, in its own order.
 *
 * Exported for a **fork**, not for this theme: `storefrontOptionKind` below is its only reader here.
 * The starter is source a customer owns, and a customer who adds a storefront source of their own
 * needs the vocabulary to validate against without restating it.
 */
export const STOREFRONT_OPTION_KINDS = ['none', 'color', 'custom'] as const;

/**
 * **What the wire said, or `none`.** A response from a gateway older than the contract that added
 * the field carries no `kind` at all, and a value this theme has never heard of is a kind it cannot
 * draw — both read as `none`, which is the display every option had before the field existed. Never
 * a throw: this runs on the product read's own path, where a refusal replaces the whole page with
 * an error alert over a presentational field.
 *
 * **It never looks at the option's key.** An option a merchant named "Color" or "Colour" and left on
 * None is pills, because that is what the merchant chose; guessing from the name is what this field
 * exists to replace.
 */
export function storefrontOptionKind(raw: unknown): StorefrontOptionKind {
  return STOREFRONT_OPTION_KINDS.includes(raw as StorefrontOptionKind)
    ? (raw as StorefrontOptionKind)
    : 'none';
}

/**
 * **`kind` plus a colour to show → the control.** `color` is the only kind that can draw swatches;
 * `none` and `custom` are both pills. A `custom` option is deliberately not a third control: it is
 * pills plus a name (`StorefrontProductOption.metadata`) a theme branches on when it wants one — see
 * `docs/starter-kit.md`.
 *
 * **A `color` option with no colours on any of its values draws pills.** The kind is *permission* to
 * show colours, never a promise that there are any: the platform leaves a value's `swatch` nullable
 * and Studio's own colour control is clearable, so "Display as: Color, colours not picked yet" and
 * "…cleared again" are both ordinary states a merchant can be in. A swatch picker handed no colours
 * draws one blank disc per value with the value's name in visually hidden text — a shopper sees a row
 * of identical empty circles and cannot tell M from XL — where the pills it replaced read their names
 * out loud. So the swatch control is earned by the data, exactly as a filter group's colour dots are
 * (`blocks/collection-grid/parts/groups.ts`'s `groupKindFor`, the same rule for the same reason), and
 * the two surfaces cannot disagree about one option.
 *
 * **One value without a colour inside an option that has them is kept, uncoloured** — the filter
 * panel's behaviour for the same case, where such a row draws an empty dot beside its name. In the
 * picker's swatch mode that one disc is also unlabelled, since the label is `sr-only` there; filling
 * the colour in (or clearing the rest, which drops the whole option to pills) is the merchant's fix,
 * and dropping the value instead would hide a variant a shopper can buy.
 *
 * `values` defaults to empty, so calling it with a kind alone answers `pills` for every kind — the
 * safe half of the decision, never an accidental swatch group.
 */
export function optionDisplayType(
  kind: StorefrontOptionKind,
  values: ReadonlyArray<{ swatch?: string | null }> = []
): 'swatches' | 'pills' {
  return kind === 'color' && values.some((value) => value.swatch) ? 'swatches' : 'pills';
}
