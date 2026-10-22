import type { Component } from 'vue';
import type { UiMessages } from '../../composables/useMessages';
import type { DrawerSide } from '../drawer/types';

/** One entry; `@eldrajs/theme-core`'s `ResolvedLink` (a resolved Studio link tree) fits it as is. */
export interface NavMenuLink {
  /** The visible text. An entry with no label (`null` or empty) is not rendered. */
  label: string | null;
  /** The destination. Without one the entry renders as plain text, never a dead link. */
  href?: string | null;
  /** Opens in a new tab, with the hidden "opens in a new tab" text. */
  newTab?: boolean;
  /** A second line under the label, for a mega panel. */
  description?: string | null;
  /** A short tag after the label, such as "Coming soon". */
  badge?: string | null;
  /** The column heading this entry sits under; entries sharing one form a column. */
  group?: string | null;
  /** Marks the page the visitor is on (`aria-current="page"`). */
  current?: boolean;
}

/** `dropdown` hangs a compact panel under its trigger; `mega` spans the menu's positioning box. */
export type NavMenuPanelLayout = 'dropdown' | 'mega';

/** One top-level entry: a link when it has no children, a button opening a panel when it has. */
export interface NavMenuItem extends NavMenuLink {
  /** The panel's entries, one level deep. */
  children?: readonly NavMenuLink[];
  /** Default `mega` when any child has a `group`, else `dropdown`. */
  layout?: NavMenuPanelLayout;
}

/** Below which viewport breakpoint the bar turns into a menu button and a `Drawer`. */
export type NavMenuCollapse = 'md' | 'lg' | 'xl' | 'never';

/** The parts a consumer can restyle through `classes`. */
export type NavMenuPart =
  | 'root'
  | 'nav'
  | 'list'
  | 'item'
  | 'link'
  | 'trigger'
  | 'triggerIcon'
  | 'panel'
  | 'content'
  | 'overview'
  | 'columns'
  | 'group'
  | 'groupHeading'
  | 'panelList'
  | 'panelItem'
  | 'panelLink'
  | 'panelLabel'
  | 'description'
  | 'badge'
  | 'footer'
  | 'toggle'
  | 'toggleIcon'
  | 'drawer'
  | 'drawerList'
  | 'drawerItem'
  | 'drawerLink'
  | 'drawerTrigger'
  | 'drawerPanel'
  | 'drawerFooter';

export interface NavMenuProps {
  /** The top-level entries, in order. */
  items: readonly NavMenuItem[];
  /** The open panel's index in `items` (two-way); `null` when none is open. */
  modelValue?: number | null;
  /** Whether the narrow-screen drawer is open (two-way, `update:drawerOpen`). */
  drawerOpen?: boolean;
  /** The navigation landmark's accessible name. Defaults to `messages.navMenuLabel`. */
  ariaLabel?: string;
  /** Below this viewport breakpoint the bar collapses into the drawer. Default `lg`. */
  collapseBelow?: NavMenuCollapse;
  /** The edge the drawer slides in from. Default `left`. */
  drawerSide?: DrawerSide;
  /** Also open a panel when a mouse pointer rests on its trigger; leaving closes it again. */
  openOnHover?: boolean;
  /**
   * Render every link as a different tag or component, such as a router link. A string is used as
   * the tag and keeps `href`; a component receives the destination as `to`.
   */
  linkAs?: string | Component;
  /** Message overrides. See `useMessages`. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<NavMenuPart, string>>;
}
