import type { Component } from 'vue';
import type { UiMessages } from '../../composables/useMessages';
import type { DrawerSide } from '../drawer/types';

/** A promotional card's content, resolved by `@eldrajs/theme-core`: the picture, the title and, for a product, its price. */
export interface NavMenuCard {
  /** The picture's URL: the card's own image, else its target's. The panel's card draws it with an empty `alt` beside the printed `title`; a custom card names it with `title`. */
  image: string;
  title: string;
  /** A product's lowest price in the store's major units; format it with the store's currency. */
  price?: number;
}

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
  /** `card` when the author made the entry a promotional card. With a resolved `card` the panel draws a picture, title and price; without one it is a plain link. */
  display?: 'card' | 'link';
  /** Set only on a resolved card; without it the entry is a plain link whatever `display` says. */
  card?: NavMenuCard;
  /**
   * `accent` draws a top-level entry in the accent colour, in the bar and in the drawer (a "Sale"
   * link). The entry carries it as `data-tone`. Not read on a panel's own entries.
   */
  tone?: NavMenuTone;
}

/** How a top-level entry is coloured: as its siblings (`default`), or in the accent colour. */
export type NavMenuTone = 'default' | 'accent';

/** One column of a panel, as a resolved Studio link's `sections`. */
export interface NavMenuSection {
  /** The column heading. Without one the column's links sit under no heading. */
  heading?: string | null;
  /** The heading's own page. Without one (or without a destination) the heading is plain text. */
  headingLink?: NavMenuLink | null;
  /** `card` when the author made the column cards; each entry decides by its own resolved `card`. */
  display?: 'card' | 'link';
  /** The column's entries. */
  links: readonly NavMenuLink[];
  /** The trailing "see all" entry under the column's links. */
  seeAll?: NavMenuLink | null;
}

/** `dropdown` hangs a compact panel under its trigger; `mega` spans the menu's positioning box. */
export type NavMenuPanelLayout = 'dropdown' | 'mega';

/** A column heading in a panel, matched to its entries by `label`; with an `href` it links to its own page. */
export interface NavMenuGroup {
  /** The heading, as the entries' `group` names it. */
  label: string;
  /** The heading's own page. Without one the heading is plain text. */
  href?: string | null;
  /** Opens in a new tab, with the hidden "opens in a new tab" text. */
  newTab?: boolean;
  /** Marks the page the visitor is on (`aria-current="page"`). */
  current?: boolean;
}

/** One top-level entry: a link when it has no children, a button opening a panel when it has. */
export interface NavMenuItem extends NavMenuLink {
  /** The panel's entries, one level deep. */
  children?: readonly NavMenuLink[];
  /** The panel's columns, each with its own heading. When present they are the panel and `children` is not read. */
  sections?: readonly NavMenuSection[];
  /** The panel's column headings, for those that link to a page of their own. */
  groups?: readonly NavMenuGroup[];
  /** Default `mega` when any child has a `group`, else `dropdown`. */
  layout?: NavMenuPanelLayout;
}

/** Below which viewport (`md`…) or nearest-container (`@tablet`…) breakpoint the bar becomes a menu button. */
export type NavMenuCollapse =
  | 'md'
  | 'lg'
  | 'xl'
  | '@tablet'
  | '@content'
  | '@wide'
  | 'never'
  | 'always';

/** `ghost` fills an entry on hover, as `Button`'s ghost variant does; `muted` is `Link`'s muted tone. */
export type NavMenuVariant = 'ghost' | 'muted';

/**
 * `accordion` folds each panel into a row that opens, its links indented beneath; `sections` lists every panel
 * open under a heading row (a link when the entry has a page), its links indented beneath.
 */
export type NavMenuDrawerLayout = 'accordion' | 'sections';

/**
 * `sheet` (default) opens the narrow-screen menu as a modal `Drawer` from the side. `inline` opens it
 * as a disclosure hanging under the menu's positioning box (a whole header, when the root is made
 * `static`), filling the window below and scrolling on its own; its button stays in view and reads
 * as Close while it is open.
 */
export type NavMenuDrawerMode = 'sheet' | 'inline';

/** Where a panel's content is drawn: under the bar, or in the narrow-screen drawer. */
export type NavMenuPlacement = 'bar' | 'drawer';

