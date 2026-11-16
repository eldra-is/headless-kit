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

/** Where `Button`'s loading spinner is drawn. */
export type ButtonSpinnerPlacement = 'overlay' | 'start';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type ButtonPart = 'leadingIcon' | 'label' | 'trailingIcon' | 'spinner';

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
   * NuxtLink's own contract. With neither `href` nor `to`, a component `as` (or `'a'`/`'button'`)
   * is ignored and this is a `<button>`, the same rule as `Link`'s `as`; any other string (`'span'`,
   * `'div'`) renders that tag with the button look and nothing interactive — no `type`,
   * `disabled`, `tabindex`, `aria-pressed`, `aria-disabled` or `aria-label` — for a part that only
   * looks like a button inside another control (a row that is itself the button). Its name is its
   * own text; an icon-only one is decorative.
   */
  as?: string | Component;
  /**
   * A router destination (a path or a route object) for an `as` component, handed to it as its
   * `to` prop, for a destination `href` cannot hold. Ignored without a component `as`. No `type`,
   * `disabled` or `aria-pressed` is set on the component; while disabled it is
   * `aria-disabled="true"`, out of the tab order, and its clicks are cancelled before the router
   * link's own handler sees them.
   */
  to?: string | Record<string, unknown>;
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
  /**
   * Where the spinner goes while `loading`. `"overlay"` (the default) centres it over the hidden
   * label and icons, and `label` becomes the accessible name. `"start"` draws it in the leading
   * icon's place, before the label, which stays visible and keeps naming the button.
   */
  spinnerPlacement?: ButtonSpinnerPlacement;
  /**
   * While `loading` with the overlay spinner, keep the hidden label in the accessibility tree
   * (transparent rather than `visibility: hidden`), so slot content keeps naming the button when
   * there is no `label`. A `label` still wins as the name. Default `false`.
   */
  keepNameWhileLoading?: boolean;
  /** Full width of its container. */
  block?: boolean;
  /**
   * Toggle buttons only: sets `aria-pressed`. Leave it undefined for ordinary buttons. `true` draws
   * the pressed fill (`surface-strong`, `border-strong` boundary) on `outline` and `ghost`.
   */
  pressed?: boolean;
  /** Native `disabled`. A disabled link button loses its `href` so it is not focusable either. */
  disabled?: boolean;
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the button
   * itself with `class`.
   */
  classes?: Partial<Record<ButtonPart, string>>;
}

/** ButtonGroup has no inner parts: style the group itself with `class`. */
export type ButtonGroupPart = never;

export interface ButtonGroupProps {
  /**
   * Renders the group as a segmented control: no gap, square inner corners, neighbours overlapping
   * by 1px and `role="group"`. Give it an `aria-label` ("View"), which falls through to the root.
   */
  attached?: boolean;
}
