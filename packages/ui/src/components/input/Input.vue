<script setup lang="ts">
import { computed, inject, ref, useSlots } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { joinIds, useUiId } from '../../utils/id';
import { applyMask, stripMask } from '../../utils/mask';
import { FIELD_KEY } from '../field-wrapper/context';
import Icon from '../icon/Icon.vue';
import type { InputProps, InputSize } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<InputProps>(), {
  modelValue: undefined,
  type: 'text',
  size: 'md',
  id: undefined,
  name: undefined,
  placeholder: undefined,
  autocomplete: undefined,
  inputmode: undefined,
  min: undefined,
  max: undefined,
  step: undefined,
  leadingIcon: undefined,
  // Undefined, not false: these four fall back to the field wrapper's context, and `false` there
  // would be an answer rather than "no opinion".
  clearable: undefined,
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  readonly: false,
  disabled: false,
  mask: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  clear: [];
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
}>();

const slots = useSlots();
const m = useMessages();

/**
 * The field wrapper's context (spec "Input" → Properties: "`id` comes from the Field wrapper and
 * ties the label", "`describedBy` … supplied by the Field wrapper", "`invalid` … usually passed
 * down from the Field wrapper's `error`"). Optional: an Input used on its own injects nothing.
 * An explicit prop always wins, so a field can be marked invalid on one control inside a wrapper
 * that is not.
 */
const field = inject(FIELD_KEY, null);

/**
 * The id. Taken from the field context only when that context comes from a wrapper that labels its
 * control with a `<label for>`: a `group` wrapper puts that same id on its own `<fieldset>`, so a
 * control inside one that adopted it would put a single id on two elements.
 */
