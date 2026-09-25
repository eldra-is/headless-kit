<script setup lang="ts">
import { computed, h, inject, provide, useSlots, type FunctionalComponent } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { useSlotPresence } from '../../composables/useSlotPresence';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FORM_LAYOUT_KEY } from '../form-layout/context';
import { FIELD_KEY, type FieldContext } from './context';
import FieldError from './FieldError.vue';
import type { FieldWrapperProps } from './types';

const props = withDefaults(defineProps<FieldWrapperProps>(), {
  id: undefined,
  required: false,
  optional: false,
  help: undefined,
  error: undefined,
  counter: undefined,
  group: false,
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
const counterId = computed(() => `${controlId.value}-counter`);

/** Slots are not reactive; see `useSlotPresence` for the defect this avoids. */
const slotContent = useSlotPresence(slots, ['error', 'help'] as const);

/**
 * A slot counts as content: `<template #error>` is a richer way of writing the `error` prop (a
 * message with a link in it, say), not a different feature, so it makes the field invalid and
 * gets linked exactly as the prop does.
 */
const hasError = computed(() => Boolean(props.error) || slotContent.value.error);
const hasHelp = computed(() => Boolean(props.help) || slotContent.value.help);
const hasCounter = computed(() => props.counter !== undefined);
const hasFoot = computed(() => hasHelp.value || hasCounter.value);

/**
 * Spec "Field wrapper" → Accessibility: `aria-describedby="<error-id> <help-id> <counter-id>"` —
 * "the error comes first and is announced on focus". Only ids that actually render go in, so a
 * field with no help never points at an element that is not there.
 */
const describedBy = computed(() => {
  const ids = [
    hasError.value ? errorId.value : undefined,
    hasHelp.value ? helpId.value : undefined,
    hasCounter.value ? counterId.value : undefined,
  ].filter((id): id is string => id !== undefined);
  return ids.length > 0 ? ids.join(' ') : undefined;
});

/**
 * What the control inside reads (see `context.ts`). A `ComputedRef`, so a control that mounted
 * while the field was valid still sees `invalid` the moment an error arrives.
 *
 * A group provides it too: the `<fieldset>` is described by the same ids, and a future
 * `CheckboxGroup` or `RadioGroup` reads `id` and `required` from here the way `Input` does.
 */
const context = computed<FieldContext>(() => ({
  id: controlId.value,
  labelId: labelId.value,
  describedBy: describedBy.value,
  invalid: hasError.value,
  required: props.required,
  // A `group` is a `<fieldset>` named by its `<legend>`: there is no `<label for>`, so a control
  // that draws its own label keeps it, and nothing inside should claim the id the fieldset holds.
  labelsControl: !props.group,
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
 * Field wrapper section draws it. A `group` fieldset never flattens: it is a set of controls, not
 * the one field an inline row holds.
 */
const isInline = computed(() => layout?.value === 'inline' && !props.group);

/** Spec "Field wrapper" → Properties: a counter with no `value` is an empty field, so "0 / max". */
const count = computed(() => props.counter?.value ?? 0);
const isOverLimit = computed(() => props.counter !== undefined && count.value > props.counter.max);

/**
 * One root, two shapes. A `group` is a `<fieldset>` named by its `<legend>` and described as a
 * whole: there is no single control for a `<label for>` to point at, so `aria-describedby` and
 * `aria-invalid` sit on the fieldset itself. Everything inside is identical either way, which is
 * why the template branches on the tag rather than duplicating itself — and why the root stays a
 * single node, as `@vue/test-utils` and every `classes` override expect.
 *
 * The vertical rhythm (spec "Field wrapper" → Sizes, "Vertical rhythm"): "Grid with a 0.25rem gap:
 * label → control 0.375rem (gap + label margin), control → help/error 0.25rem." So the gap is the
 * whole rhythm and the label's own 0.125rem bottom margin is what makes its row the wider one.
 *
 * `content-start` is what keeps that true inside a form. A grid item stretches to its row, so in a
 * two-column layout the shorter of a pair used to have its own rows stretched to match the taller
 * one — the gap grew from 0.375rem to whatever the row needed, and the two controls stopped lining
 * up. Packing the rows to the start leaves the rhythm fixed and lets the extra height fall below
 * the field, where it belongs.
 *
 * The fieldset variant is the spec's own separate geometry: "no border, padding or min-width, grid
 * with a 0.75rem (`space-3`) gap, and the legend has a 0.5rem (`space-2`) bottom margin."
 *
 * A `group` fieldset also carries `tabindex="-1"`. It is the one part of a field that an error
 * summary can link to — a group has no single control, so `#<id>` points at the fieldset itself —
 * and a browser moves focus to a fragment's target only when that target can take focus. `-1`
 * keeps it out of the tab order while making the link actually land on the question it names.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'grid content-start gap-1',
      props.group && 'min-w-0 gap-3 rounded-none border-0 p-0',
      isInline.value && 'contents',
      spansBothColumns.value && '@two-col:col-span-2'
    ),
    props.classes,
    'root'
  )
);

/**
 * The label-and-control group: one box holding the two of them, and **only** where that box has a
 * job to do.
 *
 * In an inline row it is the growing flex item (see `isInline` above). Everywhere else the label
 * and the control are simply the first two rows of the wrapper's own grid — and in the `group`
 * fieldset a box around them is not merely redundant but wrong: HTML names a `<fieldset>` by its
 * first `<legend>` **child**, so a `<div>` in between leaves the fieldset with no accessible name
 * at all, whatever the CSS says (`display: contents` does not change whose child an element is).
 * That is a defect no screenshot shows and axe's own descendant lookup hides.
 *
 * So the box renders only in an inline row, and the label and the control stay written once — a
 * duplicated `v-if`/`v-else` pair of the same two elements is exactly the kind of thing that drifts
 * apart later. It carries no `data-part`, because it is not one of the spec's parts.
 */
const GROUP_INLINE = 'grid min-w-0 flex-[1_1_14rem] content-start gap-1';
const LabelAndControl: FunctionalComponent = (_props, { slots: own }) =>
  isInline.value ? h('div', { class: GROUP_INLINE }, own.default?.()) : (own.default?.() ?? []);

/** In an inline row the error and the foot take a full-width row of their own, below the button. */
const INLINE_ROW = 'order-1 w-full basis-full';

/**
 * Spec "Field wrapper" → States: the label is `text` in every state, including error — "Don't turn
 * the label red on error. The border and message are enough, and red labels read as 'required'."
 * `w-fit` keeps the click target on the words rather than the whole grid row.
 *
 * The legend is the same type style with the fieldset variant's own 0.5rem bottom margin, and with
 * the `padding-inline` a `<legend>` carries by default removed.
 */
const LABEL_TYPE = 'text-label text-text block w-fit';
const labelClass = computed(() => partClass(cx(LABEL_TYPE, 'mb-0.5'), props.classes, 'label'));
const legendClass = computed(() => partClass(cx(LABEL_TYPE, 'mb-2 p-0'), props.classes, 'legend'));

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
  <component
    :is="group ? 'fieldset' : 'div'"
    :id="group ? controlId : undefined"
    data-part="root"
    :class="rootClass"
    :tabindex="group ? -1 : undefined"
    :aria-describedby="group ? describedBy : undefined"
    :aria-invalid="group && hasError ? 'true' : undefined"
  >
    <LabelAndControl>
      <component
        :is="group ? 'legend' : 'label'"
        :id="labelId"
        :for="group ? undefined : controlId"
        :data-part="group ? 'legend' : 'label'"
        :class="group ? legendClass : labelClass"
      >
        <slot name="label">{{ label }}</slot>
        <!-- The asterisk is decorative: the control's native `required` is what announces it. -->
        <span v-if="required" data-part="requiredMark" :class="requiredMarkClass" aria-hidden="true"
          >*</span
        >
        <span v-else-if="optional" data-part="optionalText" :class="optionalTextClass"
          >({{ m.optional }})</span
        >
      </component>

      <div data-part="control" :class="controlClass"><slot /></div>
    </LabelAndControl>

    <!-- The error row is `FieldError`, shared with `CheckboxGroup`: the `error` and `errorIcon`
         parts, and their `classes` keys, are still this wrapper's. -->
    <FieldError
      v-if="hasError"
      :id="errorId"
      :row-class="isInline ? INLINE_ROW : undefined"
      :classes="classes"
      ><slot name="error">{{ error }}</slot></FieldError
    >

    <div v-if="hasFoot" data-part="foot" :class="footClass">
      <span v-if="hasHelp" :id="helpId" data-part="help" :class="helpClass">
        <slot name="help">{{ help }}</slot>
      </span>
      <span v-if="counter" :id="counterId" data-part="counter" :class="counterClass">
        {{ m.counter(count, counter.max) }}
      </span>
    </div>
  </component>
</template>
