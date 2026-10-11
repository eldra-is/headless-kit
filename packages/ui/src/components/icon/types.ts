import type { Component } from 'vue';

/**
 * An icon component. In practice a Tabler outline icon
 * (`import { IconSearch } from '@tabler/icons-vue'`), but any component that
 * renders an `<svg>` and accepts class and ARIA attributes works — the package
 * does not depend on `@tabler/icons-vue`, the consumer passes the component.
 */
export type IconComponent = Component;

/**
 * The design spec's four icon sizes: 1rem (small), 1.25rem (default),
 * 1.5rem (feature tiles) and 2rem (empty states).
 */
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

/** The parts a consumer can restyle through `classes`. */
export type IconPart = 'root';

export interface IconProps {
  /** The icon component to render. */
  icon: IconComponent;
  /** One of the spec's four sizes. Defaults to `md` (1.25rem). */
  size?: IconSize;
  /**
   * An accessible name. Give it only when the icon carries meaning nothing
   * else on screen carries; without it the icon is decorative and hidden from
   * assistive technology.
   */
  label?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<IconPart, string>>;
}
