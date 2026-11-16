/** The parts a consumer can restyle through `Tabs`' `classes`, named as the spec's anatomy names
 *  them. `tab`, `indicator` and `panel` are drawn by the `Tab`/`TabPanel` children — in items mode
 *  `Tabs` forwards its own `classes.tab`/`.indicator`/`.panel` down to the children it renders; in
 *  slots mode a consumer restyles a single `Tab`/`TabPanel` through that component's own `class`
 *  (and a `Tab`'s `classes.indicator`) instead. */
export type TabsPart = 'list' | 'tab' | 'indicator' | 'panel';

/** Underline (default): a bar under the selected tab, sitting on the list's hairline. Pills: a
 *  filled, fully-rounded button — the fill itself is the "indicator". */
export type TabsVariant = 'underline' | 'pills';

/** `auto`: arrow keys select immediately. `manual`: arrow keys move focus only, `Enter`/`Space`
 *  selects — use only when a panel loads slowly. */
export type TabsActivation = 'auto' | 'manual';

/** One tab and its panel, for the data-driven `items` API. Equivalent to a `<Tab>`/`<TabPanel>`
 *  pair in the slots API — `Tabs` renders exactly that pair internally for each item. */
export interface TabsItem {
  /** The value selected, and the one `modelValue` holds when this tab is chosen. */
  value: string;
  /** The visible tab label. One to three words (spec "Tabs" → Properties, `items` row). */
  title: string;
  /** The panel's plain-text content. Use the slots API instead for richer panel content. */
  content?: string;
  /** Not selectable, skipped by the arrow keys and `Home`/`End`. See `TabProps.disabled`. */
  disabled?: boolean;
}

export interface TabsProps {
  /** The selected tab's value (two-way). Defaults to the first tab — the first `Tab` to register,
   *  in DOM order, or `items[0]` in the data-driven API (the same thing, since `items` renders as
   *  `Tab`s internally — see `context.ts`). */
  modelValue?: string;
  /** `underline` (default) or `pills`. */
  variant?: TabsVariant;
  /** The tab list's accessible name (spec "Tabs" → Properties, `label` row: "Product
   *  information"), put on `role="tablist"` as `aria-label`. Package convention: an
   *  accessible-name-only prop is named `ariaLabel`, never `label` (visible text is `title`). */
  ariaLabel: string;
  /** `auto` (default) or `manual`. */
  activation?: TabsActivation;
  /** The tabs and their panels, 1–5 of them (spec's own guidance). Renders internally as the same
   *  `Tab`/`TabPanel` pair a consumer would place through the slots API — omit this and use the
   *  `tabs` slot (for `Tab`s) and the default slot (for `TabPanel`s) instead for panel content
   *  richer than plain text. */
  items?: TabsItem[];
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the root
   * itself with `class`.
   */
  classes?: Partial<Record<TabsPart, string>>;
}

/** The part a consumer can restyle through a standalone `<Tab>`'s `classes`; the tab itself takes
 *  `class`. */
export type TabPart = 'indicator';

export interface TabProps {
  /** This tab's value — what `Tabs`' `modelValue` holds when it is selected, and what
   *  `aria-controls`/the matching `TabPanel`'s `value` are keyed by. */
  value: string;
  /** The visible label. Also the default slot's fallback, the same shape `Button`'s `label` and
   *  default slot follow. */
  title?: string;
  /**
   * The tab cannot be selected: a click does nothing, the arrow keys and `Home`/`End` skip it, and
   * it carries `aria-disabled="true"` rather than native `disabled`, so a disabled tab that is
   * already selected stays the list's one tab stop. The default selection is the first tab that is
   * not disabled. Defaults to `false`.
   */
  disabled?: boolean;
  /** Per-part classes, appended to the part's own (they win by cascade layer). */
  classes?: Partial<Record<TabPart, string>>;
}

/** `TabPanel` has no inner parts: style the panel itself with `class`. */
export type TabPanelPart = never;

export interface TabPanelProps {
  /** The `Tab` this panel belongs to — must match that tab's own `value`. */
  value: string;
}
