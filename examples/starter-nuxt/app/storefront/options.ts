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

/** Every kind the platform stores, in its own order. */
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
 * **`kind` → the control.** `color` is the only kind with a colour to show, so it is the only one
 * that draws swatches; `none` and `custom` are both pills. A `custom` option is deliberately not a
 * third control: it is pills plus a name (`StorefrontProductOption.metadata`) a theme branches on
 * when it wants one — see `docs/starter-kit.md`.
 */
export function optionDisplayType(kind: StorefrontOptionKind): 'swatches' | 'pills' {
  return kind === 'color' ? 'swatches' : 'pills';
}
