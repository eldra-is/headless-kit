<script setup lang="ts">
import { computed, inject, nextTick, ref, useAttrs, useSlots, watch, watchPostEffect } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { joinIds, useUiId } from '../../utils/id';
import Button from '../button/Button.vue';
import { FIELD_KEY } from '../field-wrapper/context';
import { ICON_STROKE_WIDTH } from '../icon/sizes';
import SelectPanel from './SelectPanel.vue';
import SelectTags from './SelectTags.vue';
import { TRIGGER_VALUE_CELL, TRIGGER_VALUE_STACK } from './panelParts';
import { useSummaryFit } from './useSummaryFit';
import { useTagRows } from './useTagRows';
import type { MultiSelectProps, SelectOption, SelectSize } from './types';
import { useListbox } from './useListbox';
import { CREATE_VALUE, useOptionList } from './useOptionList';
import { usePopover } from './usePopover';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<MultiSelectProps>(), {
  modelValue: undefined,
  name: undefined,
  id: undefined,
  size: 'md',
  // Undefined, not false: `searchable` falls back to the spec's "more than 10 options" rule, and
  // the next four fall back to the field wrapper's context, where `false` would be an answer
  // rather than "no opinion".
  searchable: undefined,
  searchPlaceholder: undefined,
  placeholder: undefined,
  leadingIcon: undefined,
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  disabled: false,
  readonly: false,
  placement: 'auto',
  teleport: true,
  loading: false,
  creatable: false,
  renderBatch: undefined,
  showTags: true,
  tagPlacement: 'below',
  maxTagRows: 2,
  maxSummary: 'fit',
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
  /** Spec "Multi-select" → Events: "fires with the new array on **every** toggle". */
  change: [value: string[]];
  /** Spec: "fires when the footer Clear, the trigger's clear button, `Backspace`/`Delete` or tag
   *  removals empty the selection". */
  clear: [];
  open: [];
  /** Spec: "fires when the popover closes (Done, `Escape`, focus leaving, outside click)". */
  close: [];
  /** The search query, on every keystroke in the panel's search field. */
  search: [query: string];
  /** The create row was chosen: the trimmed query, for the consumer to add as an option. */
  create: [query: string];
}>();

const m = useMessages(() => props.messages);

/** Field-wrapper wiring, identical to `Select`'s — see the comments there. */
const field = inject(FIELD_KEY, null);
const controlId = useUiId(
  'multiselect',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const labelledBy = computed(() =>
  field?.value.labelsControl === true && field.value.labelled !== false
    ? field.value.labelId
    : undefined
);
const attrs = useAttrs();
const slots = useSlots();
const fieldRef = ref<HTMLElement | null>(null);
/** `tagPlacement: 'inside'`: the tags sit in the field, and the panel hangs off the whole field. */
const inside = computed(() => props.tagPlacement === 'inside');
const panelAnchor = computed(() => (inside.value ? fieldRef.value : null));
const fallbackLabel = computed(() =>
  labelledBy.value === undefined && typeof attrs['aria-label'] === 'string'
    ? attrs['aria-label']
    : undefined
);

/**
 * `aria-describedby` (spec "Actions and forms" → the Field wrapper): **own ids first, then the
 * field context's.** The prop adds to the wrapper's error/help ids, it never replaces them — a
 * `<FieldWrapper error="…">` still describes its error when the control is given a `describedBy`
 * of its own. `joinIds` dedupes and drops the attribute when there is nothing to say.
 */
const describedBy = computed(() => joinIds(props.describedBy, field?.value.describedBy));
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);

const panelId = computed(() => `${controlId.value}-panel`);
const listboxId = computed(() => `${controlId.value}-listbox`);
const clearId = computed(() => `${controlId.value}-clear`);
const tagsId = computed(() => `${controlId.value}-tags`);

/** An option's element id is built from its position, not its value (see `Select`). */
const indexOfValue = computed(
  () => new Map(props.options.map((option, index) => [option.value, index]))
);
const optionId = (value: string): string =>
  value === CREATE_VALUE
    ? `${controlId.value}-create`
    : `${controlId.value}-o${indexOfValue.value.get(value) ?? 0}`;

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string[]>(props, emit, () => []);

/** Spec "Select" → Properties: "`true` when there are more than 10 options, else `false`". */
const searchable = computed(
  () => props.searchable ?? (props.creatable || props.options.length > 10)
);
const placeholderText = computed(() => props.placeholder ?? m.value.multiSelectPlaceholder);
const searchPlaceholderText = computed(() => props.searchPlaceholder ?? m.value.search);

const optionByValue = computed(
  () => new Map(props.options.map((option) => [option.value, option]))
);

/**
 * The chosen options, in the order they were chosen.
 *
 * A value with no option of its own is dropped: it has no label, so the trigger, the tags and the
 * hidden native select could not show it anyway. Every count the control draws is this list's
 * length, so the summary, the "+N" pill, the tags and the footer's live count can never disagree.
 */
