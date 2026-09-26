// `AvatarGroup`'s own list join is not `reviewsWord`'s kind of formatting problem — it needs
// `Intl.ListFormat`, not a plural rule — so it lives in its own module rather than growing a
// third helper here; see `src/utils/listFormat.ts#formatConjunctionList`.
import { formatConjunctionList } from '../utils/listFormat';

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
/**
 * Shared between `rating` and `reviewCount` below, so the two sentences that both name a review
 * count (`Rating`'s accessible sentence and the linked variant's visible "128 reviews" text) never
 * drift onto two different plural rules.
 */
function reviewsWord(n: number): string {
  return n === 1 ? 'review' : 'reviews';
}

export const enUS = {
  /** Empties a field or a selection. */
  clear: 'Clear',
  /** Dismisses a dialog, a drawer or a toast. */
  close: 'Close',
  /**
   * A `Drawer`'s close button, when the drawer has a name to put in it (spec "Drawer" →
   * Accessibility: "Close button names the drawer: 'Close cart', 'Close menu', 'Close filters'").
   * `name` is whatever names the drawer — its `title` text if it has one, else its `ariaLabel` —
   * so a consumer names the exact wording by choosing that prop's value (`title="Cart"` reads
   * "Close Cart"). Falls back to the plain `close` above when the drawer has neither.
   */
  closeDrawer: (name: string) => `Close ${name}`,
  /** A `Toast`'s close button (spec "Toast" -> Accessibility: `aria-label="Dismiss notification"`)
   *  — distinct from `close` above, which is the generic word `Dialog` and future modal surfaces
   *  use for the same button. */
  dismissNotification: 'Dismiss notification',
  /** A `Toaster`'s own region (spec "Toast" -> Accessibility: `aria-label="Notifications"`, on the
   *  `role="status" aria-live="polite"` element). */
  notifications: 'Notifications',
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
  /** A product that cannot be bought. `ProductCard`'s own sold-out `Badge`, and `StockBadge`'s
   * default copy for `level="out"` — one key, not two, for the same English/Icelandic phrase. */
  soldOut: 'Sold out',
  /**
   * `ProductCard`'s "New" badge (spec "Product card" → Anatomy, part 2). A plain string, unlike
   * `quickAdd` below: the word never takes a value, so it needs no function.
   */
  newBadge: 'New',
  /**
   * `ProductCard`'s quick-add button's *visible* text (spec "Product card" → Anatomy, part 8:
   * "Quick add"). Separate from `quickAdd` below — see that key's own comment for why the two are
   * not the same string.
   */
  quickAddLabel: 'Quick add',
  /**
   * `ProductCard`'s quick-add button's full accessible name (spec "Product card" → Accessibility:
   * "Quick add names the product: 'Quick add' + hidden ' Merino crew sweater'"), a *function*
   * rather than the visible label plus an appended title: the English spec text always puts the
   * product name last, but a locale's natural word order need not — `is-IS`'s own translation
   * puts it in the middle ("Setja {title} í körfu") — so the whole sentence has to be one
   * catalogue entry a locale can reorder freely, not `quickAddLabel` plus a raw suffix glued on
   * by the component. Applied as the button's `aria-label`, which replaces the *visible* text for
   * accessible-name purposes (confirmed: a fallthrough `aria-label` on `<Button>` overrides its
   * own computed one — see `ProductCard.vue`'s own comment), so the visible/hidden split the spec
   * draws for English is honoured without constraining every locale to the same shape.
   */
  quickAdd: (title: string) => `Quick add ${title}`,
  /**
   * `ProductCard`'s loading skeleton's accessible name (spec "Product card" → Variants, Loading
   * row: `aria-label="Loading product"`).
   */
  loadingProduct: 'Loading product',
  /**
   * `ProductCard`'s colour dots' hidden summary (spec "Product card" → Anatomy, part 7: 'hidden
   * "Available in 5 colours"'; → Accessibility: "Colour dots are `aria-hidden`, summarised by
   * hidden 'Available in 5 colours'"). The dots themselves carry no text of their own.
   */
  swatchesAvailable: (n: number) => `Available in ${n} ${n === 1 ? 'colour' : 'colours'}`,
  /** `Image`'s live placeholder text, shown next to the photo icon when there is no `media` (spec
   * "Image" → Variants, "Placeholder (live)" row). */
  noImage: 'No image',
  /** `Image`'s live placeholder's accessible name (spec "Image" → Accessibility: 'otherwise it
   * gets `role="img"` and `aria-label="No image available"`'), omitted when `decorative` is on. */
  noImageAvailable: 'No image available',
  /**
   * `LogoItem`'s default `linkContext` (spec "Logo item" → Properties, `linkContext` row: `"
   * (stockist site)"` when `href` is external), appended to a linked logo's accessible name —
   * "Kiln Street (stockist site)". Only used when `href` looks external and no `linkContext` was
   * given; an on-site stockist page link gets no extra context.
   */
  stockistSite: ' (stockist site)',
  /** A `StockBadge`'s default copy for `level="in"` (spec "Badge" → Stock status line). */
  stockIn: 'In stock, ships in 1–2 days',
  /**
   * A `StockBadge`'s default copy for `level="low"` (spec "Badge" → Stock status line): "Low
   * stock: only 3 left" is the spec's own example with a quantity of 3. With no `quantity` there
   * is nothing to count, so the copy drops the count rather than fabricate one.
   */
  stockLow: (n: number | null) => (n === null ? 'Low stock' : `Low stock: only ${n} left`),
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
  /**
   * `Rating`'s one accessible sentence (spec "Rating" → Accessibility: "the wrapper has `role="img"`
   * and `aria-label="Rated 4.5 out of 5, 128 reviews"`"), reused verbatim as the linked variant's
   * `aria-label` too — see `Rating.vue`'s own comment for why both forms share one sentence rather
   * than the spec's separately worded linked hidden text. `value` is the already-rounded rating.
   */
  rating: (value: number, count: number) =>
    `Rated ${value.toFixed(1)} out of 5, ${count} ${reviewsWord(count)}`,
  /** `Rating`'s no-reviews state (spec "Rating" → Variants, "No reviews" row): "count = 0 renders
   * the no-reviews state ... never '0.0'." Read as normal text, not an `aria-label`. */
  noReviews: 'No reviews yet',
  /**
   * `Rating`'s linked-variant visible count text (spec "Rating" → Anatomy, part 3: "'(128)' on
   * cards; '128 reviews' underlined when linked") — the one piece of `Rating`'s own text the task
   * brief's two named keys (`rating`, `noReviews`) do not cover: the card form's `"(128)"` is a
   * literal parenthesised number with no word to pluralise, but the linked form's visible text is a
   * real English/Icelandic sentence fragment and so must come from `useMessages()` like every other
   * word this package renders.
   */
  reviewCount: (n: number) => `${n} ${reviewsWord(n)}`,
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
  /** `EmptyState`'s built-in "Try again" button (`variant="error"`, no `actions` slot given). */
  tryAgain: 'Try again',
  /**
   * The error summary's own line in the `./vee-validate` entry's `Form` (spec "Form layout" ->
   * States, Invalid on submit: "Long forms add an error summary alert at the top ... that lists a
   * link to each error"). The links below it are the messages themselves, so this one only has to
   * say how many there are.
   */
  formErrors: (n: number) =>
    n === 1 ? 'There is 1 problem with this form' : `There are ${n} problems with this form`,
  /**
   * `AvatarGroup`'s one accessible sentence (spec "Avatar" → Accessibility: "A group gets one
   * name: `role="group"`, `aria-label="Makers: Ingrid, Tomas, Maya and 4 more"`"). `names` is the
   * visible avatars' own names, in order; `more` is however many more people the group holds
   * beyond those — `0` when every person in the group already has a visible avatar, in which case
   * the sentence is just `label` plus the plain conjunction list with nothing appended.
   */
  avatarGroup: (label: string, names: string[], more: number) => {
    const items = more > 0 ? [...names, `${more} more`] : names;
    return `${label}: ${formatConjunctionList(items, 'en-US')}`;
  },
  /** A `FeatureCard`'s default link cue when linked (spec "Feature card" → Properties, `cue` row:
   * default `"Learn more"`). `cue` overrides it per instance. */
  learnMore: 'Learn more',
};

/**
 * Every message a component can emit. A consumer overrides any subset of it,
 * per component (the `messages` prop) or app-wide
 * (`provideEldraUiMessages`).
 */
export type UiMessages = typeof enUS;
