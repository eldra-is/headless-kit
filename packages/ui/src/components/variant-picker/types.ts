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
   * The option name ("Size", "Colour"). Rendered in the legend and used, unmodified, as the
   * radios' shared native `name` — exactly what the spec's Properties table asks for. A page with
   * more than one picker sharing an option name (two product cards each with their own "Size")
   * must give each picker its own `name` ("size-<productId>"); this component does not namespace
   * it for you.
   */
  name: string;
  /** Pills for text values, swatches for colours. Defaults to `"pills"`. */
  type?: VariantPickerType;
  /** The options. `swatch` colours are the one allowed per-item colour, set as an inline style. */
  options: VariantPickerOption[];
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<VariantPickerPart, string>>;
}
