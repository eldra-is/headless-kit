<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  useAttrs,
  watch,
  watchPostEffect,
} from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useFloating } from '../../composables/useFloating';
import { useMessages } from '../../composables/useMessages';
import { useOverlay } from '../../composables/useOverlay';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import Icon from '../icon/Icon.vue';
import { registerOpen, unregisterOpen } from './openRegistry';
import type { SelectOption, SelectProps, SelectSize } from './types';
import { normalizeText, useListbox } from './useListbox';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SelectProps>(), {
  modelValue: undefined,
  name: undefined,
  id: undefined,
  size: 'md',
  // Undefined, not false: `searchable` falls back to the spec's "more than 10 options" rule, and
  // the next four fall back to the field wrapper's context, where `false` would be an answer
  // rather than "no opinion".
  searchable: undefined,
  searchPlaceholder: undefined,
  clearable: false,
  placeholder: undefined,
  leadingIcon: undefined,
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  disabled: false,
  readonly: false,
  placement: 'auto',
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Spec "Select" → Events: "fires with the new value when an option is chosen or cleared". */
  change: [value: string];
  /** Spec "Select" → Events: "fires when the clear button, `Backspace` or `Delete` empties it". */
  clear: [];
  open: [];
  close: [];
  /** The search query, on every keystroke in the panel's search field. */
  search: [query: string];
}>();

const m = useMessages(() => props.messages);

/**
 * The field wrapper's context, exactly as `Input` reads it. `id` is taken from it only when the
 * wrapper labels its control with a `<label for>` — a `group` wrapper puts that id on its own
 * `<fieldset>`.
 */
const field = inject(FIELD_KEY, null);
const controlId = useUiId(
  'select',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
/**
 * Spec "Select" → Accessibility: "`aria-labelledby` = the visible label's id (fallback: an
 * `aria-label`)". A `<label for>` cannot name a `<button>`, which is why the wrapper renders an
 * `id`-suffixed label element in the first place.
 */
const labelledBy = computed(() =>
  field?.value.labelsControl === true ? `${field.value.id}-label` : undefined
);
/**
 * Spec "Select" → Accessibility: the popup is "labelled by the field label (`aria-labelledby`)".
 * Outside a field wrapper the label is whatever `aria-label` the consumer put on the control, and
 * an unnamed `role="listbox"` is an actual violation (axe's `aria-input-field-name`), so the popup
 * borrows it rather than going without a name.
 */
const attrs = useAttrs();
const fallbackLabel = computed(() =>
  labelledBy.value === undefined && typeof attrs['aria-label'] === 'string'
    ? attrs['aria-label']
    : undefined
);

const describedBy = computed(() => props.describedBy ?? field?.value.describedBy);
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);

const panelId = computed(() => `${controlId.value}-panel`);
const listboxId = computed(() => `${controlId.value}-listbox`);
const clearId = computed(() => `${controlId.value}-clear`);

/**
 * An option's element id is built from its *position*, not its value: a value is merchant data and
 * may hold spaces, quotes or a `#`, none of which belong in an id that `aria-activedescendant` and
 * `getElementById` have to round-trip.
 */
const indexOfValue = computed(
  () => new Map(props.options.map((option, index) => [option.value, index]))
);
const optionId = (value: string): string =>
  `${controlId.value}-o${indexOfValue.value.get(value) ?? 0}`;

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string>(props, emit, () => '');

/** Spec "Select" → Properties: "`true` when there are more than 10 options, else `false`". */
const searchable = computed(() => props.searchable ?? props.options.length > 10);
const placeholderText = computed(() => props.placeholder ?? m.value.selectPlaceholder);
const searchPlaceholderText = computed(() => props.searchPlaceholder ?? m.value.search);

const selectedOption = computed(() => props.options.find((option) => option.value === model.value));
/** Spec "Select" → Variants, Clearable: "The clear button shows when there is a value." */
const showClear = computed(
  () => props.clearable && !props.disabled && !props.readonly && model.value !== ''
);

const isOpen = ref(false);
const query = ref('');
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const nativeRef = ref<HTMLSelectElement | null>(null);

// --- filtering ---------------------------------------------------------------------------------

