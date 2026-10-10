import type { Component } from 'vue';
import type { IconComponent } from '../icon/types';

/**
 * The six variants of the design spec's Button: visual weight and meaning.
 *
 * `secondary` is the accent fill and is for promotions only; `link` is an
 * action that should read like text ("Size guide", "Clear all"), which is a
 * Button, not a Link.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'danger';

/** The spec's three button heights: 2rem, 2.5rem and 3rem. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type ButtonPart = 'container' | 'leadingIcon' | 'label' | 'trailingIcon' | 'spinner';

export interface ButtonProps {
  /** Visual weight and meaning. Required: there is no neutral default in the spec. */
  variant: ButtonVariant;
  /** One of the spec's three sizes. Defaults to `md`. */
  size?: ButtonSize;
  /** The native button type. Ignored when `href` is set. */
  type?: 'button' | 'submit' | 'reset';
  /** When set, renders an `<a href>` styled as a button. Use it only for navigation. */
  href?: string;
  /**
   * Render the link form as a different tag or component instead of a native `<a>` — a router
   * link component, for example `resolveComponent('NuxtLink')`, so an in-app destination routes
   * instead of reloading the document. A string is used as the tag directly and still receives
   * `href`; a component receives the destination as its `to` prop instead, matching Vue Router /
   * NuxtLink's own contract. Ignored when there is no `href`: without a destination this is a
   * `<button>`, and the same rule as `Link`'s `as`.
   */
  as?: string | Component;
  /** Leading icon component, for example `IconShoppingBag`. */
  iconLeft?: IconComponent;
  /** Trailing icon component, for example `IconArrowRight` on "Continue to checkout". */
  iconRight?: IconComponent;
  /** A square button with only an icon. `label` is required and becomes the accessible name. */
  iconOnly?: boolean;
  /** The icon for `iconOnly`. */
  icon?: IconComponent;
  /**
   * The accessible name. Required with `iconOnly` ("Add Merino crew sweater to wishlist"), and
   * used as the name while `loading` ("Adding to cart"). With no default slot it is also the
   * visible label.
   */
  label?: string;
  /** Shows the spinner, sets `aria-busy="true"` and keeps the button's width and focus. */
  loading?: boolean;
  /** Full width of its container. */
  block?: boolean;
  /** Toggle buttons only: sets `aria-pressed`. Leave it undefined for ordinary buttons. */
  pressed?: boolean;
  /** Native `disabled`. A disabled link button loses its `href` so it is not focusable either. */
  disabled?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ButtonPart, string>>;
}

/** The one part of a ButtonGroup a consumer can restyle. */
export type ButtonGroupPart = 'root';

export interface ButtonGroupProps {
  /**
   * Renders the group as a segmented control: no gap, square inner corners, neighbours overlapping
   * by 1px and `role="group"`. Give it an `aria-label` ("View"), which falls through to the root.
   */
  attached?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ButtonGroupPart, string>>;
}
