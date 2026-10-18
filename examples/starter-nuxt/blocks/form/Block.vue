<script setup lang="ts">
/**
 * A form from the platform's Forms page, rendered from its definition: the fields, their labels in
 * the page's locale, which are required, the spam protection and what a visitor is told afterwards
 * are all the merchant's (Studio, `GET /site/v1/forms/{key}`), so one block serves a contact form,
 * a newsletter sign-up or any form a merchant builds. This block owns only the copy around the
 * form — heading, text, button label, consent line — and the look. `preset`:
 *  - `default`: the fields stacked in a two-column `FormLayout` (long fields and checkboxes span
 *    both columns), the button in the actions row.
 *  - `inline`: one field and the button on one row, centred under the copy — a sign-up. A form of
 *    several fields falls back to the stacked layout rather than squeezing them into one row.
 *
 * **Errors are field-keyed.** A failed local check (required, shape, length) and a `422` from the
 * platform land in the same place — under the field they name, as `FieldWrapper`'s `error` — and
 * focus moves to the first invalid control. Messages about the form as a whole (the `422`'s `form`
 * list, a rate limit, the service being down) go in the form's error summary, a `role="alert"`
 * region above the fields. Nothing reaches the platform from a form that fails its own checks, but
 * the platform decides: its messages are shown verbatim and win over the local ones.
 *
 * **Spam.** The definition names a honeypot field: it is rendered off-screen and inert (a person
 * never reaches it) and its value is sent as `hp`. When the merchant enabled Cloudflare Turnstile
 * the widget is rendered under the fields (`useTurnstile`) and the token sent with the submission;
 * a form on a site without it loads nothing third-party.
 *
 * **Success** replaces the form with a `role="status"` panel that takes focus (the submit button
 * that held it is gone), the merchant's confirmation text under a title. A form that subscribes the
 * visitor answers `pending: true` — a confirmation email is on its way — and the title says so. A
 * merchant-set redirect sends the visitor on instead, outside the editor.
 *
 * **`FormLayout`'s own gate.** It refuses to emit `submit` while any control is `aria-invalid`, so
 * an error clears itself the moment its field changes, and a server failure that marks no field
 * (every `form`-level message) never blocks the visitor's retry.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  Button,
  Checkbox,
  Container,
  EditorPlaceholder,
  FieldWrapper,
  FormLayout,
  Input,
  Section,
  Select,
  Textarea,
  type FormLayoutSubmitPayload,
  type SectionBackground,
} from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useStorefront } from '../../app/composables/useStorefront';
import { useTurnstile } from '../../app/composables/useTurnstile';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import FormHoneypot from '../../app/components/FormHoneypot.vue';
import { safeHref } from '../../app/utils/links';
import type { StorefrontFormField, StorefrontFormSubmitResult } from '../../app/storefront/types';
import { validateField } from './validate';

const props = defineProps<{ entry: EldraBlockEntry<'form'> }>();
const { data, entryId } = useBlockData(props, 'form');
const { t } = useI18n();
const isEditing = useEditing();
const storefront = useStorefront();

const uid = useUiId();
const headingId = `form-heading-${uid}`;
const fieldId = (id: string): string => `form-${uid}-${id}`;
const fieldErrorId = (id: string): string => `form-${uid}-${id}-error`;

const variant = computed<'default' | 'inline'>(() =>
  data.value.preset === 'inline' ? 'inline' : 'default'
);
const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');
const isInverted = computed(
  () => sectionBackground.value === 'primary' || sectionBackground.value === 'accent'
);

const formKey = computed(() => (data.value.formKey ?? '').trim());
const heading = computed(() => (data.value.heading ?? '').trim());
const text = computed(() => (data.value.text ?? '').trim());
const buttonLabelText = computed(() => data.value.buttonLabel || t('form.submit'));
const hasConsent = computed(
  () => Array.isArray(data.value.consent?.content) && data.value.consent.content.length > 0
);
const showHeadingHint = computed(() => isEditing.value && heading.value === '');
const showFormHint = computed(() => isEditing.value && formKey.value === '');

const definition = storefront.forms.definition(formKey);
const form = computed(() => definition.data.value);

/** Spec "On primary / accent": text on the section switches to the contrast colour. */
const contrastTextClass = computed<string | undefined>(() => {
  if (sectionBackground.value === 'primary') return 'text-primary-contrast';
  if (sectionBackground.value === 'accent') return 'text-accent-contrast';
  return undefined;
});
const mutedToneClass = computed(() => {
  if (sectionBackground.value === 'primary') return 'text-primary-contrast/90';
  if (sectionBackground.value === 'accent') return 'text-accent-contrast/90';
  return 'text-muted';
});
/**
 * The platform's consent sentence of a subscribing form (`{shop}` already filled in). Plain text,
 * rendered as an escaped interpolation, never as HTML, and tied to the submit button with
 * `aria-describedby`: pressing it is the consent, so a screen reader hears the wording with it.
 */
