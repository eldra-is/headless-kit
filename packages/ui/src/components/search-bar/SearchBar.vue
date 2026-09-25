<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { useListbox } from '../select/useListbox';
import { matchRange, type MatchParts } from '../select/useOptionList';
import { usePopover } from '../select/usePopover';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import SearchResultsPanel from './SearchResultsPanel.vue';
import { claimShortcut, ownsShortcut, releaseShortcut } from './shortcutOwner';
import type {
  SearchBarPart,
  SearchBarProps,
  SearchBarSize,
  SearchResultItem,
  SearchResultType,
  SearchRow,
  SearchSection,
  SearchSelectType,
} from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SearchBarProps>(), {
  modelValue: undefined,
  size: 'md',
  pill: false,
  action: '/search',
  label: undefined,
  placeholder: undefined,
  results: undefined,
  loading: false,
  // Undefined, not `[]`: an absent `recent` is what sends the component to browser storage, where
  // an empty array is the consumer saying "there is no history".
  recent: undefined,
  popular: undefined,
  showRecent: true,
  resultTypes: undefined,
  shortcut: true,
  autofocus: false,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Spec "Search bar" → Events: "fires with the query when `Enter` is pressed with no active
   *  option. The form then goes to the Search page." */
  submit: [query: string];
  /** "fires with the chosen option … before navigating". */
  select: [item: SearchResultItem, type: SearchSelectType];
  /** The "Clear recent searches" row was chosen. */
  clearRecent: [];
}>();

const m = useMessages(() => props.messages);

const controlId = useUiId('searchbar');
const panelId = computed(() => `${controlId.value}-panel`);
const listboxId = computed(() => `${controlId.value}-listbox`);

const fieldRef = ref<HTMLInputElement | null>(null);
const panelComponent = ref<InstanceType<typeof SearchResultsPanel> | null>(null);
const panelRef = computed<HTMLElement | null>(() => panelComponent.value?.root ?? null);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string>(props, emit, () => '');
const query = computed(() => model.value.trim());

const labelText = computed(() => props.label ?? m.value.searchTheShop);
const placeholderText = computed(() => props.placeholder ?? labelText.value);

// --- recent searches ---------------------------------------------------------------------------

/** Spec "Search bar" → Behaviour, Data: "Recent searches are stored per browser (max 5)." */
const RECENT_KEY = 'eldra-ui:recent-searches';
const RECENT_MAX = 5;

const storedRecent = ref<string[]>([]);
/**
 * Whether the "Clear recent searches" row has hidden the list.
 *
 * The row "hides the recent group and keeps focus in the input" whether or not the consumer owns
 * the list: with `recent` supplied, emptying it is the consumer's to do (we emit `clearRecent`),
 * and until they do, the group stays hidden here. A new `recent` array is a new answer, so it
 * shows again.
 */
const recentCleared = ref(false);
watch(
  () => props.recent,
  () => (recentCleared.value = false)
);

/** Never lets a storage that refuses (private mode, blocked cookies) or holds nonsense break the
 *  control: an unreadable history is simply no history. */
function readStoredRecent(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function forgetStoredRecent(): void {
  try {
    globalThis.localStorage?.removeItem(RECENT_KEY);
  } catch {
    /* the same storage that refused to be read may refuse to be written */
  }
}

/**
 * Spec "Search bar" → Behaviour, Data: "Recent searches are stored per browser (max 5) and never
 * sent to the server."
 *
 * Written when a search actually happens — the form is submitted, or a row in the panel is
 * followed — rather than on every keystroke, so the history holds searches a shopper made and not
 * every prefix they typed on the way. Only when the component owns the list: a consumer that
 * supplies `recent` owns the storage behind it too, and has the `submit`/`select` events to write
 * from.
 *
 * Most recent first, case-insensitively deduplicated (searching "Merino" again moves the entry it
 * already has to the top rather than adding a second one), capped at five, and wrapped in the same
 * try/catch as every other storage call: a browser that refuses simply keeps no history.
 */
function rememberSearch(text: string): void {
  if (props.recent !== undefined) return;
  const entry = text.trim();
  if (entry === '') return;
  const folded = entry.toLocaleLowerCase();
  const next = [
    entry,
    ...storedRecent.value.filter((previous) => previous.toLocaleLowerCase() !== folded),
  ].slice(0, RECENT_MAX);
  storedRecent.value = next;
  // A search made after "Clear recent searches" is new history, so the group comes back.
  recentCleared.value = false;
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* a storage that refuses to be written leaves the list in memory for this page only */
  }
}

