<script setup lang="ts">
/**
 * An email sign-up with a clear promise, one field, a plain consent line and visible error/success
 * states (spec `02-blocks.md` "Newsletter", lines 1645–1762). Use it once per page. `variant`:
 *  - `centered` (default): everything centred in a 36rem column; the form's own text (label,
 *    error, consent) stays left-aligned so it lines up with the field.
 *  - `split`: from `@content` (64rem) block width, copy left / form right (`1fr 1fr`, 4rem gap,
 *    vertically centred). Below that it stacks like `centered`, left-aligned, full container width.
 *
 * **The field-row / checkbox / button / consent order** is one CSS grid (`@two-col`, the package's
 * own 36rem container-query token — the same breakpoint `FormLayout`'s own two-column layout uses)
 * with an explicit `order` on the checkbox and the consent line, not a hand-built two-slot form:
 * the design spec's Composition draws the field and the button sharing one row, with the optional
 * checkbox and the consent line each on their own row below — but its own Keyboard table asks for
 * `Tab` to reach the checkbox *before* the button ("the input, the checkbox (when present), the
 * button and the consent links, in that order"). Source (and therefore tab) order is field, then
 * checkbox, then button, then consent; `order-2`/`order-3` (plus `@two-col:col-span-2`) move the
 * checkbox and consent visually below the field+button row without touching that order — the same
 * visual/DOM split `split-content`'s own image-side alternation documents. Below `@two-col` there
 * is only one column, so the same order values simply stack the parts top to bottom in the
 * "label, input, error, button, checkbox, consent" sequence the spec's mobile layout describes,
 * with no separate mobile-only markup.
 *
 * The email field's error lives inside `FieldWrapper`'s own box (label, input, error stacked), so
 * on the shared row it sits under the input's own column rather than spanning under the button too
 * — a `FieldWrapper` set to grow (`flex-[1_1_14rem]`-equivalent via the grid's `1fr` track) still
 * takes up nearly the whole row, which reads close enough to "under both" without forking the
 * component to split its own error out into a sibling grid cell.
 *
 * The consent checkbox is deliberately **not** wrapped in a `FieldWrapper`: a plain `FieldWrapper`
 * would put its own `<label for>` *above* the box (right for `Input`, wrong for a checkbox, whose
 * label sits beside the box on the same line), and `FieldWrapper group` — the package's own
 * "required consent" pattern (see its README/stories) — assumes a separate `<legend>` naming the
 * *group*, which this single sentence does not need. So the checkbox keeps its own built-in label
 * (the slot text) and a hand-written error row that reuses `FieldError`'s own recipe (icon size,
 * `text-field-note`/`text-danger`, the 0.3125rem icon gap) since that internal component is not
 * exported from the package.
 *
 * The newsletter posts through `useStorefront().forms.subscribe({ email, list })` — see
 * `blocks/footer/Block.vue`'s own newsletter zone for the identical local-validation-first,
 * backend-`{ok:false}`-second pattern this reuses: empty/malformed email never reaches the
 * storefront, and a backend `reason: 'invalid'` shows the exact same message a local check would.
 *
 * `role="status"` region: the spec requires the region to exist **before** submission (empty) so
 * the success content is announced when it lands (4.1.3) and receives focus itself
 * (`tabindex="-1"`, 2.4.3) since the submit button that held focus disappears with the form. That
 * is a *visible* panel, not `FormLayout`'s own built-in `role="status"` (which is `VisuallyHidden`,
 * for a plain announced sentence) — so this block renders its own, always-mounted `role="status"`
 * element and only ever changes what is inside it.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  Button,
  Checkbox,
  Container,
  EditorPlaceholder,
  FieldWrapper,
  FormLayout,
  Input,
  Section,
  type FormLayoutSubmitPayload,
  type SectionBackground,
} from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';

const props = defineProps<{ entry: EldraBlockEntry<'newsletter'> }>();
const { data, entryId } = useBlockData(props, 'newsletter');
const t = useT();
const isEditing = useEditing();
const storefront = useStorefront();

const headingId = `newsletter-heading-${useUiId()}`;
const consentErrorId = `newsletter-consent-error-${useUiId()}`;

type Variant = 'centered' | 'split';
const variant = computed<Variant>(() => data.value.variant ?? 'centered');
const isSplit = computed(() => variant.value === 'split');

const sectionBackground = computed<SectionBackground>(
  () => data.value.sectionBackground ?? 'surface'
);
const isInverted = computed(
  () => sectionBackground.value === 'primary' || sectionBackground.value === 'accent'
);

const heading = computed(() => (data.value.heading ?? '').trim());
const text = computed(() => (data.value.text ?? '').trim());
const fieldLabelText = computed(() => data.value.fieldLabel || t('newsletter.emailLabel'));
const placeholderText = computed(() => data.value.placeholder || t('newsletter.emailPlaceholder'));
const buttonLabelText = computed(() => data.value.buttonLabel || t('newsletter.subscribe'));
const requireConsentCheckbox = computed(() => data.value.requireConsentCheckbox ?? false);
const consentCheckboxLabelText = computed(
  () => data.value.consentCheckboxLabel || t('newsletter.consentCheckboxLabel')
);
const successTitleText = computed(() => data.value.successTitle || t('newsletter.successTitle'));
const successTextValue = computed(() => (data.value.successText ?? '').trim());
const hasConsent = computed(
  () => Array.isArray(data.value.consent?.content) && data.value.consent.content.length > 0
);

const showHeadingHint = computed(() => isEditing.value && heading.value === '');
const showTextHint = computed(() => isEditing.value && text.value === '');

/** Spec "On primary / accent": label, text and consent switch to the contrast colour; nothing ever
 *  reads `muted` on those two backgrounds. `undefined` on every other ground leaves the package's
 *  own default (`text-text`) in place. */
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
const consentToneClass = computed(() => {
  if (sectionBackground.value === 'primary') {
    return 'text-primary-contrast/90 [&_a]:text-primary-contrast';
  }
  if (sectionBackground.value === 'accent') {
    return 'text-accent-contrast/90 [&_a]:text-accent-contrast';
  }
  return 'text-muted [&_a]:text-muted';
});
/** Spec "On primary / accent": the error message sits on a small `background` chip so `danger`
 *  keeps its contrast (0.25rem/0.5rem padding, `radius-sm`). */
