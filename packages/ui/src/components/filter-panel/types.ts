import type { UiMessages } from '../../messages/en-US';

/**
 * The five facet kinds of the design spec's "Filter panel" → Variants table. They are not five
 * different data shapes but five ways of drawing the same values: `list` is checkbox rows,
 * `colour` swatches (rows or tiles), `size` equal tiles grouped by size system, `toggle` a switch
 * per yes/no facet, and `range` the only one that is a span rather than a set.
 */
export type FilterFacetType = 'list' | 'colour' | 'size' | 'range' | 'toggle';

/** Colour facets only (spec → Facet shape, `layout`): swatch rows or swatch tiles. */
export type FilterFacetLayout = 'list' | 'grid';

/** One value of a facet (spec → Facet shape, `values[]`). */
export interface FilterFacetValue {
  /** The value as it appears in the selection, and in the URL the owning block writes. */
  value: string;
  /** The visible label ("Brown", "M", "Sweaters"). */
  label: string;
  /**
   * How many products this value would leave. Computed **without this facet's own filter
   * applied**, so a `0` means another facet rules the value out — which is why a 0 is shown
   * disabled rather than hidden (spec → Do / Don't).
   */
  count: number;
  /**
   * The real product colour, for a `colour` facet: any CSS colour, or a gradient for "Multi" and
   * patterned items. It comes from product data and is drawn as an inline style, never a token —
   * see `swatchInk.ts` for how the check mark picks its ink against it.
   */
  swatch?: string;
  /**
   * The size system this value belongs to, for a `size` facet ("Knitwear", "Socks (EU)"). Sizes
   * are grouped under one sub-heading per system and never mixed in one grid (spec → Do / Don't).
   * Values with no `group` are drawn as one unlabelled grid.
   */
  group?: string;
  /**
   * Nothing is left for this value: it stays in place, not operable, struck through. A value the
   * shopper has selected is never disabled, whatever this says — the panel enforces that itself.
   */
  disabled?: boolean;
  /**
   * The `value` of the row this one sits under, for a facet the store answers as a tree (a
   * category list). Drawn one indent in, inside a `role="group"` named after the parent — a real
   * grouping for a screen reader and **no extra tab stop**, so `Tab`, `Esc` and **Show all N**
   * behave exactly as they do in a flat facet.
   */
  parent?: string;
  /**
   * Ticked because its `parent` is, not because it is a filter of its own: the request carries the
   * parent's value and the platform expands it. Said out loud in the row's accessible name,
   * because a ticked, disabled box with no explanation reads as a dead end.
   */
  implied?: boolean;
}

/** One facet group, in the order the panel draws them (spec → Properties, `facets`). */
export interface FilterFacet {
  /** Stable key. It is also the key this facet's selection is held under (`colour`, `price`). */
  id: string;
  /** The group name ("Colour"). Also the hidden `<legend>` of its `<fieldset>`. */
  label: string;
  /** Which of the five shapes to draw. */
  type: FilterFacetType;
  /** Start closed. A facet with a selected value always starts open, whatever this says. */
  collapsed?: boolean;
  /** Colour facets only: swatch rows (`list`, the default) or swatch tiles (`grid`). */
  layout?: FilterFacetLayout;
  /** The values, in the order they are drawn. Ignored by a `range` facet. */
  values?: FilterFacetValue[];
  /** Range facets: the lowest value either thumb can reach. */
  min?: number;
  /** Range facets: the highest. */
  max?: number;
  /** Range facets: the granularity every move lands on. */
  step?: number;
  /**
   * Range facets: product counts per equal bucket over `[min, max]`, drawn as the decorative
   * histogram above the track (the spec's own distribution is 24 buckets). Leave it out to draw
   * no histogram at all — the panel never invents one from the page it can see, because one page
   * is not the range.
   */
  histogram?: number[];
  /** Size facets: the destination of the **Size guide** link under the tiles. */
  sizeGuideHref?: string;
  /**
   * Range facets: whether to draw the two-thumb range at all. `false` leaves the Min and Max
   * fields alone, for a store whose values sit in a few tight clusters a track cannot separate.
   */
  slider?: boolean;
  /**
   * Range facets: whether this range is money, so the Min and Max fields are the store's own
   * currency fields rather than generic number fields. A `price` facet sets it.
   */
  currency?: boolean;
}

