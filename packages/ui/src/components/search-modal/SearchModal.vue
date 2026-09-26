<script setup lang="ts">
/**
 * The same live search as `SearchBar` (spec "Search modal", lines 3968-4124), inside a native
 * `<dialog>`: opened from a header trigger the consumer renders (a search icon button, a field-like
 * "Search the shop ⌘K" pill — neither is part of this component, the same way a "Open dialog" button
 * is not part of `Dialog`) or with `/`/`⌘K`/`Ctrl+K` from anywhere. "Everything else is exactly as
 * the Search bar" (the spec's own words), which is why this file duplicates `SearchBar.vue`'s view
 * logic (idle/results/none/loading, the grouping, the highlight arithmetic, recent-search storage)
 * rather than importing it: the two share behaviour, not markup — one is a floating popup with a
 * boxed field, the other a modal frame with a borderless one, and they have almost no DOM in common
 * beyond the `SearchResultsPanel`/`useListbox` pair this file reuses directly.
 *
 * Built on `useDialog`, the same shared "Modal dialogs" contract `Dialog`/`Drawer` use: native
 * `<dialog>` + `showModal()`, no `role="dialog"`, no custom focus trap, never stacking two modals,
 * the page behind inert and not scrolling, a backdrop click closing. The one behaviour `useDialog`
 * does not cover is the spec's own three-step `Esc` (clear the active option, then the query, then
 * close) — `useDialog`'s own `onCancel` is a plain notification with nothing to prevent the close,
 * which is right for `Dialog`/`Drawer` ("Esc always closes") but not for this component, so the
 * native `cancel` event is intercepted directly on the `<dialog>` (`onDialogCancel` below, bound in
 * the template so it attaches *before* `useDialog`'s own listener, which attaches in its own
 * `onMounted`) and stopped with `stopImmediatePropagation()` on the two steps that must not close.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useDialog } from '../../composables/useDialog';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_CLEAR_BUTTON, FIELD_SEARCH_APPEARANCE } from '../input/classes';
import { useListbox } from '../select/useListbox';
import { matchRange, type MatchParts } from '../select/useOptionList';
import SearchResultsPanel from '../search-bar/SearchResultsPanel.vue';
import { claimShortcut, ownsShortcut, releaseShortcut } from '../search-bar/shortcutOwner';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import type {
  SearchModalPart,
  SearchModalProps,
  SearchResultItem,
  SearchResultType,
  SearchRow,
  SearchSection,
  SearchSelectType,
} from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SearchModalProps>(), {
  // `undefined`, not `false` (unlike `Dialog`/`Drawer`, which never write `true` to their own
  // model without an external `v-model` prompting it first): this modal opens *itself*, from
  // inside, on `/`/`⌘K`/`Ctrl+K` — the same reason `Switch`'s own toggle uses `undefined` here
  // rather than a literal `false`. `useControllableModel`'s "is this controlled?" check is
  // `props.modelValue === undefined`; a literal `false` default would make that always false (it
  // is a *value*, not "absent"), which would permanently block every internal write once this
  // modal has no `v-model` bound to it at all — exactly the shortcut-opened, uncontrolled case.
  modelValue: undefined,
  query: undefined,
  ariaLabel: undefined,
  results: undefined,
  loading: false,
  recent: undefined,
  popular: undefined,
  showRecent: true,
  resultTypes: undefined,
  placeholder: undefined,
  action: '/search',
  shortcut: true,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:query': [value: string];
  /** Fires when `Esc` actually closes the modal (its third step) — before it closes, the same
   *  contract `Dialog`/`Drawer`'s own `cancel` event has. Never fires for the first two steps:
   *  those clear state and consume the key instead of closing anything. */
  cancel: [];
  /** Fires after the modal has closed, with how: `"escape"`, `"backdrop"`, `"button"`, `"select"`
   *  (a result or "See all" row was followed), or whatever a consumer passed to the exposed
   *  `close(returnValue)` method. */
  close: [reason: string];
  /** A row was chosen — with the keyboard (`Enter` on an active option) or the pointer. */
  select: [item: SearchResultItem, type: SearchSelectType];
  /** Fires with the query when `Enter` is pressed with no active option. */
  submit: [query: string];
  /** The "Clear recent searches" row was chosen. */
  clearRecent: [];
}>();

const m = useMessages(() => props.messages);

const controlId = useUiId('searchmodal');
const panelId = computed(() => `${controlId.value}-panel`);
const listboxId = computed(() => `${controlId.value}-listbox`);