onMounted(() => {
  if (props.recent === undefined) storedRecent.value = readStoredRecent();
  if (props.autofocus) fieldRef.value?.focus();
});

const recentList = computed(() => {
  if (!props.showRecent || recentCleared.value) return [];
  return (props.recent ?? storedRecent.value).slice(0, RECENT_MAX);
});

/** Spec "Search bar" → Properties: "Popular searches, max 6." */
const popularList = computed(() => (props.popular ?? []).slice(0, 6));

// --- the rows ----------------------------------------------------------------------------------

const ALL_TYPES: SearchResultType[] = ['products', 'collections', 'articles', 'pages'];

/**
 * Spec "Search bar" → Panel views, `results`: "Groups in this fixed order: Products (max 4),
 * Collections (max 3), Journal and help (max 3)."
 *
 * Journal and help is one group over two result types, which is why the caps are per *group* and
 * not per type: articles and pages share three rows between them, in that order.
 */
const GROUPS: Array<{ key: string; types: SearchResultType[]; max: number }> = [
  { key: 'products', types: ['products'], max: 4 },
  { key: 'collections', types: ['collections'], max: 3 },
  { key: 'journal', types: ['articles', 'pages'], max: 3 },
];

const enabledTypes = computed(() => new Set(props.resultTypes ?? ALL_TYPES));

const headingFor: Record<string, () => string> = {
  products: () => m.value.searchProducts,
  collections: () => m.value.searchCollections,
  journal: () => m.value.searchJournal,
};

const resultSections = computed<SearchSection[]>(() => {
  const results = props.results;
  if (results === undefined) return [];
  const sections: SearchSection[] = [];
  for (const group of GROUPS) {
    const rows: SearchRow[] = [];
    for (const type of group.types) {
      if (!enabledTypes.value.has(type)) continue;
      for (const item of results[type]) {
        rows.push({
          value: `${type}:${item.id}`,
          label: item.title,
          kind: 'result',
          type,
          item,
          href: item.href,
        });
      }
    }
    // Empty groups are hidden.
    if (rows.length === 0) continue;
    sections.push({
      key: group.key,
      kind: 'result',
      heading: headingFor[group.key]?.() ?? group.key,
      headingId: `${controlId.value}-h-${group.key}`,
      rows: rows.slice(0, group.max),
    });
  }
  return sections;
});

const hasResults = computed(() => resultSections.value.length > 0);

const idleSections = computed<SearchSection[]>(() => {
  const sections: SearchSection[] = [];
  if (recentList.value.length > 0) {
    const rows: SearchRow[] = recentList.value.map((text, index) => ({
      value: `recent:${index}`,
      label: text,
      kind: 'recent',
    }));
    // "…up to 5 rows, then a 'Clear recent searches' row".
    rows.push({ value: 'clear-recent', label: m.value.clearRecent, kind: 'clearRecent' });
    sections.push({
      key: 'recent',
      kind: 'recent',
      heading: m.value.recentSearches,
      headingId: `${controlId.value}-h-recent`,
      rows,
    });
  }
  if (popularList.value.length > 0) {
    sections.push({
      key: 'popular',
      kind: 'popular',
      heading: m.value.popularSearches,
      headingId: `${controlId.value}-h-popular`,
      rows: chipRows.value,
    });
  }
  return sections;
});