const selectedOptions = computed(() =>
  model.value
    .map((value) => optionByValue.value.get(value))
    .filter((option): option is SelectOption => option !== undefined)
);

const hasSelection = computed(() => selectedOptions.value.length > 0);

/** Spec "Multi-select" → Properties: "The clear button is always available when something is
 *  selected (no `clearable` property needed)." */
const showClear = computed(() => !props.disabled && !props.readonly && hasSelection.value);

/**
 * Whether a tag carries its remove button.
 *
 * The spec's States table ends a disabled control's row with "clear button hidden", and a read-only
 * one is "the value is readable but fixed". The tag list *is* the value made readable, so it stays
 * in both states; the control that would change it goes, exactly as the trigger's clear button
 * already does (`showClear` above). Hidden rather than `disabled`: a disabled button stays in the
 * accessibility tree, announcing a "Remove Sweaters" action that can never happen, and hiding it is
 * the spec's own answer for the clear button in the same situation.
 */
const showTagRemove = computed(() => !props.disabled && !props.readonly);

/**
 * Spec "Multi-select" → States, Some selected: "the trigger lists the first 2 labels, comma-
 * separated and truncated with an ellipsis, plus a '+N' pill for the rest."
 */
/** Out of flow and invisible, so the measured copy never moves or widens anything. */
const SUMMARY_MEASURE =
  'eldra:pointer-events-none eldra:invisible eldra:absolute eldra:start-0 eldra:top-0 eldra:flex eldra:items-center eldra:gap-2 eldra:overflow-hidden';
const summaryRef = ref<HTMLElement | null>(null);
const summaryRunRef = ref<HTMLElement | null>(null);
const summaryPillRef = ref<HTMLElement | null>(null);
const summaryFit = useSummaryFit(summaryRef, summaryRunRef, summaryPillRef, () =>
  selectedOptions.value.map((option) => option.label)
);
/** `'fit'` measures the trigger (`useSummaryFit`); a consumer's `value` slot draws its own. */
const fitsSummary = computed(() => props.maxSummary === 'fit' && !slots.value);
const summaryCount = computed(() =>
  props.maxSummary === 'fit' ? summaryFit.count.value : Math.max(0, props.maxSummary)
);
const summaryText = computed(() =>
  selectedOptions.value
    .slice(0, summaryCount.value)
    .map((option) => option.label)
    .join(', ')
);
const moreCount = computed(() => Math.max(0, selectedOptions.value.length - summaryCount.value));

const tagRows = useTagRows(
  fieldRef,
  () => props.maxTagRows,
  () => inside.value,
  () => model.value.join('\u0000')
);
/** The tags drawn: all of them below, and inside up to `maxTagRows` rows' worth. */
const shownTags = computed(() =>
  inside.value && tagRows.visible.value !== null
    ? selectedOptions.value.slice(0, tagRows.visible.value)
    : selectedOptions.value
);
const hiddenTagCount = computed(() => selectedOptions.value.length - shownTags.value.length);

/** Spec → Accessibility: the footer count is "4 selected" / "None selected", announced politely. */
const countText = computed(() =>
  hasSelection.value ? m.value.selectedCount(selectedOptions.value.length) : m.value.noneSelected
);

const query = ref('');
const triggerRef = ref<HTMLButtonElement | null>(null);
const nativeRef = ref<HTMLSelectElement | null>(null);

/** The panel's own elements — see `Select` for why they come from the component rather than a ref. */
const panelComponent = ref<InstanceType<typeof SelectPanel> | null>(null);
const panelRef = computed<HTMLElement | null>(() => panelComponent.value?.root ?? null);
const searchRef = computed<HTMLInputElement | null>(
  () => panelComponent.value?.searchInput ?? null
);

// --- the list ----------------------------------------------------------------------------------

const {
  sections,
  nativeSections,
  listOptions,
  hasOptions,
  highlights,
  createOption,
  renderMore,
  reveal,
  resetBatch,
} = useOptionList({
  options: () => props.options,
  query: () => query.value,
  searchable: () => searchable.value,
  controlId: () => controlId.value,
  loading: () => props.loading,
  creatable: () => props.creatable,
  renderBatch: () => props.renderBatch,
});

// --- opening and closing -------------------------------------------------------------------------

/**
 * The panel's open/closed life, shared with `Select` and the `SearchBar`'s results panel: the
 * registry's "only one open at a time", `useOverlay`'s closing rules, `useFloating`'s position and
 * the label-forwarded-click latch (see `usePopover`).
 */