const dialogEl = ref<HTMLDialogElement | null>(null);
const fieldRef = ref<HTMLInputElement | null>(null);

/** Controlled when the parent binds `v-model`, self-managing when it does not — the same model
 *  every stateful component in this package uses. This is the modal's *open* state; `Dialog` and
 *  `Drawer` both name it `modelValue` too, which is why the query below needs a name of its own. */
const model = useControllableModel<boolean>(props, emit, () => false);

/**
 * The query. Its own named `v-model:query` — not `modelValue`, which this component already gives
 * to the open/closed state — self-managing exactly the same way `SearchBar`'s own `modelValue` is
 * (a `ref` that mirrors the prop while nothing external drives it, and only ever writes back
 * through the emit).
 */
const internalText = ref(props.query ?? '');
watch(
  () => props.query,
  (value) => {
    if (value !== undefined) internalText.value = value;
  }
);
const text = computed<string>({
  get: () => props.query ?? internalText.value,
  set: (value) => {
    if (props.query === undefined) internalText.value = value;
    emit('update:query', value);
  },
});
const query = computed(() => text.value.trim());

const labelText = computed(() => m.value.searchTheShop);
const placeholderText = computed(() => props.placeholder ?? labelText.value);
const accessibleName = computed(() => props.ariaLabel ?? m.value.search);

// --- recent searches (identical to SearchBar's own — same storage key, spec: "shared per browser")
// ---------------------------------------------------------------------------------------------

const RECENT_KEY = 'eldra-ui:recent-searches';
const RECENT_MAX = 5;

const storedRecent = ref<string[]>([]);
const recentCleared = ref(false);
watch(
  () => props.recent,
  () => (recentCleared.value = false)
);

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

function rememberSearch(value: string): void {
  if (props.recent !== undefined) return;
  const entry = value.trim();
  if (entry === '') return;
  const folded = entry.toLocaleLowerCase();
  const next = [
    entry,
    ...storedRecent.value.filter((previous) => previous.toLocaleLowerCase() !== folded),
  ].slice(0, RECENT_MAX);
  storedRecent.value = next;
  recentCleared.value = false;
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* a storage that refuses to be written leaves the list in memory for this page only */
  }
}

onMounted(() => {
  if (props.recent === undefined) storedRecent.value = readStoredRecent();
});

const recentList = computed(() => {
  if (!props.showRecent || recentCleared.value) return [];
  return (props.recent ?? storedRecent.value).slice(0, RECENT_MAX);
});

const popularList = computed(() => (props.popular ?? []).slice(0, 6));

// --- the rows (identical to SearchBar's own grouping) -------------------------------------------

const ALL_TYPES: SearchResultType[] = ['products', 'collections', 'articles', 'pages'];

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
    const rows: SearchRow[] = recentList.value.map((label, index) => ({
      value: `recent:${index}`,
      label,
      kind: 'recent',
    }));
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

const chipRows = computed<SearchRow[]>(() =>
  popularList.value.map((label, index) => ({ value: `popular:${index}`, label, kind: 'chip' }))
);

// --- the views ------------------------------------------------------------------------------------

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

const awaitingFirstResults = computed(() => query.value !== '' && props.results === undefined);

/**
 * Unlike `SearchBar`'s own popup — which simply has no panel at all while `awaitingFirstResults`
 * (see that computed's own comment) — this results area can never fully disappear: spec "Search
 * modal" → Accessibility: "In the modal the panel is always shown, so `aria-expanded` stays `true`
 * while the dialog is open." So a query with no response behind it yet reads as `results` with an
 * empty `resultSections` (nothing rendered under the listbox) rather than `none` — "No results for
 * ‘m’" while the request for it is still in flight would be a wrong answer, not an empty one.
 */
const view = computed<'idle' | 'results' | 'none' | 'loading'>(() => {
  if (loadingShown.value) return 'loading';
  if (query.value === '') return 'idle';
  if (awaitingFirstResults.value) return 'results';
  return hasResults.value ? 'results' : 'none';
});

const sections = computed<SearchSection[]>(() => {
  if (view.value === 'idle') return idleSections.value;
  if (view.value === 'results') return resultSections.value;
  return [];
});

const looseChips = computed<SearchRow[]>(() =>
  view.value === 'none' && !awaitingFirstResults.value ? chipRows.value : []
);

