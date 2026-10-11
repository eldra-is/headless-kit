<script setup lang="ts">
import { useForm, type SubmissionContext } from 'vee-validate';
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import FormLayout from '../components/form-layout/FormLayout.vue';
import { focusInvalid } from '../components/form-layout/focusInvalid';
import type { FormLayoutSubmitPayload } from '../components/form-layout/types';
import { useMessages } from '../composables/useMessages';
import { API_ERRORS_KEY, FIELD_ANCHORS_KEY } from './context';
import type { FormProps, FormSlotProps, FormValues } from './types';
import { useControlProps } from './useFieldControl';

/**
 * `FormLayout` with a vee-validate form behind it.
 *
 * It renders a `FormLayout` and nothing else — every one of its props passes straight through — so
 * the layout, the heading, the actions row, the container-query two-column grid and the polite
 * status region are the same ones the agnostic component ships. What this adds is the form itself:
 * `useForm`, the submit that only reaches the consumer with valid values, the error summary the
 * spec asks a long form for, and the place a server's field errors attach to.
 */
const props = defineProps<FormProps>();

const emit = defineEmits<{
  /** The form validated. Carries the values and vee-validate's own submission context. */
  submit: [values: FormValues, ctx: SubmissionContext<FormValues>];
  /** The form did not validate. Carries the messages, keyed by field path. Focus has moved. */
  invalid: [errors: Record<string, string | undefined>];
}>();

defineSlots<{
  /** The fields. */
  default: (props: FormSlotProps) => unknown;
  /** The actions row, exactly as `FormLayout`'s. */
  actions?: (props: FormSlotProps) => unknown;
  /** Replaces the default list inside the summary alert. The alert itself is still drawn for you. */
  errorSummary?: (props: FormSlotProps) => unknown;
}>();

const m = useMessages();

const form = useForm<FormValues>({
  initialValues: props.initialValues,
  validationSchema: computed(() => props.validationSchema),
});
const { errors, values, meta, isSubmitting, submitCount, handleSubmit, setErrors, setFieldError } =
  form;

/**
 * The server's field errors. Held in a ref of this form's own rather than read straight from the
 * prop, because a `Field*` drops its own entry the moment its value changes (see `context.ts`) —
 * and a prop is not the field's to write to.
 */
const apiErrors = ref<Record<string, string>>({ ...props.apiErrors });
provide(API_ERRORS_KEY, apiErrors);

/**
 * The errors that should currently be **shown**, which is not the same set as the errors that
 * exist. vee-validate revalidates on every keystroke, so a field knows its message long before the
 * customer is done typing; the spec's rule (Form layout → Behaviour & motion) is to validate on
 * submit and then on blur, so a message surfaces once its field has been touched or the form has
 * been submitted. Each `Field*` applies the same gate to its own `invalid` state, so what a
 * `FieldWrapper` shows and what the control marks itself as cannot disagree.
 */
const visibleErrors = computed<Record<string, string>>(() => {
  const shown: Record<string, string> = {};
  for (const [path, message] of Object.entries(errors.value)) {
    if (message === undefined) continue;
    if (submitCount.value > 0 || form.isFieldTouched(path) || path in apiErrors.value) {
      shown[path] = message;
    }
  }
  return shown;
});

/**
 * Where the summary's links point. Only a `Field*` can resolve its control's id — it may be the one
 * a `FieldWrapper` generated and tied its `<label for>` to — so each one registers it here rather
 * than the form hunting through the DOM for it.
 */
const anchors = ref<Record<string, string>>({});
provide(FIELD_ANCHORS_KEY, {
  register(name: string, id: string | undefined) {
    if (id === undefined) delete anchors.value[name];
    else anchors.value[name] = id;
  },
  unregister(name: string) {
    delete anchors.value[name];
  },
});

interface SummaryEntry {
  name: string;
  message: string;
  href?: string;
}

const summary = computed<SummaryEntry[]>(() =>
  Object.entries(visibleErrors.value).map(([name, message]) => {
    const id = anchors.value[name];
    return { name, message, href: id === undefined ? undefined : `#${id}` };
  })
);

/**
 * Spec "Form layout" → States, Invalid on submit: "Long forms add an error summary alert at the
 * top … that lists a link to each error". After a submit, and only then — before the first attempt
 * an alert listing everything still to fill in is noise, not help.
 */
const showSummary = computed(() => submitCount.value > 0 && summary.value.length > 0);

watch(
  () => props.apiErrors,
  (next) => {
    apiErrors.value = { ...next };
  },
  { deep: true }
);

/** The paths currently carrying a server error, so one that goes away is actually unset. */
let applied: string[] = [];

function applyApiErrors(next: Record<string, string>): void {
  for (const path of applied) if (!(path in next)) setFieldError(path, undefined);
  if (Object.keys(next).length > 0) setErrors(next);
  applied = Object.keys(next);
}

/**
 * On mount, not immediately: `setFieldError` on a path no field has registered yet does nothing,
 * and a `Form`'s own `setup()` runs before its fields exist. A parent's `onMounted` runs after
 * every child's, which is exactly when the fields are there to receive them.
 */