/** The popular list, as rows. The `none` view offers the same chips as suggestions. */
const chipRows = computed<SearchRow[]>(() =>
  popularList.value.map((text, index) => ({
    value: `popular:${index}`,
    label: text,
    kind: 'chip',
  }))
);

// --- the four views ----------------------------------------------------------------------------

/**
 * Spec "Search bar" → Panel views, `loading`: "A request has been in flight for more than 300ms."
 * Under those 300ms the panel keeps whatever it was already showing, "so the panel doesn't
 * flicker" — which is the whole point of the delay.
 */
const LOADING_DELAY_MS = 300;
const loadingShown = ref(false);
let loadingTimer: ReturnType<typeof setTimeout> | undefined;

function stopLoadingTimer(): void {
  if (loadingTimer !== undefined) clearTimeout(loadingTimer);
  loadingTimer = undefined;
}

watch(
  () => props.loading,
  (loading) => {
    stopLoadingTimer();
    if (!loading) {
      loadingShown.value = false;
      return;
    }
    loadingTimer = setTimeout(() => {
      loadingShown.value = true;
      loadingTimer = undefined;
    }, LOADING_DELAY_MS);
  },
  { immediate: true }
);

/**
 * A query with no response behind it yet. The spec's `none` view is "Query **without matches**" —
 * an answer from the shop — so it cannot be drawn before the first response arrives: a shopper
 * typing "m" would be told there is nothing called "m" while the request for it is still in
 * flight. Until `results` is given, the panel shows nothing at all (and, after 300ms, the loading
 * view).
 */
const awaitingFirstResults = computed(() => query.value !== '' && props.results === undefined);

const view = computed<'idle' | 'results' | 'none' | 'loading'>(() => {
  if (loadingShown.value) return 'loading';
  if (query.value === '') return 'idle';
  return hasResults.value ? 'results' : 'none';
});

const sections = computed<SearchSection[]>(() => {
  if (view.value === 'idle') return idleSections.value;
  if (view.value === 'results') return resultSections.value;
  return [];
});

/** The `none` view's suggestion chips, which belong to no group of their own. */
const looseChips = computed<SearchRow[]>(() =>
  view.value === 'none' && !awaitingFirstResults.value ? chipRows.value : []
);

/**
 * Spec → Panel views, `results`: '"See all N results for “q”" is always the last row.' The row is a
 * real link to the Search page with the query already in it, so it works with the keyboard, the
 * pointer and a middle click alike.
 */
const viewAllRow = computed<SearchRow | undefined>(() => {
  if (view.value !== 'results') return undefined;
  const total = props.results?.total ?? 0;
  const separator = props.action.includes('?') ? '&' : '?';
  return {
    value: 'view-all',
    label: m.value.viewAllResults(total, query.value),
    kind: 'viewAll',
    // An action that already carries a parameter ("/search?type=product") keeps it.
    href: `${props.action}${separator}q=${encodeURIComponent(model.value)}`,
  };
});

/** Every navigable row, in the order they appear — which is the order the arrow keys walk. */
const listRows = computed<SearchRow[]>(() => {
  const rows = sections.value.flatMap((section) => section.rows);
  rows.push(...looseChips.value);
  const viewAll = viewAllRow.value;
  if (viewAll !== undefined) rows.push(viewAll);
  return rows;
});

const hasPanelContent = computed(() => {
  if (view.value === 'loading') return true;
  if (awaitingFirstResults.value) return false;
  if (view.value === 'none') return true;
  return listRows.value.length > 0;
});

/**
 * An option's element id is built from its *position*, for the reason `Select`'s is: a row's value
 * carries merchant data (a product id), and an id that `aria-activedescendant` and
 * `getElementById` have to round-trip should hold nothing that needs escaping.
 */
const indexOfRow = computed(() => new Map(listRows.value.map((row, index) => [row.value, index])));
const optionId = (value: string): string | undefined => {
  const index = indexOfRow.value.get(value);
  // No fallback: a value with no row of its own has no element, and pointing
  // `aria-activedescendant` at row 0 would announce a row the keyboard never moved to (the active
  // row outlives a results change that drops it, for the moment before the next one arrives).
  return index === undefined ? undefined : `${controlId.value}-o${index}`;
};

