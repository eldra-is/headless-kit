import type { UiMessages } from '../../../messages/en-US';
import type { FilterFacet, FilterPanelPart, FilterSelection } from '../types';

/**
 * What every facet component is handed. They are private to `FilterPanel`, which is why there is
 * one shared interface rather than five: the panel passes the same bag to all of them, each draws
 * the facet its own way, and each emits the shopper's intent rather than writing the selection.
 */
export interface FacetProps {
  facet: FilterFacet;
  /** The whole selection, so a facet can ask whether one of its values is in it. */
  selection: FilterSelection;
  /** Namespaces the ids a facet mints, so a sidebar and a drawer never collide. */
  idPrefix: string;
  /** The tighter targets of a 15rem sidebar. */
  dense?: boolean;
  classes?: Partial<Record<FilterPanelPart, string>>;
  messages?: Partial<UiMessages>;
}

/**
 * Spec "Filter panel" → Sizes, Option row: "Count 0.8125rem `muted`, tabular figures, pushed to
 * the end." The same count sits at the end of a swatch row and a switch row, so it is written
 * once.
 */
export const FACET_COUNT =
  'eldra:ms-auto eldra:shrink-0 eldra:text-caption eldra:text-muted eldra:tabular-nums';

/**
 * Spec → States, "Option row, hover" and "Swatch row/tile, hover": "`text` at 6%".
 *
 * A `color-mix` against the token rather than a tint of its own, so a store that changes `text`
 * changes the hover with it — the same shape `Switch`'s own hover fill uses.
 */
export const FACET_ROW_HOVER =
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';

/**
 * Spec → Sizes, Option row: "padding 0.25rem 0.5rem with a −0.5rem side margin (the hover tint
 * bleeds into the gutter)". The negative margin is what lets the tint reach past the panel's own
 * text edge, so a hovered row reads as a row rather than as a highlighted label.
 */
export const FACET_ROW_GUTTER = 'eldra:-mx-2 eldra:px-2';

/** The same, at the swatch row's own tighter 0.375rem padding (spec → Sizes, Swatch row). */
export const FACET_SWATCH_GUTTER = 'eldra:-mx-1.5 eldra:px-1.5';
