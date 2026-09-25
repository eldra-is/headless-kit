<script setup lang="ts">
import { computed, inject, provide, useSlots } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FORM_LAYOUT_KEY } from '../form-layout/context';
import { FIELD_KEY, type FieldContext } from './context';
import type { FieldWrapperProps } from './types';

const props = withDefaults(defineProps<FieldWrapperProps>(), {
  id: undefined,
  required: false,
  optional: false,
  help: undefined,
  error: undefined,
  counter: undefined,
  full: false,
  classes: undefined,
});

const slots = useSlots();
const m = useMessages();

/**
 * The control's id (spec "Field wrapper" → Properties, `id`: "generated"). The wrapper owns it
 * because the wrapper owns the `<label for>`; a caller that needs a stable id for a
 * server-rendered form passes one and it is used verbatim.
 *
 * The label carries an id of its own too. Native controls are tied by `for`/`id`, but the spec's
 * Accessibility notes say "The custom select and multi-select triggers use `aria-labelledby`
 * pointing to the label", and a `<label for>` cannot name a `<button>` trigger — so the id that
 * makes that possible exists from the start rather than being retrofitted.
 */
const controlId = useUiId('field', () => props.id);
const labelId = computed(() => `${controlId.value}-label`);
const helpId = computed(() => `${controlId.value}-help`);
const errorId = computed(() => `${controlId.value}-error`);

/**
 * A slot counts as content: `<template #error>` is a richer way of writing the `error` prop (a
 * message with a link in it, say), not a different feature, so it makes the field invalid and
 * gets linked exactly as the prop does.
 */
const hasError = computed(() => Boolean(props.error) || slots.error !== undefined);
const hasHelp = computed(() => Boolean(props.help) || slots.help !== undefined);
const hasCounter = computed(() => props.counter !== undefined);
const hasFoot = computed(() => hasHelp.value || hasCounter.value);

/**
 * Spec "Field wrapper" → Accessibility: "the error comes first and is announced on focus". Only
 * ids that actually render go in, so a field with no help never points at an element that is not
 * there. The counter is deliberately not in the list: it is a live status the Textarea wires in
 * itself when it owns one, and repeating "2 / 3" in front of every other description on focus
 * makes the field noisier, not clearer.
 */
const describedBy = computed(() => {
  const ids = [
    hasError.value ? errorId.value : undefined,
    hasHelp.value ? helpId.value : undefined,
  ].filter((id): id is string => id !== undefined);
  return ids.length > 0 ? ids.join(' ') : undefined;
});

/**
 * What the control inside reads (see `context.ts`). A `ComputedRef`, so a control that mounted
 * while the field was valid still sees `invalid` the moment an error arrives.
 */
const context = computed<FieldContext>(() => ({
  id: controlId.value,
  describedBy: describedBy.value,
  invalid: hasError.value,
  required: props.required,
}));
provide(FIELD_KEY, context);

/**
 * Spec "Field wrapper" → Properties, `full`: "Spans both columns in the two-column form layout."
 * Only there — in a single-column or inline form, and in a field standing on its own in a
 * page-builder column, there is no second column to span and the prop does nothing.
 */
const layout = inject(FORM_LAYOUT_KEY, null);
const spansBothColumns = computed(() => props.full && layout?.value === 'two');

/**
 * Spec "Form layout" → Anatomy, the inline form: "[ Email address ___ ] [Subscribe]", the field
 * "grows, shrinks, basis 14rem", the button bottom-aligned to it, and the "error: full-width row
 * below both when invalid".
 *
 * A field is one box, and a box cannot be half a flex row — so in an inline form the wrapper
 * *becomes* the row rather than sitting in it: the root and the label/control group swap their
 * `display`, so the label and the control travel together as the growing flex item while the error
 * and the foot row wrap onto full-width rows of their own, after the button (`order-1`, which
 * moves nothing in the DOM or the tab order). That is what keeps the button level with the
 * control instead of dropping to the bottom of the help text.
 *
 * Everywhere else the group is `display: contents` and the wrapper is its own grid, exactly as the
 * Field wrapper section draws it.
 */
const isInline = computed(() => layout?.value === 'inline');

/** Spec "Field wrapper" → Properties: a counter with no `value` is an empty field, so "0 / max". */
const count = computed(() => props.counter?.value ?? 0);
const isOverLimit = computed(() => props.counter !== undefined && count.value > props.counter.max);

/**
 * The vertical rhythm (spec "Field wrapper" → Sizes, "Vertical rhythm"): "Grid with a 0.25rem gap:
 * label → control 0.375rem (gap + label margin), control → help/error 0.25rem." So the gap is the
 * whole rhythm and the label's own 0.125rem bottom margin is what makes its row the wider one.
 */
const rootClass = computed(() =>
  partClass(
    cx('grid gap-1', isInline.value && 'contents', spansBothColumns.value && '@two-col:col-span-2'),
    props.classes,
    'root'
  )
);