/**
 * Spec → Behaviour, Rendering: "matching ignores case and accents ('linen' finds 'Línen')", and
 * → States, Match: "weight 700 with a 2px underline … never colour alone". The arithmetic is
 * `matchRange`, shared with the select family.
 */
const highlights = computed(() => {
  const trimmed = query.value;
  return new Map<string, MatchParts | null>(
    listRows.value.map((row) => {
      const range = trimmed === '' || row.kind !== 'result' ? null : matchRange(row.label, trimmed);
      if (range === null) return [row.value, null];
      const characters = [...row.label];
      return [
        row.value,
        {
          before: characters.slice(0, range.start).join(''),
          match: characters.slice(range.start, range.end).join(''),
          after: characters.slice(range.end).join(''),
        },
      ];
    })
  );
});

// --- opening and closing -------------------------------------------------------------------------

const {
  isOpen,
  panelStyle,
  placement: resolvedPlacement,
  open: openPopover,
  close: closePopover,
} = usePopover({
  trigger: fieldRef,
  content: panelRef,
  // Spec "Search bar" → Sizes, Panel: "0.375rem gap below it", and "Matches the field's width".
  offset: 6,
  matchWidth: true,
  onClose: () => listbox.setActive(undefined),
});

/** The panel is only *shown* when it has something in it: an empty popup is not an answer. */
const showPanel = computed(() => isOpen.value && hasPanelContent.value);

function openPanel(): void {
  openPopover();
}

// --- the keyboard ------------------------------------------------------------------------------

/**
 * The listbox half of the WAI-ARIA combobox pattern, shared with `Select` and `MultiSelect`:
 * arrow movement that stops at the ends, the active row and `aria-activedescendant`.
 *
 * `searchable: true` is not a property of this control but a statement about the focused element:
 * the thing carrying the keyboard *is* a text field, so `Home`, `End`, `Space` and every printable
 * key belong to the caret, which is exactly what that flag means to `useListbox`. The **closed**
 * half of its keyboard table is deliberately never reached (see `onKeydown`): it opens the popup on
 * any printable key and `preventDefault()`s it, which on a real text field would swallow typing.
 */
const listbox = useListbox({
  options: () => listRows.value,
  isOpen: () => showPanel.value,
  searchable: () => true,
  optionId,
  open: () => openPanel(),
  close: () => closePopover(),
  select: (row) => choose(row as SearchRow),
  escape: () => {
    // Spec → Keyboard, `Escape`: "First clears the active option, then the query, then closes the
    // panel." Returning `false` on the third press is what lets `useOverlay` close it.
    if (listbox.activeValue.value !== undefined) {
      listbox.setActive(undefined);
      return true;
    }
    if (model.value !== '') {
      model.value = '';
      return true;
    }
    return false;
  },
});

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (!showPanel.value) {
    // Spec → Keyboard: "`ArrowDown` opens the panel if closed", and both arrows land on an option
    // from a standing start ("from none: the first" / "the last"). Nothing else on a closed field
    // is ours: `Enter` submits the form natively and every other key types.
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openPanel();
      if (showPanel.value) listbox.move(event.key === 'ArrowDown' ? 1 : -1);
    }
    return;
  }
  // "`Enter`: with an active option, follow it … with no active option, submit the form to the
  // Search page with the query" — which is the native submit, so the key is left alone.
  if (event.key === 'Enter') {
    if (listbox.activeValue.value === undefined) return;
    event.preventDefault();
    listbox.selectActive();
    return;
  }
  listbox.onKeydown(event);
}

// --- choosing ----------------------------------------------------------------------------------