/**
 * Where a query matches inside a label, in **code points of the original string**.
 *
 * Matching is case- and diacritic-insensitive (the spec's "'island' finds 'Ísland'"), so the
 * comparison happens on a normalised copy — and the match has to be reported back in the original
 * string's own offsets, or the bold-and-underlined run would land on the wrong characters for any
 * label holding an accent. Hence the per-character walk: each original code point contributes zero
 * (a combining mark) or more normalised characters, and `positions` maps back.
 */
function matchRange(label: string, rawQuery: string): { start: number; end: number } | null {
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

/** The label split into the run before the match, the match itself, and the run after it. */
interface MatchParts {
  before: string;
  match: string;
  after: string;
}

function matchParts(label: string): MatchParts | null {
  if (!searchable.value) return null;
  const range = matchRange(label, query.value.trim());
  if (range === null) return null;
  const characters = [...label];
  return {
    before: characters.slice(0, range.start).join(''),
    match: characters.slice(range.start, range.end).join(''),
    after: characters.slice(range.end).join(''),
  };
}

const visibleOptions = computed(() => {
  const trimmed = query.value.trim();
  if (!searchable.value || trimmed === '') return props.options;
  return props.options.filter((option) => matchRange(option.label, trimmed) !== null);
});

interface Section {
  key: string;
  label?: string;
  labelId?: string;
  options: SelectOption[];
}

/**
 * Options bucketed by `group`, in the order each group first appears — so a "Most used" group
 * written first stays first, which is exactly the spec's advice ("Put the 3 to 5 most likely
 * answers first"). Options with no `group` form an unlabelled section of their own.
 */
function groupOptions(list: SelectOption[], idPrefix: string): Section[] {
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
    labelId: key === '' ? undefined : `${controlId.value}-g${index}`,
    options: buckets.get(key) ?? [],
  }));
}

const sections = computed(() => groupOptions(visibleOptions.value, 'panel'));
const nativeSections = computed(() => groupOptions(props.options, 'native'));
/** The rows in DOM order — which is the section order, not the prop order, once groups interleave. */
const listOptions = computed(() => sections.value.flatMap((section) => section.options));

/**
 * A `role="listbox"` may own only `option` and `group` children, so the "No matches" text is a
 * sibling of the listbox rather than a child of it — a `role="presentation"` div inside would be
 * an `aria-required-children` violation, while a genuinely empty listbox is merely "needs review".
 * The listbox itself always renders, empty or not: a `role="combobox"` with `aria-expanded="true"`
 * is *required* to carry `aria-controls`, so it must always have something real to point at.
 */
const hasOptions = computed(() => listOptions.value.length > 0);

/**
 * Spec "Select" → Variants, Searchable: "The matched part is bold with a 2px underline." Computed
 * once per query rather than per render of each row: the walk is O(label) and the template would
 * otherwise run it three times for every visible option on every keystroke.
 */
const highlights = computed(
  () => new Map(listOptions.value.map((option) => [option.value, matchParts(option.label)]))
);

// --- the keyboard ------------------------------------------------------------------------------

const listbox = useListbox({
  options: () => listOptions.value,
  isOpen: () => isOpen.value,
  searchable: () => searchable.value,
  optionId,
  open: (edge) => openPanel(edge),
  close: () => closePanel(),
  select: (option) => choose(option as SelectOption),
  clear: () => clearValue(),
  startQuery: (character) => setQuery(character),
  escape: () => {
    if (!searchable.value || query.value === '') return false;
    setQuery('');
    return true;
  },
});

const isActive = (option: SelectOption): boolean => listbox.activeValue.value === option.value;
const isSelected = (option: SelectOption): boolean => model.value === option.value;

// --- opening and closing -------------------------------------------------------------------------

/** The registry's handle on this select. Stable, so the registry can tell ours from another's. */
const closeFromRegistry = (): void => setOpen(false);

