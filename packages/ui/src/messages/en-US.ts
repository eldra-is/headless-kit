/**
 * The English strings the components emit on their own — the ones a consumer
 * never passes in: an icon-only button's accessible name, a listbox's empty
 * state, a character counter. Everything else is content and comes from props
 * or slots.
 *
 * This object is the shape: `UiMessages` is `typeof enUS`, every other locale
 * is typed against it, and `src/messages/__tests__/parity.spec.ts` fails if a
 * locale is missing a key or changes a function's arity.
 *
 * Sentence case throughout, per the design spec's voice and content rules.
 */
export const enUS = {
  /** Empties a field or a selection. */
  clear: 'Clear',
  /** Dismisses a dialog, a drawer or a toast. */
  close: 'Close',
  /** Accompanies a spinner or a busy region. */
  loading: 'Loading',
  /**
   * Marks a field that may be left empty. The `FieldWrapper` renders it in parentheses, so the
   * spec's optional mark reads "(optional)" — hence the lower case here, unlike the labels above.
   */
  optional: 'optional',
  /** Marks a field that must be filled in. */
  required: 'Required',
  /** The search control's own label. */
  search: 'Search',
  /**
   * Shown by a `Select` with no value (spec "Select" -> Properties, `placeholder`: default
   * `"Select"`). Two words would not fit a narrow filter bar's trigger, and the field's own label
   * already says which choice this is.
   */
  selectPlaceholder: 'Select',
  /**
   * Shown by a `MultiSelect` with no value (spec "Multi-select" -> Properties, `placeholder`:
   * default `"Any"`). It reads as a filter's "no filter applied", which is what a multi-select
   * mostly is, and the field's own label says which choice it belongs to.
   */
  multiSelectPlaceholder: 'Any',
  /** Shown when a filtered list has nothing to show. */
  noResults: 'No results',
  /**
   * A `SearchBar`'s no-results title (spec "Search bar" -> Panel views, `none`: '"No results for
   * “q”"'). Deliberately not `noMatchesFor`, which is a `Select`'s own empty state and whose
   * "matches" is that section's own word.
   */
  noResultsFor: (query: string) => `No results for “${query}”`,
  /**
   * A `Select`'s empty state while a search query is showing (spec "Select" -> Behaviour, Search:
   * 'With no matches, the empty state "No matches for “query”" shows as real text'). The
   * curly quotation marks are the spec's own.
   */
  noMatchesFor: (query: string) => `No matches for “${query}”`,
  /** The overflow badge on a `MultiSelect` that cannot show every tag. */
  moreSelected: (n: number) => `+${n}`,
  /** The accessible name of a selected tag's remove button. */
  removeTag: (label: string) => `Remove ${label}`,
  /**
   * Names a `MultiSelect`'s tag list. Inside a `FieldWrapper` it is joined with the field's own
   * label, so the list reads "Selected categories".
   */
  selected: 'Selected',
  /** A `MultiSelect` footer's live count. */
  selectedCount: (n: number) => `${n} selected`,
  /** A `MultiSelect` footer's live count with nothing chosen. */
  noneSelected: 'None selected',
  /** Closes a `MultiSelect`'s popover. It commits nothing: every toggle already applied. */
  done: 'Done',
  /** The accessible name of a `QuantityStepper`'s minus button. */
  decrease: 'Decrease',
  /** The accessible name of a `QuantityStepper`'s plus button. */
  increase: 'Increase',
  /** The accessible name of a `QuantityStepper`'s field. */
  quantity: 'Quantity',
  /** A `QuantityStepper`'s polite live-region announcement after a settled change. */
  quantityUpdated: (n: number) => `Quantity: ${n}`,
  /** Appended to a link that opens a new browsing context. */
  opensInNewTab: '(opens in a new tab)',
  /** A position-in-a-set counter, e.g. a carousel's slide count. */
  counter: (n: number, max: number) => `${n} / ${max}`,
  /** A `Textarea`'s remaining-characters hint, announced once at 80% of the limit. */
  charactersLeft: (n: number) => `${n} ${n === 1 ? 'character' : 'characters'} left`,
  /** A `Textarea`'s over-the-limit hint, announced once when the limit is passed. */
  overLimit: (n: number) => `Over the limit by ${n}`,
  /** A product that cannot be bought. */
  soldOut: 'Sold out',
  /** The `SearchModal`'s field label. */
  searchTheShop: 'Search the shop',
  /** The `SearchBar`'s results-panel name, and the `SearchModal`'s. */
  searchSuggestions: 'Search suggestions',
  /** The heading of a search panel's product group. */
  searchProducts: 'Products',
  /** The heading of a search panel's collection group. */
  searchCollections: 'Collections',
  /** The heading of a search panel's articles-and-pages group. */
  searchJournal: 'Journal and help',
  /** The line under a search panel's "No results" title, above the suggestion chips. */
  searchAdvice: 'Check the spelling, or try one of these.',
  /** The `SearchModal`'s history group heading. */
  recentSearches: 'Recent searches',
  /** The `SearchModal`'s suggestions group heading. */
  popularSearches: 'Popular searches',
  /** Empties the search history (the spec's own row label). */
  clearRecent: 'Clear recent searches',
  /** The live-region announcement after a search. */
  resultsCount: (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`,
  /** The last row of a search results panel, which opens the full results page. */
  viewAllResults: (n: number) => (n === 1 ? 'See 1 result' : `See all ${n} results`),
  /** The keyboard hint beside a search control. */
  shortcutHint: 'Press / to search',
  /** The label of an error region. */
  error: 'Error',
};

/**
 * Every message a component can emit. A consumer overrides any subset of it,
 * per component (the `messages` prop) or app-wide
 * (`provideEldraUiMessages`).
 */
export type UiMessages = typeof enUS;
