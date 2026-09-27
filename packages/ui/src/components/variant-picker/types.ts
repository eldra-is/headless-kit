/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type VariantPickerPart =
  | 'root'
  | 'legend'
  | 'legendValue'
  | 'options'
  | 'option'
  | 'radio'
  | 'label'
  | 'swatch'
  | 'soldOutLine';

/** Pills for text values (sizes, capacities), swatches for colours and glazes. */
export type VariantPickerType = 'pills' | 'swatches';

/**
 * One product option. `swatch` is a colour from product data — the spec's "only per-item colour"
 * — applied as an inline style, never a class. `available: false` marks sold out, or a combination
 * that is sold out given the other variant already chosen; either way it stays selectable (spec
 * "Variant picker" → Do/Don't: "Don't disable or hide sold-out options").
 */
export interface VariantPickerOption {
  value: string;
  label: string;
  swatch?: string;
  available: boolean;
}

export interface VariantPickerProps {
  /** The selected value (two-way). Defaults to the first available option (spec Properties table). */
  modelValue?: string;
  /**
   * The radios' shared native `name`, and — unless `legend` is given — the visible option name in
   * the legend too ("Size", "Colour"): exactly what the spec's Properties table asks for. A page
   * with more than one picker sharing an option name (two product cards each with their own
   * "Size", a product-detail form rendered twice) must give each picker its own `name`
   * ("size-<productId>", or a `useUiId()` value); this component does not namespace it for you.
   */
  name: string;
  /**
   * The human legend, when it must differ from `name` (added 2026-09-27).
   *
   * `name` does two jobs, and a page that needs unique radio-group names could not do the first
   * without breaking the second: giving a picker `name: "size-sku-4471"` so its radios don't join
   * the neighbouring card's group also printed "size-sku-4471:" above the pills. With `legend`
   * the two separate — `name` stays the grouping key, `legend` is what a shopper reads — and
   * `name`'s own behaviour is unchanged whenever `legend` is absent, so every existing caller
   * keeps the spec's single-prop shape. The starter's `product-detail` block is the consumer.
   *
   * It is also what the picker's `aria` wiring uses: the `<fieldset>`'s own `<legend>` is the
   * accessible name of the radio group, so a unique-`name` picker with no `legend` would read its
   * internal grouping key out to a screen reader.
   */
  legend?: string;
  /** Pills for text values, swatches for colours. Defaults to `"pills"`. */
  type?: VariantPickerType;
  /** The options. `swatch` colours are the one allowed per-item colour, set as an inline style. */
  options: VariantPickerOption[];
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<VariantPickerPart, string>>;
}