function setOpen(next: boolean): void {
  if (next === isOpen.value) return;
  if (next) {
    if (props.disabled || props.readonly) return;
    isOpen.value = true;
    listbox.resetTypeahead();
    // Spec "Select" → Behaviour: "opening a select closes any other open select or multi-select".
    registerOpen(closeFromRegistry);
    emit('open');
    return;
  }
  isOpen.value = false;
  unregisterOpen(closeFromRegistry);
  listbox.resetTypeahead();
  // Spec "Select" → Behaviour, Search: "opening clears any old query and shows every option."
  // Cleared on the way *out* rather than on the way in, so the reset never races the active option
  // the next open picks.
  if (query.value !== '') setQuery('');
  emit('close');
}

useOverlay({
  open: isOpen,
  trigger: triggerRef,
  content: panelRef,
  setOpen: (next) => setOpen(next),
});

const { styles: floatingStyles, placement: resolvedPlacement } = useFloating(
  triggerRef,
  panelRef,
  // Read once, like every `useFloating` option: a select that has to change its placement at
  // runtime re-keys instead. `placement` is a layout decision ("the footer's selectors use
  // `above`"), not state.
  { placement: props.placement, matchWidth: true }
);

function openPanel(edge: 'start' | 'end'): void {
  if (props.disabled || props.readonly) return;
  const wasOpen = isOpen.value;
  setOpen(true);
  if (!isOpen.value) return;
  // Spec "Select" → Behaviour: "the selected option, or else the first enabled one" — except for
  // `ArrowUp` on a closed, non-searchable trigger, which the Keyboard table lands on the last.
  if (edge === 'end' && !searchable.value) listbox.last();
  else listbox.activateFrom(model.value);
  if (!wasOpen) void afterOpen();
}

async function afterOpen(): Promise<void> {
  await nextTick();
  // Spec "Select" → Accessibility: "Searchable: opening moves focus into the search input."
  // Non-searchable: "focus stays on the trigger while open", so nothing moves.
  if (searchable.value) {
    const element = searchRef.value;
    element?.focus();
    element?.setSelectionRange?.(element.value.length, element.value.length);
  }
  scrollActiveIntoView();
}

function closePanel(returnFocus = true): void {
  if (!isOpen.value) return;
  setOpen(false);
  // Spec "Select" → Behaviour: selecting and `Escape` both "return focus to the trigger", and
  // `Tab` needs focus on the trigger *before* the browser's own default action moves it on.
  if (returnFocus) triggerRef.value?.focus();
}

onBeforeUnmount(() => unregisterOpen(closeFromRegistry));

// --- choosing ------------------------------------------------------------------------------------

/** Whether a native `change` we dispatched ourselves is currently in flight. */
let dispatching = false;

/**
 * Spec "Select" → Progressive enhancement: the hidden native `<select>` is "kept in sync with every
 * change (it fires a bubbling `change` event). So forms post the value and existing listeners keep
 * working."
 */
function syncNative(value: string, fire: boolean): void {
  const element = nativeRef.value;
  if (element === null) return;
  element.value = value;
  if (!fire) return;
  dispatching = true;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  dispatching = false;
}

/** Keeps the native select on the model whoever changed it — a parent's `v-model` included. */
watchPostEffect(() => {
  const element = nativeRef.value;
  const value = model.value;
  if (element !== null && element.value !== value) element.value = value;
});

function commit(value: string): void {
  model.value = value;
  syncNative(value, true);
  emit('change', value);
}

function choose(option: SelectOption): void {
  if (option.disabled === true) return;
  commit(option.value);
  closePanel();
}

function clearValue(): boolean {
  if (!props.clearable || props.disabled || props.readonly || model.value === '') return false;
  commit('');
  emit('clear');
  return true;
}

function onClearClick(): void {
  clearValue();
  triggerRef.value?.focus();
}

function onNativeChange(event: Event): void {
  if (dispatching) return;
  const element = event.target as HTMLSelectElement;
  if (element.value === model.value) return;
  model.value = element.value;
  emit('change', element.value);
}

// --- pointer ---------------------------------------------------------------------------------