const {
  isOpen,
  panelStyle,
  placement: resolvedPlacement,
  teleportTo,
  teleportDisabled,
  open: openPopover,
  close: closePopover,
  onTriggerPointerDown,
  onTriggerClick,
} = usePopover({
  trigger: triggerRef,
  anchor: panelAnchor,
  content: panelRef,
  canOpen: () => !props.disabled && !props.readonly,
  placement: props.placement,
  teleport: props.teleport,
  // Spec → Keyboard: "Tab moves from the search field (or the trigger) to the footer's Clear, then
  // Done, with the popover still open." A teleported panel is no longer after the trigger in the
  // DOM, so that walk has to be restored — but only where the control does not already put focus
  // in the panel itself: a searchable multi-select focuses its search field on open, and from
  // there the footer is the browser's own next stop.
  tabRedirect: () => !searchable.value,
  matchWidth: true,
  onOpen: () => {
    listbox.resetTypeahead();
    emit('open');
  },
  onClose: () => {
    listbox.resetTypeahead();
    resetBatch();
    if (query.value !== '') setQuery('');
    emit('close');
  },
  afterOpen: () => afterOpen(),
  openFromPointer: () => openPanel('start'),
});

// --- the keyboard ------------------------------------------------------------------------------

/**
 * The same composable `Select` uses, with the three differences the spec's Multi-select Keyboard
 * table lists, each expressed as a callback rather than as a second keyboard:
 *
 * - `select` **toggles** and does not close, so `Enter` (and `Space` when there is no search field)
 *   toggles with the popover still open.
 * - `close` — which `useListbox` calls only for `Tab` — deliberately does nothing: "Tab moves from
 *   the search field (or the trigger) to the footer's Clear, then Done, with the popover still
 *   open." Focus is still what closes it, through `useOverlay`: Tab past Done, or Shift+Tab out of
 *   the component, lands outside the trigger and the panel.
 * - `clear` empties the whole selection, which is what `Backspace`/`Delete` on a closed trigger do
 *   here, with no `clearable` to ask.
 *
 * `Alt+ArrowUp` ("toggle the active option **and close**") is the one key whose difference is not
 * expressible as a callback — `select` cannot tell which key called it — so `onKeydown` below
 * closes after the fact.
 */
const listbox = useListbox({
  options: () => listOptions.value,
  isOpen: () => isOpen.value,
  canOpen: () => !props.disabled && !props.readonly,
  searchable: () => searchable.value,
  optionId,
  open: (edge) => openPanel(edge),
  close: () => {},
  select: (option) => toggle(option as SelectOption),
  clear: () => clearAll(),
  startQuery: (character) => setQuery(character),
  escape: () => {
    if (!searchable.value || query.value === '') return false;
    setQuery('');
    return true;
  },
});
// Synchronous, so a keyboard move past the rendered batch has its row in the DOM before the panel
// scrolls it into view.
watch(listbox.activeValue, reveal, { flush: 'sync' });

function onKeydown(event: KeyboardEvent): void {
  const wasOpen = isOpen.value;
  // A `Backspace` at the start of an empty query takes the last tag off, the way every chip input
  // does. Guarded on the query being empty, so it never eats a character the user meant to delete.
  if (
    wasOpen &&
    searchable.value &&
    event.key === 'Backspace' &&
    query.value === '' &&
    hasSelection.value
  ) {
    event.preventDefault();
    const last = [...selectedOptions.value].reverse().find((option) => !option.disabled);
    if (last !== undefined) deselect(last.value);
    return;
  }
  // Inside, the closed trigger sits after the tags like a chip input's caret, so `Backspace` takes
  // the last one off rather than clearing everything (`Delete` still clears).
  if (
    !wasOpen &&
    inside.value &&
    event.key === 'Backspace' &&
    showTagRemove.value &&
    hasSelection.value
  ) {
    event.preventDefault();
    const last = [...selectedOptions.value].reverse().find((option) => !option.disabled);
    if (last !== undefined) deselect(last.value);
    return;
  }
  listbox.onKeydown(event);
  // Spec "Multi-select" → Keyboard: "`Alt+ArrowUp` | Toggle the active option and close."
  if (wasOpen && event.altKey && event.key === 'ArrowUp') closePanel();
}

function openPanel(edge: 'start' | 'end'): void {
  openPopover(() => {
    // The first selected option, or else the first enabled one — the same rule as `Select`, read
    // for a list of values.
    if (edge === 'end' && !searchable.value) listbox.last();
    else listbox.activateFrom(model.value[0]);
  });
}

async function afterOpen(): Promise<void> {
  await nextTick();
  if (searchable.value) {
    const element = searchRef.value;
    element?.focus();
    element?.setSelectionRange?.(element.value.length, element.value.length);
  }
}

/** Closing returns focus to the trigger, which is `usePopover`'s own default. */
function closePanel(): void {
  closePopover();
}

// --- choosing ------------------------------------------------------------------------------------

/** Whether a native `change` we dispatched ourselves is currently in flight. */
let dispatching = false;