const viewAllRow = computed<SearchRow | undefined>(() => {
  if (view.value !== 'results' || awaitingFirstResults.value) return undefined;
  const total = props.results?.total ?? 0;
  const separator = props.action.includes('?') ? '&' : '?';
  return {
    value: 'view-all',
    label: m.value.viewAllResults(total, query.value),
    kind: 'viewAll',
    href: `${props.action}${separator}q=${encodeURIComponent(text.value)}`,
  };
});

const listRows = computed<SearchRow[]>(() => {
  const rows = sections.value.flatMap((section) => section.rows);
  rows.push(...looseChips.value);
  const viewAll = viewAllRow.value;
  if (viewAll !== undefined) rows.push(viewAll);
  return rows;
});

const indexOfRow = computed(() => new Map(listRows.value.map((row, index) => [row.value, index])));
const optionId = (value: string): string | undefined => {
  const index = indexOfRow.value.get(value);
  return index === undefined ? undefined : `${controlId.value}-o${index}`;
};

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

// --- the keyboard ---------------------------------------------------------------------------------

/**
 * The listbox half of the combobox pattern, exactly as `SearchBar` shares it with `Select` and
 * `MultiSelect`. Two differences from `SearchBar`'s own call, both because this "popup" is never
 * closed while the dialog itself is open: `isOpen` always answers `true` (there is no closed
 * keyboard table to fall into), and `close`/`open` are no-ops — `Tab` must move focus on to Clear
 * and Close, never close the whole modal the way it closes `SearchBar`'s popup. `Escape` is handled
 * entirely by `onDialogCancel` below instead of `useListbox`'s own `escape` option (see this file's
 * top comment for why).
 */
const listbox = useListbox({
  options: () => listRows.value,
  isOpen: () => true,
  searchable: () => true,
  optionId,
  open: () => {
    /* the results area is always shown while the dialog is open; nothing to open */
  },
  close: () => {
    /* Tab moves on to Clear/Close; it must never close the whole modal */
  },
  select: (row) => choose(row as SearchRow),
});

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  // "Enter … with no active option: submits the form to the Search page" — the native submit, so
  // the key is left alone.
  if (event.key === 'Enter') {
    if (listbox.activeValue.value === undefined) return;
    event.preventDefault();
    listbox.selectActive();
    return;
  }
  listbox.onKeydown(event);
}

// --- Esc, in the spec's own three steps -----------------------------------------------------------

/**
 * Spec "Search modal" → Behaviour, "Esc, in order": clears the active option; else, with text in
 * the field, clears the query and keeps the dialog open (its `cancel` event is *cancelled*); else
 * lets the dialog close as normal. Bound in the template rather than passed to `useDialog` as
 * `onCancel`, because that callback cannot prevent the close it is always followed by (see this
 * file's own top comment) — this listener runs first (template bindings attach before a
 * composable's own `onMounted`) and calls `stopImmediatePropagation()` on the two steps that must
 * not reach `useDialog`'s listener at all.
 */
function onDialogCancel(event: Event): void {
  if (listbox.activeValue.value !== undefined) {
    event.preventDefault();
    event.stopImmediatePropagation();
    listbox.setActive(undefined);
    return;
  }
  if (query.value !== '' && document.activeElement === fieldRef.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    text.value = '';
    return;
  }
  // Neither step applies: let `useDialog`'s own listener run and close the modal as normal.
}

// --- opening, closing and the useDialog contract --------------------------------------------------

const { close, isTop } = useDialog({
  open: model,
  setOpen: (next) => {
    model.value = next;
  },
  dialog: dialogEl,
  onCancel: () => emit('cancel'),
});

/** The one place the public `close` event is emitted, for every closing route at once — the same
 *  pattern `Dialog`/`Drawer` use, including why a plain external close reads as `"escape"`. */
function onNativeClose(): void {
  emit('close', dialogEl.value?.returnValue || 'escape');
}

/** Spec → Behaviour, "On close": "the query is reset to empty (idle view next time)". A plain
 *  watcher catches every closing route at once — Esc, the Close/Cancel button, a backdrop click, a
 *  consumer's own `close(value)`, or `v-model` simply being set to `false` from outside. */
watch(model, (open) => {
  if (!open) {
    text.value = '';
    listbox.setActive(undefined);
  }
});

function onCloseClick(): void {
  close('button');
}

/** So a consumer can close the modal with an action value of their own via a template ref, the same
 *  mechanism `Dialog`/`Drawer` expose. */
defineExpose({ close, isTop });

// --- choosing ---------------------------------------------------------------------------------