const controlId = useUiId(
  'input',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
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

const controlRef = ref<HTMLInputElement | null>(null);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string>(props, emit, () => '');

/**
 * The raw value lives in the model; the field shows the masked text (spec's "Do put format hints
 * in help text" reads on a field that formats as you type). With no mask the two are the same
 * string, so nothing is computed twice for the ordinary case.
 */
const display = computed(() =>
  props.mask === undefined ? model.value : applyMask(model.value, props.mask)
);

/** Spec "Input" → Properties: `false`, but `true` for `type="search"`. */
const clearable = computed(() => props.clearable ?? props.type === 'search');
/** "Shows the clear button while there is a value" — and never on a field that cannot be edited. */
const showClear = computed(
  () => clearable.value && !props.disabled && !props.readonly && model.value.length > 0
);
const hasSuffixSlot = computed(() => slots.suffix !== undefined);
const hasTrailing = computed(() => showClear.value || hasSuffixSlot.value);
const hasLeading = computed(
  () => props.leadingIcon !== undefined || slots.leadingIcon !== undefined
);

/**
 * Spec "Input" → Variants, `number`: `inputmode="numeric"` unless the caller says otherwise.
 *
 * The prop is a plain `string` — the spec lists it as one, and a consumer should not have to
 * import a union to pass `"numeric"` — but Vue's DOM typing for the attribute is the native
 * enumeration, so the value is narrowed here rather than in the public type.
 */
type NativeInputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
const resolvedInputmode = computed<NativeInputMode | undefined>(
  () =>
    (props.inputmode ?? (props.type === 'number' ? 'numeric' : undefined)) as
      | NativeInputMode
      | undefined
);

/**
 * Shared box (spec "Input" → Anatomy, Sizes, States). The `<input>` *is* the field box — the
 * anatomy calls it "the native `<input>`, full width" — so the border, the radius and the one
 * focus ring all live here, and the leading icon and trailing action are absolutely positioned
 * over the padding the sizes reserve for them.
 *
 * `eldra-focus-always` is the text-field rule from the focus-ring foundation: the ring shows on
 * *any* focus, pointer included, "because a caret alone is easy to miss". There is deliberately no
 * `transition-*`/`duration-*` utility beside it — `eldra-focus` owns this element's transition
 * list, including the `duration-fast` border-colour change the spec's Behaviour section asks for.
 * See `src/styles/tailwind.css` and `src/__tests__/focus-transition.spec.ts`.
 */
const BASE =
  'block w-full min-w-0 eldra-field-border bg-background text-text placeholder:text-muted ' +
  'rounded-[var(--eldra-input-radius,var(--eldra-radius-md))] eldra-focus eldra-focus-always';

/**
 * Sizes (spec "Input" → Sizes). `--spacing` is 0.25rem, so `py-0.75`/`px-2.25` are the spec's
 * 0.1875/0.5625rem, `py-1.75`/`px-2.75` its 0.4375/0.6875rem and `py-2.75` its 0.6875rem.
 * The 1.5rem line comes from the `text-control*` utilities, so the value sits on the spec's line
 * inside the spec's box at every size.
 */
const SIZE: Record<InputSize, string> = {
  sm: 'control-h-sm py-0.75 px-2.25 text-control-sm',
  md: 'control-h py-1.75 px-2.75 text-control max-md:text-control-mobile',
  lg: 'control-h-lg py-2.75 px-2.75 text-control-lg',
};

/**
 * Room for the decorations (spec "Input" → Sizes, md row): "With a leading icon, the start padding
 * is 2.25rem. With a trailing action, the end padding is 2.5rem." The leading icon is 1.125rem at
 * every size, so its 2.25rem applies to all three; the trailing action is 2rem square, which does
 * not fit a 2rem sm box, so sm uses a 1.5rem button (still the 2.5.8 target minimum) and 2rem of
 * end padding to match.
 */
const TRAILING_PAD: Record<InputSize, string> = { sm: 'pe-8', md: 'pe-10', lg: 'pe-10' };
const CLEAR_SIZE: Record<InputSize, string> = { sm: 'size-6', md: 'size-8', lg: 'size-8' };

/**
 * States (spec "Input" → States). Disabled and read-only replace the live colours outright rather
 * than layering over them, so a `:hover` rule can never win back a live boundary on a dead field.
 * The error row's second 1px line is drawn by the root's `eldra-field-invalid` pseudo-element,
 * because the ring already owns this element's `outline` and `box-shadow`.
 */
const LIVE = 'border-border-strong hover:border-text focus:border-text';
const INVALID = 'border-danger hover:border-danger focus:border-danger';
const DISABLED = 'bg-surface-strong border-border border-dashed text-muted cursor-not-allowed';
const READONLY = 'bg-surface border-border text-text';

/** Spec "Input" → Variants, `search`: "The browser's own clear button is hidden." */
const SEARCH =
  '[&::-webkit-search-cancel-button]:appearance-none ' +
  '[&::-webkit-search-decoration]:appearance-none';

/**
 * Spec "Input" -> States: the error boundary belongs to a field that can still be corrected. A
 * disabled field is out of the conversation, so it keeps its dead grey boundary and drops the
 * danger one (`aria-invalid` stays: the field is still invalid, it just cannot be fixed here). A
 * read-only field keeps it — the value is shown, cannot be edited in place, and is still wrong.
 * The root and the control agree on that, so the 1px border and the 1px inset line that make up
 * the spec's 2px boundary can never appear one without the other.
 */
const showsInvalid = computed(() => isInvalid.value && !props.disabled);

const rootClass = computed(() =>
  partClass(
    cx('relative block w-full', showsInvalid.value && 'eldra-field-invalid'),
    props.classes,
    'root'
  )
);

const controlClass = computed(() =>
  partClass(
    cx(
      BASE,
      SIZE[props.size],
      hasLeading.value && 'ps-9',
      hasTrailing.value && TRAILING_PAD[props.size],
      props.type === 'number' && 'tabular-nums',
      props.type === 'search' && SEARCH,
      props.disabled ? DISABLED : props.readonly ? READONLY : LIVE,
      showsInvalid.value && INVALID
    ),
    props.classes,
    'control'
  )
);

/** 1.125rem, `muted`, 0.6875rem from the start edge, and out of the pointer's way. */
const leadingIconClass = computed(() =>
  partClass(
    'absolute start-2.75 inset-y-0 my-auto flex h-4.5 w-4.5 items-center justify-center ' +
      'text-muted pointer-events-none',
    props.classes,
    'leadingIcon'
  )
);

/**
 * The end-edge area, 0.25rem from the edge (spec "Input" → Anatomy, "Trailing action"). The clear
 * button and the `suffix` slot share it, so a field that has both keeps them on one row in reading
 * order — which is also the tab order the Keyboard table asks for: the input first, the clear
 * button next.
 */
const suffixClass = computed(() =>
  partClass('absolute end-1 inset-y-0 my-auto flex items-center gap-1', props.classes, 'suffix')
);

/** A ghost icon button (spec "Input" → Anatomy): square, `muted`, the one focus ring. */
const clearButtonClass = computed(() =>
  partClass(
    cx(
      'inline-flex shrink-0 items-center justify-center rounded-[var(--eldra-radius-sm)]',
      CLEAR_SIZE[props.size],
      'text-muted hover:text-text',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'eldra-focus'
    ),
    props.classes,
    'clearButton'
  )
);

/** The types whose selection API a browser actually implements; `number` and `email` throw. */
const SELECTABLE_TYPES = new Set(['text', 'search', 'tel', 'url', 'password']);

function onInput(event: Event): void {
  const element = event.target as HTMLInputElement;

  if (props.mask === undefined) {
    model.value = element.value;
    return;
  }

  // With a mask the model is the raw value, so what the customer typed is stripped back to raw
  // and re-formatted. The formatted text is written to the element directly as well as through
  // the model: a keystroke that changes nothing raw (a stray letter in a digit slot) leaves the
  // bound value identical, so Vue would not patch the DOM and the stray character would stay.
  const caretAtEnd = element.selectionStart === element.value.length;
  const raw = stripMask(element.value, props.mask);
  const formatted = applyMask(raw, props.mask);

  model.value = raw;
  element.value = formatted;

  // Writing `value` puts the caret at the end in every browser. For the one case the spec asks
  // about — typing at the end of the field — that is where the caret already was, and the explicit
  // `setSelectionRange` below keeps it there in the types whose selection API exists. An edit in
  // the *middle* of the value therefore **loses the caret to the end of the field**: nothing here
  // maps the old offset through the re-format, and the value rewrite has already moved it. That is
  // a real cost of the mask and is pinned by a test ("resets the caret to the end after an edit in
  // the middle of the value"), so preserving the caret later is a deliberate change rather than an
  // accidental one.
  if (caretAtEnd && SELECTABLE_TYPES.has(props.type)) {
    element.setSelectionRange(formatted.length, formatted.length);
  }
}

/**
 * Spec "Input" → Events and Behaviour: "Clicking it empties the field and returns focus to the
 * input", and clearing "also fires `input` with `""`".
 */
function onClear(): void {
  model.value = '';
  emit('clear');
  controlRef.value?.focus();
}
</script>

<template>
  <div data-part="root" :class="rootClass">
    <span v-if="hasLeading" data-part="leadingIcon" :class="leadingIconClass">
      <slot name="leadingIcon">
        <Icon v-if="leadingIcon" :icon="leadingIcon" :classes="{ root: 'size-4.5' }" />
      </slot>
    </span>

    <input
      ref="controlRef"
      v-bind="$attrs"
      data-part="control"
      :class="controlClass"
      :id="controlId"
      :name="name"
      :type="type"
      :value="display"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :inputmode="resolvedInputmode"
      :min="min"
      :max="max"
      :step="step"
      :required="isRequired || undefined"
      :readonly="readonly || undefined"
      :disabled="disabled || undefined"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @focus="emit('focus', $event as FocusEvent)"
      @blur="emit('blur', $event as FocusEvent)"
    />

    <span v-if="hasTrailing" data-part="suffix" :class="suffixClass">
      <button
        v-if="showClear"
        data-part="clearButton"
        type="button"
        :class="clearButtonClass"
        :aria-label="m.clear"
        @click="onClear"
      >
        <!-- Tabler's `x`, stroke 1.75, at 1.125rem. Decorative: the button is named by aria-label. -->
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
      <slot name="suffix" />
    </span>
  </div>
</template>
