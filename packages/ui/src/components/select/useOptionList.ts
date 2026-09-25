import { computed, type ComputedRef } from 'vue';
import type { SelectOption } from './types';
import { normalizeText } from './useListbox';

/** The label split into the run before the match, the match itself, and the run after it. */
export interface MatchParts {
  before: string;
  match: string;
  after: string;
}

/** One block of the panel's list: an `<optgroup>`-like heading and the rows under it. */
export interface PanelSection {
  key: string;
  label?: string;
  labelId?: string;
  options: SelectOption[];
}

/**
 * Where a query matches inside a label, in **code points of the original string**.
 *
 * Matching is case- and diacritic-insensitive (the spec's "'island' finds 'Ísland'"), so the
 * comparison happens on a normalised copy — and the match has to be reported back in the original
 * string's own offsets, or the bold-and-underlined run would land on the wrong characters for any
 * label holding an accent. Hence the per-character walk: each original code point contributes zero
 * (a combining mark) or more normalised characters, and `positions` maps back.
 */
export function matchRange(label: string, rawQuery: string): { start: number; end: number } | null {
  const needle = normalizeText(rawQuery);
  if (needle === '') return null;
  const characters = [...label];
  const positions: number[] = [];
  let normalized = '';
  for (const [index, character] of characters.entries()) {
    const piece = normalizeText(character);
    for (let step = 0; step < piece.length; step += 1) positions.push(index);
    normalized += piece;
  }
  const at = normalized.indexOf(needle);
  if (at === -1) return null;
  const start = positions[at] ?? 0;
  const end = (positions[at + needle.length - 1] ?? characters.length - 1) + 1;
  return { start, end };
}

/**
 * Options bucketed by `group`, in the order each group first appears — so a "Most used" group
 * written first stays first, which is exactly the spec's advice ("Put the 3 to 5 most likely
 * answers first"). Options with no `group` form an unlabelled section of their own.
 */
export function groupOptions(
  list: SelectOption[],
  idPrefix: string,
  controlId: string
): PanelSection[] {
  const order: string[] = [];
  const buckets = new Map<string, SelectOption[]>();
  for (const option of list) {
    const key = option.group ?? '';
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(option);
  }
  return order.map((key, index) => ({
    key: key === '' ? `${idPrefix}-plain-${index}` : `${idPrefix}-group-${key}`,
    label: key === '' ? undefined : key,
    labelId: key === '' ? undefined : `${controlId}-g${index}`,
    options: buckets.get(key) ?? [],
  }));
}

export interface UseOptionListOptions {
  /** Every option the control was given, in the order the consumer wrote them. */
  options: () => SelectOption[];
  /** The current search query. Ignored entirely when `searchable` says no. */
  query: () => string;
  searchable: () => boolean;
  /** The control's own id, which the group headings' ids are built from. */
  controlId: () => string;
}

export interface UseOptionListReturn {
  /** The visible options bucketed into the panel's sections. */
  sections: ComputedRef<PanelSection[]>;
  /** *Every* option bucketed, for the hidden native select's `<optgroup>`s. */
  nativeSections: ComputedRef<PanelSection[]>;
  /** The visible rows in DOM order — the section order, not the prop order, once groups interleave. */
  listOptions: ComputedRef<SelectOption[]>;
  hasOptions: ComputedRef<boolean>;
  /** Per option value, where the query matched its label — or `null` when it did not. */
  highlights: ComputedRef<Map<string, MatchParts | null>>;
}

/**
 * The list a select panel shows: filtering, grouping and match highlighting.
 *
 * Shared by `Select` and `MultiSelect`, which differ in what choosing a row *does* and in nothing
 * about which rows there are. Pure derivation — no DOM, no state of its own.
 */
export function useOptionList(options: UseOptionListOptions): UseOptionListReturn {
  const trimmedQuery = computed(() => (options.searchable() ? options.query().trim() : ''));

  /**
   * The options a query leaves, in the consumer's order. Not returned: every caller wants them
   * bucketed (`sections`) or in DOM order (`listOptions`), and a third view of the same list would
   * only be a way to disagree with those two.
   */
  const visibleOptions = computed(() => {
    const trimmed = trimmedQuery.value;
    if (trimmed === '') return options.options();
    return options.options().filter((option) => matchRange(option.label, trimmed) !== null);
  });

  const sections = computed(() => groupOptions(visibleOptions.value, 'panel', options.controlId()));
  const nativeSections = computed(() =>
    groupOptions(options.options(), 'native', options.controlId())
  );
  const listOptions = computed(() => sections.value.flatMap((section) => section.options));

  /**
   * A `role="listbox"` may own only `option` and `group` children, so the "No matches" text is a
   * sibling of the listbox rather than a child of it — a `role="presentation"` div inside would be
   * an `aria-required-children` violation, while a genuinely empty listbox is merely "needs
   * review". The listbox itself always renders whenever the panel does, empty or not, because
   * `aria-controls` is a *required* property of a `role="combobox"` and has to point at something
   * real while the popup is showing.
   */
  const hasOptions = computed(() => listOptions.value.length > 0);

  /**
   * Spec "Select" → Variants, Searchable: "The matched part is bold with a 2px underline."
   * Computed once per query rather than per render of each row: the walk is O(label) and the
   * template would otherwise run it three times for every visible option on every keystroke.
   */
  const highlights = computed(() => {
    const trimmed = trimmedQuery.value;
    return new Map(
      listOptions.value.map((option) => {
        const range = trimmed === '' ? null : matchRange(option.label, trimmed);
        if (range === null) return [option.value, null] as const;
        const characters = [...option.label];
        return [
          option.value,
          {
            before: characters.slice(0, range.start).join(''),
            match: characters.slice(range.start, range.end).join(''),
            after: characters.slice(range.end).join(''),
          },
        ] as const;
      })
    );
  });

  return { sections, nativeSections, listOptions, hasOptions, highlights };
}