/** Spec → Behaviour, Enter/Choosing: link rows are followed by clicking their own anchor, so the
 *  keyboard and the pointer converge on one handler (`onRowSelect`) — the same technique
 *  `SearchBar` uses. */
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
  event.preventDefault();
  applyRow(row);
}

/** Spec → Behaviour, Enter: "On an active product, collection or article option: follows the link
 *  and closes the dialog." A pointer click on the same row does the same thing. */
function reportSelection(row: SearchRow): void {
  rememberSearch(text.value);
  if (row.kind === 'viewAll') {
    emit('select', { id: row.value, title: row.label, href: row.href ?? '' }, 'viewAll');
  } else if (row.item !== undefined && row.type !== undefined) {
    emit('select', row.item, row.type);
  }
  close('select');
}

/** Recent rows, chips and "Clear recent searches" never navigate and never close the modal — spec:
 *  "no navigation; focus stays in the input." */
function applyRow(row: SearchRow): void {
  if (row.kind === 'clearRecent') {
    recentCleared.value = true;
    if (props.recent === undefined) {
      storedRecent.value = [];
      forgetStoredRecent();
    }
    emit('clearRecent');
  } else {
    text.value = row.label;
  }
  listbox.setActive(undefined);
  fieldRef.value?.focus();
}

function onInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value;
  listbox.setActive(undefined);
}

function onClear(): void {
  text.value = '';
  listbox.setActive(undefined);
  fieldRef.value?.focus();
}

/**
 * "With no active option: submits the form to `action` with the query." Left as a plain native
 * submit, like `SearchBar`'s own — deliberately not followed by `close()` here, unlike
 * `reportSelection` above: the spec's own Enter bullet says "follows the link **and closes**" only
 * for the active-option case, and is silent on closing for a plain submit.
 */
function onSubmit(): void {
  rememberSearch(text.value);
  emit('submit', text.value);
}

// --- the live region (identical to SearchBar's own) ------------------------------------------------

const ANNOUNCE_DELAY_MS = 400;
const announcement = ref('');
let announceTimer: ReturnType<typeof setTimeout> | undefined;

watch([query, () => props.results], ([value]) => {
  if (announceTimer !== undefined) clearTimeout(announceTimer);
  announceTimer = undefined;
  if (value === '') {
    announcement.value = '';
    return;
  }
  announceTimer = setTimeout(() => {
    const total = props.results?.total ?? 0;
    announcement.value =
      total > 0 ? m.value.resultsCount(total, value) : m.value.noResultsFor(value);
    announceTimer = undefined;
  }, ANNOUNCE_DELAY_MS);
});

// --- the / and ⌘K/Ctrl+K shortcuts ------------------------------------------------------------------

/** Spec → Behaviour, Shortcut (Search bar section, deferred to by this one): the exception list a
 *  single-character shortcut must respect (WCAG 2.1.4). Duplicated from `SearchBar.vue` rather than
 *  shared: a small, pure predicate, and this task must not touch that file. */
function isTypingTarget(element: Element | null): boolean {
  if (element === null) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  const role = element.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton';
}

function isOpenShortcut(event: KeyboardEvent): boolean {
  return (
    (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey) && !event.altKey
  );
}

/** This instance's claim on the `/` and `⌘K`/`Ctrl+K` keys — see `shortcutOwner.ts`. An object
 *  identity, the same as `SearchBar`'s own token. */
const shortcutToken = {};

function onShortcut(event: KeyboardEvent): void {
  if (!props.shortcut) return;
  // "⌘K / Ctrl+K … Always opens the modal, even while typing in a field; the browser's default …
  // is prevented." Its own queue (spec: "Only one search modal on a page may enable it"), separate
  // from `/`'s, which this instance also contends for below.
  if (isOpenShortcut(event)) {
    if (!ownsShortcut(shortcutToken, 'modal')) return;
    event.preventDefault();
    if (!model.value) model.value = true;
    return;
  }
  // "`/` opens it only when no SearchBar currently owns the `/` shortcut" — the very same queue
  // `SearchBar` claims, so whichever of them mounted first (with its own shortcut on) owns the key.
  if (event.key !== '/' || !ownsShortcut(shortcutToken)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTypingTarget(document.activeElement)) return;
  event.preventDefault();
  if (!model.value) model.value = true;
}

onMounted(() => {
  if (props.shortcut) {
    claimShortcut(shortcutToken);
    claimShortcut(shortcutToken, 'modal');
  }
  if (typeof document === 'undefined') return;
  document.addEventListener('keydown', onShortcut);
});