/**
 * Puts the model onto the hidden `<select multiple>`, per option.
 *
 * It reads `props.options` as well as the value for the reason `Select`'s own sync does: a
 * `<select>` cannot hold a value none of its `<option>`s carries, so what can be written depends on
 * the list — and reading the list is what makes the effect below re-run when a list that arrives
 * after mount (fetched categories) or is replaced brings the real options with it.
 */
function writeNative(values: string[]): void {
  const element = nativeRef.value;
  const known = new Set(
    props.options.filter((option) => values.includes(option.value)).map((option) => option.value)
  );
  if (element === null) return;
  for (const option of element.options) {
    const next = known.has(option.value);
    if (option.selected !== next) option.selected = next;
  }
}

function syncNativeSelection(): void {
  writeNative(model.value);
}

/** Post-flush, so the new `<option>` elements exist by the time they are selected. */
watchPostEffect(syncNativeSelection);

function commit(values: string[]): void {
  model.value = values;
  // The *intended* selection, written before the event: a controlled parent's `modelValue` has not
  // come back round yet, so syncing from the model here would fire a `change` announcing the value
  // that was just replaced. The `nextTick` below is what puts a refused value back.
  writeNative(values);
  // Spec "Multi-select" → Events: "A bubbling native `change` also fires on the hidden
  // `<select multiple>`", so existing form listeners keep working.
  const element = nativeRef.value;
  if (element !== null) {
    dispatching = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    dispatching = false;
  }
  emit('change', values);
  // A controlled parent may refuse the value, in which case the model never changed and the effect
  // above will not fire — but the native select has already been written. Put it back.
  void nextTick(syncNativeSelection);
}

/** Spec "Multi-select" → Behaviour: "Toggling keeps the popover open, and the toggled row stays
 *  active." Changes apply immediately: "There is no pending state inside the popover." */
function toggle(option: SelectOption): void {
  if (option.value === CREATE_VALUE) {
    emit('create', option.label);
    setQuery('');
    return;
  }
  if (option.disabled === true || props.disabled || props.readonly) return;
  const values = model.value;
  const next = values.includes(option.value)
    ? values.filter((value) => value !== option.value)
    : [...values, option.value];
  commit(next);
  listbox.setActive(option.value);
}

/** Removing a tag "deselects that value, fires `change` and returns focus to the trigger". */
function deselect(value: string): void {
  if (props.disabled || props.readonly) return;
  if (props.options.find((option) => option.value === value)?.disabled) return;
  const next = model.value.filter((current) => current !== value);
  if (next.length === model.value.length) return;
  commit(next);
  if (next.length === 0) emit('clear');
}

/** A press on the inside field's own padding or gaps, not on a tag or button, opens like the trigger. */
function onFieldPointerDown(event: PointerEvent): void {
  if (!inside.value || props.disabled || props.readonly || event.button !== 0) return;
  const target = event.target as Element | null;
  if (target?.closest('button, a, input, [data-part="tag"]')) return;
  event.preventDefault();
  triggerRef.value?.focus();
  triggerRef.value?.click();
}

function onTagRemove(value: string): void {
  deselect(value);
  triggerRef.value?.focus();
}

function clearAll(): boolean {
  if (props.disabled || props.readonly || model.value.length === 0) return false;
  commit([]);
  emit('clear');
  return true;
}

/**
 * The trigger's clear button. Focus goes back to the trigger — except while the panel is open with a
 * search field, where focus belongs in that field: it is the element carrying
 * `aria-activedescendant` (the trigger drops it the moment the search field takes focus), so
 * pulling focus onto the trigger would leave the open listbox with no active-row announcement at
 * all. The same rule the footer's Clear follows.
 */
function onClearClick(): void {
  clearAll();
  if (isOpen.value && searchable.value) searchRef.value?.focus();
  else triggerRef.value?.focus();
}

/**
 * Spec "Multi-select" → Clear, Done and Apply: "The footer's Clear empties the selection and keeps
 * the popover open, with focus in the search field (or on the trigger when not searchable)."
 */
function onFooterClear(): void {
  clearAll();
  if (searchable.value) searchRef.value?.focus();
  else triggerRef.value?.focus();
}

/** "Done only closes the popover and returns focus to the trigger. It commits nothing." */
function onDone(): void {
  closePanel();
}

function onNativeChange(event: Event): void {
  if (dispatching) return;
  const element = event.target as HTMLSelectElement;
  const values = [...element.selectedOptions].map((option) => option.value);
  const current = model.value;
  if (
    values.length === current.length &&
    values.every((value, index) => value === current[index])
  ) {
    return;
  }
  model.value = values;
  emit('change', values);
}

// --- searching ---------------------------------------------------------------------------------

function setQuery(next: string): void {
  if (query.value === next) return;
  query.value = next;
  emit('search', next);
}

watch(query, () => {
  if (!isOpen.value) return;
  listbox.activateFrom(undefined);
});