/** The parts of a panel's content; in the drawer each one is named with a `drawer` prefix. */
export type NavMenuPanelPart =
  | 'overview'
  | 'columns'
  | 'group'
  | 'groupHeading'
  | 'panelList'
  | 'panelItem'
  | 'groupLink'
  | 'panelLink'
  | 'panelLabel'
  | 'description'
  | 'badge'
  | 'card'
  | 'cardImage'
  | 'cardTitle'
  | 'cardPrice';

/** A panel part as the drawer names it: `panelLink` is `drawerPanelLink`. */
export type NavMenuDrawerPanelPart = `drawer${Capitalize<NavMenuPanelPart>}`;

/** What the `panelItem` slot is handed: the entry, the item whose panel holds it, and where it is drawn. */
export interface NavMenuPanelItemSlotProps {
  link: NavMenuLink;
  item: NavMenuItem;
  placement: NavMenuPlacement;
  /** True for a section's trailing "see all" entry. */
  isSeeAll?: boolean;
}

/** What the `groupHeading` slot is handed: the heading, its entries, their item, and where it is drawn. */
export interface NavMenuGroupHeadingSlotProps {
  group: string;
  links: NavMenuLink[];
  item: NavMenuItem;
  placement: NavMenuPlacement;
}

/** The parts a consumer can restyle through `classes`. The root is styled with `class`. */
export type NavMenuPart =
  | 'nav'
  | 'list'
  | 'item'
  | 'link'
  | 'trigger'
  | 'triggerIcon'
  | 'panel'
  | 'content'
  | NavMenuPanelPart
  | 'footer'
  | 'toggle'
  | 'toggleIcon'
  | 'drawerRoot'
  | 'drawer'
  | 'drawerHeader'
  | 'drawerClose'
  | 'drawerBody'
  | 'drawerList'
  | 'drawerItem'
  | 'drawerLink'
  | 'drawerTrigger'
  | 'drawerPanel'
  | 'drawerSectionHeading'
  | 'drawerNest'
  | NavMenuDrawerPanelPart
  | 'drawerFooter';

export interface NavMenuProps {
  /** The top-level entries, in order. */
  items: readonly NavMenuItem[];
  /** The bar's and its panels' look: `ghost` (default) fills on hover and while open, `muted` is quiet text. */
  variant?: NavMenuVariant;
  /** The open panel's index in `items` (two-way); `null` when none is open. */
  modelValue?: number | null;
  /** Whether the narrow-screen drawer is open (two-way, `update:drawerOpen`). */
  drawerOpen?: boolean;
  /** The navigation landmark's accessible name. Defaults to `messages.navMenuLabel`. */
  ariaLabel?: string;
  /** Below this breakpoint the bar collapses into the drawer. Default `lg`. */
  collapseBelow?: NavMenuCollapse;
  /** The edge the drawer slides in from. Default `left`. */
  drawerSide?: DrawerSide;
  /** How the drawer shows a panel: `accordion` (default) rows that open, or `sections` listed open. */
  drawerLayout?: NavMenuDrawerLayout;
  /** How the drawer opens: `sheet` (default), a modal side sheet, or `inline` under the bar. */
  drawerMode?: NavMenuDrawerMode;
  /** The drawer's entries when they differ from the bar's. Defaults to `items`. */
  drawerItems?: readonly NavMenuItem[];
  /** Also open a panel when a mouse pointer rests 150ms on its trigger; leaving closes it again. */
  openOnHover?: boolean;
  /**
   * Render every link as a different tag or component, such as a router link. A string is used as
   * the tag and keeps `href`; a component receives the destination as `to`.
   */
  linkAs?: string | Component;
  /**
   * The crop of every card's picture, as `width:height` (`4:3`, `16:9`): the aspect the theme's block
   * declares in `cards.aspect`. Default `4:3`; a value that is not two positive numbers is `4:3`.
   * A card's price is written in the ambient store currency and locale, as `Price` is.
   */
  cardAspect?: string;
  /** Message overrides. See `useMessages`. */
  messages?: Partial<UiMessages>;
  /** Per-part classes, appended to the part's own (a consumer class wins by cascade layer). */
  classes?: Partial<Record<NavMenuPart, string>>;
}