/**
 * Whether the click that is about to arrive came from a pointer press on the trigger itself.
 *
 * A `<label for>` naming the trigger forwards its own click to it, and the spec is explicit that
 * "clicking the Field wrapper's label focuses the trigger (**it doesn't open it**)". A forwarded
 * click is indistinguishable from a real one except that no pointer was pressed on the trigger and
 * its `detail` is 0 — the same shape as a programmatic `element.click()`, which therefore focuses
 * rather than opens. Keyboard activation never reaches here at all: `useListbox` `preventDefault()`s
 * `Enter` and `Space`, so the button's synthetic click is never dispatched.
 */
let pressedTrigger = false;

function onTriggerPointerDown(): void {
  pressedTrigger = true;
}

function onTriggerClick(event: MouseEvent): void {
  const fromPointer = pressedTrigger || event.detail > 0;
  pressedTrigger = false;
  if (props.disabled || props.readonly) return;
  if (!fromPointer) {
    triggerRef.value?.focus();
    return;
  }
  if (isOpen.value) closePanel();
  else openPanel('start');
}

/**
 * Spec "Select" → Behaviour: "Pointer presses inside the list don't blur the focused element."
 * `mousedown`'s default action is what moves focus, so preventing it keeps focus on the trigger
 * (or in the search field) while the click still lands on the option.
 */
function onListboxMouseDown(event: MouseEvent): void {
  event.preventDefault();
}

// --- searching ---------------------------------------------------------------------------------

function setQuery(next: string): void {
  if (query.value === next) return;
  query.value = next;
  emit('search', next);
}

function onSearchInput(event: Event): void {
  setQuery((event.target as HTMLInputElement).value);
}

// Spec "Select" → Behaviour, Search: "The first visible enabled option becomes active after each
// change."
watch(query, () => {
  if (!isOpen.value) return;
  listbox.activateFrom(undefined);
});

function scrollActiveIntoView(): void {
  const id = listbox.activeId.value;
  if (id === undefined || typeof document === 'undefined') return;
  // Spec "Select" → Behaviour: "The active option is scrolled into view with a 0.25rem margin
  // whenever it changes" — the margin is the row's own `scroll-my-1`.
  document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' });
}

watch(
  () => listbox.activeValue.value,
  () => {
    if (isOpen.value) void nextTick(scrollActiveIntoView);
  }
);

// --- classes -----------------------------------------------------------------------------------

/**
 * Spec "Select" → States, Error row: "2px `danger` (1px border + 1px inset line)". The same shape
 * as `Input`: the 1px border stays on the trigger in every state so the value never moves, and the
 * second line is the root's `eldra-field-invalid` pseudo-element. A disabled field drops it — it
 * cannot be corrected here — while a read-only one keeps it.
 */
const showsInvalid = computed(() => isInvalid.value && !props.disabled);

const rootClass = computed(() =>
  partClass(
    cx('relative block w-full', showsInvalid.value && 'eldra-field-invalid'),
    props.classes,
    'root'
  )
);

/**
 * The trigger box (spec "Select" → Sizes): the same box as `Input`, "so selects and text fields
 * line up in a row". `eldra-focus` without `-always`: a trigger is a button, and the focus-ring
 * foundation's pointer-focus exception is for *text fields*, "because a caret alone is easy to
 * miss". No `transition-*` utility here — `eldra-focus` owns this element's transition list,
 * including the `duration-fast` border-colour change (see `src/styles/tailwind.css`).
 */
const TRIGGER_BASE =
  'flex w-full min-w-0 items-center gap-2 text-start eldra-field-border ' +
  'rounded-[var(--eldra-field-radius,var(--eldra-radius-md))] eldra-focus';

const SIZE: Record<SelectSize, string> = {
  sm: 'control-h-sm ps-2.25 pe-2.5 text-control-sm',
  md: 'control-h ps-2.75 pe-2.5 text-control max-md:text-control-mobile',
  lg: 'control-h-lg ps-2.75 pe-2.5 text-control-lg',
};

/** Spec "Select" → States. Open and hover share the `text` boundary; disabled/read-only replace it. */
const LIVE = 'bg-background border-border-strong hover:border-text text-text cursor-default';
const OPEN = 'border-text';
const INVALID = 'border-danger hover:border-danger';
const DISABLED = 'bg-surface-strong border-border border-dashed text-muted cursor-not-allowed';
const READONLY = 'bg-surface border-border text-text cursor-default';