// --- classes -----------------------------------------------------------------------------------

const showsInvalid = computed(() => isInvalid.value && !props.disabled);

const rootClass = computed(() => [
  'eldra:relative eldra:block eldra:w-full',
  showsInvalid.value && 'eldra:eldra-field-invalid',
]);

/**
 * The trigger box: the same box as `Select`'s, which is the same box as `Input`'s — including
 * `eldra-focus-open`, which keeps the ring on while the popover is open (see `Select.vue`'s own
 * comment for why a pointer-opened trigger needs it).
 */
const TRIGGER_BASE =
  'eldra:flex eldra:w-full eldra:min-w-0 eldra:items-center eldra:gap-2 eldra:text-start eldra:eldra-field-border ' +
  'eldra:rounded-[var(--eldra-field-radius,var(--eldra-radius-md))] eldra:eldra-focus eldra:eldra-focus-open';

const SIZE: Record<SelectSize, string> = {
  sm: 'eldra:control-h-sm eldra:ps-2.25 eldra:pe-2.5 eldra:text-control-sm',
  md: 'eldra:control-h eldra:ps-2.75 eldra:pe-2.5 eldra:text-control eldra:max-md:text-control-mobile',
  lg: 'eldra:control-h-lg eldra:ps-2.75 eldra:pe-2.5 eldra:text-control-lg',
};

/**
 * `cursor-pointer` (operator report, 2026-09-25; recorded under Deviations in the README) replaces
 * Tailwind v4 preflight's `button { cursor: default }`; read-only keeps `cursor-default` (it opens
 * no popover) and disabled keeps `cursor-not-allowed`. As in `Select`, the fill and the boundary
 * are picked apart: the error boundary over the open one over the rest one.
 */
const LIVE_FILL = 'eldra:bg-background eldra:text-text eldra:cursor-pointer';
const REST = 'eldra:border-border-strong eldra:hover:border-text';
const OPEN = 'eldra:border-text eldra:hover:border-text';
const INVALID = 'eldra:border-danger eldra:hover:border-danger';
const DISABLED =
  'eldra:bg-surface-strong eldra:border-border eldra:border-dashed eldra:text-muted eldra:cursor-not-allowed';
const READONLY_FILL = 'eldra:bg-surface eldra:text-text eldra:cursor-default';

function boxState(): string {
  if (props.disabled) return DISABLED;
  if (props.readonly)
    return `${READONLY_FILL} ${showsInvalid.value ? INVALID : 'eldra:border-border'}`;
  return `${LIVE_FILL} ${showsInvalid.value ? INVALID : isOpen.value ? OPEN : REST}`;
}

const triggerClass = computed(() => [
  TRIGGER_BASE,
  SIZE[props.size],
  boxState(),
  props.classes?.trigger,
]);

/**
 * `tagPlacement: 'inside'`: the field takes the trigger box's border, fill, states and ring (through
 * `eldra-focus-proxy`, and while open through the expanded trigger inside it), wraps the tags and
 * the trigger, and grows a row at a time. Its vertical padding centres a 1.75rem tag in each
 * control height; the end padding keeps every row clear of the chevron, and of Clear while it shows.
 */
const FIELD_SIZE: Record<SelectSize, string> = {
  sm: 'eldra:min-h-(--eldra-control-height-sm) eldra:py-px eldra:ps-0.75 eldra:text-control-sm',
  md: 'eldra:min-h-(--eldra-control-height) eldra:py-1.25 eldra:ps-1.25 eldra:text-control eldra:max-md:text-control-mobile',
  lg: 'eldra:min-h-(--eldra-control-height-lg) eldra:py-2.25 eldra:ps-2.25 eldra:text-control-lg',
};

const fieldClass = computed(() =>
  inside.value
    ? [
        'eldra:relative eldra:isolate eldra:flex eldra:w-full eldra:min-w-0 eldra:flex-wrap eldra:items-center eldra:gap-1.5 eldra:eldra-field-border',
        'eldra:rounded-[var(--eldra-field-radius,var(--eldra-radius-md))] eldra:eldra-focus eldra:eldra-focus-proxy',
        'eldra:has-[[aria-expanded=true]]:[--eldra-focus-alpha:1]',
        FIELD_SIZE[props.size],
        showClear.value ? 'eldra:pe-15' : 'eldra:pe-9',
        boxState(),
        props.classes?.field,
      ]
    : 'eldra:relative'
);