const errorChipClass = computed<string | undefined>(() =>
  isInverted.value ? 'w-fit rounded-sm bg-background px-2 py-1' : undefined
);
const fieldWrapperClasses = computed(() => ({
  label: contrastTextClass.value,
  error: errorChipClass.value,
}));
const checkboxClasses = computed(() => ({ label: contrastTextClass.value }));

const outerClass = computed(() =>
  isSplit.value
    ? '@content:grid @content:grid-cols-2 @content:items-center @content:gap-16'
    : 'mx-auto max-w-[36rem] text-center'
);
const copyClass = computed(() => (isSplit.value ? 'grid gap-3 text-left' : 'grid gap-3'));
const formColumnClass = computed(() =>
  isSplit.value ? 'mt-6 @content:mt-0 text-left' : 'mt-6 text-left'
);

/* ---------------------------------------------------------------------- */
/* Form state                                                              */
/* ---------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = ref('');
const emailError = ref<string | null>(null);
const consentChecked = ref(false);
const consentError = ref<string | null>(null);
const isSubmitting = ref(false);
const succeeded = ref(false);

const emailFieldRoot = ref<HTMLElement | null>(null);
const checkboxFieldRoot = ref<HTMLElement | null>(null);
const statusRoot = ref<HTMLElement | null>(null);
const consentRoot = ref<HTMLElement | null>(null);

useRichTextScrollRegions(consentRoot, (caption) => caption ?? t('newsletter.richTextTableLabel'));

/**
 * `FormLayout`'s own submit handler refuses to emit `submit` at all while *any* element in the
 * form still carries `aria-invalid="true"` — it emits `invalid` and returns instead (see that
 * component's own doc comment). So an error has to clear itself the moment its own condition is
 * fixed, not only inside a later successful `onSubmit`: otherwise a corrected but still-marked
 * field wedges every future submit, this block's own included, before this handler ever runs.
 */
watch(email, () => {
  emailError.value = null;
  retryable.value = false;
});
watch(consentChecked, (checked) => {
  if (checked) consentError.value = null;
});

/**
 * A sign-up-service failure marks the field invalid too (spec "Error (sign-up service failed)":
 * "Same treatment"), but unlike a malformed address nothing about the *value* is wrong, so the
 * visitor's natural next move — pressing Subscribe again, unchanged — must reach the service
 * again. `FormLayout`'s gate above would refuse that submit on the stale mark, so the block
 * remembers that its current error is retryable and, when the gate fires, clears the mark and
 * re-submits the form itself.
 */
const retryable = ref(false);