const consentSentence = computed(() => (form.value?.consentText ?? '').trim());
const consentSentenceId = `form-consent-sentence-${uid}`;
const consentSentenceToneClass = computed(() =>
  sectionBackground.value === 'primary'
    ? 'text-primary-contrast/90'
    : sectionBackground.value === 'accent'
      ? 'text-accent-contrast/90'
      : 'text-muted'
);
const consentToneClass = computed(() => {
  if (sectionBackground.value === 'primary') {
    return 'text-primary-contrast/90 [&_a]:text-primary-contrast';
  }
  if (sectionBackground.value === 'accent') {
    return 'text-accent-contrast/90 [&_a]:text-accent-contrast';
  }
  return 'text-muted [&_a]:text-muted';
});
const errorChipClass = computed<string | undefined>(() =>
  isInverted.value ? 'w-fit rounded-sm bg-background px-2 py-1' : undefined
);
const fieldWrapperClasses = computed(() => ({
  label: contrastTextClass.value,
  error: errorChipClass.value,
}));
const checkboxClasses = computed(() => ({ label: contrastTextClass.value }));

/* ---------------------------------------------------------------------- */
/* State                                                                   */
/* ---------------------------------------------------------------------- */

const values = reactive<Record<string, string | boolean>>({});
const fieldErrors = reactive<Record<string, string | undefined>>({});
const formErrors = ref<string[]>([]);
const honeypot = ref('');
const isSubmitting = ref(false);
const succeeded = ref<{ pending: boolean } | null>(null);

/** Seeds one value per field when the definition arrives (or the form it names changes). */
watch(
  () => form.value?.key,
  () => {
    for (const key of Object.keys(values)) delete values[key];
    for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
    for (const field of form.value?.fields ?? []) {
      values[field.id] = isBoolean(field) ? false : '';
    }
    formErrors.value = [];
    succeeded.value = null;
  },
  { immediate: true }
);

function setValue(field: StorefrontFormField, value: string | boolean): void {
  values[field.id] = value;
  // The gate described in the file doc: a field's error is gone the moment its value changes.
  fieldErrors[field.id] = undefined;
}

const statusRoot = ref<HTMLElement | null>(null);
const consentRoot = ref<HTMLElement | null>(null);
const turnstileRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(consentRoot, (caption) => caption ?? t('form.richTextTableLabel'));

const turnstileKey = computed(() =>
  succeeded.value ? null : (form.value?.turnstileSiteKey ?? null)
);
const turnstile = useTurnstile(turnstileKey, turnstileRoot);

const errorCount = computed(() => Object.values(fieldErrors).filter(Boolean).length);

/** Inline only when the form is one text-like field, which is the one shape a row can hold. */
const isInlineRow = computed(() => {
  const fields = form.value?.fields ?? [];
  return (
    variant.value === 'inline' &&
    fields.length === 1 &&
    fields[0] !== undefined &&
    !isBoolean(fields[0]) &&
    fields[0].type !== 'textarea' &&
    fields[0].type !== 'select'
  );
});

const layout = computed(() => (variant.value === 'default' ? 'two' : 'single'));
const fieldsClass = computed(() =>
  isInlineRow.value
    ? 'grid gap-3 @two-col:grid-cols-[1fr_auto] @two-col:items-end'
    : variant.value === 'inline'
      ? 'grid gap-4'
      : undefined
);