/** Inside, the trigger: under the tags across the field, or the placeholder's row with none. */
const insideTriggerClass = computed(() => [
  'eldra:flex eldra:items-center eldra:bg-transparent eldra:text-start eldra:outline-none',
  // With tags it shows nothing, so it leaves the flow and lies under them across the whole
  // field: it never needs a row (or the gap before one), and a press on any empty part of the
  // field lands on it. With none it is the row, holding the placeholder. The field draws the ring.
  hasSelection.value
    ? 'eldra:absolute eldra:inset-0 eldra:rounded-[inherit]'
    : 'eldra:min-h-7 eldra:min-w-8 eldra:flex-1 eldra:self-stretch eldra:ps-1.5',
  props.disabled
    ? 'eldra:cursor-not-allowed'
    : props.readonly
      ? 'eldra:cursor-default'
      : 'eldra:cursor-pointer',
  props.classes?.trigger,
]);

/** The inside field's chevron: out of the flow, at the end, centred however many rows there are. */
const insideChevronClass = computed(() => [
  'eldra:pointer-events-none eldra:absolute eldra:end-2.5 eldra:inset-y-0 eldra:my-auto eldra:size-4.5 eldra:text-muted',
  'eldra:transition-transform eldra:duration-base',
  isOpen.value && 'eldra:rotate-180',
  props.classes?.chevron,
]);

const leadingIconClass = computed(() => [
  'eldra:flex eldra:size-4.5 eldra:shrink-0 eldra:items-center eldra:justify-center eldra:text-muted',
  props.classes?.leadingIcon,
]);

/** The summary row: the labels, then the "+N" pill. 1.75rem of end padding while Clear shows. */
const summaryClass = computed(() => [
  'eldra:flex eldra:min-w-0 eldra:flex-1 eldra:items-center eldra:gap-2',
  TRIGGER_VALUE_CELL,
  fitsSummary.value && 'eldra:contain-inline-size',
  showClear.value && 'eldra:pe-7',
  props.classes?.summary,
]);

/** Spec "Multi-select" → Sizes: min width 1.5rem, 1.25rem tall, 0.3125rem side padding. */
const summaryMoreClass = computed(() => [
  'eldra:bg-surface-strong eldra:text-text eldra:inline-flex eldra:h-5 eldra:min-w-6 eldra:shrink-0 eldra:items-center eldra:justify-center ' +
    'eldra:rounded-full eldra:px-1.25 eldra:text-select-pill',
  props.classes?.summaryMore,
]);

const placeholderClass = computed(() => [
  'eldra:min-w-0 eldra:flex-1 eldra:truncate eldra:text-muted',
  showClear.value && 'eldra:pe-7',
  props.classes?.placeholder,
]);

const chevronClass = computed(() => [
  'eldra:size-4.5 eldra:shrink-0 eldra:text-muted eldra:transition-transform eldra:duration-base',
  isOpen.value && 'eldra:rotate-180',
  props.classes?.chevron,
]);

const clearButtonClass = computed(() => [
  'eldra:absolute eldra:end-8 eldra:inset-y-0 eldra:my-auto eldra:inline-flex eldra:size-6 eldra:cursor-pointer eldra:items-center eldra:justify-center',
  'eldra:rounded-sm eldra:text-muted eldra:hover:text-text',
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
  'eldra:eldra-focus',
  props.classes?.clearButton,
]);

/**
 * Spec "Multi-select" → Sizes, Footer: "padding 0.375rem (0.75rem at the start), 1px `border`
 * hairline above, `background`, 0.5rem gap. The count … pushes the buttons to the end. It stays put
 * while the list scrolls."
 */
const footerClass = computed(() => [
  'eldra:flex eldra:shrink-0 eldra:items-center eldra:gap-2 eldra:border-t eldra:p-1.5 eldra:ps-3',
  'eldra:border-[color:var(--eldra-select-panel-border,var(--eldra-color-border))]',
  'eldra:bg-[color:var(--eldra-select-panel-background,var(--eldra-color-background))]',
  props.classes?.footer,
]);

const footerCountClass = computed(() => [
  'eldra:text-caption eldra:me-auto eldra:tabular-nums eldra:text-[color:var(--eldra-select-panel-muted,var(--eldra-color-muted))]',
  props.classes?.footerCount,
]);

/** Spec: "Clear = Button link sm (0.5rem side padding), Done = Button primary sm." */
const footerClearClass = computed(() => ['eldra:px-2', props.classes?.footerClear]);
const footerDoneClass = computed(() => props.classes?.footerDone);