const triggerClass = computed(() =>
  partClass(
    cx(
      TRIGGER_BASE,
      SIZE[props.size],
      props.disabled ? DISABLED : props.readonly ? READONLY : LIVE,
      !props.disabled && !props.readonly && isOpen.value && OPEN,
      showsInvalid.value && INVALID
    ),
    props.classes,
    'trigger'
  )
);

const leadingIconClass = computed(() =>
  partClass(
    'flex size-4.5 shrink-0 items-center justify-center text-muted',
    props.classes,
    'leadingIcon'
  )
);

/** The chosen option's mark and label. 1.75rem of extra end padding while the clear button shows. */
const valueClass = computed(() =>
  partClass(
    cx('flex min-w-0 flex-1 items-center gap-2', showClear.value && 'pe-7'),
    props.classes,
    'value'
  )
);

const placeholderClass = computed(() =>
  partClass(
    cx('min-w-0 flex-1 truncate text-muted', showClear.value && 'pe-7'),
    props.classes,
    'placeholder'
  )
);

/** Spec "Select" → States, Open: "chevron turned 180°", over `duration-base`. */
const chevronClass = computed(() =>
  partClass(
    cx(
      'size-4.5 shrink-0 text-muted transition-transform duration-base',
      isOpen.value && 'rotate-180'
    ),
    props.classes,
    'chevron'
  )
);

/**
 * Spec "Select" → Anatomy, item 4: the clear button "is a separate `<button>` beside the chevron.
 * **It is not inside the trigger.**" Which is also the only way it can exist — a `<button>` may not
 * contain a `<button>` — so it is a sibling positioned over the trigger, after it in the DOM and
 * therefore after it in the tab order, exactly as `Input`'s clear button is.
 */
const clearButtonClass = computed(() =>
  partClass(
    cx(
      'absolute end-8 inset-y-0 my-auto inline-flex size-6 items-center justify-center',
      'rounded-sm text-muted hover:text-text',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'eldra-focus'
    ),
    props.classes,
    'clearButton'
  )
);

/**
 * The popover (spec "Select" → Sizes, Popover row). Not a dialog and never teleported: it is a
 * non-modal popup (non-negotiable 2), positioned by `useFloating` against the trigger and kept
 * inside the component's own root so a consumer's `classes` and `data-part` selectors still reach
 * it. `z-popover` puts it over the sticky header, `overflow-hidden` keeps the search field's top
 * corners on the popover's radius, and the list — not the panel — is what scrolls.
 */
const panelClass = computed(() =>
  partClass(
    cx(
      'absolute z-popover flex flex-col overflow-hidden',
      'eldra-select-panel-height eldra-select-panel-width',
      'rounded-md border border-border bg-background shadow-md',
      resolvedPlacement.value.startsWith('top')
        ? 'animate-eldra-popover-in-above'
        : 'animate-eldra-popover-in'
    ),
    props.classes,
    'panel'
  )
);

/** Spec "Select" → Sizes, Search field: 2.5rem tall, text from 2.125rem, inset focus ring. */
const searchClass = computed(() =>
  partClass(
    cx(
      'control-h w-full min-w-0 rounded-t-md bg-transparent ps-8.5 pe-3',
      'text-control-sm max-md:text-control-mobile text-text placeholder:text-muted',
      'eldra-focus-inset eldra-focus-inset-always'
    ),
    props.classes,
    'search'
  )
);

const listboxClass = computed(() =>
  partClass(
    cx(
      'overflow-y-auto overscroll-contain',
      // An empty listbox still renders (see `hasOptions`), so it takes no room of its own.
      hasOptions.value ? 'min-h-0 flex-1 p-1' : 'h-0'
    ),
    props.classes,
    'listbox'
  )
);

/** Spec: "Every group after the first gets a 1px `border` hairline and 0.25rem gap above it." */
const groupClass = (index: number): string =>
  partClass(cx(index > 0 && 'mt-1 border-t border-border'), props.classes, 'group');

const groupLabelClass = (index: number): string =>
  partClass(
    cx('text-select-group text-muted px-2 pb-1', index > 0 ? 'pt-2.5' : 'pt-2'),
    props.classes,
    'groupLabel'
  );

