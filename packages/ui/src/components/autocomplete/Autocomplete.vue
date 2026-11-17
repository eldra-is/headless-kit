<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useEldraScope } from '../../composables/useEldraScope';
import { useMessages } from '../../composables/useMessages';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import { FIELD_CLEAR_SIZE } from '../input/classes';
import Input from '../input/Input.vue';
import {
  listboxClass,
  optionClass,
  optionHintClass,
  optionLabelClass,
  panelClass,
} from '../select/panelParts';
import { useListbox } from '../select/useListbox';
import { usePopover } from '../select/usePopover';
import Spinner from '../spinner/Spinner.vue';
import type {
  AutocompleteOptionSlotProps,
  AutocompleteProps,
  AutocompleteSuggestion,
} from './types';

/**
 * A free-text `Input` with a list of suggestions under it: an ARIA combobox with list
 * autocomplete. The value is always the text in the field. Choosing a row writes its `label` into
 * the field and reports the row; nothing has to be chosen.
 *
 * The field is the package's own `Input` (its box, sizes, states, clear button and `FieldWrapper`
 * wiring), the keyboard and the active row are `useListbox`, and the panel's life cycle, teleport
 * and position are `usePopover`. What is this component's own is when the panel may show.
 */

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<AutocompleteProps>(), {
  modelValue: undefined,
  size: 'md',
  id: undefined,
  name: undefined,
  placeholder: undefined,
  autocomplete: undefined,
  inputmode: undefined,
  leadingIcon: undefined,
  // Undefined, not false: these four fall back to the field wrapper's context inside `Input`.
  clearable: undefined,
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  readonly: false,
  disabled: false,
  suggestions: () => [],
  loading: false,
  minLength: 1,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** A row was chosen. `update:modelValue` with the row's `label` fires just before it. */
  select: [suggestion: AutocompleteSuggestion];
  clear: [];
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
}>();

defineSlots<{
  /** Draws a row's content in place of the label and description. */
  option?: (props: AutocompleteOptionSlotProps) => unknown;
  /** A line under the list, inside the panel: a data-source credit. */
  footer?: () => unknown;
  /** `Input`'s own three. */
  leadingIcon?: () => unknown;
  prefix?: () => unknown;
  suffix?: () => unknown;
}>();

const m = useMessages(() => props.messages);

/**
 * The id is worked out here rather than left to `Input`, because the panel, the listbox and every
 * row derive theirs from it. Same rule as `Input`'s: the prop, else the `FieldWrapper`'s when that
 * wrapper labels its control with a `<label for>`, else a generated one.
 */