/**
 * Spec → Behaviour, Choosing: "product, collection, page and 'See all' options are links and
 * navigate. Recent-search rows and popular or suggestion chips fill the field with their text and
 * run the search (they don't navigate), and focus stays in the input. 'Clear recent searches' hides
 * the recent group and keeps focus in the input."
 *
 * A link row is followed by clicking its own anchor rather than by writing `location`, so the
 * keyboard takes exactly the path the pointer takes — one `select` event, one navigation, and a
 * consumer's `@click.prevent` on the row works for both.
 */
function choose(row: SearchRow): void {
  if (row.kind === 'result' || row.kind === 'viewAll') {
    const id = optionId(row.value);
    if (id !== undefined) document.getElementById(id)?.click();
    return;
  }
  applyRow(row);
}

function onRowSelect(row: SearchRow, event: MouseEvent): void {
  if (row.kind === 'result' || row.kind === 'viewAll') {
    reportSelection(row);
    return;
  }
  // A row that does not navigate is still an `<a>` (the spec's own markup), so its default action
  // is stopped rather than followed.
  event.preventDefault();
  applyRow(row);
}

function reportSelection(row: SearchRow): void {
  // Following a row is a search that happened, so it goes into the history (see `rememberSearch`).
  rememberSearch(model.value);
  if (row.kind === 'viewAll') {
    emit('select', { id: row.value, title: row.label, href: row.href ?? '' }, 'viewAll');
    return;
  }
  if (row.item !== undefined && row.type !== undefined) emit('select', row.item, row.type);
}

function applyRow(row: SearchRow): void {
  if (row.kind === 'clearRecent') {
    recentCleared.value = true;
    if (props.recent === undefined) {
      storedRecent.value = [];
      forgetStoredRecent();
    }
    emit('clearRecent');
  } else {
    model.value = row.label;
  }
  listbox.setActive(undefined);
  fieldRef.value?.focus();
}

function onInput(event: Event): void {
  model.value = (event.target as HTMLInputElement).value;
  // "The panel opens … on typing", and a new query "resets the active option".
  listbox.setActive(undefined);
  openPanel();
}

function onClear(): void {
  model.value = '';
  listbox.setActive(undefined);
  fieldRef.value?.focus();
}

/** "Enter in the field submits the form"; the native submit then takes the browser to the page. */
function onSubmit(): void {
  rememberSearch(model.value);
  emit('submit', model.value);
  closePopover(false);
}

// --- the live region ---------------------------------------------------------------------------

/**
 * Spec → Behaviour, Announcements: 'a visually hidden `aria-live="polite"` region announces "4
 * results for mer" … or "No results for teapot", debounced until typing pauses (400ms)'. An empty
 * query "clears the live region".
 */
const ANNOUNCE_DELAY_MS = 400;
const announcement = ref('');
let announceTimer: ReturnType<typeof setTimeout> | undefined;

watch([query, () => props.results], ([text]) => {
  if (announceTimer !== undefined) clearTimeout(announceTimer);
  announceTimer = undefined;
  if (text === '') {
    announcement.value = '';
    return;
  }
  announceTimer = setTimeout(() => {
    const total = props.results?.total ?? 0;
    announcement.value = total > 0 ? m.value.resultsCount(total, text) : m.value.noResultsFor(text);
    announceTimer = undefined;
  }, ANNOUNCE_DELAY_MS);
});

// --- the / shortcut ----------------------------------------------------------------------------

/**
 * Spec → Behaviour, Shortcut: "`/` anywhere on the page (when focus isn't in a text field, select,
 * combobox or editable area) focuses the header search." WCAG 2.1.4 is why the exception list is
 * checked rather than assumed: a single-character shortcut must not fire while someone is typing.
 */
function isTypingTarget(element: Element | null): boolean {
  if (element === null) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  const role = element.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton';
}

/**
 * This instance's claim on the `/` key. An object identity rather than an id: the registry only
 * ever compares it with `===`, and nothing outside this component can forge one.
 */
const shortcutToken = {};