const emptyText = computed(() =>
  query.value.trim() === '' ? m.value.noResults : m.value.noMatchesFor(query.value.trim())
);
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="[rootClass, $attrs.class]"
  >
    <!-- The trigger and its clear button share a positioning context of their own: the root also
         holds the tag list, and a clear button positioned against *that* would drift down the
         control as tags wrap onto a second line. -->
    <div
      ref="fieldRef"
      :data-part="inside ? 'field' : undefined"
      :class="fieldClass"
      :data-eldra-overlay-owner="inside ? panelId : undefined"
      @pointerdown="onFieldPointerDown"
    >
      <span
        v-if="inside && (leadingIcon || $slots.leading)"
        :data-eldra-slot="eldra.slotHost('leading')"
        data-part="leadingIcon"
        :class="leadingIconClass"
      >
        <slot name="leading" :options="selectedOptions" :open="isOpen">
          <component
            v-if="leadingIcon"
            :is="leadingIcon"
            class="eldra:size-4.5 eldra:shrink-0"
            :stroke-width="ICON_STROKE_WIDTH"
            aria-hidden="true"
            focusable="false"
          />
        </slot>
      </span>
      <SelectTags
        v-if="inside && hasSelection"
        :id="tagsId"
        :options="shownTags"
        :label="m.selected"
        :labelled-by="labelledBy"
        :inside="inside"
        :classes="classes"
        :removable="showTagRemove"
        :remove-label="m.removeTag"
        :more="hiddenTagCount"
        :more-label="m.moreSelected(hiddenTagCount)"
        @remove="onTagRemove"
        @deselect="deselect"
      >
        <template v-if="$slots.tagItem" #tagItem="params">
          <slot name="tagItem" v-bind="params" />
        </template>
        <template v-if="$slots.tag" #tag="params">
          <slot name="tag" v-bind="params" />
        </template>
      </SelectTags>
      <button
        ref="triggerRef"
        v-bind="{ ...$attrs, class: undefined }"
        data-part="trigger"
        type="button"
        role="combobox"
        :id="controlId"
        :class="inside ? insideTriggerClass : triggerClass"
        aria-haspopup="listbox"
        :aria-expanded="isOpen ? 'true' : 'false'"
        :aria-controls="listboxId"
        :aria-activedescendant="isOpen && !searchable ? listbox.activeId.value : undefined"
        :aria-labelledby="labelledBy"
        :aria-describedby="describedBy"
        :aria-invalid="isInvalid ? 'true' : undefined"
        :aria-required="isRequired ? 'true' : undefined"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-readonly="readonly ? 'true' : undefined"
        :disabled="disabled || undefined"
        @pointerdown="onTriggerPointerDown"
        @click="onTriggerClick"
        @keydown="onKeydown"
      >
        <span
          v-if="!inside && (leadingIcon || $slots.leading)"
          :data-eldra-slot="eldra.slotHost('leading')"
          data-part="leadingIcon"
          :class="leadingIconClass"
        >
          <slot name="leading" :options="selectedOptions" :open="isOpen">
            <component
              v-if="leadingIcon"
              :is="leadingIcon"
              class="eldra:size-4.5 eldra:shrink-0"
              :stroke-width="ICON_STROKE_WIDTH"
              aria-hidden="true"
              focusable="false"
            />
          </slot>
        </span>

        <template v-if="inside">
          <span v-if="!hasSelection" data-part="placeholder" :class="placeholderClass">
            {{ placeholderText }}
          </span>
        </template>
        <span
          v-else-if="hasSelection"
          :class="TRIGGER_VALUE_STACK"
          :data-placeholder="placeholderText"
        >
          <span
            ref="summaryRef"
            :data-eldra-slot="eldra.slotHost('value')"
            data-part="summary"
            :class="summaryClass"
          >
            <slot name="value" :options="selectedOptions">
              <span v-if="summaryText" class="eldra:min-w-0 eldra:truncate">{{ summaryText }}</span>
              <span v-if="moreCount > 0" data-part="summaryMore" :class="summaryMoreClass">
                {{ m.moreSelected(moreCount) }}
              </span>
            </slot>
          </span>
          <!-- The copy useSummaryFit measures: every label on one line, and the widest pill. -->
          <span
            v-if="fitsSummary && summaryFit.mounted.value"
            aria-hidden="true"
            inert
            :class="SUMMARY_MEASURE"
          >
            <span ref="summaryRunRef" class="eldra:whitespace-nowrap"
              ><span v-for="(option, index) in selectedOptions" :key="option.value" data-label
                >{{ index ? ', ' : '' }}{{ option.label }}</span
              ></span
            >
            <span ref="summaryPillRef" :class="summaryMoreClass">
              {{ m.moreSelected(selectedOptions.length) }}
            </span>
          </span>
        </span>
        <span v-else data-part="placeholder" :class="placeholderClass">{{ placeholderText }}</span>

        <!-- Spec "Select" → States, Read-only: "no chevron". -->
        <span
          v-if="!readonly && !inside"
          data-part="chevron"
          :class="chevronClass"
          aria-hidden="true"
        >
          <!-- Tabler's `chevron-down`, stroke 1.75. -->
          <svg
            class="eldra:size-4.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            focusable="false"
          >
            <path d="M6 9l6 6l6 -6" />
          </svg>
        </span>
      </button>
      <span
        v-if="!readonly && inside"
        data-part="chevron"
        :class="insideChevronClass"
        aria-hidden="true"
      >
        <!-- Tabler's `chevron-down`, stroke 1.75. -->
        <svg
          class="eldra:size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          focusable="false"
        >
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </span>

      <!-- `data-eldra-overlay-owner` makes `useOverlay` count this button as part of the overlay,
           so reaching it never closes the popover — the spec's own Tab table says the popover stays
           open all the way to the footer's buttons. `usePopover`'s `tabRedirect` reads the same
           attribute to find the control's last tab stop now that the panel is teleported out of
           DOM order: `Tab` walks trigger → this button on the browser's own order, and it is from
           *here* that focus is sent into the panel (and back here on `Shift+Tab`). -->
      <button
        v-if="showClear"
        :id="clearId"
        data-part="clearButton"
        type="button"
        :class="clearButtonClass"
        :aria-label="m.clear"
        :aria-labelledby="labelledBy ? `${clearId} ${labelledBy}` : undefined"
        :data-eldra-overlay-owner="panelId"
        @click="onClearClick"
      >
        <!-- Tabler's `x` at 1rem. Decorative: the button is named by its label. -->
        <svg
          class="eldra:size-4"
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
    </div>

    <!-- Teleported to `body`, or to the open `<dialog>` this control sits in — see `usePopover`'s
         `teleport` option, and `Select.vue` for why the `v-if` is on the `<Teleport>` itself. The
         footer goes with it: it is the panel's own slot, not a sibling. -->
    <Teleport v-if="isOpen" :to="teleportTo" :disabled="teleportDisabled">
      <SelectPanel
        ref="panelComponent"
        multiple
        :panel-id="panelId"
        :listbox-id="listboxId"
        :sections="sections"
        :has-options="hasOptions"
        :highlights="highlights"
        :option-id="optionId"
        :active-value="listbox.activeValue.value"
        :selected-values="model"
        :searchable="searchable"
        :query="query"
        :search-placeholder="searchPlaceholderText"
        :empty-text="emptyText"
        :loading="loading"
        :loading-text="m.loading"
        :create-option="createOption"
        :create-text="createOption ? m.createOption(createOption.label) : undefined"
        :labelled-by="labelledBy"
        :fallback-label="fallbackLabel"
        :panel-style="panelStyle"
        :placement="resolvedPlacement"
        :classes="classes"
        @search="setQuery"
        @select="toggle"
        @activate="listbox.setActive"
        @scroll-end="renderMore"
        @keydown="onKeydown"
      >
        <template v-if="$slots.option" #option="params">
          <slot name="option" v-bind="params" />
        </template>
        <template v-if="$slots.optionContent" #optionContent="params">
          <slot name="optionContent" v-bind="params" />
        </template>
        <template v-if="$slots.empty" #empty><slot name="empty" /></template>
        <template v-if="$slots.loading" #loading><slot name="loading" /></template>

        <template #footer>
          <div :data-eldra-scope="eldra.scope" data-part="footer" :class="footerClass">
            <!-- Spec → Accessibility: the count is "an `aria-live="polite"` region, so every toggle
                 is confirmed without moving focus". -->
            <span data-part="footerCount" :class="footerCountClass" aria-live="polite">
              {{ countText }}
            </span>
            <Button
              variant="link"
              size="sm"
              type="button"
              data-part="footerClear"
              :class="footerClearClass"
              @click="onFooterClear"
            >
              {{ m.clear }}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              data-part="footerDone"
              :class="footerDoneClass"
              @click="onDone"
            >
              {{ m.done }}
            </Button>
          </div>
        </template>
      </SelectPanel>
    </Teleport>

    <SelectTags
      v-if="!inside && showTags && hasSelection"
      :id="tagsId"
      :options="selectedOptions"
      :label="m.selected"
      :labelled-by="labelledBy"
      :inside="inside"
      :classes="classes"
      :removable="showTagRemove"
      :remove-label="m.removeTag"
      :more="0"
      more-label=""
      @remove="onTagRemove"
      @deselect="deselect"
    >
      <template v-if="$slots.tagItem" #tagItem="params">
        <slot name="tagItem" v-bind="params" />
      </template>
      <template v-if="$slots.tag" #tag="params">
        <slot name="tag" v-bind="params" />
      </template>
    </SelectTags>

    <!-- Spec "Multi-select": "built from a native `<select multiple>` that stays hidden underneath,
         in sync, so forms post every selected value". -->
    <select
      ref="nativeRef"
      data-part="native"
      hidden
      aria-hidden="true"
      tabindex="-1"
      multiple
      :name="name"
      :required="isRequired || undefined"
      :disabled="disabled || undefined"
      @change="onNativeChange"
    >
      <template v-for="section in nativeSections" :key="section.key">
        <optgroup v-if="section.label" :label="section.label">
          <option
            v-for="option in section.options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
          >
            {{ option.label }}
          </option>
        </optgroup>
        <template v-else>
          <option
            v-for="option in section.options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
          >
            {{ option.label }}
          </option>
        </template>
      </template>
    </select>
  </div>
</template>
