<script setup lang="ts">
import { computed, provide, useSlots } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FORM_LAYOUT_KEY, FORM_SUBMITTING_KEY } from './context';
import type { FormLayoutProps, FormLayoutVariant } from './types';

const props = withDefaults(defineProps<FormLayoutProps>(), {
  layout: 'single',
  heading: undefined,
  ariaLabel: undefined,
  action: undefined,
  method: undefined,
  novalidate: true,
  submitting: false,
  classes: undefined,
});

const emit = defineEmits<{ submit: [event: SubmitEvent] }>();

const slots = useSlots();

const headingId = useUiId('form-heading');

/**
 * What the subtree reads (see `context.ts`): the layout name, so a `FieldWrapper`'s `full` spans
 * both columns only where there are two, and the submitting flag, so the submit Button goes busy
 * and every other action in the form goes disabled without the form reaching into them.
 */
provide(
  FORM_LAYOUT_KEY,
  computed(() => props.layout)
);
provide(
  FORM_SUBMITTING_KEY,
  computed(() => props.submitting)
);

/**
 * Spec "Form layout" → Accessibility: "A real `<form>` named by `aria-labelledby` its heading (or
 * `aria-label`, for the newsletter)". A visible heading always wins — naming the same form twice,
 * once visibly and once invisibly, is how an accessible name ends up disagreeing with what is on
 * the screen (2.5.3).
 */
const labelledBy = computed(() => (props.heading === undefined ? undefined : headingId.value));
const ariaLabelAttr = computed(() => (props.heading === undefined ? props.ariaLabel : undefined));

const hasActions = computed(() => slots.actions !== undefined);

/**
 * The form is a `@container` (spec "Form layout" → Sizes: the two-column breakpoint is "measured
 * on the containing block, so it works in narrow page-builder columns", and Accessibility:
 * "primary buttons 2.75rem below a 48rem container"). Every container query below — and the
 * `@max-tablet:target-touch` inside the Buttons of the actions row — measures this element.
 */
const ROOT_BASE = '@container w-full';

/**
 * Spec "Form layout" → Anatomy: "form (grid, 1rem row gap)". The inline form is the one exception:
 * a wrapping flex row that keeps the field and the button on one line until there is no room
 * ("inline form (flex, wraps, bottom-aligned)", 0.5rem gap).
 */
const ROOT: Record<FormLayoutVariant, string> = {
  single: 'grid gap-4',
  two: 'grid gap-4',
  // 0.5rem between the field and the button; 0.25rem between the control row and the help or
  // error row below it, which is the Field wrapper's own rhythm carried onto the form's row.
  inline: 'flex flex-wrap items-end gap-x-2 gap-y-1',
};

/**
 * Spec "Form layout" → Variants, Two-column: "pairs sit side by side from a 36rem container …
 * Below a 36rem container everything stacks in one column." `@two-col` is that 36rem breakpoint
 * (`src/styles/tailwind.css`), measured on the form, not the viewport.
 *
 * The inline row's field is the growing half: "the field grows, shrinks, basis 14rem", which is
 * also what makes the button wrap below it rather than squeezing the field under 14rem — that
 * basis lives on the `FieldWrapper`'s own group, because in the inline row the wrapper *is* the
 * row.
 */
const FIELDS: Record<FormLayoutVariant, string> = {
  single: 'grid gap-4',
  two: 'grid gap-4 @two-col:grid-cols-2',
  // `display: contents` in the inline row: the field's label-and-control group, its error and its
  // foot row become items of the form's own flex row, which is what lets the button sit level with
  // the control while the error takes a full-width row below both (see `FieldWrapper.vue`).
  inline: 'contents',
};

/**
 * Spec "Form layout" → Sizes and Variants, Actions row: "0.75rem gap, wraps, items centred,
 * 0.25rem extra top padding", the primary action last (at the end) on wide layouts, and on narrow
 * containers "the buttons are full width (Button `block`) and the primary is first (top)".
 *
 * `flex-col-reverse` is what puts the primary first without moving it in the DOM: the slot's
 * reading and tab order stays the spec's own (back link, secondary, primary), and only the narrow
 * container's visual order flips. `*:w-full` is the `block` button the spec asks for, applied from
 * the row so a caller does not have to set it per button for one breakpoint.
 */
const ACTIONS_BASE = 'flex flex-wrap items-center gap-3';
const ACTIONS: Record<FormLayoutVariant, string> = {
  single:
    'justify-end pt-1 @max-two-col:flex-col-reverse @max-two-col:items-stretch @max-two-col:gap-2 @max-two-col:*:w-full',
  two: 'justify-end pt-1 @max-two-col:flex-col-reverse @max-two-col:items-stretch @max-two-col:gap-2 @max-two-col:*:w-full',
  inline: 'shrink-0 gap-2',
};

/**
 * The inline row's two columns come from the field's own group (`flex: 1 1 14rem`) and the button,
 * so an inline form holds one field and one button, exactly as the spec's Variants table says.
 */

const rootClass = computed(() =>
  partClass(cx(ROOT_BASE, ROOT[props.layout]), props.classes, 'root')
);

/**
 * Spec "Form layout" → Anatomy: "Heading (optional): h4 style (1.125rem, 600)". `h4` names the
 * type style, not the outline level — the element is an `<h2>`, the level a form's own title takes
 * under a page's `<h1>`. In the inline row it is a full-width line above the field and the button.
 */
const headingClass = computed(() =>
  partClass(
    cx('text-h4 text-text', props.layout === 'inline' && 'basis-full'),
    props.classes,
    'heading'
  )
);

const fieldsClass = computed(() => partClass(FIELDS[props.layout], props.classes, 'fields'));

const actionsClass = computed(() =>
  partClass(cx(ACTIONS_BASE, ACTIONS[props.layout]), props.classes, 'actions')
);

/**
 * Spec "Form layout" → Events and Accessibility: `submit` fires with the native event, and the
 * default is deliberately not prevented — "The form still posts without scripting", so a form with
 * an `action` keeps working and a scripted one calls `preventDefault()` in its own handler.
 */
function onSubmit(event: Event): void {
  emit('submit', event as SubmitEvent);
}
</script>

<template>
  <form
    data-part="root"
    :class="rootClass"
    :action="action"
    :method="method"
    :novalidate="novalidate || undefined"
    :aria-labelledby="labelledBy"
    :aria-label="ariaLabelAttr"
    @submit="onSubmit"
  >
    <h2 v-if="heading !== undefined" :id="headingId" data-part="heading" :class="headingClass">
      {{ heading }}
    </h2>

    <div data-part="fields" :class="fieldsClass"><slot /></div>

    <div v-if="hasActions" data-part="actions" :class="actionsClass"><slot name="actions" /></div>
  </form>
</template>