/**
 * One facet's selection: an array of values for `list`, `colour`, `size` and `toggle` facets, and
 * the two ends of the span for a `range`.
 *
 * The two are told apart at runtime by the first element's type, which is why a range is a pair of
 * **numbers** and a value list is a list of **strings** — see `isRangeSelection`.
 */
export type FilterFacetSelection = string[] | [number, number];

/** The whole selection, keyed by facet id (spec → Properties, `value`). */
export type FilterSelection = Record<string, FilterFacetSelection>;

/**
 * Where the panel is drawn (spec → Variants): `sidebar` applies every change at once, `drawer`
 * batches them until **Show N products**.
 */
export type FilterPanelMode = 'sidebar' | 'drawer';

/** What `remove` reports: the chip the shopper took off. */
export interface FilterRemoval {
  facetId: string;
  value: string;
}

/** One applied-filter chip (spec → Anatomy item 2). */
export interface AppliedFilter {
  facetId: string;
  /** The facet's own label, for the remove button's name ("Remove filter Colour: Brown"). */
  facetLabel: string;
  value: string;
  /** The value's own label, which is the chip's visible text. */
  label: string;
}

/**
 * The parts a consumer can restyle through `classes`, named as the design spec's "Filter panel"
 * anatomy names them. One flat union across the panel, its groups and all five facets: `FilterGroup`
 * and the facet components are private, so `FilterPanel` is the only place a `classes` prop can be
 * passed, and it hands the whole bag down.
 *
 * Several parts are drawn more than once (`group`, `row`, `swatch`, `tile`, `chip`, …) — one class
 * string styles every instance, and each element carries a `data-facet` or `data-value` attribute
 * for the rare rule that has to tell them apart.
 */
export type FilterPanelPart =
  | 'root'
  | 'head'
  | 'title'
  | 'clear'
  | 'applied'
  | 'chip'
  | 'group'
  | 'trigger'
  | 'groupLabel'
  | 'badge'
  | 'summary'
  | 'chevron'
  | 'body'
  | 'legend'
  | 'search'
  | 'noMatches'
  | 'values'
  | 'row'
  | 'rowLabel'
  | 'count'
  | 'checkbox'
  | 'showAll'
  | 'swatch'
  | 'swatchMark'
  | 'swatchStrike'
  | 'subheading'
  | 'tile'
  | 'tileLabel'
  | 'sizeGuide'
  | 'range'
  | 'histogram'
  | 'histogramBar'
  | 'fields'
  | 'field'
  | 'fieldLabel'
  | 'separator'
  | 'switchRow'
  | 'foot';

export interface FilterPanelProps {
  /**
   * The selection (two-way), keyed by facet id. Unset, the panel manages its own — which is what
   * makes it usable in a story or a prototype, while a store binds `v-model` and keeps the URL.
   */
  modelValue?: FilterSelection;
  /** The facet groups, in the order they are drawn. */
  facets?: FilterFacet[];
  /** `sidebar` applies every change at once; `drawer` batches until **Show N products**. */
  mode?: FilterPanelMode;
  /** The head's visible title. Defaults to the `filterPanelTitle` message ("Filters"). */
  title?: string;
  /** Draw the head (title + **Clear all**). Set it to `false` inside the drawer. */
  showHead?: boolean;
  /** Draw the applied-filter chips above the groups. */
  showApplied?: boolean;
  /**
   * The accessible name of the `<form>`. Defaults to the `filterPanelLabel` message ("Product
   * filters"). Named `label` rather than `ariaLabel` because the head's `title` is the visible
   * text and this is the name of the form around it — see `FilterPanel.vue`'s own comment.
   */
  label?: string;
  /** The locale numbers and currencies are formatted in. Defaults to the ambient locale. */
  locale?: string;
  /** The currency a money range is formatted in. Defaults to the ambient store currency. */
  currency?: string;
  /**
   * The live product count for the current (pending) selection. Drawer mode puts it in **Show N
   * products**; the panel never announces it itself — the owning block's own count does that.
   */
  resultCount?: number | null;
  /** The tighter targets of a 15rem sidebar. */
  dense?: boolean;
  /** Namespaces every id this panel mints, so a sidebar and a drawer never collide. */
  idPrefix?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<FilterPanelPart, string>>;
  /** Overrides for the strings this component renders itself. */
  messages?: Partial<UiMessages>;
}