onMounted(() => applyApiErrors(apiErrors.value));
watch(() => ({ ...apiErrors.value }), applyApiErrors);

/** A new attempt makes the last response stale: its errors describe values that are being resent. */
function clearApiErrors(): void {
  const previous = applied;
  applied = [];
  apiErrors.value = {};
  for (const path of previous) setFieldError(path, undefined);
}

const layout = ref<InstanceType<typeof FormLayout> | null>(null);

/**
 * Focus the first invalid field after vee-validate has rejected a submit.
 *
 * `FormLayout` can do this itself, but it can only refuse what the DOM already says is invalid —
 * and on the **first** attempt nothing is marked yet, because no field has been touched. So this
 * form owns the move, over the same `[aria-invalid="true"]` query and the same `focusInvalid`,
 * falling back to the first summary anchor for a control with no invalid state of its own (a
 * `Switch`, a `VariantPicker`). The layout's own move is turned off (`:focus-on-invalid="false"`),
 * so a refused submit moves focus once rather than to one element and then to another.
 */
function focusFirstInvalid(): void {
  const root = layout.value?.$el;
  if (!(root instanceof HTMLElement)) return;
  const marked = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (marked !== null) {
    focusInvalid(marked);
    return;
  }
  const first = summary.value.find((entry) => entry.href !== undefined);
  if (first?.href === undefined) return;
  const target = root.ownerDocument.getElementById(first.href.slice(1));
  if (target !== null) focusInvalid(target);
}

/** Set by a submit that validated, and cleared by the next attempt. Drives `successMessage`. */
const submitted = ref(false);

const runSubmit = handleSubmit(
  (submitValues, ctx) => {
    submitted.value = true;
    emit('submit', submitValues, ctx);
  },
  ({ errors: failed }) => {
    emit('invalid', failed);
    void nextTick(focusFirstInvalid);
  }
);

/**
 * `FormLayout` emits `submit` when the DOM holds no invalid field and `invalid` when it does, and
 * both mean the same thing here: run the form's own validation. Taking only `submit` would leave a
 * form whose first touched field is already invalid unable to validate the *rest* of itself — the
 * layout would stop the submit, `submitCount` would never rise, and the untouched fields would
 * keep their messages to themselves.
 *
 * vee-validate's `handleSubmit` calls `preventDefault()` on the event it is given, so the form does
 * not also post; without an event (the `invalid` path, which the layout has already prevented)
 * there is nothing to prevent.
 */
function onLayoutSubmit(payload: FormLayoutSubmitPayload): void {
  submitted.value = false;
  clearApiErrors();
  void runSubmit(payload.event);
}

function onLayoutInvalid(): void {
  submitted.value = false;
  clearApiErrors();
  void runSubmit();
}

/**
 * Spec "Form layout" → States, Success: "announce it in a polite live region". `FormLayout`'s
 * status region is never visible, so this is the announcement and nothing more — replacing the form
 * with a confirmation, or navigating, stays the page's job. An explicit `statusMessage` wins, which
 * is how a consumer announces the *server's* answer rather than the submit.
 */
const statusMessage = computed(
  () => props.statusMessage ?? (submitted.value ? props.successMessage : undefined)
);

/** `submitting` is the form's own state or the consumer's, whichever is true. */
const submitting = computed(() => props.submitting === true || isSubmitting.value);

const layoutProps = useControlProps(props, [
  'initialValues',
  'validationSchema',
  'apiErrors',
  'successMessage',
  'statusMessage',
  'submitting',
] as const);

const slotProps = computed<FormSlotProps>(() => ({
  errors: visibleErrors.value,
  values,
  meta: meta.value,
  isSubmitting: isSubmitting.value,
  submitCount: submitCount.value,
}));

/** The vee-validate form context, for a consumer that needs `resetForm`, `setErrors` or `values`. */
defineExpose({ form });

/** The summary's own type, kept off the error box's `text-body-sm` body copy. */
const SUMMARY_TITLE = 'font-semibold';
const SUMMARY_LIST = 'mt-1 list-disc ps-4';
const SUMMARY_LINK = 'underline';
</script>

<template>
  <FormLayout
    ref="layout"
    v-bind="layoutProps"
    :submitting="submitting"
    :status-message="statusMessage"
    :focus-on-invalid="false"
    @submit="onLayoutSubmit"
    @invalid="onLayoutInvalid"
  >
    <template v-if="showSummary" #errorSummary>
      <slot name="errorSummary" v-bind="slotProps">
        <p :class="SUMMARY_TITLE">{{ m.formErrors(summary.length) }}</p>
        <ul :class="SUMMARY_LIST">
          <li v-for="entry in summary" :key="entry.name">
            <a v-if="entry.href !== undefined" :href="entry.href" :class="SUMMARY_LINK">{{
              entry.message
            }}</a>
            <template v-else>{{ entry.message }}</template>
          </li>
        </ul>
      </slot>
    </template>

    <slot v-bind="slotProps" />

    <template v-if="$slots.actions" #actions><slot name="actions" v-bind="slotProps" /></template>
  </FormLayout>
</template>
