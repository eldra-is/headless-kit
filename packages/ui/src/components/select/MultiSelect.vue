<script setup lang="ts">
import { computed, inject, nextTick, ref, useAttrs, watch, watchPostEffect } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { joinIds, useUiId } from '../../utils/id';
import Button from '../button/Button.vue';
import { FIELD_KEY } from '../field-wrapper/context';
import Icon from '../icon/Icon.vue';
import SelectPanel from './SelectPanel.vue';
import type { MultiSelectPart, MultiSelectProps, SelectOption, SelectSize } from './types';
import { useListbox } from './useListbox';
import { useOptionList } from './useOptionList';
import { usePopover } from './usePopover';

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
  showTags: true,
  maxSummary: 2,
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
}>();

const m = useMessages(() => props.messages);

/** Field-wrapper wiring, identical to `Select`'s — see the comments there. */
const field = inject(FIELD_KEY, null);
const controlId = useUiId(
  'multiselect',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const labelledBy = computed(() =>
  field?.value.labelsControl === true ? field.value.labelId : undefined
);
const attrs = useAttrs();
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
  `${controlId.value}-o${indexOfValue.value.get(value) ?? 0}`;

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string[]>(props, emit, () => []);

/** Spec "Select" → Properties: "`true` when there are more than 10 options, else `false`". */
const searchable = computed(() => props.searchable ?? props.options.length > 10);
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
const summaryText = computed(() =>
  selectedOptions.value
    .slice(0, Math.max(0, props.maxSummary))
    .map((option) => option.label)
    .join(', ')
);
const moreCount = computed(() =>
  Math.max(0, selectedOptions.value.length - Math.max(0, props.maxSummary))
);

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

const { sections, nativeSections, listOptions, hasOptions, highlights } = useOptionList({
  options: () => props.options,
  query: () => query.value,
  searchable: () => searchable.value,
  controlId: () => controlId.value,
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
  open: openPopover,
  close: closePopover,
  onTriggerPointerDown,
  onTriggerClick,
} = usePopover({
  trigger: triggerRef,
  content: panelRef,
  canOpen: () => !props.disabled && !props.readonly,
  placement: props.placement,
  matchWidth: true,
  onOpen: () => {
    listbox.resetTypeahead();
    emit('open');
  },
  onClose: () => {
    listbox.resetTypeahead();
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
    const last = selectedOptions.value.at(-1);
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
  const next = model.value.filter((current) => current !== value);
  if (next.length === model.value.length) return;
  commit(next);
  if (next.length === 0) emit('clear');
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

const part = (base: string, name: MultiSelectPart): string => partClass(base, props.classes, name);

const rootClass = computed(() =>
  part(cx('relative block w-full', showsInvalid.value && 'eldra-field-invalid'), 'root')
);

/**
 * The trigger box: the same box as `Select`'s, which is the same box as `Input`'s — including
 * `eldra-focus-open`, which keeps the ring on while the popover is open (see `Select.vue`'s own
 * comment for why a pointer-opened trigger needs it).
 */
const TRIGGER_BASE =
  'flex w-full min-w-0 items-center gap-2 text-start eldra-field-border ' +
  'rounded-[var(--eldra-field-radius,var(--eldra-radius-md))] eldra-focus eldra-focus-open';

const SIZE: Record<SelectSize, string> = {
  sm: 'control-h-sm ps-2.25 pe-2.5 text-control-sm',
  md: 'control-h ps-2.75 pe-2.5 text-control max-md:text-control-mobile',
  lg: 'control-h-lg ps-2.75 pe-2.5 text-control-lg',
};

const LIVE = 'bg-background border-border-strong hover:border-text text-text cursor-default';
const OPEN = 'border-text';
const INVALID = 'border-danger hover:border-danger';
const DISABLED = 'bg-surface-strong border-border border-dashed text-muted cursor-not-allowed';
const READONLY = 'bg-surface border-border text-text cursor-default';

const triggerClass = computed(() =>
  part(
    cx(
      TRIGGER_BASE,
      SIZE[props.size],
      props.disabled ? DISABLED : props.readonly ? READONLY : LIVE,
      !props.disabled && !props.readonly && isOpen.value && OPEN,
      showsInvalid.value && INVALID
    ),
    'trigger'
  )
);

const leadingIconClass = computed(() =>
  part('flex size-4.5 shrink-0 items-center justify-center text-muted', 'leadingIcon')
);

/** The summary row: the labels, then the "+N" pill. 1.75rem of end padding while Clear shows. */
const summaryClass = computed(() =>
  part(cx('flex min-w-0 flex-1 items-center gap-2', showClear.value && 'pe-7'), 'summary')
);

/** Spec "Multi-select" → Sizes: min width 1.5rem, 1.25rem tall, 0.3125rem side padding. */
const summaryMoreClass = computed(() =>
  part(
    'bg-surface-strong text-text inline-flex h-5 min-w-6 shrink-0 items-center justify-center ' +
      'rounded-full px-1.25 text-select-pill',
    'summaryMore'
  )
);

const placeholderClass = computed(() =>
  part(cx('min-w-0 flex-1 truncate text-muted', showClear.value && 'pe-7'), 'placeholder')
);

const chevronClass = computed(() =>
  part(
    cx(
      'size-4.5 shrink-0 text-muted transition-transform duration-base',
      isOpen.value && 'rotate-180'
    ),
    'chevron'
  )
);

const clearButtonClass = computed(() =>
  part(
    cx(
      'absolute end-8 inset-y-0 my-auto inline-flex size-6 items-center justify-center',
      'rounded-sm text-muted hover:text-text',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'eldra-focus'
    ),
    'clearButton'
  )
);

/**
 * Spec "Multi-select" → Sizes, Footer: "padding 0.375rem (0.75rem at the start), 1px `border`
 * hairline above, `background`, 0.5rem gap. The count … pushes the buttons to the end. It stays put
 * while the list scrolls."
 */
const footerClass = computed(() =>
  part('border-border bg-background flex shrink-0 items-center gap-2 border-t p-1.5 ps-3', 'footer')
);

const footerCountClass = computed(() =>
  part('text-caption text-muted me-auto tabular-nums', 'footerCount')
);

/** Spec: "Clear = Button link sm (0.5rem side padding), Done = Button primary sm." */
const footerClearClass = computed(() => part('px-2', 'footerClear'));
const footerDoneClass = computed(() => part('', 'footerDone'));

/**
 * Spec "Multi-select" → Sizes, Tags: "small chips: min 1.75rem tall, 0.8125rem text, 0.625rem start
 * padding, `surface-strong` fill, `radius-full`. … The list wraps with a 0.375rem gap, 0.25rem
 * below the control."
 */
const tagsClass = computed(() => part('mt-1 flex list-none flex-wrap gap-1.5 p-0', 'tags'));

const tagClass = computed(() =>
  part(
    cx(
      'bg-surface-strong text-text inline-flex min-h-7 items-center gap-1 rounded-full text-caption',
      // 0.625rem at the start either way; the end padding is the remove button's own room, so a
      // chip without one is padded evenly instead of ending short.
      showTagRemove.value ? 'ps-2.5 pe-0.5' : 'px-2.5'
    ),
    'tag'
  )
);

/** "Remove button 1.5rem circle with a 0.875rem icon (hover `text` at 11%)." */
const tagRemoveClass = computed(() =>
  part(
    'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted ' +
      'hover:text-text hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)] ' +
      'eldra-focus',
    'tagRemove'
  )
);

const emptyText = computed(() =>
  query.value.trim() === '' ? m.value.noResults : m.value.noMatchesFor(query.value.trim())
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <!-- The trigger and its clear button share a positioning context of their own: the root also
         holds the tag list, and a clear button positioned against *that* would drift down the
         control as tags wrap onto a second line. -->
    <div class="relative">
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
        <span v-if="leadingIcon" data-part="leadingIcon" :class="leadingIconClass">
          <Icon :icon="leadingIcon" :classes="{ root: 'size-4.5' }" />
        </span>

        <span v-if="hasSelection" data-part="summary" :class="summaryClass">
          <slot name="value" :options="selectedOptions">
            <span v-if="summaryText" class="min-w-0 truncate">{{ summaryText }}</span>
            <span v-if="moreCount > 0" data-part="summaryMore" :class="summaryMoreClass">
              {{ m.moreSelected(moreCount) }}
            </span>
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

      <!-- `data-eldra-overlay-owner` makes `useOverlay` count this button as part of the overlay:
           it sits between the trigger and the panel in the tab order, and the spec's own Tab table
           says the popover stays open all the way to the footer's buttons. -->
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
    </div>

    <SelectPanel
      v-if="isOpen"
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
      :labelled-by="labelledBy"
      :fallback-label="fallbackLabel"
      :panel-style="panelStyle"
      :placement="resolvedPlacement"
      :classes="classes"
      @search="setQuery"
      @select="toggle"
      @activate="listbox.setActive"
      @keydown="onKeydown"
    >
      <template v-if="$slots.option" #option="params">
        <slot name="option" v-bind="params" />
      </template>
      <template v-if="$slots.empty" #empty><slot name="empty" /></template>

      <template #footer>
        <div data-part="footer" :class="footerClass">
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
            :classes="{ container: footerClearClass }"
            @click="onFooterClear"
          >
            {{ m.clear }}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            data-part="footerDone"
            :classes="{ container: footerDoneClass }"
            @click="onDone"
          >
            {{ m.done }}
          </Button>
        </div>
      </template>
    </SelectPanel>

    <!-- Spec → Accessibility: "a `<ul>` named 'Selected <label>'. Each chip's remove control is a
         real `<button type="button">` named 'Remove <label>'." -->
    <ul
      v-if="showTags && hasSelection"
      :id="tagsId"
      data-part="tags"
      :class="tagsClass"
      :aria-label="m.selected"
      :aria-labelledby="labelledBy ? `${tagsId} ${labelledBy}` : undefined"
    >
      <li v-for="option in selectedOptions" :key="option.value" data-part="tag" :class="tagClass">
        <slot name="tag" :option="option">
          <span class="min-w-0 truncate">{{ option.label }}</span>
        </slot>
        <button
          v-if="showTagRemove"
          data-part="tagRemove"
          type="button"
          :class="tagRemoveClass"
          :aria-label="m.removeTag(option.label)"
          @click="onTagRemove(option.value)"
        >
          <!-- Tabler's `x` at 0.875rem. Decorative: the button is named above. -->
          <svg
            class="size-3.5"
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
      </li>
    </ul>

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
