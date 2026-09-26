import type { UiMessages } from '../../composables/useMessages';
import type {
  SearchBarPart,
  SearchResultItem,
  SearchResultType,
  SearchResults,
  SearchRow,
  SearchSection,
  SearchSelectType,
} from '../search-bar/types';

// The data shapes are exactly `SearchBar`'s — "the same live search … it shares the Search bar's
// … data contract" (spec "Search modal"). Re-exported here so a consumer importing from this
// component's own module never has to know they live in `search-bar/types.ts`.
export type {
  SearchResultItem,
  SearchResultType,
  SearchResults,
  SearchRow,
  SearchSection,
  SearchSelectType,
};

/**
 * The parts a consumer can restyle through `classes`. The seven the modal's own frame draws
 * (`root`, `form`, `field`, `leadingIcon`, `clear`, `close`, `results`, `footer`), plus every part
 * of the reused `SearchResultsPanel` (`panel`, `listbox`, `section`, … `liveRegion`) — `classes` is
 * forwarded straight into that child, so a consumer restyles the frame and the rows through one
 * prop, the rows named exactly as `SearchBar`'s own anatomy already names them (controller ruling:
 * "align with SearchBar's part names where the same thing is meant").
 *
 * `results` is the frame's own bounding box around the reused panel (`min-h-0 flex-1 overflow-
 * hidden`) — distinct from that panel's own `panel` part, which is the scrollable box inside it and
 * is the exact same element `SearchBar`'s popup uses, just drawn `flat` (see `SearchResultsPanel`'s
 * own `flat` prop).
 */
export type SearchModalPart =
  | 'root'
  | 'form'
  | 'field'
  | 'leadingIcon'
  | 'clear'
  | 'close'
  | 'results'
  | 'footer'
  | SearchBarPart;

export interface SearchModalProps {
  /** Shows the modal with `showModal()` when `true`, closes it when `false` (two-way). */
  modelValue?: boolean;
  /**
   * The query (two-way, its own named `v-model:query` rather than `modelValue` — this component
   * already uses `modelValue` for its open/closed state, the way every other modal surface in this
   * package does). Reset to `""` whenever the modal closes, by any route.
   */
  query?: string;
  /** The dialog's accessible name (package rule: the accessible-name-only prop is always
   *  `ariaLabel`, never a bare noun — see `Drawer`'s own `ariaLabel`). Defaults to
   *  `messages.search` ("Search"), the spec's own `<dialog aria-label="Search">`. */
  ariaLabel?: string;
  /** The predictive-search response, as `SearchBar`'s. */
  results?: SearchResults;
  /** A request is in flight. The loading view shows only after 300ms, as `SearchBar`'s. */
  loading?: boolean;
  /** Up to 5 recent queries. Read from browser storage — the same key `SearchBar` reads — when
   *  this is not given. */
  recent?: string[];
  /** Popular searches, max 6. Also the suggestions under "No results". */
  popular?: string[];
  /** Shows the recent-searches list. Defaults to `true`. */
  showRecent?: boolean;
  /** Which result groups appear, in the spec's fixed order. Defaults to all four. */
  resultTypes?: SearchResultType[];
  /** The field's placeholder. Defaults to `messages.searchTheShop`. */
  placeholder?: string;
  /** The form's action. The query is submitted as `q`. Defaults to `/search`. */
  action?: string;
  /**
   * Enables the `/` and `⌘K`/`Ctrl+K` shortcuts (spec: "Only one search modal on a page may enable
   * it"). `/` opens this modal only while no `SearchBar` on the page currently owns that key (see
   * `shortcutOwner.ts`); `⌘K`/`Ctrl+K` always opens it, from anywhere. Defaults to `true`.
   */
  shortcut?: boolean;
  /** Message overrides for this control alone. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. Forwarded to the reused
   *  `SearchResultsPanel` for every part that is its own. */
  classes?: Partial<Record<SearchModalPart, string>>;
}