const field = inject(FIELD_KEY, null);
const controlId = useUiId(
  'autocomplete',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const panelId = computed(() => `${controlId.value}-panel`);
const listboxId = computed(() => `${controlId.value}-listbox`);

const inputComponent = ref<InstanceType<typeof Input> | null>(null);
const controlRef = computed<HTMLElement | null>(() => inputComponent.value?.control ?? null);
const panelRef = ref<HTMLElement | null>(null);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string>(props, emit, () => '');

// --- when the panel shows ------------------------------------------------------------------------

const focused = ref(false);
/**
 * Set when the panel was closed by the person rather than by its conditions: a selection,
 * `Escape`, `Tab`, a press outside. It keeps the panel closed while `suggestions` still holds rows
 * (a consumer's next answer for the same text would otherwise re-open it at once), until the text
 * is typed in again or the field is focused again.
 */
const dismissed = ref(false);

/** The rows on screen. `props.suggestions`, except while a wait holds the previous ones. */
const rows = shallowRef<AutocompleteSuggestion[]>(props.suggestions);

const canShow = computed(
  () =>
    !props.disabled &&
    !props.readonly &&
    model.value.length >= props.minLength &&
    // A single row that says what the field already says still shows: it confirms the text.
    rows.value.length > 0
);
const wantsOpen = computed(() => focused.value && !dismissed.value && canShow.value);

/** True while the panel is being closed because `wantsOpen` turned false, not by the person. */
let closingForConditions = false;

const {
  isOpen,
  panelStyle,
  placement: resolvedPlacement,
  teleportTo,
  teleportDisabled,
  open: openPopover,
  close: closePopover,
} = usePopover({
  trigger: controlRef,
  content: panelRef,
  canOpen: () => !props.disabled && !props.readonly,
  // The panel matches the field's width. `'exact'` rather than `true`, which is only a floor: the
  // panel is teleported, so shrink-to-fit would otherwise let a long row widen it past the field.
  matchWidth: 'exact',
  // A text field that loses focus to nowhere stays blurred; `usePopover` would refocus it.
  returnFocus: false,
  onClose: () => {
    if (!closingForConditions) dismissed.value = true;
    listbox.setActive(undefined);
  },
});

watch(wantsOpen, (wants) => {
  if (wants) {
    openPopover();
    return;
  }
  closingForConditions = true;
  closePopover(false);
  closingForConditions = false;
});

/**
 * An open panel keeps its rows while a wait is in progress, so a consumer that empties
 * `suggestions` before each request does not make the panel close and re-open per keystroke. A
 * closed panel takes the new list as it is, so it never opens on rows from an earlier text.
 */
watch(
  () => [props.suggestions, props.suggestions.length, props.loading] as const,
  ([next, length, loading]) => {
    if (length > 0 || !loading || !isOpen.value) rows.value = next;
  }
);

// --- the keyboard --------------------------------------------------------------------------------

/**
 * A row's element id is built from its position, as `Select`'s and `SearchBar`'s are: a `value` is
 * the consumer's data, and an id `aria-activedescendant` has to round-trip should hold nothing
 * that needs escaping. `undefined` for a value with no row on screen.
 */
const indexOfRow = computed(() => new Map(rows.value.map((row, index) => [row.value, index])));
const optionId = (value: string): string | undefined => {
  const index = indexOfRow.value.get(value);
  return index === undefined ? undefined : `${controlId.value}-option-${index}`;
};

/**
 * `searchable: true` says the focused element is a text field, so `Home`, `End`, `Space` and every
 * printable key stay the caret's. The closed half of `useListbox`'s table is never reached (see
 * `onKeydown`): it opens on any printable key and prevents it, which would swallow typing.
 */
const listbox = useListbox<AutocompleteSuggestion>({
  options: () => rows.value,
  isOpen: () => isOpen.value,
  searchable: () => true,
  optionId,
  open: () => undefined,
  // `Tab`: close without a choice and let focus move on.
  close: () => closePopover(false),
  select: (suggestion) => choose(suggestion),
});

/** A new list that no longer holds the active row leaves nothing active. */
watch(rows, () => {
  if (listbox.activeId.value === undefined) listbox.setActive(undefined);
});

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (!isOpen.value) {
    // The arrows bring back a panel that was dismissed (`Escape`, a selection) and land on a row.
    // Nothing else on a closed field is ours: `Enter` submits the form and every other key types.
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && focused.value && canShow.value) {
      event.preventDefault();
      dismissed.value = false;
      openPopover();
      if (isOpen.value) listbox.move(event.key === 'ArrowDown' ? 1 : -1);
    }
    return;
  }
  // `Enter` with no active row is the field's own: it submits the surrounding form.
  if (event.key === 'Enter' && listbox.activeId.value === undefined) return;
  listbox.onKeydown(event);
}

// --- choosing ------------------------------------------------------------------------------------

function choose(suggestion: AutocompleteSuggestion): void {
  if (suggestion.disabled === true) return;
  // Closing here is the person's doing, so `onClose` marks the panel dismissed.
  closePopover(false);
  model.value = suggestion.label;
  emit('select', suggestion);
}

function onType(value: string): void {
  model.value = value;
  // New text is a new question: the panel may show again, and no row is active.
  dismissed.value = false;
  listbox.setActive(undefined);
}

function onFocus(event: FocusEvent): void {
  focused.value = true;
  dismissed.value = false;
  emit('focus', event);
}

function onBlur(event: FocusEvent): void {
  focused.value = false;
  emit('blur', event);
}

/** The active row is kept in view, with the row's own `scroll-my-1` as its margin. */
watch(
  () => listbox.activeId.value,
  (id) => {
    if (id === undefined) return;
    void nextTick(() => document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' }));
  }
);

// --- the wait ------------------------------------------------------------------------------------

/** The spinner waits 300ms, as `SearchBar`'s does, so a fast answer never flashes it. */
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
    // No timer on the server: nothing there would ever clear it.
    if (typeof window === 'undefined') return;
    loadingTimer = setTimeout(() => {
      loadingShown.value = true;
      loadingTimer = undefined;
    }, LOADING_DELAY_MS);
  },
  { immediate: true }
);

onBeforeUnmount(stopLoadingTimer);

// --- classes -------------------------------------------------------------------------------------

/** The clear button's own square, so the spinner sits where an action would. */
const busyClass = computed(() => [
  'eldra:pointer-events-none eldra:inline-flex eldra:items-center eldra:justify-center eldra:text-muted',
  FIELD_CLEAR_SIZE[props.size],
  props.classes?.busy,
]);

