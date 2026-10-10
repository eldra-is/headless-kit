<script setup lang="ts">
import { computed, provide, useSlots } from 'vue';
import { useHeadingTag } from '../../composables/useHeadingTag';
import { useSlotPresence } from '../../composables/useSlotPresence';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import { FORM_LAYOUT_KEY, FORM_SUBMITTING_KEY } from './context';
import { focusInvalid } from './focusInvalid';
import type { FormLayoutProps, FormLayoutSubmitPayload, FormLayoutVariant } from './types';

const props = withDefaults(defineProps<FormLayoutProps>(), {
  layout: 'single',
  heading: undefined,
  headingLevel: 2,
  ariaLabel: undefined,
  action: undefined,
  method: undefined,
  novalidate: true,
  focusOnInvalid: true,
  submitting: false,
  statusMessage: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  submit: [payload: FormLayoutSubmitPayload];
  invalid: [ids: string[]];
}>();

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

/**
 * Slots are not reactive, so these two cannot be a plain `computed` over `slots` — a form that
 * grows an error summary after a failed submit, or an actions row behind a `v-if`, would render
 * the state it had at setup for the rest of its life. `useSlotPresence` is the shared fix.
 */
const present = useSlotPresence(slots, ['actions', 'errorSummary'] as const);
const hasActions = computed(() => present.value.actions);
const hasErrorSummary = computed(() => present.value.errorSummary);

/**
 * The form is a `@container` (spec "Form layout" → Sizes: the two-column breakpoint is "measured
 * on the containing block, so it works in narrow page-builder columns"). Every container query
 * below measures this element. The spec's Accessibility note also grows primary buttons to 2.75rem
 * below a 48rem container; the operator override recorded under Deviations in the README keeps
 * every Button on the shared control-height scale instead, so nothing inside this form measures
 * this container for that purpose any more.
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
 * "A tertiary back link … comes first and the row uses space-between." A row that is
 * `justify-between` outright would strand a lone secondary button at the start, so the row ends
 * its content and the back link — the spec's own tertiary, a standalone `Link`, which is the only
 * `<a>` the row holds — pushes itself away with an auto margin. That is space-between when there
 * is a back link and end-alignment when there is not, with nothing for the caller to remember.
 *
 * `flex-col-reverse` is what puts the primary first without moving it in the DOM: the slot's
 * reading and tab order stays the spec's own (back link, secondary, primary), and only the narrow
 * container's visual order flips. `*:w-full` is the `block` button the spec asks for, applied from
 * the row so a caller does not have to set it per button for one breakpoint.
 */
const ACTIONS_BASE = 'flex flex-wrap items-center gap-3 [&>a:first-child]:me-auto';
const ACTIONS_STACKED =
  '@max-two-col:flex-col-reverse @max-two-col:items-stretch @max-two-col:gap-2 @max-two-col:*:w-full';
const ACTIONS: Record<FormLayoutVariant, string> = {
  single: `justify-end pt-1 ${ACTIONS_STACKED}`,
  two: `justify-end pt-1 ${ACTIONS_STACKED}`,
  inline: 'shrink-0 gap-2',
};

const rootClass = computed(() =>
  partClass(cx(ROOT_BASE, ROOT[props.layout]), props.classes, 'root')
);

/**
 * Spec "Form layout" → Anatomy: "Heading (optional): h4 style (1.125rem, 600)". `h4` names the
 * type style, not the outline level — `headingLevel` picks the element, defaulting to the `<h2>` a
 * form's own title takes under a page's `<h1>`. In the inline row it is a full-width line above
 * the field and the button.
 */
const headingTag = useHeadingTag(() => props.headingLevel);
const headingClass = computed(() =>
  partClass(
    cx('text-h4 text-text', props.layout === 'inline' && 'basis-full'),
    props.classes,
    'heading'
  )
);

/**
 * Spec "Form layout" → States, Invalid on submit: "Long forms add an error summary alert at the
 * top (`surface` fill, 1px `danger` border, `danger` icon) that lists a link to each error." The
 * component draws the box and the icon; the slot supplies the list, because only the caller knows
 * which fields failed and what to link to.
 */
const errorSummaryClass = computed(() =>
  partClass(
    'text-body-sm text-text border-danger bg-surface flex items-start gap-2 ' +
      'rounded-[var(--eldra-form-summary-radius,var(--eldra-radius-md))] border p-3',
    props.classes,
    'errorSummary'
  )
);

const fieldsClass = computed(() => partClass(FIELDS[props.layout], props.classes, 'fields'));

const actionsClass = computed(() =>
  partClass(cx(ACTIONS_BASE, ACTIONS[props.layout]), props.classes, 'actions')
);

/** Never visible; `classes.status` is here so a consumer can unhide it while debugging. */
const statusClass = computed(() => partClass('', props.classes, 'status'));

/**
 * Spec "Form layout" → Events and States, Invalid on submit.
 *
 * The form asks the DOM which fields are invalid rather than keeping a register of its own: every
 * control in this package mirrors its field's error as `aria-invalid="true"`, so the query is both
 * the accessibility state and the validity state, and they cannot drift apart. With any invalid
 * field the submit is stopped, focus moves to the first one, and `invalid` fires with their ids —
 * which is what an error summary links to.
 *
 * With none, `submit` fires with the native event and the form's own `FormData`, and the default
 * is deliberately *not* prevented: "The form still posts without scripting", so a form with an
 * `action` keeps working and a scripted one calls `preventDefault()` in its own handler.
 */
function onSubmit(event: Event): void {
  const form = event.currentTarget as HTMLFormElement;
  const invalid = [...form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')];

  if (invalid.length > 0) {
    event.preventDefault();
    const first = invalid[0];
    // Skipped when something above the form owns the focus move (see `focusOnInvalid`); the
    // `invalid` event still fires, because that is how an error summary learns what failed.
    if (first && props.focusOnInvalid) focusInvalid(first);
    emit(
      'invalid',
      invalid.map((element) => element.id).filter((id) => id.length > 0)
    );
    return;
  }

  // The submitter is passed to `FormData` so a named submit button contributes its own
  // name/value pair — which is how a form with "Save draft" and "Publish" tells them apart, and
  // what a plain `new FormData(form)` silently drops.
  const submitEvent = event as SubmitEvent;
  emit('submit', { event: submitEvent, data: new FormData(form, submitEvent.submitter) });
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
    <component
      :is="headingTag"
      v-if="heading !== undefined"
      :id="headingId"
      data-part="heading"
      :class="headingClass"
    >
      {{ heading }}
    </component>

    <div v-if="hasErrorSummary" data-part="errorSummary" :class="errorSummaryClass" role="alert">
      <!-- Tabler's `alert-circle`, stroke 1.75, at 1.25rem. Decorative: the list is the message. -->
      <svg
        class="text-danger mt-0.5 size-5 shrink-0"
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
      <div class="min-w-0"><slot name="errorSummary" /></div>
    </div>

    <div data-part="fields" :class="fieldsClass"><slot /></div>

    <div v-if="hasActions" data-part="actions" :class="actionsClass"><slot name="actions" /></div>

    <!-- Spec "Form layout" → States, Success: "announce it in a polite live region". Always in the
         DOM so a message set later is announced; empty until there is something to say. -->
    <VisuallyHidden
      as="p"
      data-part="status"
      role="status"
      aria-live="polite"
      :classes="{ root: statusClass }"
      >{{ statusMessage }}</VisuallyHidden
    >
  </form>
</template>