watch(
  () => props.shortcut,
  (on) => {
    if (on) {
      claimShortcut(shortcutToken);
      claimShortcut(shortcutToken, 'modal');
    } else {
      releaseShortcut(shortcutToken);
      releaseShortcut(shortcutToken, 'modal');
    }
  }
);

onBeforeUnmount(() => {
  stopLoadingTimer();
  if (announceTimer !== undefined) clearTimeout(announceTimer);
  releaseShortcut(shortcutToken);
  releaseShortcut(shortcutToken, 'modal');
  if (typeof document === 'undefined') return;
  document.removeEventListener('keydown', onShortcut);
});

// --- classes ---------------------------------------------------------------------------------------

const part = (base: string, name: SearchModalPart): string => partClass(base, props.classes, name);

/**
 * The dialog's own box (spec "Search modal" → Sizes, Dialog row). No separate "panel" wrapper the
 * way `Dialog`/`Drawer` draw one: unlike those two, nothing here needs to shrink-wrap an inner
 * child's intrinsic size or dock a panel to one edge, so the frame's own position, size, radius,
 * border and clipping all live on the root `<dialog>` directly.
 *
 * `max-w-none` matters more than it looks: Chromium's own UA stylesheet gives every `<dialog>` a
 * default `max-width` clamp (found by inspecting the computed style against the screenshot
 * baseline below — it silently shrank the full-screen variant below 48rem to several dozen pixels
 * short of true `100vw`). `Dialog`/`Drawer` never hit it because their own root always shrink-wraps
 * a narrower inner panel; this root *is* the sized box, so it needs its own explicit override.
 * `max-md:h-screen` is the same shape for height: a `<dialog>`'s
 * intrinsic height is its content's, and the spec's mobile row is "100% × 100%" — a floor, not
 * only the ceiling `eldra-search-modal-max-height` already gives it — so short content (the idle
 * view) would otherwise leave a visible gap under a short panel instead of filling the screen.
 */
const rootClass = computed(() =>
  part(
    cx(
      'flex max-w-none flex-col overflow-hidden border-0 bg-background p-0 text-text',
      'eldra-search-modal-position',
      'eldra-search-modal-width',
      'eldra-search-modal-max-height',
      'max-md:h-screen',
      'rounded-lg border border-border shadow-md',
      'max-md:rounded-none max-md:border-0 max-md:shadow-none',
      'backdrop:bg-overlay',
      'animate-eldra-dialog-in motion-reduce:animate-eldra-dialog-in-reduced'
    ),
    'root'
  )
);

const formClass = computed(() =>
  part('relative flex h-14 shrink-0 items-center border-b border-border', 'form')
);

/**
 * The field (spec "Search modal" → Sizes, Field row): "no border or radius of its own, transparent
 * fill … left padding 3rem, right padding 5.25rem" (7.5rem below 48rem, room for "Cancel"). Not
 * `Input`'s box (`FIELD_BASE`) — the spec gives this field a wholly different rest state (no
 * boundary at all, an *inset* focus ring instead of `Input`'s outer one) — but the browser's own
 * search decoration is still reset the same way `Input`'s is (`FIELD_SEARCH_APPEARANCE`).
 */
const fieldClass = computed(() =>
  part(
    cx(
      'block h-full w-full min-w-0 bg-transparent text-text placeholder:text-muted',
      'ps-12 pe-21 max-md:pe-30',
      'text-search-modal-field max-md:text-control-mobile',
      'rounded-t-lg max-md:rounded-none eldra-focus-inset eldra-focus-inset-always',
      FIELD_SEARCH_APPEARANCE
    ),
    'field'
  )
);

/** "Search icon: 1.25rem, 1.125rem from the left edge." */
const leadingIconClass = computed(() =>
  part(
    'pointer-events-none absolute inset-y-0 my-auto flex size-5 items-center justify-center start-4.5 text-muted',
    'leadingIcon'
  )
);

/** "Clear: 2rem ghost icon button, 2.75rem from the right edge" (5rem below 48rem, left of
 *  "Cancel"). */
const clearButtonClass = computed(() =>
  part(
    cx(FIELD_CLEAR_BUTTON, 'absolute inset-y-0 my-auto size-8 rounded-sm end-11 max-md:end-20'),
    'clear'
  )
);

/** "Close: 2rem ghost icon button (×) … 0.5rem from the right edge" — desktop and tablet only; the
 *  phone variant below replaces it. */