const panelClasses = computed(() => panelClass(props.classes));
const listboxClasses = computed(() => listboxClass(props.classes, true));
const labelClasses = computed(() => optionLabelClass(props.classes));
const descriptionClasses = computed(() => [
  ...optionHintClass(undefined),
  props.classes?.optionDescription,
]);
const footerClasses = computed(() => [
  'eldra:shrink-0 eldra:border-t eldra:px-3 eldra:py-2 eldra:text-caption',
  'eldra:border-[color:var(--eldra-select-panel-border,var(--eldra-color-border))]',
  'eldra:text-[color:var(--eldra-select-panel-muted,var(--eldra-color-muted))]',
  props.classes?.footer,
]);

const isActive = (suggestion: AutocompleteSuggestion): boolean =>
  listbox.activeValue.value === suggestion.value;

const rowClass = (suggestion: AutocompleteSuggestion) =>
  optionClass(props.classes, suggestion, {
    active: isActive(suggestion),
    selected: false,
    multiple: false,
  });

/** `control` is the native `<input>`, as `Input` exposes it. */
defineExpose({
  control: controlRef,
  focus: () => controlRef.value?.focus(),
});
</script>

<template>
  <Input
    ref="inputComponent"
    v-bind="$attrs"
    :id="controlId"
    :model-value="model"
    :size="size"
    :name="name"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :inputmode="inputmode"
    :leading-icon="leadingIcon"
    :clearable="clearable"
    :invalid="invalid"
    :described-by="describedBy"
    :required="required"
    :readonly="readonly"
    :disabled="disabled"
    :classes="classes"
    role="combobox"
    aria-autocomplete="list"
    :aria-expanded="isOpen ? 'true' : 'false'"
    :aria-controls="isOpen ? listboxId : undefined"
    :aria-activedescendant="isOpen ? listbox.activeId.value : undefined"
    @update:model-value="onType"
    @focus="onFocus"
    @blur="onBlur"
    @clear="emit('clear')"
    @keydown="onKeydown"
  >
    <template v-if="$slots.leadingIcon" #leadingIcon><slot name="leadingIcon" /></template>
    <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
    <template v-if="loadingShown || $slots.suffix" #suffix>
      <!-- Decorative: the wait is announced by `aria-busy` on the listbox, never by the shape. -->
      <span v-if="loadingShown" :data-eldra-scope="eldra.scope" data-part="busy" :class="busyClass">
        <Spinner class="eldra:size-4.5" />
      </span>
      <slot name="suffix" />
    </template>
  </Input>

  <!-- Teleported to `body`, or to the open `<dialog>` the field sits in (see `usePopover`). The
       `v-if` is on the `<Teleport>` itself, so a server render emits nothing for a closed panel. -->
  <Teleport v-if="isOpen" :to="teleportTo" :disabled="teleportDisabled">
    <!-- `mousedown`'s default action is what moves focus, so preventing it keeps the caret in the
         field while the click on a row still lands. -->
    <div
      ref="panelRef"
      :id="panelId"
      data-eldra-ui
      :data-eldra-scope="eldra.scope"
      data-part="panel"
      :data-eldra-overlay-owner="panelId"
      :class="panelClasses"
      :style="panelStyle"
      :data-placement="resolvedPlacement"
      @mousedown.prevent
    >
      <div
        :id="listboxId"
        data-part="listbox"
        role="listbox"
        :class="listboxClasses"
        :aria-label="m.suggestions"
        :aria-busy="loading ? 'true' : undefined"
      >
        <div
          v-for="suggestion in rows"
          :key="suggestion.value"
          :id="optionId(suggestion.value)"
          :data-eldra-slot="eldra.slotHost('option')"
          data-part="option"
          role="option"
          :class="rowClass(suggestion)"
          :aria-selected="isActive(suggestion) ? 'true' : 'false'"
          :aria-disabled="suggestion.disabled ? 'true' : undefined"
          @click="choose(suggestion)"
          @mouseenter="suggestion.disabled ? undefined : listbox.setActive(suggestion.value)"
        >
          <slot name="option" :suggestion="suggestion" :active="isActive(suggestion)">
            <span class="eldra:min-w-0 eldra:flex-1">
              <span data-part="optionLabel" :class="labelClasses">{{ suggestion.label }}</span>
              <span
                v-if="suggestion.description"
                data-part="optionDescription"
                :class="descriptionClasses"
              >
                {{ suggestion.description }}
              </span>
            </span>
          </slot>
        </div>
      </div>

      <div
        v-if="$slots.footer"
        :data-eldra-slot="eldra.slotHost('footer')"
        data-part="footer"
        :class="footerClasses"
      >
        <slot name="footer" />
      </div>
    </div>
  </Teleport>
</template>