function onShortcut(event: KeyboardEvent): void {
  // Every search bar on the page listens, but only the one that owns the key answers — see
  // `shortcutOwner.ts`. Read at keystroke time, so a claim released by an unmount takes effect on
  // the very next `/`.
  if (!props.shortcut || !ownsShortcut(shortcutToken) || event.key !== '/') return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTypingTarget(document.activeElement)) return;
  event.preventDefault();
  fieldRef.value?.focus();
}

onMounted(() => {
  // Claimed on mount rather than during setup, so a server render claims nothing and the queue is
  // in mount order: the first search bar on the page owns the key.
  if (props.shortcut) claimShortcut(shortcutToken);
  if (typeof document === 'undefined') return;
  document.addEventListener('keydown', onShortcut);
});

watch(
  () => props.shortcut,
  (on) => (on ? claimShortcut(shortcutToken) : releaseShortcut(shortcutToken))
);

onBeforeUnmount(() => {
  stopLoadingTimer();
  if (announceTimer !== undefined) clearTimeout(announceTimer);
  releaseShortcut(shortcutToken);
  if (typeof document === 'undefined') return;
  document.removeEventListener('keydown', onShortcut);
});

// --- classes -----------------------------------------------------------------------------------

const part = (base: string, name: SearchBarPart): string => partClass(base, props.classes, name);

const rootClass = computed(() => part('relative block w-full', 'root'));
const formClass = computed(() => part('relative block w-full', 'form'));

/**
 * The field (spec "Search bar" → Sizes, and "Actions and forms" → Compact controls): the same box
 * as `Input`'s, because it is one. `eldra-focus-always` is the text-field rule from the focus-ring
 * foundation — the ring shows on *any* focus, pointer included, "because a caret alone is easy to
 * miss" — and there is deliberately no `transition-*`/`duration-*` utility beside it:
 * `eldra-focus` owns this element's transition list, including the border-colour change.
 */
const FIELD_BASE =
  'block w-full min-w-0 eldra-field-border bg-background text-text placeholder:text-muted ' +
  'eldra-focus eldra-focus-always ' +
  // "The browser's own clear and decoration are hidden" (anatomy, item 3).
  '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none';

/**
 * Sizes. `--spacing` is 0.25rem, so `ps-9.5` is the md row's 2.375rem start padding, `ps-11` the lg
 * row's 2.75rem and the shared 2.75rem end padding ("room for the clear button or hint"), and
 * `ps-10` the pill row's 2.5rem.
 */
const SIZE: Record<SearchBarSize, string> = {
  md: 'control-h ps-9.5 pe-11 text-control max-md:text-control-mobile',
  lg: 'control-h-lg ps-11 pe-11 text-control-lg',
};

const fieldClass = computed(() =>
  part(
    cx(
      FIELD_BASE,
      SIZE[props.size],
      props.pill
        ? 'rounded-full ps-10'
        : 'rounded-[var(--eldra-input-radius,var(--eldra-radius-md))]',
      'border-border-strong hover:border-text focus:border-text'
    ),
    'field'
  )
);

/** "Search icon: `muted`, decorative", 1.125rem at 0.75rem (md) or 1.25rem at 0.875rem (lg). */
const ICON_SIZE: Record<SearchBarSize, string> = { md: 'size-4.5', lg: 'size-5' };
const leadingIconClass = computed(() =>
  part(
    cx(
      'pointer-events-none absolute inset-y-0 my-auto flex items-center justify-center text-muted',
      props.size === 'lg' || props.pill ? 'start-3.5' : 'start-3',
      ICON_SIZE[props.size]
    ),
    'leadingIcon'
  )
);

/** "Clear: 2rem ghost icon button, 0.25rem from the end edge … round in the pill variant." */
const clearButtonClass = computed(() =>
  part(
    cx(
      'absolute end-1 inset-y-0 my-auto inline-flex size-8 items-center justify-center',
      props.pill ? 'rounded-full' : 'rounded-sm',
      'text-muted hover:text-text',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'eldra-focus'
    ),
    'clearButton'
  )
);