const closeIconClass = computed(() =>
  part(
    cx(
      FIELD_CLEAR_BUTTON,
      'absolute inset-y-0 my-auto hidden size-8 rounded-sm end-2 md:inline-flex'
    ),
    'close'
  )
);

/** "'Cancel' small ghost text button (2rem tall), 0.5rem from the right edge" — replaces the icon
 *  button below 48rem, where its own visible text is already the accessible name. */
const cancelClass = computed(() =>
  part(
    cx(
      'absolute inset-y-0 my-auto inline-flex h-8 items-center rounded-sm px-2 end-2 md:hidden',
      'text-body-sm font-medium text-muted hover:text-text cursor-pointer eldra-focus',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
    ),
    'close'
  )
);

/** The frame's own bounding box around the reused panel (spec → Sizes, Panel row: "fills the
 *  remaining height and scrolls") — distinct from that panel's own `panel` part, the scrollable box
 *  inside it. */
const resultsClass = computed(() => part('min-h-0 flex-1 overflow-hidden', 'results'));

/** "Foot | padding 0.625rem 1rem, gap 0.5rem 1.25rem … 1px border above … hidden [below 48rem]." */
const footerClass = computed(() =>
  part(
    cx(
      'hidden items-center gap-x-5 gap-y-2 border-t border-border bg-surface px-4 py-2.5 md:flex',
      'text-search-modal-foot text-muted'
    ),
    'footer'
  )
);

const hintKeyClass =
  'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-strong ' +
  'bg-background px-1 text-search-modal-kbd text-muted';
const hintClass = 'inline-flex items-center gap-1.5';

const liveRegionClass = computed(() => part('', 'liveRegion'));

const showClear = computed(() => text.value.length > 0);
</script>

<template>
  <dialog
    ref="dialogEl"
    data-part="root"
    :class="rootClass"
    :aria-label="accessibleName"
    @cancel="onDialogCancel"
    @close="onNativeClose"
  >
    <!-- Spec → Accessibility: "a role=search wrapper" around the field, the same landmark
         `SearchBar` renders. -->
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
          class="size-5"
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
        :value="text"
        :placeholder="placeholderText"
        :aria-label="labelText"
        aria-autocomplete="list"
        aria-expanded="true"
        :aria-controls="listboxId"
        :aria-activedescendant="listbox.activeId.value"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @keydown="onKeydown"
      />

      <button
        v-if="showClear"
        data-part="clear"
        type="button"
        :class="clearButtonClass"
        :aria-label="m.clearSearch"
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

      <button
        data-part="close"
        type="button"
        :class="closeIconClass"
        :aria-label="m.closeSearch"
        @click="onCloseClick"
      >
        <!-- Tabler's `x`, matching Dialog's own close button. Hidden below 48rem — see `cancelClass`. -->
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
      <button data-part="close" type="button" :class="cancelClass" @click="onCloseClick">
        {{ m.cancel }}
      </button>
    </form>

    <div data-part="results" :class="resultsClass">
      <SearchResultsPanel
        flat
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
        :empty-title="m.noResultsFor(text)"
        :empty-advice="m.searchAdvice"
        :classes="classes"
        @select="onRowSelect"
        @activate="listbox.setActive"
      >
        <template v-if="$slots.item" #item="params">
          <slot name="item" v-bind="params" />
        </template>
        <template v-if="$slots.empty" #empty><slot name="empty" /></template>
      </SearchResultsPanel>
    </div>

    <!-- Spec → Anatomy, item 6: keyboard hints, hidden on phones (there is no hardware keyboard to
         hint at there) and `aria-hidden` always — screen readers get the combobox semantics
         instead (spec → Accessibility). -->
    <div data-part="footer" :class="footerClass" aria-hidden="true">
      <span :class="hintClass"
        ><span :class="hintKeyClass">↑</span><span :class="hintKeyClass">↓</span>
        {{ m.searchMoveHint }}</span
      >
      <span :class="hintClass"><span :class="hintKeyClass">↵</span> {{ m.searchOpenHint }}</span>
      <span :class="hintClass"><span :class="hintKeyClass">esc</span> {{ m.searchEscHint }}</span>
    </div>

    <!-- Spec "Search bar" → Anatomy, item 11: a visually hidden, polite live region. -->
    <VisuallyHidden
      as="p"
      data-part="liveRegion"
      role="status"
      aria-live="polite"
      :classes="{ root: liveRegionClass }"
      >{{ announcement }}</VisuallyHidden
    >
  </dialog>
</template>
