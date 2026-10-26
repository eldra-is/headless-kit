<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, type ComponentPublicInstance } from 'vue';
import { provideEldraUiMessages, useMessages } from '../../composables/useMessages';
import type { UiMessages } from '../../messages/en-US';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import Button from '../button/Button.vue';
import Checkbox from '../checkbox/Checkbox.vue';
import FieldError from '../field-wrapper/FieldError.vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import { focusInvalid } from '../form-layout/focusInvalid';
import FormLayout from '../form-layout/FormLayout.vue';
import type { FormLayoutSubmitPayload, FormLayoutVariant } from '../form-layout/types';
import Input from '../input/Input.vue';
import type { InputType } from '../input/types';
import Select from '../select/Select.vue';
import Textarea from '../textarea/Textarea.vue';
import { isBooleanField } from './localize';
import type {
  SiteFormFailure,
  SiteFormField,
  SiteFormProps,
  SiteFormSuccess,
  SiteFormValue,
} from './types';
import { useSiteForm } from './useSiteForm';

const props = withDefaults(defineProps<SiteFormProps>(), {
  definition: undefined,
  formKey: undefined,
  pagePath: undefined,
  layout: 'single',
  heading: undefined,
  headingLevel: 2,
  submitLabel: undefined,
  navigate: undefined,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  success: [success: SiteFormSuccess];
  error: [failure: SiteFormFailure];
}>();

defineSlots<{
  loading?(): unknown;
  failed?(): unknown;
  submit?(props: { label: string; submitting: boolean; describedBy: string | undefined }): unknown;
  success?(props: { pending: boolean; title: string; message: string; reset: () => void }): unknown;
}>();

const m = useMessages(() => props.messages);
const subtreeMessages = reactive({ ...m.value }) as UiMessages;
watch(m, (next) => Object.assign(subtreeMessages, next));
provideEldraUiMessages(subtreeMessages);

const site = useSiteForm({
  definition: () => props.definition,
  formKey: () => props.formKey,
  client: () => props.client,
  locale: () => props.locale,
  pagePath: () => props.pagePath,
  messages: () => props.messages,
});
const { form, status, values, errors, formErrors, honeypot, submitting, success } = site;
const setTurnstileRoot = (element: Element | ComponentPublicInstance | null): void => {
  site.turnstileRoot.value = element instanceof HTMLElement ? element : null;
};

const uid = useUiId('site-form');
const fieldId = (id: string): string => `${uid.value}-${id}`;
const errorId = (id: string): string => `${fieldId(id)}-error`;
const consentId = computed(() => `${uid.value}-consent`);

const isInlineRow = computed(() => {
  const fields = form.value?.fields ?? [];
  const only = fields[0];
  return (
    props.layout === 'inline' &&
    fields.length === 1 &&
    only !== undefined &&
    !isBooleanField(only) &&
    only.type !== 'textarea' &&
    only.type !== 'select'
  );
});
const layout = computed<FormLayoutVariant>(() =>
  props.layout === 'inline' ? (isInlineRow.value ? 'inline' : 'single') : props.layout
);

const INPUT_TYPE: Partial<Record<SiteFormField['type'], InputType>> = {
  email: 'email',
  phone: 'tel',
  url: 'url',
};
const INPUT_MODE: Partial<Record<SiteFormField['type'], string>> = {
  email: 'email',
  phone: 'tel',
  url: 'url',
  number: 'decimal',
};
const AUTOCOMPLETE_BY_ID: Record<string, string> = {
  name: 'name',
  email: 'email',
  phone: 'tel',
  tel: 'tel',
  company: 'organization',
};
const AUTOCOMPLETE_BY_TYPE: Partial<Record<SiteFormField['type'], string>> = {
  email: 'email',
  phone: 'tel',
  url: 'url',
};
const autocompleteFor = (field: SiteFormField): string | undefined =>
  AUTOCOMPLETE_BY_TYPE[field.type] ?? AUTOCOMPLETE_BY_ID[field.id.toLowerCase()];

const textOf = (id: string): string => {
  const value = values[id];
  return typeof value === 'string' ? value : '';
};
const setValue = (id: string, value: SiteFormValue | undefined): void =>
  site.setValue(id, value ?? '');

const submitText = computed(() => props.submitLabel ?? m.value.formSubmit);
const successTitle = computed(() =>
  success.value?.pending ? m.value.formPendingTitle : m.value.formSuccessTitle
);
const successMessage = computed(
  () => form.value?.successMessage || (success.value?.pending ? m.value.formPendingMessage : '')
);

const spansRow = computed(() =>
  cx(layout.value === 'two' && '@two-col:col-span-2', layout.value === 'inline' && 'basis-full')
);

const rootClass = computed(() => partClass('', props.classes, 'root'));
const noticeClass = computed(() => partClass('text-body-sm text-muted', props.classes, 'notice'));
const layoutClasses = computed(() => ({
  root: props.classes?.form,
  heading: props.classes?.heading,
  errorSummary: props.classes?.errorSummary,
  fields: props.classes?.fields,
  actions: props.classes?.actions,
}));
const fieldClasses = computed(() => ({
  root: props.classes?.field,
  label: props.classes?.label,
  requiredMark: props.classes?.requiredMark,
  optionalText: props.classes?.optionalText,
  error: props.classes?.error,
}));
const errorClasses = computed(() => ({ error: props.classes?.error }));
const controlClasses = computed(() => ({ control: props.classes?.control }));
const selectClasses = computed(() => ({ trigger: props.classes?.control }));
const checkboxClasses = computed(() => ({ root: props.classes?.checkbox }));
const booleanFieldClass = computed(() =>
  partClass(cx('grid gap-1', spansRow.value), props.classes, 'field')
);
const turnstileClass = computed(() =>
  partClass(cx(spansRow.value, layout.value === 'inline' && 'order-2'), props.classes, 'turnstile')
);
const consentClass = computed(() =>
  partClass(
    cx('text-body-sm text-muted', layout.value === 'inline' && 'order-3 basis-full'),
    props.classes,
    'consentText'
  )
);
const consentUnderButton = computed(
  () => Boolean(form.value?.consentText) && layout.value !== 'inline'
);
const submitClasses = computed(() => ({
  container: partClass(
    consentUnderButton.value ? '@two-col:justify-self-end' : '',
    props.classes,
    'submit'
  ),
}));
const successClass = computed(() =>
  partClass('grid gap-1 focus:outline-none', props.classes, 'success')
);
const successTitleClass = computed(() =>
  partClass('text-body text-text font-semibold', props.classes, 'successTitle')
);
const successMessageClass = computed(() =>
  partClass('text-body text-muted', props.classes, 'successMessage')
);

const successRoot = ref<HTMLElement | null>(null);

async function focusFirstInvalid(): Promise<void> {
  await nextTick();
  const first = (form.value?.fields ?? []).find((field) => errors[field.id]);
  const element = first ? document.getElementById(fieldId(first.id)) : null;
  if (element) focusInvalid(element);
}

async function onSubmit({ event }: FormLayoutSubmitPayload): Promise<void> {
  event.preventDefault();
  const outcome = await site.submit();
  if (outcome.kind === 'invalid') {
    await focusFirstInvalid();
    return;
  }
  if (outcome.kind === 'failed') {
    emit('error', outcome.failure);
    if (outcome.failure.reason === 'refused') await focusFirstInvalid();
    return;
  }
  if (outcome.kind !== 'success') return;
  emit('success', outcome.success);
  const redirect = outcome.success.redirect;
  if (redirect !== null) {
    if (redirect.startsWith('/') && props.navigate) props.navigate(redirect);
    else window.location.assign(redirect);
    return;
  }
  await nextTick();
  successRoot.value?.focus();
}

async function sendAnother(): Promise<void> {
  site.reset();
  await nextTick();
  const first = form.value?.fields[0];
  const element = first ? document.getElementById(fieldId(first.id)) : null;
  if (element) focusInvalid(element);
}
</script>

<template>
  <div data-eldra-ui data-part="root" :class="rootClass">
    <slot v-if="status === 'loading'" name="loading">
      <p data-part="notice" role="status" :class="noticeClass">{{ m.formLoading }}</p>
    </slot>

    <slot v-else-if="status === 'failed' || !form" name="failed">
      <p data-part="notice" role="alert" :class="noticeClass">{{ m.formLoadFailed }}</p>
    </slot>

    <div
      v-else-if="success"
      ref="successRoot"
      data-part="success"
      role="status"
      tabindex="-1"
      :class="successClass"
    >
      <slot
        name="success"
        :pending="success.pending"
        :title="successTitle"
        :message="successMessage"
        :reset="sendAnother"
      >
        <p data-part="successTitle" :class="successTitleClass">{{ successTitle }}</p>
        <p v-if="successMessage" data-part="successMessage" :class="successMessageClass">
          {{ successMessage }}
        </p>
      </slot>
    </div>

    <FormLayout
      v-else
      :layout="layout"
      :heading="heading"
      :heading-level="headingLevel"
      :aria-label="heading ? undefined : form.name"
      :submitting="submitting"
      :classes="layoutClasses"
      @submit="onSubmit"
    >
      <template v-if="formErrors.length > 0" #errorSummary>
        <p v-for="(message, index) in formErrors" :key="index" class="m-0">{{ message }}</p>
      </template>

      <template v-for="field in form.fields" :key="field.id">
        <div v-if="isBooleanField(field)" data-part="field" :class="booleanFieldClass">
          <Checkbox
            :id="fieldId(field.id)"
            :model-value="values[field.id] === true"
            :name="field.id"
            :required="field.required"
            :invalid="Boolean(errors[field.id])"
            :described-by="errors[field.id] ? errorId(field.id) : undefined"
            :classes="checkboxClasses"
            @update:model-value="setValue(field.id, $event)"
          >
            {{ field.label }}
          </Checkbox>
          <FieldError v-if="errors[field.id]" :id="errorId(field.id)" :classes="errorClasses">
            {{ errors[field.id] }}
          </FieldError>
        </div>

        <FieldWrapper
          v-else
          :id="fieldId(field.id)"
          :label="field.label"
          :required="field.required"
          :optional="!field.required && form.fields.length > 1"
          :full="field.type === 'textarea'"
          :error="errors[field.id]"
          :classes="fieldClasses"
        >
          <Textarea
            v-if="field.type === 'textarea'"
            :model-value="textOf(field.id)"
            :name="field.id"
            :placeholder="field.placeholder"
            :classes="controlClasses"
            @update:model-value="setValue(field.id, $event)"
          />
          <Select
            v-else-if="field.type === 'select'"
            :model-value="textOf(field.id)"
            :name="field.id"
            :options="field.options ?? []"
            :placeholder="field.placeholder"
            :clearable="!field.required"
            :classes="selectClasses"
            @update:model-value="setValue(field.id, $event)"
          />
          <Input
            v-else
            :model-value="textOf(field.id)"
            :type="INPUT_TYPE[field.type] ?? 'text'"
            :inputmode="INPUT_MODE[field.type]"
            :autocomplete="autocompleteFor(field)"
            :name="field.id"
            :placeholder="field.placeholder"
            :classes="controlClasses"
            @update:model-value="setValue(field.id, $event)"
          />
        </FieldWrapper>
      </template>

      <!-- The honeypot: hidden from people and assistive technology, filled only by a bot. -->
      <div v-if="form.honeypotField" class="sr-only" aria-hidden="true" inert>
        <input
          v-model="honeypot"
          type="text"
          :name="form.honeypotField"
          tabindex="-1"
          autocomplete="off"
        />
      </div>

      <div
        v-if="form.turnstileSiteKey"
        :ref="setTurnstileRoot"
        data-part="turnstile"
        :class="turnstileClass"
      />

      <p
        v-if="form.consentText && layout === 'inline'"
        :id="consentId"
        data-part="consentText"
        :class="consentClass"
      >
        {{ form.consentText }}
      </p>

      <template #actions>
        <div v-if="consentUnderButton" class="grid w-full gap-2">
          <slot name="submit" :label="submitText" :submitting="submitting" :describedBy="consentId">
            <Button
              type="submit"
              variant="primary"
              :label="m.formSubmitting"
              :aria-describedby="consentId"
              :classes="submitClasses"
            >
              {{ submitText }}
            </Button>
          </slot>
          <p :id="consentId" data-part="consentText" :class="consentClass">
            {{ form.consentText }}
          </p>
        </div>
        <slot
          v-else
          name="submit"
          :label="submitText"
          :submitting="submitting"
          :describedBy="form.consentText ? consentId : undefined"
        >
          <Button
            type="submit"
            variant="primary"
            :label="m.formSubmitting"
            :aria-describedby="form.consentText ? consentId : undefined"
            :classes="submitClasses"
          >
            {{ submitText }}
          </Button>
        </slot>
      </template>
    </FormLayout>
  </div>
</template>
