import type { UiMessages } from '../../composables/useMessages';

/** One row of a search results panel. Only products carry a price and a thumbnail. */
export interface SearchResultItem {
  /** Stable per row: the key Vue renders it with, and part of its element id. */
  id: string;
  /** The row's own text. The part of it the query matched is marked. */
  title: string;
  /** Where the row goes. Rows are real links, so a click, a middle click and Enter all work. */
  href: string;
  /** A product's price, already formatted by the store ("$96.00"). */
  price?: string;
  /** A product's thumbnail. */
  image?: string;
  /** The thumbnail's alt text. Empty (or absent) marks it decorative beside the title. */
  imageAlt?: string;
}

/**
 * A predictive-search response (spec "Search bar" → Properties, `results`).
 *
 * `total` is the *whole* result count, not the number of rows here: the panel shows at most 4
 * products, 3 collections and 3 journal-and-help rows, and the "See all N results" row carries
 * `total`.
 */
export interface SearchResults {
  products: SearchResultItem[];
  collections: SearchResultItem[];
  articles: SearchResultItem[];
  pages: SearchResultItem[];
  total: number;
}

/** The four result groups a store can turn on (spec "Search bar" → Properties, `resultTypes`). */
export type SearchResultType = 'products' | 'collections' | 'articles' | 'pages';

/**
 * What the `select` event carries alongside the chosen item: one of the four result types, or
 * `viewAll` for the last row, which is also a link and also worth knowing about.
 */
export type SearchSelectType = SearchResultType | 'viewAll';

/**
 * The parts a consumer can restyle through `classes`, named as the spec's anatomy names them.
 *
 * Four are not in the brief's list but are in the spec's own anatomy, and a part the component
 * draws and a consumer cannot reach is not a part: `listbox` (the panel is the popup box; the
 * listbox is the element inside it that owns the options, so the no-results message and the
 * loading rows can be siblings of it rather than invalid children), `chip` (anatomy item 9),
 * `clearRecent` (the idle view's "Clear recent searches" row) and `liveRegion` (anatomy item 11).
 * `itemArrow` is the Sizes table's "Active arrow".
 */
export type SearchBarPart =
  | 'root'
  | 'form'
  | 'field'
  | 'leadingIcon'
  | 'clearButton'
  | 'busy'
  | 'shortcutHint'
  | 'panel'
  | 'listbox'
  | 'section'
  | 'sectionHeading'
  | 'item'
  | 'itemImage'
  | 'itemTitle'
  | 'itemMeta'
  | 'itemArrow'
  | 'recent'
  | 'clearRecent'
  | 'popular'
  | 'chip'
  | 'viewAll'
  | 'loading'
  | 'empty'
  | 'liveRegion';

/** The spec's two search-bar sizes: 2.5rem in a header or toolbar, 3rem on the Search page. */
export type SearchBarSize = 'md' | 'lg';

export interface SearchBarProps {
  /** The query (two-way). */
  modelValue?: string;
  /** `md` in the header and toolbars, `lg` on the Search page. */
  size?: SearchBarSize;
  /** Fully rounded field, for a header. */
  pill?: boolean;
  /** The form's action. The query is submitted as `q`. Defaults to `/search`. */
  action?: string;
  /** The field's accessible name. Defaults to `messages.searchTheShop`. */
  label?: string;
  /** The placeholder. Defaults to the label. */
  placeholder?: string;
  /** The predictive-search response. */
  results?: SearchResults;
  /** A request is in flight. The loading view shows only after 300ms. */
  loading?: boolean;
  /** Up to 5 recent queries. Read from browser storage when this is not given. */
  recent?: string[];
  /** Popular searches, max 6. Also the suggestions under "No results". */
  popular?: string[];
  /** Shows the recent-searches list. Defaults to `true`. */
  showRecent?: boolean;
  /** Which groups appear, in the spec's fixed order. Defaults to all four. */
  resultTypes?: SearchResultType[];
  /** Enables the `/` shortcut and its hint. Defaults to `true`. */
  shortcut?: boolean;
  /** Focus the field on mount. Only on the Search page itself. */
  autofocus?: boolean;
  /**
   * Where the results panel is rendered. `true` (default) teleports it to `document.body` — or to
   * the open native `<dialog>` the field sits in, which renders in the browser's top layer and
   * would otherwise cover it. A string is a CSS selector for your own target. `false` keeps the
   * panel inside the control, which is only right when nothing above it clips or stacks over it;
   * a search bar usually lives in a header, which is exactly such an ancestor.
   *
   * Read once, like every positioning option.
   */
  teleport?: boolean | string;
  /** Message overrides for this control alone. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<SearchBarPart, string>>;
}

/**
 * One navigable row of the panel, for the panel component and for `useListbox`.
 *
 * Every row is an option — the spec's Accessibility notes say so ("Every row, chip and 'See all' is
 * an `<a role="option">`") — and `kind` is what choosing one does: follow a link (`result`,
 * `viewAll`), fill the field and search (`recent`, `chip`), or empty the history (`clearRecent`).
 */
export interface SearchRow {
  /** Unique within the panel. `useListbox` moves between rows by this, and ids are built from it. */
  value: string;
  /** The row's text. Also `useListbox`'s label. */
  label: string;
  kind: 'result' | 'recent' | 'chip' | 'viewAll' | 'clearRecent';
  /** Which group a `result` row came from. */
  type?: SearchResultType;
  /** The item a `result` row draws, and what the `item` slot and the `select` event carry. */
  item?: SearchResultItem;
  /** Where a link row goes. `recent`, `chip` and `clearRecent` rows have none: they never navigate. */
  href?: string;
}

/** One block of the panel: a heading and the rows under it. */
export interface SearchSection {
  key: string;
  kind: 'result' | 'recent' | 'popular';
  heading: string;
  headingId: string;
  rows: SearchRow[];
}