function onInvalid(): void {
  if (!retryable.value) return;
  retryable.value = false;
  emailError.value = null;
  const form = emailFieldRoot.value?.closest('form');
  if (!form) return;
  void nextTick(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function focusEmailField(): Promise<void> {
  await nextTick();
  emailFieldRoot.value?.querySelector<HTMLInputElement>('input')?.focus();
}

async function focusCheckbox(): Promise<void> {
  await nextTick();
  checkboxFieldRoot.value?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
}

async function focusStatus(): Promise<void> {
  await nextTick();
  statusRoot.value?.focus();
}

async function onSubmit(payload: FormLayoutSubmitPayload): Promise<void> {
  payload.event.preventDefault();
  // Spec "Submitting": "Repeat submits are ignored." The submit Button stays clickable while
  // loading (see `Button.vue`'s own comment on that), so this guard is the one thing that has to
  // actually stop it.
  if (isSubmitting.value) return;

  const value = String(payload.data.get('email') ?? '').trim();

  if (!EMAIL_PATTERN.test(value)) {
    emailError.value = t('newsletter.invalidEmail');
    await focusEmailField();
    return;
  }

  if (requireConsentCheckbox.value && !consentChecked.value) {
    consentError.value = t('newsletter.consentRequired');
    await focusCheckbox();
    return;
  }

  emailError.value = null;
  consentError.value = null;
  isSubmitting.value = true;
  const result = await storefront.forms.subscribe({ email: value, list: data.value.list });
  isSubmitting.value = false;

  if (result.ok) {
    succeeded.value = true;
    await focusStatus();
    return;
  }

  const serviceFailed = result.reason !== 'invalid';
  retryable.value = serviceFailed;
  emailError.value = serviceFailed ? t('newsletter.failed') : t('newsletter.invalidEmail');
  await focusEmailField();
}
</script>

<template>
  <Section :background="sectionBackground" spacing="md" :labelled-by="headingId">
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
            :label="t('newsletter.headingHintLabel')"
          />
          <p v-if="text" class="text-base leading-[1.6]" :class="mutedToneClass">{{ text }}</p>
          <EditorPlaceholder
            v-else-if="showTextHint"
            inline
            :label="t('newsletter.textHintLabel')"
          />
        </div>

        <div :class="formColumnClass">
          <FormLayout
            v-if="!succeeded"
            novalidate
            :submitting="isSubmitting"
            :classes="{ fields: 'grid gap-3 @two-col:grid-cols-[1fr_auto] @two-col:items-end' }"
            @submit="onSubmit"
            @invalid="onInvalid"
          >
            <div ref="emailFieldRoot" class="contents">
              <FieldWrapper
                :label="fieldLabelText"
                :error="emailError ?? undefined"
                :classes="fieldWrapperClasses"
              >
                <Input
                  v-model="email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  size="lg"
                  :placeholder="placeholderText"
                />
              </FieldWrapper>
            </div>

            <div
              v-if="requireConsentCheckbox"
              ref="checkboxFieldRoot"
              class="@two-col:col-span-2 order-2 grid gap-1"
            >
              <Checkbox
                v-model="consentChecked"
                name="consent"
                :invalid="consentError !== null"
                :described-by="consentError ? consentErrorId : undefined"
                :classes="checkboxClasses"
              >
                {{ consentCheckboxLabelText }}
              </Checkbox>
              <p
                v-if="consentError"
                :id="consentErrorId"
                class="text-field-note text-danger flex items-start gap-1.25 font-medium"
                :class="errorChipClass"
              >
                <EldraIcon
                  name="alert-circle"
                  size="sm"
                  class="size-4 shrink-0 translate-y-[0.1em]"
                  aria-hidden="true"
                />
                <span>{{ consentError }}</span>
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              class="@two-col:w-auto w-full"
              :label="t('newsletter.subscribing')"
            >
              {{ buttonLabelText }}
            </Button>

            <div ref="consentRoot" class="@two-col:col-span-2 order-3">
              <!-- Under this block's own `h2`, so any heading in the consent copy starts at `h3`. -->
              <EldraRichText
                v-if="hasConsent"
                class="prose-eldra text-body-sm"
                :class="consentToneClass"
                :entry-id="entryId"
                field="consent"
                :doc="data.consent"
                api-id="newsletter"
                :min-heading-level="3"
              />
            </div>
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
            <template v-if="succeeded">
              <EldraIcon
                name="circle-check"
                size="lg"
                class="text-success shrink-0"
                aria-hidden="true"
              />
              <div class="grid gap-1">
                <p class="font-semibold">{{ successTitleText }}</p>
                <p v-if="successTextValue" class="text-muted">{{ successTextValue }}</p>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Container>
  </Section>
</template>
