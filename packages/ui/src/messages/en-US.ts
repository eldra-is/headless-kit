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
  /** A `StockBadge`'s default copy for `level="in"` (spec "Badge" → Stock status line). */
  stockIn: 'In stock, ships in 1–2 days',
  /**
   * A `StockBadge`'s default copy for `level="low"` (spec "Badge" → Stock status line): "Low
   * stock: only 3 left" is the spec's own example with a quantity of 3. With no `quantity` there
   * is nothing to count, so the copy drops the count rather than fabricate one.
   */
  stockLow: (n: number | null) => (n === null ? 'Low stock' : `Low stock: only ${n} left`),
  /** A `StockBadge`'s default copy for `level="out"`. */
  stockOut: 'Sold out',
  /**
   * A `StockBadge`'s default copy for `level="preorder"` (spec "Badge" → Stock status line): the
   * spec's own example is "Pre-order, ships 14 Nov", but `StockBadge` has no `date` prop to fill
   * that in — a store that knows the ship date passes it here or overrides the whole line with
   * `message`. With no date this reads as plain "Pre-order".
   */
  stockPreorder: (date?: string) =>
    date === undefined || date === '' ? 'Pre-order' : `Pre-order, ships ${date}`,
  /**
   * A `Price`'s visually hidden label before the current amount when on sale (spec "Price" →
   * Anatomy, part 2). `labels.sale` overrides it per instance.
   */
  salePrice: 'Sale price',
  /**
   * A `Price`'s visually hidden label before the compare-at amount when on sale (spec "Price" →
   * Anatomy, part 3). `labels.regular` overrides it per instance.
   */
  regularPrice: 'Regular price',
  /**
   * A `Price`'s "From" label for a product whose variants differ in price (spec "Price" →
   * Properties, `from` row). `labels.from` overrides it per instance.
   */
  from: 'From',
  /**
   * A `Price`'s unit-price line (spec "Price" → Anatomy, part 4): "$6.00 / 100 g" — this is the
   * separator and unit half, appended after the formatted per-unit amount.
   */
  perUnit: (per: string) => `/ ${per}`,
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
  /**
   * The live-region announcement after a search (spec "Search bar" -> Behaviour, Announcements:
   * 'announces "4 results for mer" (singular "1 result for mer")'). The query is optional: a
   * results count with nothing to name — a filtered list, a Search page heading — reads "4 results".
   */
  resultsCount: (n: number, query?: string) =>
    query === undefined || query === ''
      ? `${n} ${n === 1 ? 'result' : 'results'}`
      : `${n} ${n === 1 ? 'result' : 'results'} for “${query}”`,
  /**
   * The last row of a search results panel, which opens the full results page (spec "Search bar":
   * '"See all N results for “q”" is always the last row'). The query is optional, for a panel that
   * has none to show — the Search modal's own "See all n results" row.
   */
  viewAllResults: (n: number, query?: string) => {
    const count = n === 1 ? 'See 1 result' : `See all ${n} results`;
    return query === undefined || query === '' ? count : `${count} for “${query}”`;
  },
  /** The keyboard hint beside a search control. */
  shortcutHint: 'Press / to search',
  /** The label of an error region. */
  error: 'Error',
  /**
   * The error summary's own line in the `./vee-validate` entry's `Form` (spec "Form layout" ->
   * States, Invalid on submit: "Long forms add an error summary alert at the top ... that lists a
   * link to each error"). The links below it are the messages themselves, so this one only has to
   * say how many there are.
   */
  formErrors: (n: number) =>
    n === 1 ? 'There is 1 problem with this form' : `There are ${n} problems with this form`,
};

/**
 * Every message a component can emit. A consumer overrides any subset of it,
 * per component (the `messages` prop) or app-wide
 * (`provideEldraUiMessages`).
 */
export type UiMessages = typeof enUS;
