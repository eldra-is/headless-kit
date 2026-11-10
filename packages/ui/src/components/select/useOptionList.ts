import { ref, watch, type ComputedRef } from 'vue';
import { computed } from '../../utils/scopedComputed';
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

/**
 * The value of the "Create “query”" row a `creatable` control appends. A control character no
 * merchant value holds, so it never collides with an option's own value.
 */
export const CREATE_VALUE = '\u0000eldra-create';

export interface UseOptionListOptions {
  /** Every option the control was given, in the order the consumer wrote them. */
  options: () => SelectOption[];
  /** The current search query. Ignored entirely when `searchable` says no. */
  query: () => string;
  searchable: () => boolean;
  /** The control's own id, which the group headings' ids are built from. */
  controlId: () => string;
  /** While loading, no row is visible or reachable. The native select still has every option. */
  loading?: () => boolean;
  /** Whether a query no label equals offers a "Create" row. */
  creatable?: () => boolean;
  /** How many rows to render at a time; `undefined` (or anything below 1) renders all of them. */
  renderBatch?: () => number | undefined;
}

export interface UseOptionListReturn {
  /** The rendered options bucketed into the panel's sections. */
  sections: ComputedRef<PanelSection[]>;
  /** *Every* option bucketed, for the hidden native select's `<optgroup>`s. */
  nativeSections: ComputedRef<PanelSection[]>;
  /**
   * Every row the keyboard can reach, in DOM order — the section order, not the prop order, once
   * groups interleave — with the create row, when there is one, last. With `renderBatch` it runs
   * past the rendered rows; reaching one renders it.
   */
  listOptions: ComputedRef<SelectOption[]>;
  hasOptions: ComputedRef<boolean>;
  /** Per option value, where the query matched its label — or `null` when it did not. */
  highlights: ComputedRef<Map<string, MatchParts | null>>;
  /** The "Create “query”" row, whose `label` is the trimmed query; `undefined` when there is none. */
  createOption: ComputedRef<SelectOption | undefined>;
  /** Render the next batch. The panel calls it when its list is scrolled near the end. */
  renderMore: () => void;
  /**
   * Render every batch up to the row holding `value`, so a keyboard move past the rendered rows
   * lands on a row that exists. Call it synchronously whenever the active row changes.
   */
  reveal: (value: string | undefined) => void;
  /** Back to the first batch, for closing. */
  resetBatch: () => void;
}

/**
 * The list a select panel shows: filtering, grouping, match highlighting, the create row and the
 * render batch.
 *
 * Shared by `Select` and `MultiSelect`, which differ in what choosing a row *does* and in nothing
 * about which rows there are. No DOM; its one piece of state is how many rows are rendered.
 */
export function useOptionList(options: UseOptionListOptions): UseOptionListReturn {
  const trimmedQuery = computed(() => (options.searchable() ? options.query().trim() : ''));
  const loading = computed(() => options.loading?.() === true);

  /**
   * The options a query leaves, in the consumer's order. Not returned: every caller wants them
   * bucketed (`sections`) or in DOM order (`listOptions`), and a third view of the same list would
   * only be a way to disagree with those two.
   */
  const visibleOptions = computed(() => {
    if (loading.value) return [];
    const trimmed = trimmedQuery.value;
    if (trimmed === '') return options.options();
    const needle = normalizeText(trimmed);
    return options
      .options()
      .filter(
        (option) =>
          matchRange(option.label, trimmed) !== null ||
          option.keywords?.some((keyword) => normalizeText(keyword).includes(needle)) === true
      );
  });

  /** Every visible option in DOM order, before the render batch cuts it. */
  const orderedOptions = computed(() =>
    groupOptions(visibleOptions.value, 'panel', options.controlId()).flatMap(
      (section) => section.options
    )
  );

  const batchSize = (): number => {
    const size = options.renderBatch?.();
    return size === undefined || !(size >= 1) ? Number.POSITIVE_INFINITY : Math.floor(size);
  };
  const rendered = ref(batchSize());
  const resetBatch = (): void => {
    rendered.value = batchSize();
  };
  const renderMore = (): void => {
    if (rendered.value < orderedOptions.value.length) rendered.value += batchSize();
  };
  const reveal = (value: string | undefined): void => {
    if (value === undefined || !Number.isFinite(rendered.value)) return;
    const index = orderedOptions.value.findIndex((option) => option.value === value);
    if (index < rendered.value) return;
    const size = batchSize();
    rendered.value = Math.ceil((index + 1) / size) * size;
  };
  watch(trimmedQuery, resetBatch);
  watch(() => options.renderBatch?.(), resetBatch);

  const renderedOptions = computed(() =>
    Number.isFinite(rendered.value)
      ? orderedOptions.value.slice(0, rendered.value)
      : orderedOptions.value
  );

  const sections = computed(() =>
    groupOptions(renderedOptions.value, 'panel', options.controlId())
  );
  const nativeSections = computed(() =>
    groupOptions(options.options(), 'native', options.controlId())
  );

  /**
   * Spec-free addition: a query no option's label already equals can be offered as a new option.
   * Equal ignoring case and accents, the same comparison the search itself makes, so "Shirt" is
   * not offered beside an existing "shirt".
   */
  const createOption = computed<SelectOption | undefined>(() => {
    const trimmed = trimmedQuery.value;
    if (options.creatable?.() !== true || loading.value || trimmed === '') return undefined;
    const needle = normalizeText(trimmed);
    if (options.options().some((option) => normalizeText(option.label) === needle)) {
      return undefined;
    }
    return { value: CREATE_VALUE, label: trimmed };
  });

  const listOptions = computed(() =>
    createOption.value === undefined
      ? orderedOptions.value
      : [...orderedOptions.value, createOption.value]
  );

  /**
   * A `role="listbox"` may own only `option` and `group` children, so the "No matches" text is a
   * sibling of the listbox rather than a child of it — a `role="presentation"` div inside would be
   * an `aria-required-children` violation, while a genuinely empty listbox is merely "needs
   * review". The listbox itself always renders whenever the panel does, empty or not, because
   * `aria-controls` is a *required* property of a `role="combobox"` and has to point at something
   * real while the popup is showing. The create row is an option, so it counts.
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
      renderedOptions.value.map((option) => {
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

  return {
    sections,
    nativeSections,
    listOptions,
    hasOptions,
    highlights,
    createOption,
    renderMore,
    reveal,
    resetBatch,
  };
}