/** Spec "Select" → Sizes, Option row, and → States for active / selected / disabled. */
const optionClass = (option: SelectOption): string =>
  partClass(
    cx(
      'flex min-h-9 scroll-my-1 items-center gap-2 rounded-sm px-2 py-1.5 text-select-option',
      isActive(option) && 'bg-surface-strong',
      isSelected(option) && 'font-semibold',
      option.disabled === true ? 'text-muted cursor-not-allowed' : 'text-text cursor-pointer'
    ),
    props.classes,
    'option'
  );

const optionLabelClass = (option: SelectOption): string =>
  partClass(cx('block', option.disabled === true && 'line-through'), props.classes, 'optionLabel');

const optionHintClass = computed(() =>
  partClass('text-caption text-muted block', props.classes, 'optionHint')
);

const META_TONE = {
  warning: 'text-warning font-semibold',
  danger: 'text-danger font-semibold',
} as const;

const optionMetaClass = (option: SelectOption): string =>
  partClass(
    cx(
      'ms-3 shrink-0 text-caption tabular-nums',
      option.metaTone === undefined ? 'text-muted' : META_TONE[option.metaTone]
    ),
    props.classes,
    'optionMeta'
  );

const optionSwatchClass = computed(() =>
  partClass('size-4 shrink-0 rounded-full eldra-select-swatch', props.classes, 'optionSwatch')
);

const optionIconClass = computed(() => partClass('size-4.5 shrink-0', props.classes, 'optionIcon'));

const optionCheckClass = computed(() =>
  partClass('size-4.5 shrink-0 text-text', props.classes, 'optionCheck')
);

const emptyClass = computed(() =>
  partClass('px-3 py-4 text-center text-body-sm text-muted', props.classes, 'empty')
);