const isSplitCentered = computed(() => variant.value === 'inline');
const outerClass = computed(() =>
  isSplitCentered.value ? 'mx-auto max-w-[36rem] text-center' : 'mx-auto max-w-[40rem]'
);
const copyClass = 'grid gap-3';

const NUMERIC_INPUT_MODE: Partial<
  Record<StorefrontFormField['type'], 'tel' | 'email' | 'decimal' | 'url'>
> = {
  phone: 'tel',
  email: 'email',
  number: 'decimal',
  url: 'url',
};
const AUTOCOMPLETE: Partial<Record<string, string>> = {
  name: 'name',
  email: 'email',
  tel: 'tel',
  phone: 'tel',
};
/** A checkbox and a consent are both a boolean control; `required` means it must be checked. */
function isBoolean(field: StorefrontFormField): boolean {
  return field.type === 'checkbox' || field.type === 'consent';
}

function autocompleteFor(field: StorefrontFormField): string | undefined {
  return (
    AUTOCOMPLETE[field.id] ??
    (field.type === 'email'
      ? 'email'
      : field.type === 'phone'
        ? 'tel'
        : field.type === 'url'
          ? 'url'
          : undefined)
  );
}

// A number field stays `type="text"` with `inputmode="decimal"`: a `type="number"` input blanks a
// value the browser's locale does not parse (a decimal comma), which would submit it empty.
function inputType(field: StorefrontFormField): 'text' | 'email' | 'tel' | 'url' {
  if (field.type === 'phone') return 'tel';
  if (field.type === 'email' || field.type === 'url') return field.type;
  return 'text';
}

/* ---------------------------------------------------------------------- */
/* Submit                                                                  */
/* ---------------------------------------------------------------------- */

async function focusFirstInvalid(): Promise<void> {
  await nextTick();
  const first = (form.value?.fields ?? []).find((field) => fieldErrors[field.id]);
  if (first === undefined) return;
  const element = document.getElementById(fieldId(first.id));
  element?.focus();
}

async function focusStatus(): Promise<void> {
  await nextTick();
  statusRoot.value?.focus();
}

function formMessageFor(result: Extract<StorefrontFormSubmitResult, { ok: false }>): string[] {
  if (result.reason === 'invalid') {
    return result.form.length > 0 ? result.form : [];
  }
  switch (result.reason) {
    case 'rate-limited':
      return [t('form.rateLimited')];
    case 'too-large':
      return [t('form.tooLarge')];
    case 'unsupported':
      return [t('form.unsupported')];
    default:
      return [t('form.unavailable')];
  }
}

function redirectTarget(): string | null {
  const target = form.value?.successRedirect;
  return target ? safeHref(target) : null;
}

async function onSubmit(payload: FormLayoutSubmitPayload): Promise<void> {
  payload.event.preventDefault();
  // Spec "Submitting": repeat submits are ignored. The submit Button stays clickable while loading,
  // so this guard is what stops them.
  if (isSubmitting.value) return;
  const current = form.value;
  if (current === null) return;

  formErrors.value = [];
  let valid = true;
  for (const field of current.fields) {
    const message = validateField(field, values[field.id], t);
    fieldErrors[field.id] = message ?? undefined;
    if (message !== null) valid = false;
  }
  if (!valid) {
    await focusFirstInvalid();
    return;
  }
  if (current.turnstileSiteKey !== null && turnstile.token.value === null) {
    formErrors.value = [
      turnstile.failed.value ? t('form.turnstileFailed') : t('form.turnstileRequired'),
    ];
    return;
  }

  isSubmitting.value = true;
  const result = await storefront.forms.submit(current.key, {
    values: { ...values },
    ...(turnstile.token.value ? { turnstileToken: turnstile.token.value } : {}),
    ...(honeypot.value ? { hp: honeypot.value } : {}),
  });
  isSubmitting.value = false;

  if (result.ok) {
    succeeded.value = { pending: result.pending };
    const redirect = isEditing.value ? null : redirectTarget();
    if (redirect !== null) {
      window.location.assign(redirect);
      return;
    }
    await focusStatus();
    return;
  }

  // A token is single-use: whatever failed, the next attempt needs a fresh one.
  turnstile.reset();
  if (result.reason === 'invalid') {
    for (const field of current.fields) {
      const messages = result.errors[field.id];
      fieldErrors[field.id] = messages?.[0];
    }
    // A message about a field this form does not render would otherwise vanish.
    const orphaned = Object.entries(result.errors)
      .filter(([id]) => !current.fields.some((field) => field.id === id))
      .flatMap(([, messages]) => messages);
    const summary = [...result.form, ...orphaned];
    formErrors.value =
      summary.length > 0 || Object.keys(result.errors).length > 0
        ? summary
        : [t('form.invalidForm')];
    if (errorCount.value > 0) await focusFirstInvalid();
    return;
  }
  formErrors.value = formMessageFor(result);
}