/**
 * The label-and-control group. It has no `data-part` of its own because it is not a part: in every
 * layout but `inline` it is `display: contents` and the browser lays the label and the control out
 * as the rows of `root` that the spec's anatomy draws.
 */
const groupClass = computed(() =>
  isInline.value ? 'grid min-w-0 flex-[1_1_14rem] gap-1' : 'contents'
);

/** In an inline row the error and the foot take a full-width row of their own, below the button. */
const INLINE_ROW = 'order-1 w-full basis-full';

/**
 * Spec "Field wrapper" → States: the label is `text` in every state, including error — "Don't turn
 * the label red on error. The border and message are enough, and red labels read as 'required'."
 * `w-fit` keeps the click target on the words rather than the whole grid row.
 */
const labelClass = computed(() =>
  partClass('text-label text-text mb-0.5 block w-fit', props.classes, 'label')
);

/** 0.125rem start margin, `danger`, inheriting the label's weight 600. */
const requiredMarkClass = computed(() =>
  partClass('text-danger ms-0.5', props.classes, 'requiredMark')
);

/** 0.25rem start margin, `muted`, weight 400 against the label's 600. */
const optionalTextClass = computed(() =>
  partClass('text-muted ms-1 font-normal', props.classes, 'optionalText')
);

/** The control's row. `min-w-0` because a grid item's default `auto` floor would let it overflow. */
const controlClass = computed(() => partClass('min-w-0', props.classes, 'control'));

/**
 * Spec "Field wrapper" → Sizes, Error row: 0.8125rem / 1.45, weight 500, `danger`, with the icon
 * top-aligned and 0.3125rem from the text. `gap-1.25` is that 0.3125rem on the 0.25rem step.
 */
const errorClass = computed(() =>
  partClass(
    cx(
      'text-field-note text-danger flex items-start gap-1.25 font-medium',
      isInline.value && INLINE_ROW
    ),
    props.classes,
    'error'
  )
);

/** 1rem, nudged 0.1em down so it sits on the text rather than above it. */
const errorIconClass = computed(() =>
  partClass('size-4 shrink-0 translate-y-[0.1em]', props.classes, 'errorIcon')
);

/** Spec "Field wrapper" → Sizes, Foot row: "help and counter on one line, 0.75rem gap". */
const footClass = computed(() =>
  partClass(
    cx('flex flex-wrap items-baseline gap-x-3 gap-y-1', isInline.value && INLINE_ROW),
    props.classes,
    'foot'
  )
);

/** 0.8125rem / 1.45, weight 400, `muted`. */
const helpClass = computed(() =>
  partClass('text-field-note text-muted min-w-0 font-normal', props.classes, 'help')
);

/**
 * Spec "Field wrapper" → Sizes, Counter row: "0.8125rem / 1.5, tabular numerals, no wrap … pushed
 * to the end of the foot row", `muted` weight 400 under the limit and `danger` weight 600 over it.
 */
const counterClass = computed(() =>
  partClass(
    cx(
      'text-counter ms-auto shrink-0 tabular-nums whitespace-nowrap',
      isOverLimit.value ? 'text-danger font-semibold' : 'text-muted font-normal'
    ),
    props.classes,
    'counter'
  )
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <div :class="groupClass">
      <label :id="labelId" :for="controlId" data-part="label" :class="labelClass">
        <slot name="label">{{ label }}</slot>
        <!-- The asterisk is decorative: the control's native `required` is what announces it. -->
        <span v-if="required" data-part="requiredMark" :class="requiredMarkClass" aria-hidden="true"
          >*</span
        >
        <span v-else-if="optional" data-part="optionalText" :class="optionalTextClass"
          >({{ m.optional }})</span
        >
      </label>

      <div data-part="control" :class="controlClass"><slot /></div>
    </div>

    <!-- Linked by id, not a live region: the spec's Accessibility notes put the error in
         `aria-describedby` so it is announced on focus, and leave announcing a failed submit to
         the form's own error summary. A `role="alert"` here would read every error again the
         moment it rendered. -->
    <p v-if="hasError" :id="errorId" data-part="error" :class="errorClass">
      <!-- Tabler's `alert-circle`, stroke 1.75, at 1rem. Decorative: the message is the text. -->
      <svg
        data-part="errorIcon"
        :class="errorIconClass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span
        ><slot name="error">{{ error }}</slot></span
      >
    </p>

    <div v-if="hasFoot" data-part="foot" :class="footClass">
      <span v-if="hasHelp" :id="helpId" data-part="help" :class="helpClass">
        <slot name="help">{{ help }}</slot>
      </span>
      <span v-if="counter" data-part="counter" :class="counterClass">
        {{ m.counter(count, counter.max) }}
      </span>
    </div>
  </div>
</template>