/** Spec "Select" → Behaviour, Search: 'the empty state "No matches for “<query>”" shows as text'. */
const emptyText = computed(() =>
  query.value.trim() === '' ? m.value.noResults : m.value.noMatchesFor(query.value.trim())
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <button
      ref="triggerRef"
      v-bind="$attrs"
      data-part="trigger"
      type="button"
      role="combobox"
      :id="controlId"
      :class="triggerClass"
      aria-haspopup="listbox"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-controls="isOpen ? listboxId : undefined"
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
      @keydown="listbox.onKeydown"
    >
      <span v-if="leadingIcon" data-part="leadingIcon" :class="leadingIconClass">
        <Icon :icon="leadingIcon" :classes="{ root: 'size-4.5' }" />
      </span>

      <span v-if="selectedOption" data-part="value" :class="valueClass">
        <slot name="value" :option="selectedOption">
          <span
            v-if="selectedOption.swatch"
            data-part="optionSwatch"
            :class="optionSwatchClass"
            :style="{ backgroundColor: selectedOption.swatch }"
            aria-hidden="true"
          />
          <Icon
            v-else-if="selectedOption.icon"
            data-part="optionIcon"
            :icon="selectedOption.icon"
            :classes="{ root: optionIconClass }"
          />
          <span class="min-w-0 flex-1 truncate">{{ selectedOption.label }}</span>
        </slot>
      </span>
      <span v-else data-part="placeholder" :class="placeholderClass">{{ placeholderText }}</span>

      <!-- Spec "Select" → States, Read-only: "no chevron". -->
      <span v-if="!readonly" data-part="chevron" :class="chevronClass" aria-hidden="true">
        <!-- Tabler's `chevron-down`, stroke 1.75. -->
        <svg
          class="size-4.5"
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

    <button
      v-if="showClear"
      :id="clearId"
      data-part="clearButton"
      type="button"
      :class="clearButtonClass"
      :aria-label="m.clear"
      :aria-labelledby="labelledBy ? `${clearId} ${labelledBy}` : undefined"
      @click="onClearClick"
    >
      <!-- Tabler's `x` at 1rem. Decorative: the button is named by its label. -->
      <svg
        class="size-4"
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

    <div
      v-if="isOpen"
      ref="panelRef"
      :id="panelId"
      data-part="panel"
      :class="panelClass"
      :style="floatingStyles"
      :data-placement="resolvedPlacement"
    >
      <div v-if="searchable" class="border-border relative shrink-0 border-b">
        <!-- Tabler's `search` at 1rem, 0.625rem from the start edge. -->
        <svg
          class="text-muted pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4"
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
        <input
          ref="searchRef"
          data-part="search"
          type="text"
          role="combobox"
          :class="searchClass"
          :value="query"
          :placeholder="searchPlaceholderText"
          :aria-label="searchPlaceholderText"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="listboxId"
          :aria-activedescendant="listbox.activeId.value"
          autocomplete="off"
          spellcheck="false"
          @input="onSearchInput"
          @keydown="listbox.onKeydown"
        />
      </div>

      <div
        :id="listboxId"
        data-part="listbox"
        role="listbox"
        :class="listboxClass"
        :aria-labelledby="labelledBy"
        :aria-label="fallbackLabel"
        @mousedown="onListboxMouseDown"
      >
        <div
          v-for="(section, sectionIndex) in sections"
          :key="section.key"
          :data-part="section.label ? 'group' : undefined"
          :role="section.label ? 'group' : 'presentation'"
          :class="section.label ? groupClass(sectionIndex) : undefined"
          :aria-labelledby="section.labelId"
        >
          <div
            v-if="section.label"
            :id="section.labelId"
            data-part="groupLabel"
            role="presentation"
            :class="groupLabelClass(sectionIndex)"
          >
            {{ section.label }}
          </div>

          <div
            v-for="option in section.options"
            :key="option.value"
            :id="optionId(option.value)"
            data-part="option"
            role="option"
            :class="optionClass(option)"
            :aria-selected="isSelected(option) ? 'true' : 'false'"
            :aria-disabled="option.disabled ? 'true' : undefined"
            @click="choose(option)"
            @mouseenter="option.disabled ? undefined : listbox.setActive(option.value)"
          >
            <slot
              name="option"
              :option="option"
              :selected="isSelected(option)"
              :active="isActive(option)"
            >
              <span
                v-if="option.swatch"
                data-part="optionSwatch"
                :class="optionSwatchClass"
                :style="{ backgroundColor: option.swatch }"
                aria-hidden="true"
              />
              <Icon
                v-else-if="option.icon"
                data-part="optionIcon"
                :icon="option.icon"
                :classes="{ root: optionIconClass }"
              />

              <span class="min-w-0 flex-1">
                <span data-part="optionLabel" :class="optionLabelClass(option)">
                  <template v-if="highlights.get(option.value)"
                    >{{ highlights.get(option.value)?.before
                    }}<span class="eldra-select-match">{{
                      highlights.get(option.value)?.match
                    }}</span
                    >{{ highlights.get(option.value)?.after }}</template
                  >
                  <template v-else>{{ option.label }}</template>
                </span>
                <span v-if="option.hint" data-part="optionHint" :class="optionHintClass">
                  {{ option.hint }}
                </span>
              </span>

              <span v-if="option.meta" data-part="optionMeta" :class="optionMetaClass(option)">
                {{ option.meta }}
              </span>

              <!-- Spec "Select" → States, Option selected: "check mark in `text` (never colour
                   alone)". Decorative: `aria-selected` is what announces it. -->
              <svg
                v-if="isSelected(option)"
                data-part="optionCheck"
                :class="optionCheckClass"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M5 12l5 5l10 -10" />
              </svg>
            </slot>
          </div>
        </div>
      </div>

      <div v-if="!hasOptions" data-part="empty" :class="emptyClass">
        <slot name="empty">{{ emptyText }}</slot>
      </div>
    </div>

    <!-- Spec "Select" → Progressive enhancement: the real `<select>` stays in the form, hidden and
         in sync, so forms post the value and existing `change` listeners keep working. -->
    <select
      ref="nativeRef"
      data-part="native"
      hidden
      aria-hidden="true"
      tabindex="-1"
      :name="name"
      :required="isRequired || undefined"
      :disabled="disabled || undefined"
      @change="onNativeChange"
    >
      <option value="">{{ placeholderText }}</option>
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
