import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';

/**
 * The least a listbox row has to be for this composable to move between rows. `Select`'s
 * `SelectOption` is a superset of it, and `MultiSelect`'s will be too — which is the point: the
 * keyboard lives here once, and each control supplies its own rows and its own idea of what
 * choosing one means.
 */
export interface ListboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface UseListboxOptions<T extends ListboxOption = ListboxOption> {
  /** The rows currently on screen, in DOM order, already filtered by any search query. */
  options: () => T[];
  /** Whether the popup is open. The keyboard table is two different tables either side of this. */
  isOpen: () => boolean;
  /** Whether a search field is showing: it owns `Home`/`End`, `Space` and every printable key. */
  searchable: () => boolean;
  /** The element id of a row, which is what `aria-activedescendant` points at. */
  optionId: (value: string) => string;
  /** Open the popup. `edge` is `'end'` for `ArrowUp` on a closed non-searchable trigger. */
  open: (edge: 'start' | 'end') => void;
  /** Close the popup without choosing anything. */
  close: () => void;
  /** Choose a row. Whether that also closes the popup is the caller's business, not ours. */
  select: (option: T) => void;
  /** `Backspace`/`Delete` on a closed trigger. Return `true` if the value was actually cleared. */
  clear?: () => boolean;
  /** Searchable + closed + a printable key: start the query with it. */
  startQuery?: (character: string) => void;
  /** `Escape` while open. Return `true` if a query was cleared, which consumes the key. */
  escape?: () => boolean;
}

export interface UseListboxReturn {
  /** The active row's value — the one `aria-activedescendant` points at. */
  activeValue: Ref<string | undefined>;
  /** The active row's element id, or `undefined` when nothing is active. */
  activeId: ComputedRef<string | undefined>;
  /** Make a row active, e.g. because the pointer moved over it. */
  setActive(value: string | undefined): void;
  /** Make the given value active if it is selectable, else the first enabled row. */
  activateFrom(value: string | undefined): void;
  /** First / last enabled row. */
  first(): void;
  last(): void;
  /** Move by `step` enabled rows, stopping at the ends (the spec: "it doesn't wrap"). */
  move(step: number): void;
  /** Choose the active row, if there is one and it can be chosen. */
  selectActive(): void;
  /** The whole keyboard table, both halves. Put it on the trigger and on the search field. */
  onKeydown(event: KeyboardEvent): void;
  /** Drop the type-ahead buffer (on open and on close, so a stale prefix never leaks). */
  resetTypeahead(): void;
}

/** Spec Select → Keyboard, open: "`PageDown` / `PageUp` | Move by 10." */
const PAGE = 10;

/** Spec Select → Keyboard, closed: "the buffer resets after 0.6s". */
const TYPEAHEAD_RESET_MS = 600;

/**
 * Case- and diacritic-insensitive, so the spec's "'island' finds 'Ísland'" holds for type-ahead
 * and for the search field alike. `NFD` splits a letter from its accent and the range drops the
 * combining marks that are left.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** A key that types a character, rather than a chord or a named key. */
function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * The keyboard and the active row of a listbox popup — everything in the design spec's Select →
 * Keyboard tables that is not about *what* choosing a row does.
 *
 * It is separate from `Select.vue` on purpose. `MultiSelect` (the next component) has the same two
 * keyboard tables with three differences — `Enter` toggles instead of choosing-and-closing,
 * `Space` toggles, and the popup stays open — all of which are the caller's `select` callback and
 * the caller's decision about closing. Everything else (arrow movement that skips disabled and
 * filtered-out rows and stops at the ends, `PageUp`/`PageDown` by ten, `Home`/`End` unless a
 * search field owns them, `Alt+ArrowUp`, `Escape` clearing a query before it closes, `Tab`
 * closing without a choice, and type-ahead with a 0.6s buffer) is identical, and identical code
 * that is written twice stops being identical.
 *
 * The composable owns no DOM. `aria-activedescendant` is `activeId`, which the caller binds to
 * whichever element is focused — the trigger when there is no search field, the search field when
 * there is — and scrolling the active row into view is the caller's, because only the caller knows
 * which element a value maps to.
 *
 * ```ts
 * const listbox = useListbox({
 *   options: () => visibleOptions.value,
 *   isOpen: () => open.value,
 *   searchable: () => searchable.value,
 *   optionId: (value) => `${id.value}-option-${value}`,
 *   open: (edge) => openPanel(edge),
 *   close: () => closePanel(),
 *   select: (option) => choose(option.value),
 * });
 * ```
 */