async function onSendAnother(): Promise<void> {
  for (const field of form.value?.fields ?? []) {
    values[field.id] = isBoolean(field) ? false : '';
    fieldErrors[field.id] = undefined;
  }
  honeypot.value = '';
  formErrors.value = [];
  succeeded.value = null;
  await nextTick();
  const first = form.value?.fields[0];
  if (first) document.getElementById(fieldId(first.id))?.focus();
}

const successTitle = computed(
  () =>
    data.value.successTitle ||
    (succeeded.value?.pending ? t('form.successTitlePending') : t('form.successTitle'))
);
</script>

<template>
  <Section
    :background="sectionBackground"
    spacing="md"
    :labelled-by="heading ? headingId : undefined"
  >
    <Container width="content">
      <div :class="outerClass">
        <div :class="copyClass">
          <h2
            v-if="heading"
            :id="headingId"
            class="@tablet:text-[2rem] text-[1.625rem] leading-tight font-semibold text-balance"
          >
            {{ heading }}
          </h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('form.headingHintLabel')"
          />
          <p v-if="text" class="text-base leading-[1.6]" :class="mutedToneClass">{{ text }}</p>
        </div>

        <div class="mt-6 text-left">
          <EditorPlaceholder
            v-if="showFormHint"
            :label="t('form.formHintLabel')"
            :help="t('form.formHintHelp')"
          />

          <p
            v-else-if="definition.pending.value"
            role="status"
            class="text-body-sm"
            :class="mutedToneClass"
          >
            {{ t('form.loading') }}
          </p>

          <p
            v-else-if="form === null"
            role="alert"
            class="text-body-sm"
            :class="[mutedToneClass, errorChipClass]"
          >
            {{ t('form.loadFailed') }}
          </p>

          <FormLayout
            v-else-if="!succeeded"
            novalidate
            :layout="layout"
            :aria-label="form.name"
            :submitting="isSubmitting"
            :classes="fieldsClass ? { fields: fieldsClass } : undefined"
            @submit="onSubmit"
          >
            <template v-if="formErrors.length > 0" #errorSummary>
              <p v-for="message in formErrors" :key="message" class="font-medium">{{ message }}</p>
            </template>

            <template v-for="field in form.fields" :key="field.id">
              <div v-if="isBoolean(field)" class="@two-col:col-span-2 grid gap-1">
                <Checkbox
                  :id="fieldId(field.id)"
                  :model-value="values[field.id] === true"
                  :name="field.id"
                  :invalid="Boolean(fieldErrors[field.id])"
                  :described-by="fieldErrors[field.id] ? fieldErrorId(field.id) : undefined"
                  :classes="checkboxClasses"
                  @update:model-value="setValue(field, $event)"
                >
                  {{ field.label }}
                </Checkbox>
                <p
                  v-if="fieldErrors[field.id]"
                  :id="fieldErrorId(field.id)"
                  class="text-field-note text-danger flex items-start gap-1.25 font-medium"
                  :class="errorChipClass"
                >
                  <EldraIcon
                    name="alert-circle"
                    size="sm"
                    class="size-4 shrink-0 translate-y-[0.1em]"
                    aria-hidden="true"
                  />
                  <span>{{ fieldErrors[field.id] }}</span>
                </p>
              </div>

              <FieldWrapper
                v-else
                :id="fieldId(field.id)"
                :label="field.label"
                :required="field.required"
                :optional="!field.required && form.fields.length > 1"
                :full="field.type === 'textarea'"
                :error="fieldErrors[field.id]"
                :classes="fieldWrapperClasses"
              >
                <Textarea
                  v-if="field.type === 'textarea'"
                  :model-value="String(values[field.id] ?? '')"
                  :name="field.id"
                  :placeholder="field.placeholder"
                  min-height="8rem"
                  @update:model-value="setValue(field, $event)"
                />
                <Select
                  v-else-if="field.type === 'select'"
                  :model-value="String(values[field.id] ?? '')"
                  :name="field.id"
                  :options="field.options ?? []"
                  :placeholder="field.placeholder ?? t('form.selectPlaceholder')"
                  clearable
                  @update:model-value="setValue(field, $event ?? '')"
                />
                <Input
                  v-else
                  :model-value="String(values[field.id] ?? '')"
                  :type="inputType(field)"
                  :name="field.id"
                  :inputmode="NUMERIC_INPUT_MODE[field.type]"
                  :autocomplete="autocompleteFor(field)"
                  :size="isInlineRow ? 'lg' : undefined"
                  :placeholder="field.placeholder"
                  @update:model-value="setValue(field, $event)"
                />
              </FieldWrapper>
            </template>

            <!-- The honeypot: off-screen and inert, so a person never reaches it; a bot that fills
                 every input does, and the platform drops the submission. -->
            <FormHoneypot v-model="honeypot" :name="form.honeypotField" />

            <div v-if="form.turnstileSiteKey" ref="turnstileRoot" class="@two-col:col-span-2" />

            <Button
              v-if="isInlineRow"
              type="submit"
              variant="primary"
              size="lg"
              class="@two-col:w-auto w-full"
              :label="t('form.submitting')"
              :aria-describedby="consentSentence ? consentSentenceId : undefined"
            >
              {{ buttonLabelText }}
            </Button>
            <p
              v-if="isInlineRow && consentSentence"
              :id="consentSentenceId"
              data-part="consent-sentence"
              class="text-body-sm @two-col:col-span-2"
              :class="consentSentenceToneClass"
            >
              {{ consentSentence }}
            </p>

            <div ref="consentRoot" class="@two-col:col-span-2">
              <!-- Under this block's own `h2`, so any heading in the consent copy starts at `h3`. -->
              <EldraRichText
                v-if="hasConsent"
                class="prose-eldra text-body-sm"
                :class="consentToneClass"
                :entry-id="entryId"
                field="consent"
                :doc="data.consent"
                api-id="form"
                :min-heading-level="3"
              />
            </div>

            <template v-if="!isInlineRow" #actions>
              <div v-if="consentSentence" class="grid w-full gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  class="@two-col:justify-self-end"
                  :label="t('form.submitting')"
                  :aria-describedby="consentSentenceId"
                >
                  {{ buttonLabelText }}
                </Button>
                <p
                  :id="consentSentenceId"
                  data-part="consent-sentence"
                  class="text-body-sm"
                  :class="consentSentenceToneClass"
                >
                  {{ consentSentence }}
                </p>
              </div>
              <Button
                v-else
                type="submit"
                variant="primary"
                size="lg"
                :label="t('form.submitting')"
              >
                {{ buttonLabelText }}
              </Button>
            </template>
          </FormLayout>

          <div
            ref="statusRoot"
            role="status"
            tabindex="-1"
            :class="
              succeeded
                ? 'border-border bg-background text-text mt-3 flex items-start gap-3 rounded-lg border p-5'
                : ''
            "
          >
            <template v-if="succeeded && form">
              <EldraIcon
                name="circle-check"
                size="lg"
                class="text-success shrink-0"
                aria-hidden="true"
              />
              <div class="grid gap-1">
                <p class="font-semibold">{{ successTitle }}</p>
                <p v-if="form.successMessage" class="text-muted">{{ form.successMessage }}</p>
                <div v-if="variant === 'default'" class="mt-2">
                  <Button variant="outline" type="button" @click="onSendAnother">{{
                    t('form.sendAnother')
                  }}</Button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Container>
  </Section>
</template>
