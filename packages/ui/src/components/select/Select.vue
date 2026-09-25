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
import { optionIconClass, optionSwatchClass } from './panelParts';
import SelectPanel from './SelectPanel.vue';
import type { SelectOption, SelectProps, SelectSize } from './types';
import { useListbox } from './useListbox';
import { useOptionList } from './useOptionList';

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
const nativeRef = ref<HTMLSelectElement | null>(null);

/**
 * The panel's own elements. `SelectPanel` owns the DOM it draws and exposes the two pieces this
 * component has to reach: the panel element, which `useFloating` positions and `useOverlay`
 * measures "inside" against, and the search input, which opening focuses.
 */
const panelComponent = ref<InstanceType<typeof SelectPanel> | null>(null);
const panelRef = computed<HTMLElement | null>(() => panelComponent.value?.root ?? null);
const searchRef = computed<HTMLInputElement | null>(
  () => panelComponent.value?.searchInput ?? null
);

// --- the list ----------------------------------------------------------------------------------

/**
 * Filtering, grouping and match highlighting, shared with `MultiSelect` (see `useOptionList`).
 * Nothing about *which* rows a panel shows differs between the two controls.
 */
const { sections, nativeSections, listOptions, hasOptions, highlights } = useOptionList({
  options: () => props.options,
  query: () => query.value,
  searchable: () => searchable.value,
  controlId: () => controlId.value,
});

// --- the keyboard ------------------------------------------------------------------------------

const listbox = useListbox({
  options: () => listOptions.value,
  isOpen: () => isOpen.value,
  // Spec "Select" → Properties: `disabled` "doesn't open", `readonly` "doesn't open". Told to the
  // listbox rather than left to `openPanel`'s own guard, so those keys are not consumed either.
  canOpen: () => !props.disabled && !props.readonly,
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

/**
 * What the panel marks as selected. A single select has exactly one value, and passing it as a
 * list is what lets one panel serve both controls.
 */
const selectedValues = computed(() => [model.value]);

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
}

function closePanel(returnFocus = true): void {
  if (!isOpen.value) return;
  setOpen(false);
  // Spec "Select" → Behaviour: selecting and `Escape` both "return focus to the trigger", and
  // `Tab` needs focus on the trigger *before* the browser's own default action moves it on.
  if (returnFocus) triggerRef.value?.focus();
}

onBeforeUnmount(() => {
  unregisterOpen(closeFromRegistry);
  detachTriggerRelease();
});

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

/**
 * Puts the model onto the native select, if the two have drifted apart.
 *
 * It reads the **options** as well as the value, and that is deliberate twice over. A `<select>`
 * cannot hold a value none of its `<option>`s carries — assigning one silently selects nothing and
 * reads back as the first option's — so what can be written depends on the list; and reading the
 * list here is what makes the effect below re-run when the list changes under a value that was
 * fine a moment ago. Without that, a list arriving after mount (fetched countries) or being
 * replaced (a dependent list, when its parent field changes) left the native select on the
 * placeholder while the trigger showed the label, and the form posted `''`.
 */
function syncNativeValue(): void {
  const value = model.value;
  const known = props.options.some((option) => option.value === value);
  const element = nativeRef.value;
  if (element === null) return;
  const next = known ? value : '';
  if (element.value !== next) element.value = next;
}

/**
 * Keeps the native select on the model whoever changed it — a parent's `v-model` included — and on
 * whatever options it currently has. Post-flush, so the new `<option>` elements exist by the time
 * the value is written.
 */
watchPostEffect(syncNativeValue);

function commit(value: string): void {
  model.value = value;
  syncNative(value, true);
  emit('change', value);
  // A controlled parent may refuse the value, in which case `model.value` never changed and the
  // watcher above will not fire — but the native select has already been written. Put it back on
  // whatever the model actually says, so it is never ahead of it.
  void nextTick(syncNativeValue);
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

/**
 * Ends the press. A press that finishes *on* the trigger becomes a click, which clears the latch
 * itself; one that finishes anywhere else (a drag off the control, a cancelled touch) never will —
 * and a latch left standing would arm the *next* click, which, if it came from a `<label for>`,
 * would open the panel the spec says a label must not open.
 */
function releaseTrigger(event: Event): void {
  detachTriggerRelease();
  const target = event.target;
  if (target instanceof Node && triggerRef.value?.contains(target) === true) return;
  pressedTrigger = false;
}

function detachTriggerRelease(): void {
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerup', releaseTrigger, true);
  document.removeEventListener('pointercancel', releaseTrigger, true);
}

function onTriggerPointerDown(): void {
  pressedTrigger = true;
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerup', releaseTrigger, true);
  document.addEventListener('pointercancel', releaseTrigger, true);
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

// --- searching ---------------------------------------------------------------------------------

function setQuery(next: string): void {
  if (query.value === next) return;
  query.value = next;
  emit('search', next);
}

// Spec "Select" → Behaviour, Search: "The first visible enabled option becomes active after each
// change."
watch(query, () => {
  if (!isOpen.value) return;
  listbox.activateFrom(undefined);
});

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
 * Which edge the panel grows from (spec "Select" → Behaviour & motion: it slides 0.25rem and scales
 * "from its top edge (from its bottom edge when flipped)").
 *
 * Two CSS variables rather than two animation classes. `placement` resolves a frame *after* the
 * panel mounts — floating-ui measures asynchronously — so a panel that ends up flipped would swap
 * class, and a new `animation-name` restarts the animation from zero: the popover visibly faded in
 * twice. Changing a custom property the keyframes read leaves `animation-name` alone, so the
 * entrance plays exactly once whichever way it ends up pointing.
 */
const isAbove = computed(() => resolvedPlacement.value.startsWith('top'));
const panelStyle = computed<Record<string, string>>(() => ({
  ...floatingStyles.value,
  '--eldra-popover-origin': isAbove.value ? 'bottom' : 'top',
  '--eldra-popover-slide': isAbove.value ? '0.25rem' : '-0.25rem',
}));

/** The chosen option's mark in the trigger: the same two parts an option row draws it with. */
const triggerSwatchClass = computed(() => optionSwatchClass(props.classes));
const triggerIconClass = computed(() => optionIconClass(props.classes));

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
            :class="triggerSwatchClass"
            :style="{ backgroundColor: selectedOption.swatch }"
            aria-hidden="true"
          />
          <Icon
            v-else-if="selectedOption.icon"
            data-part="optionIcon"
            :icon="selectedOption.icon"
            :classes="{ root: triggerIconClass }"
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

    <!-- The panel is `SelectPanel`, which `MultiSelect` renders too: one search field, one
         listbox, one set of option rows for both controls. -->
    <SelectPanel
      v-if="isOpen"
      ref="panelComponent"
      :panel-id="panelId"
      :listbox-id="listboxId"
      :sections="sections"
      :has-options="hasOptions"
      :highlights="highlights"
      :option-id="optionId"
      :active-value="listbox.activeValue.value"
      :selected-values="selectedValues"
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
      @select="choose"
      @activate="listbox.setActive"
      @keydown="listbox.onKeydown"
    >
      <template v-if="$slots.option" #option="params">
        <slot name="option" v-bind="params" />
      </template>
      <template v-if="$slots.empty" #empty><slot name="empty" /></template>
    </SelectPanel>

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