export function useListbox<T extends ListboxOption>(
  options: UseListboxOptions<T>
): UseListboxReturn {
  const activeValue = ref<string | undefined>(undefined);
  const activeId = computed(() =>
    activeValue.value === undefined ? undefined : options.optionId(activeValue.value)
  );

  /** Only enabled rows are reachable: "Arrow keys skip it" (Select → Variants, Disabled option). */
  const enabled = (): T[] => options.options().filter((option) => !option.disabled);

  const setActive = (value: string | undefined): void => {
    activeValue.value = value;
  };

  const first = (): void => setActive(enabled()[0]?.value);
  const last = (): void => setActive(enabled().at(-1)?.value);

  const activateFrom = (value: string | undefined): void => {
    const rows = enabled();
    const match = rows.find((option) => option.value === value);
    setActive((match ?? rows[0])?.value);
  };

  const move = (step: number): void => {
    const rows = enabled();
    if (rows.length === 0) {
      setActive(undefined);
      return;
    }
    const index = rows.findIndex((option) => option.value === activeValue.value);
    // Nothing active yet: ArrowDown lands on the first row, ArrowUp on the last, which is also
    // what `PageDown`/`PageUp` should do from the same standing start.
    if (index === -1) {
      setActive((step > 0 ? rows[0] : rows.at(-1))?.value);
      return;
    }
    setActive(rows[clamp(index + step, 0, rows.length - 1)]?.value);
  };

  const selectActive = (): void => {
    const option = options.options().find((row) => row.value === activeValue.value);
    if (option === undefined || option.disabled === true) return;
    options.select(option);
  };

  // --- type-ahead -----------------------------------------------------------------------------

  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const resetTypeahead = (): void => {
    buffer = '';
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  onScopeDispose(resetTypeahead);

  function typeahead(character: string, inclusive = false): void {
    buffer += character;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(resetTypeahead, TYPEAHEAD_RESET_MS);

    const rows = enabled();
    if (rows.length === 0) return;
    const prefix = normalizeText(buffer);
    const current = rows.findIndex((option) => option.value === activeValue.value);
    // A single character walks to the *next* match, so pressing "s" repeatedly cycles through the
    // options starting with it; a longer buffer re-matches from the active row, so "sm" still
    // finds the row "s" just landed on. The key that *opened* the popup is the exception: the row
    // that just became active (the selected one, or the first) has not been offered yet, so that
    // first match includes it rather than stepping past it.
    const from = buffer.length === 1 && !inclusive ? current + 1 : Math.max(current, 0);

    for (let step = 0; step < rows.length; step += 1) {
      const option = rows[(from + step + rows.length) % rows.length];
      if (option !== undefined && normalizeText(option.label).startsWith(prefix)) {
        setActive(option.value);
        return;
      }
    }
  }

  // --- the keyboard tables --------------------------------------------------------------------

  function onClosedKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      // "Open, with the selected option (or the first) active."
      case 'ArrowDown':
      case 'Enter':
      case ' ': {
        event.preventDefault();
        options.open('start');
        return;
      }
      // "Open. Non-searchable: the last option is active. Searchable: the selected (or first)."
      case 'ArrowUp': {
        event.preventDefault();
        options.open(options.searchable() ? 'start' : 'end');
        return;
      }
      // "Clear the value (clearable only, when there is a value)."
      case 'Backspace':
      case 'Delete': {
        if (options.clear?.() === true) event.preventDefault();
        return;
      }
      default: {
        if (!isPrintable(event)) return;
        event.preventDefault();
        options.open('start');
        if (options.searchable()) options.startQuery?.(event.key);
        else typeahead(event.key, true);
      }
    }
  }

  function onOpenKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        move(1);
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();
        // "`Alt+ArrowUp` | Select the active option and close." The caller's `select` closes.
        if (event.altKey) selectActive();
        else move(-1);
        return;
      }
      case 'PageDown': {
        event.preventDefault();
        move(PAGE);
        return;
      }
      case 'PageUp': {
        event.preventDefault();
        move(-PAGE);
        return;
      }
      // "Non-searchable: first / last option. In the search field they move the caret instead."
      case 'Home': {
        if (options.searchable()) return;
        event.preventDefault();
        first();
        return;
      }
      case 'End': {
        if (options.searchable()) return;
        event.preventDefault();
        last();
        return;
      }
      case 'Enter': {
        event.preventDefault();
        selectActive();
        return;
      }
      // "Non-searchable: same as `Enter`. In the search field: types a space."
      case ' ': {
        if (options.searchable()) return;
        event.preventDefault();
        selectActive();
        return;
      }
      // "With a query: clear the query first." Consuming the key is what stops `useOverlay`'s own
      // document-level `Escape` handler — which runs after this one, in the bubble phase — from
      // closing the popup in the same keystroke.
      case 'Escape': {
        if (options.escape?.() !== true) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // "Close (the value doesn't change) and let focus move on." Deliberately no
      // `preventDefault()`: `Tab` has to keep moving focus, which is WCAG 2.1.2's whole point.
      case 'Tab': {
        options.close();
        return;
      }
      default: {
        if (options.searchable() || !isPrintable(event)) return;
        event.preventDefault();
        typeahead(event.key);
      }
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (options.isOpen()) onOpenKeydown(event);
    else onClosedKeydown(event);
  }

  return {
    activeValue,
    activeId,
    setActive,
    activateFrom,
    first,
    last,
    move,
    selectActive,
    onKeydown,
    resetTypeahead,
  };
}