/**
 * "Keyboard hint: `/` in a keyboard-key chip: monospace, 0.75rem, `surface` fill, 1px
 * `border-strong`, `radius-sm`, `muted` text, 0.625rem from the end edge." `aria-hidden`, and out
 * of the pointer's way: the shortcut it names is a keyboard affordance.
 */
const shortcutHintClass = computed(() =>
  part(
    'pointer-events-none absolute end-2.5 inset-y-0 my-auto inline-flex h-5 min-w-5 ' +
      'items-center justify-center rounded-sm border border-border-strong bg-surface px-1 ' +
      'text-search-kbd text-muted',
    'shortcutHint'
  )
);

const liveRegionClass = computed(() => part('', 'liveRegion'));

const showClear = computed(() => model.value.length > 0);
const showHint = computed(() => props.shortcut && model.value.length === 0);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <!-- Spec → Accessibility: "A search landmark: … `<form role="search" action="/search">`". -->
    <form
      data-part="form"
      role="search"
      method="get"
      :action="action"
      :class="formClass"
      @submit="onSubmit"
    >
      <span data-part="leadingIcon" :class="leadingIconClass">
        <!-- Tabler's `search`, stroke 1.75. Decorative: the field is named by its label. -->
        <svg
          :class="ICON_SIZE[size]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
          <path d="M21 21l-6 -6" />
        </svg>
      </span>

      <input
        ref="fieldRef"
        v-bind="$attrs"
        :id="controlId"
        data-part="field"
        name="q"
        type="search"
        role="combobox"
        :class="fieldClass"
        :value="model"
        :placeholder="placeholderText"
        :aria-label="labelText"
        aria-autocomplete="list"
        :aria-expanded="showPanel ? 'true' : 'false'"
        :aria-controls="listboxId"
        :aria-activedescendant="showPanel ? listbox.activeId.value : undefined"
        :aria-keyshortcuts="shortcut ? '/' : undefined"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @focus="openPanel"
        @click="openPanel"
        @keydown="onKeydown"
      />

      <button
        v-if="showClear"
        data-part="clearButton"
        type="button"
        :class="clearButtonClass"
        :aria-label="m.clear"
        @click="onClear"
      >
        <!-- Tabler's `x` at 1.125rem. Decorative: the button is named by its label. -->
        <svg
          class="size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 6l-12 12" />
          <path d="M6 6l12 12" />
        </svg>
      </button>

      <span
        v-else-if="showHint"
        data-part="shortcutHint"
        :class="shortcutHintClass"
        :title="m.shortcutHint"
        aria-hidden="true"
        >/</span
      >
    </form>

    <SearchResultsPanel
      v-if="showPanel"
      ref="panelComponent"
      :panel-id="panelId"
      :listbox-id="listboxId"
      :view="view"
      :sections="sections"
      :loose-chips="looseChips"
      :view-all="viewAllRow"
      :option-id="optionId"
      :active-value="listbox.activeValue.value"
      :highlights="highlights"
      :listbox-label="m.searchSuggestions"
      :empty-title="m.noResultsFor(model)"
      :empty-advice="m.searchAdvice"
      :panel-style="panelStyle"
      :placement="resolvedPlacement"
      :classes="classes"
      @select="onRowSelect"
      @activate="listbox.setActive"
    >
      <template v-if="$slots.item" #item="params">
        <slot name="item" v-bind="params" />
      </template>
      <template v-if="$slots.empty" #empty><slot name="empty" /></template>
    </SearchResultsPanel>

    <!-- Spec → Anatomy, item 11: a visually hidden, polite live region. Always in the DOM, because
         a region added to the page at the same moment as its text is not reliably announced. -->
    <VisuallyHidden
      as="p"
      data-part="liveRegion"
      role="status"
      aria-live="polite"
      :classes="{ root: liveRegionClass }"
      >{{ announcement }}</VisuallyHidden
    >
  </div>
</template>
