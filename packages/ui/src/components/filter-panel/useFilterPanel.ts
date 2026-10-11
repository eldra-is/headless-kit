/**
 * Every rule the Filter panel runs on, as pure functions over the facets and the selection.
 *
 * Framework-free and exported from the package root, the same shape `useRangeSlider.ts` has: the
 * selection model, the badge count, the collapsed summary, the 6-and-12 thresholds and the
 * accent-insensitive search are each a decision with a right answer independent of any DOM, and a
 * unit test over them is sharper than any assertion about rendered markup. The components below
 * draw what these functions say and nothing else.
 */
import type {
  AppliedFilter,
  FilterFacet,
  FilterFacetSelection,
  FilterFacetValue,
  FilterSelection,
} from './types';

/**
 * How many values a `list` facet shows before **Show all N** (spec → Variants, `list` facet row:
 * "More than 6 values: the first 6, then **Show all N**").
 */
export const FILTER_VALUES_SHOWN = 6;

/**
 * How many values a `list` facet has to exceed before it also gets a search field (spec → the same
 * row: "More than 12: a search field above the list as well").
 *
 * Strictly more than, both of them: a facet with exactly 6 values shows all six and no button, and
 * one with exactly 12 gets no search field. The two thresholds are the whole reason these are
 * constants rather than literals in a template — a test can assert the boundary on either side of
 * each, which is what makes the off-by-one un-shippable.
 */
export const FILTER_SEARCH_FROM = 12;

/** A facet's values, or an empty list for a facet that has none (every `range` facet). */
export function facetValues(facet: FilterFacet): FilterFacetValue[] {
  return facet.values ?? [];
}

/** Whether one facet's selection is a range's span rather than a list of chosen values. */
export function isRangeSelection(
  selection: FilterFacetSelection | undefined
): selection is [number, number] {
  return Array.isArray(selection) && selection.length === 2 && typeof selection[0] === 'number';
}

/**
 * The values selected in one facet. Empty for a facet nothing is selected in, and empty for a
 * range — a span is not a set of values, and every caller here that means "the chosen values"
 * means the set.
 */
export function selectedValues(selection: FilterSelection, facetId: string): readonly string[] {
  const held = selection[facetId];
  if (held === undefined || isRangeSelection(held)) return [];
  return held;
}

export function isValueSelected(
  selection: FilterSelection,
  facetId: string,
  value: string
): boolean {
  return selectedValues(selection, facetId).includes(value);
}

/**
 * The selection with one value checked or unchecked.
 *
 * A new object every time, never a mutation: the panel is controlled, so what it emits has to be a
 * value the parent can tell apart from the one it passed in. The facet's key is **removed** rather
 * than left as an empty array when the last value goes, so "nothing selected here" has one
 * representation — which is what lets `hasSelection` and the URL grammar agree, and what makes a
 * round trip through a query string idempotent.
 */
export function toggleValue(
  selection: FilterSelection,
  facetId: string,
  value: string,
  checked: boolean
): FilterSelection {
  const current = selectedValues(selection, facetId);
  if (checked === current.includes(value)) return selection;
  const next = checked ? [...current, value] : current.filter((held) => held !== value);
  return writeFacet(selection, facetId, next.length > 0 ? next : undefined);
}

/** The selection with one value removed, whether it was there or not (a chip's own gesture). */
export function removeValue(
  selection: FilterSelection,
  facetId: string,
  value: string
): FilterSelection {
  return toggleValue(selection, facetId, value, false);
}

/**
 * The selection with one range's span written, or **removed** when the span is the facet's own
 * limits.
 *
 * A range at its limits excludes nothing, so storing it would make "no price filter" and "the
 * whole price range" two different selections that mean the same thing — and the second one would
 * keep **Clear all** on screen with nothing to clear, and put a `?price=0-240` in the URL that
 * says nothing. Dropping it is also what makes a cleared range read back as `[min, max]` through
 * `rangeOf` below.
 */
export function setRange(
  selection: FilterSelection,
  facet: FilterFacet,
  range: [number, number]
): FilterSelection {
  const [min, max] = rangeLimits(facet);
  const atLimits = range[0] <= min && range[1] >= max;
  return writeFacet(selection, facet.id, atLimits ? undefined : range);
}

/** One facet's key written or dropped, with every other key untouched. */
function writeFacet(
  selection: FilterSelection,
  facetId: string,
  value: FilterFacetSelection | undefined
): FilterSelection {
  const next: FilterSelection = { ...selection };
  if (value === undefined) {
    delete next[facetId];
  } else {
    next[facetId] = value;
  }
  return next;
}

