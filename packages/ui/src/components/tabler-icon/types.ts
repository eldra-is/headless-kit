import type { IconSize } from '../icon/types';

/** The parts a consumer can restyle through `classes`. */
export type TablerIconPart = 'root';

export interface TablerIconProps {
  /** A `tabler-icon` field value: the export name Studio's picker stores (`IconCashRegister`) or Tabler's kebab-case name (`cash-register`). Empty renders nothing. */
  name?: string | null;
  /** One of `Icon`'s four sizes. Defaults to `md` (1.25rem). */
  size?: IconSize;
  /** An accessible name; without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  /** The outline stroke width. Defaults to the spec's 1.75; a filled icon has no stroke. */
  strokeWidth?: number;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<TablerIconPart, string>>;
}