/** A range facet's own bounds, with the spec's `[0, 100]` fallback for a facet that gives none. */
export function rangeLimits(facet: FilterFacet): [number, number] {
  const min = facet.min ?? 0;
  const max = facet.max ?? 100;
  return [min, Math.max(min, max)];
}

/**
 * A range facet's current span: what the selection holds, or its own limits with nothing held.
 *
 * The limits are the answer rather than a thrown error for an absent key because absent *is* the
 * resting state (see `setRange`), and they clamp whatever is held, so a span left over from before
 * the bounds moved still reads as a span inside them.
 */
export function rangeOf(selection: FilterSelection, facet: FilterFacet): [number, number] {
  const [min, max] = rangeLimits(facet);
  const held = selection[facet.id];
  if (!isRangeSelection(held)) return [min, max];
  const lo = Math.min(Math.max(held[0], min), max);
  const hi = Math.min(Math.max(held[1], min), max);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

/** Whether a range facet is untouched — both ends at its own limits. */
export function isRangeAtLimits(selection: FilterSelection, facet: FilterFacet): boolean {
  const [min, max] = rangeLimits(facet);
  const [lo, hi] = rangeOf(selection, facet);
  return lo <= min && hi >= max;
}

/**
 * Whether a facet can be drawn at all.
 *
 * A **range with fewer than two distinct values** cannot: a catalogue whose cheapest and dearest
 * product are the same price has no span to narrow, and drawing one anyway gives the shopper a
 * single thumb that cannot move and a pair of fields reading "3,500" to "3,500" — a control that
 * looks operable, answers every gesture with nothing, and excludes nothing however it is set. The
 * honest rendering of "there is nothing to filter here" is no group at all.
 *
 * Every other facet type is drawn whatever it holds: an empty `list` is a group that says, truly,
 * that the catalogue offers no values for it, and that is information a shopper can act on (it is
 * also what a facet looks like for one tick while its counts are refreshing).
 */
export function facetIsRenderable(facet: FilterFacet): boolean {
  if (facet.type !== 'range') return true;
  const [min, max] = rangeLimits(facet);
  return max > min;
}

/** The facets a panel draws — and the only ones its selection should go on mentioning. */
export function renderableFacets(facets: FilterFacet[]): FilterFacet[] {
  return facets.filter((facet) => facetIsRenderable(facet));
}

/**
 * The selection with any key belonging to a facet the panel is **not** drawing taken out.
 *
 * It is deliberately narrow: only a facet that was supplied and then omitted loses its key. A key
 * for a facet the panel was never given is left alone, because a page may well keep a filter of
 * its own in the same object that this panel has no business clearing.
 *
 * This is what "cleared on the next change" means for a collapsed range: a span inherited from a
 * URL, or from a catalogue whose price span has since collapsed, would otherwise keep narrowing
 * the results with no control on screen that could widen them again.
 */
export function dropOmittedFacets(
  selection: FilterSelection,
  facets: FilterFacet[]
): FilterSelection {
  const omitted = facets.filter((facet) => !facetIsRenderable(facet));
  if (omitted.length === 0) return selection;
  if (!omitted.some((facet) => facet.id in selection)) return selection;
  const next: FilterSelection = { ...selection };
  for (const facet of omitted) delete next[facet.id];
  return next;
}

/**
 * The facet's selected-count badge (spec → Behaviour: "the number of checked values and
 * switched-on switches in the group ... a moved range does not count").
 *
 * A range answers `0` deliberately: its badge would say "1" for a span the shopper can see on the
 * track, which is a count of nothing. The head's **Clear all** still knows about it (see
 * `hasSelection`).
 */
export function facetSelectedCount(facet: FilterFacet, selection: FilterSelection): number {
  if (facet.type === 'range') return 0;
  return selectedValues(selection, facet.id).length;
}

/**
 * The selected labels of one facet, in the facet's **own** value order rather than the order they
 * were checked in — this is the collapsed summary ("Brown, Natural"), and a summary that reordered
 * itself as the shopper ticked would read as a different group each time.
 *
 * Empty for a range, which has no labels to list.
 */
export function facetSummaryLabels(facet: FilterFacet, selection: FilterSelection): string[] {
  if (facet.type === 'range') return [];
  const selected = selectedValues(selection, facet.id);
  if (selected.length === 0) return [];
  return facetValues(facet)
    .filter((value) => selected.includes(value.value))
    .map((value) => value.label);
}

/**
 * Whether a facet is open before the shopper has touched its trigger (spec → Facet shape,
 * `collapsed`: "A group with a selected value always starts open").
 *
 * A range counts as selected here even though its badge does not: a facet whose track has been
 * moved is a facet the shopper is using, and opening it is the only way they can see what it says.
 */
export function facetStartsOpen(facet: FilterFacet, selection: FilterSelection): boolean {
  if (facet.collapsed !== true) return true;
  if (facet.type === 'range') return !isRangeAtLimits(selection, facet);
  return facetSelectedCount(facet, selection) > 0;
}

/**
 * Whether anything is selected at all, across every facet — which is what decides whether the
 * head's **Clear all** is on screen (spec → States: "hidden while nothing is selected and every
 * range is at its limits").
 *
 * It needs the facets, not just the selection, because "at its limits" is a question only a
 * facet's own `min`/`max` can answer. Keys for facets that are no longer there are ignored, so a
 * stale key in a restored URL cannot keep the button on screen with nothing it could clear.
 */
export function hasSelection(facets: FilterFacet[], selection: FilterSelection): boolean {
  return facets.some((facet) =>
    facet.type === 'range'
      ? !isRangeAtLimits(selection, facet)
      : selectedValues(selection, facet.id).length > 0
  );
}

/**
 * The applied-filter chips, facet by facet and in each facet's own value order (spec → Anatomy
 * item 2: "one per selected value").
 *
 * Range facets contribute none: a span has no one value a chip could take off, and removing "the
 * price" is **Clear all**'s job or the track's own. A selected value the facet no longer offers
 * contributes none either — a chip the panel cannot name is a chip nobody can act on.
 */
export function appliedFilters(facets: FilterFacet[], selection: FilterSelection): AppliedFilter[] {
  const chips: AppliedFilter[] = [];
  for (const facet of facets) {
    if (facet.type === 'range') continue;
    const selected = selectedValues(selection, facet.id);
    if (selected.length === 0) continue;
    for (const value of facetValues(facet)) {
      if (!selected.includes(value.value)) continue;
      chips.push({
        facetId: facet.id,
        facetLabel: facet.label,
        value: value.value,
        label: value.label,
      });
    }
  }
  return chips;
}

/**
 * Text folded for searching: lower case with every accent taken off, so "créme" matches "creme"
 * and "Ósk" matches "osk" (spec → Behaviour: "ignoring case and accents").
 *
 * `NFD` splits a letter into its base and its combining marks and the range strips the marks,
 * which is the one decomposition that works for every script rather than a table of the
 * substitutions one language needs.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Whether one value's label answers a search query, accents and case ignored. */
export function matchesSearch(value: FilterFacetValue, query: string): boolean {
  const folded = foldForSearch(query.trim());
  if (folded === '') return true;
  return foldForSearch(value.label).includes(folded);
}

/**
 * Whether a facet gets a search field: a `list` facet with **more than** `FILTER_SEARCH_FROM`
 * values.
 *
 * Only `list`. The spec gives the search field and **Show all N** to that row of the Variants
 * table alone; a colour facet's swatches and a size facet's tiles are compact enough to read at a
 * glance, and a store with two hundred colours is a catalogue problem, not a panel one.
 */
export function facetIsSearchable(facet: FilterFacet): boolean {
  return facet.type === 'list' && facetValues(facet).length > FILTER_SEARCH_FROM;
}

/** Whether a facet can show **Show all N**: a `list` facet with more than `FILTER_VALUES_SHOWN`. */
export function facetCanShowAll(facet: FilterFacet): boolean {
  return facet.type === 'list' && facetValues(facet).length > FILTER_VALUES_SHOWN;
}

/** The state of one facet's list: whether the shopper pressed **Show all N**, and what they typed. */
export interface FacetListState {
  expanded?: boolean;
  query?: string;
}

/**
 * The values a facet draws.
 *
 * Three rules in one place, because they interact: a query shows **every** matching value and not
 * only the first six (spec → States, "Searching a long list": "the list shows all its values (not
 * just 6) while a query is active" — a truncated search result is a search that lies); with no
 * query, an expanded facet shows everything and a collapsed one the first six; and a facet that
 * never earned a **Show all N** shows everything regardless of what `expanded` says.
 */
export function visibleFacetValues(
  facet: FilterFacet,
  state: FacetListState = {}
): FilterFacetValue[] {
  const values = facetValues(facet);
  const query = (state.query ?? '').trim();
  if (query !== '') return values.filter((value) => matchesSearch(value, query));
  if (state.expanded === true || !facetCanShowAll(facet)) return values;
  return values.slice(0, FILTER_VALUES_SHOWN);
}

/** Whether **Show all N** has anything left to reveal (never while a query is filtering). */
export function facetHasHiddenValues(facet: FilterFacet, state: FacetListState = {}): boolean {
  if ((state.query ?? '').trim() !== '') return false;
  return facetCanShowAll(facet) && state.expanded !== true;
}

/** One top row of a facet's list, with the rows that sit under it (empty in a flat facet). */
export interface FacetRow {
  value: FilterFacetValue;
  children: FilterFacetValue[];
}

/**
 * The visible values re-read as parent rows and their children — the one place a flat value list
 * becomes nesting, so everything else (the badge, the 6-value truncation, the search, the chips)
 * keeps working on the flat list it always did.
 *
 * A child whose parent is **not** among the visible values becomes a top row of its own rather
 * than disappearing: the truncation cuts the list at six, and a row the shopper can see has to be
 * a row they can tick.
 */
export function facetRows(values: FilterFacetValue[]): FacetRow[] {
  const rows: FacetRow[] = [];
  const byValue = new Map<string, FacetRow>();
  for (const value of values) {
    const parent = value.parent === undefined ? undefined : byValue.get(value.parent);
    if (parent !== undefined) {
      parent.children.push(value);
      continue;
    }
    const row: FacetRow = { value, children: [] };
    rows.push(row);
    byValue.set(value.value, row);
  }
  return rows;
}

/** One size system's sub-heading and its tiles. `key` is `undefined` for values with no system. */
export interface SizeSystemGroup {
  key: string | undefined;
  values: FilterFacetValue[];
}

/**
 * A size facet's values grouped by size system, in the order the systems **first appear** in the
 * values rather than alphabetically (spec → Do / Don't: "Do group sizes by system; don't mix 'M'
 * and '42' in one grid").
 *
 * First appearance, because the order is the store's: a catalogue that lists Knitwear before Shoes
 * means it, and sorting the headings would reorder the grid under the merchant without being
 * asked. Values with no `group` collapse into one unlabelled group, which is what a store that has
 * not told us its size systems yet gets — one grid, no sub-headings, nothing invented.
 */
export function sizeSystemGroups(values: FilterFacetValue[]): SizeSystemGroup[] {
  const groups: SizeSystemGroup[] = [];
  const byKey = new Map<string | undefined, SizeSystemGroup>();
  for (const value of values) {
    const key = value.group;
    let group = byKey.get(key);
    if (group === undefined) {
      group = { key, values: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.values.push(value);
  }
  return groups;
}

/**
 * Whether one histogram bar sits inside the selected span (spec → Behaviour: "a bar is 'in' when
 * its bucket centre lies between the thumbs").
 *
 * The **centre**, not either edge: a bucket is a width of the range, and judging it by its left
 * edge lights the bar the minimum thumb is standing in the middle of while leaving the one it has
 * just left dark. `bars` is however many the facet supplied (the spec's own distribution is 24),
 * so a store that answers a different resolution still gets a correct picture.
 */
export function histogramBarInRange(
  index: number,
  bars: number,
  range: [number, number],
  limits: [number, number]
): boolean {
  if (bars <= 0) return false;
  const [min, max] = limits;
  const span = max - min;
  // A collapsed range has no buckets to place; nothing is "in" it.
  if (span <= 0) return false;
  const centre = min + (span * (index + 0.5)) / bars;
  return centre >= range[0] && centre <= range[1];
}

/**
 * A value is disabled when it has nothing left **and** the shopper has not selected it (spec →
 * States: "A selected value is never disabled").
 *
 * The exception is not cosmetic: a selected value with a count of 0 is the one a shopper has to be
 * able to un-tick to get their results back, and disabling it would trap them.
 */
export function isValueDisabled(
  value: FilterFacetValue,
  selection: FilterSelection,
  facetId: string
): boolean {
  if (isValueSelected(selection, facetId, value.value)) return false;
  return value.disabled === true || value.count <= 0;
}

/**
 * The selection a **Clear all** leaves behind: nothing at all.
 *
 * Every range goes back to its limits by the same token, because a range at its limits is an
 * absent key (see `setRange`). Keys for facets the panel is not showing go too — Clear all says
 * "clear the filters", and a key nothing on screen can reach is still a filter on the results.
 */
export function clearedSelection(): FilterSelection {
  return {};
}
