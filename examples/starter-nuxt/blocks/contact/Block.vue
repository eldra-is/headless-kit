<script setup lang="ts">
/**
 * Contact and map (spec `02-blocks.md` 1765–1892, new block). The shop's address, opening hours,
 * phone and email beside a short enquiry form, with a map that always keeps an "Open in maps" link
 * reachable outside any embed. `variant`:
 *  - `split` (default): details (5fr) and the form card (7fr) side by side from `@content` (64rem
 *    of the block's own width), with the map spanning both columns below. Below `@content` the
 *    order is details, form, map.
 *  - `details-only`: details and the map side by side (1fr/1fr) from `@content`, vertically
 *    centred; below `@content`, details then map. No form.
 *  - `form-only`: only the heading (optionally visually hidden), intro and the form card, in the
 *    `narrow` container. No details, no map.
 *
 * A single grid (`bodyGridClass`) carries all three possible cells (details/form/map) gated by
 * `v-if`, rather than writing the form or the map markup twice per variant — `split`'s map gets
 * `@content:col-span-2` to wrap onto its own full-width row below the two columns; every other
 * placement difference between variants is just which cells exist and the grid's own template.
 *
 * **Map trust.** `mapEmbed` is a bare URL (spec: "not HTML"), loaded in an `<iframe>` — third-party
 * content, so it is checked against a small allowlist of known map-embed hosts before it is ever
 * used as a `src` (`trustedMapEmbedSrc`, the same idea as `@eldrajs/rich-text`'s
 * `isTrustedEmbedSource`, kept local rather than taking a new package dependency for one host
 * check). `mapImage` always wins when both are set (spec: "or an iframe when only `mapEmbed` is
 * set") — a static image is the spec's own preferred choice ("lighter, no third-party cookies"; Do
 * "prefer a static map image plus a link"), and it never needs a trust check since it goes through
 * the same CMS media pipeline every other image field does.
 *
 * **Error summary and focus (spec → Keyboard & accessibility, "After an error submit, focus moves
 * to the summary").** `FormLayout`'s own `focusOnInvalid` (default `true`) moves focus to the
 * first invalid *field*, not the summary — right for a one-field form (`footer`'s newsletter), not
 * for this one. So `focus-on-invalid` is `false` here and this block owns the focus move itself:
 * `runValidation()` sets the three error refs (and, since a `FieldWrapper` mirrors `error` onto its
 * control as `aria-invalid`, that is also what an invalid field's accessible state is) and
 * `focusSummary()` moves focus onto the summary's own `tabindex="-1"` wrapper afterwards.
 * `FormLayout` still does the useful part of the DOM work: once one bad submit has left a field's
 * `aria-invalid="true"` in place, a browser's *next* native `submit` is intercepted by `FormLayout`
 * itself (it scans for `[aria-invalid="true"]` before this block ever sees the event) and re-fires
 * as `@invalid` instead of `@submit` — so both handlers below call the same
 * `attemptSubmit`/`focusSummary` pair. Each error ref also clears the moment its own field changes
 * (the three `watch`es), which is what lets a corrected field's `aria-invalid` go false in time for
 * that next submit to get past `FormLayout`'s own scan.
 *
 * **Success.** `forms.sendMessage` resolving `{ ok: true }` swaps the card's content for a
 * `role="status" tabindex="-1"` panel that receives focus (spec: "the card content is replaced").
 * "Send another message" restores an empty form and focuses the Name field (spec: "moves focus to
 * its first field").
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  Button,
  Container,
  EditorPlaceholder,
  FieldWrapper,
  FormLayout,
  Input,
  Link,
  Section,
  Select,
  Textarea,
  VisuallyHidden,
  type ContainerWidth,
  type FormLayoutSubmitPayload,
  type SelectOption,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

type Variant = 'split' | 'details-only' | 'form-only';

const props = defineProps<{ entry: EldraBlockEntry<'contact'> }>();
const { data } = useBlockData(props, 'contact');
const t = useT();
const isEditing = useEditing();
const storefront = useStorefront();

const uid = useUiId();
const headingId = `contact-heading-${uid}`;
const nameFieldId = `contact-name-${uid}`;
const emailFieldId = `contact-email-${uid}`;
const orderFieldId = `contact-order-${uid}`;
const topicFieldId = `contact-topic-${uid}`;
const messageFieldId = `contact-message-${uid}`;

const variant = computed<Variant>(() => data.value.variant ?? 'split');
const isFormOnly = computed(() => variant.value === 'form-only');
const isSplit = computed(() => variant.value === 'split');
const isDetailsOnly = computed(() => variant.value === 'details-only');

const containerWidth = computed<ContainerWidth>(() => (isFormOnly.value ? 'narrow' : 'content'));

/* ---------------------------------------------------------------------- */
/* Heading / intro                                                         */
/* ---------------------------------------------------------------------- */

const heading = computed(() => (data.value.heading ?? '').trim());
const showHeadingHint = computed(() => isEditing.value && heading.value === '');
/** Only in `form-only` (spec: "the h2 stays in the outline but is visually hidden"). */
const hideHeadingVisually = computed(() => isFormOnly.value && (data.value.hideHeading ?? false));
const headingClass =
  'font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] text-balance';

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const showIntroHint = computed(() => isEditing.value && !hasIntro.value);

/* ---------------------------------------------------------------------- */
/* Details column                                                          */
/* ---------------------------------------------------------------------- */

const address = computed(() => (data.value.address ?? '').trim());
const hasAddress = computed(() => address.value !== '');

const hours = computed(() =>
  (data.value.hours ?? []).filter(
    (row) => (row.days ?? '').trim() !== '' || (row.time ?? '').trim() !== ''
  )
);
const hasHours = computed(() => hours.value.length > 0);

const phone = computed(() => (data.value.phone ?? '').trim());
const hasPhone = computed(() => phone.value !== '');
/**
 * `safeHref` alone isn't enough to guard against an empty `tel:` destination: `new URL('tel:')`
 * parses without throwing (an empty path is a valid opaque one for a non-special scheme), so a
 * `phone` value with no digits at all (nothing left after stripping everything but digits/`+`, or
 * only a bare `+`) would still pass `safeHref` and render an inert `href="tel:"` link — clickable,
 * announced as a link, and going nowhere. `strippedPhoneDigits` requires at least one real digit;
 * `telHref` is `null` without one, and the template falls back to plain text for the phone row.
 */
const strippedPhoneDigits = computed(() => phone.value.replace(/[^\d+]/g, ''));
const telHref = computed(() =>
  /\d/.test(strippedPhoneDigits.value) ? safeHref(`tel:${strippedPhoneDigits.value}`) : null
);

const email = computed(() => (data.value.email ?? '').trim());
const hasEmail = computed(() => email.value !== '');
const mailtoHref = computed(() => safeHref(`mailto:${email.value}`));

const hasDetails = computed(
  () => hasAddress.value || hasHours.value || hasPhone.value || hasEmail.value
);
const showDetailsHint = computed(() => isEditing.value && !isFormOnly.value && !hasDetails.value);

type DetailKind = 'address' | 'hours' | 'phone' | 'email';
const detailRows = computed<{ kind: DetailKind; icon: string; label: string }[]>(() => {
  const rows: { kind: DetailKind; icon: string; label: string }[] = [];
  if (hasAddress.value)
    rows.push({ kind: 'address', icon: 'map-pin', label: t('contact.addressLabel') });
  if (hasHours.value) rows.push({ kind: 'hours', icon: 'clock', label: t('contact.hoursLabel') });
  if (hasPhone.value) rows.push({ kind: 'phone', icon: 'phone', label: t('contact.phoneLabel') });
  if (hasEmail.value) rows.push({ kind: 'email', icon: 'mail', label: t('contact.emailLabel') });
  return rows;
});

/* ---------------------------------------------------------------------- */
/* Map                                                                     */
/* ---------------------------------------------------------------------- */

/** Known map-embed hosts, https only — the local equivalent of
 * `@eldrajs/rich-text`'s `isTrustedEmbedSource` (see file doc). */
const TRUSTED_MAP_EMBED_HOSTS = new Set([
  'google.com',
  'maps.google.com',
  'openstreetmap.org',
  'maps.apple.com',
  'bing.com',
]);

function trustedMapEmbedSrc(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  return TRUSTED_MAP_EMBED_HOSTS.has(url.hostname.replace(/^www\./, '')) ? trimmed : null;
}

const hasMapImage = computed(() => data.value.mapImage != null);
/** Only used when there is no image (spec: "an iframe when only `mapEmbed` is set"). */
const trustedEmbedSrc = computed(() =>
  hasMapImage.value ? null : trustedMapEmbedSrc(data.value.mapEmbed)
);
const hasMapFrame = computed(() => hasMapImage.value || trustedEmbedSrc.value !== null);

const mapNote = computed(() => (data.value.mapNote ?? '').trim());
const mapLinkLabel = computed(() => (data.value.mapLinkLabel ?? '').trim());
const mapLinkHref = computed(() => safeHref(data.value.mapLinkHref));
const hasMapLink = computed(() => mapLinkLabel.value !== '' && mapLinkHref.value !== null);
const mapLinkAs = computed(() =>
  mapLinkHref.value !== null && isInternalHref(mapLinkHref.value) ? EldraRouterLink : undefined
);
const showMapBar = computed(() => hasMapFrame.value && (mapNote.value !== '' || hasMapLink.value));

/** Spec: "No map fields → no map area." Gated on the frame (image/embed) — the bar attaches to
 * it, so a note/link with no picture to go with is treated as no map (see file doc). */
const hasMapArea = computed(() => !isFormOnly.value && hasMapFrame.value);
const showMapHint = computed(() => isEditing.value && !isFormOnly.value && !hasMapFrame.value);

const mapEmbedTitle = computed(() =>
  address.value !== ''
    ? t('contact.mapTitleWithAddress', { address: address.value.split('\n')[0] ?? '' })
    : t('contact.mapTitle')
);

const MAP_FRAME_CLASS: Partial<Record<Variant, string>> = {
  split: 'aspect-[4/3] min-h-56 @content:aspect-[16/5] @content:min-h-0',
  'details-only': 'aspect-[4/3] min-h-56',
};
const mapFrameClass = computed(() => `relative w-full ${MAP_FRAME_CLASS[variant.value] ?? ''}`);

/* ---------------------------------------------------------------------- */
/* Body grid (details / form / map cells — see file doc)                   */
/* ---------------------------------------------------------------------- */

const GRID_CLASS: Record<Variant, string> = {
  split:
    'flex flex-col gap-12 @content:grid @content:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] ' +
    '@content:items-start @content:gap-x-16 @content:gap-y-12',
  'details-only':
    'flex flex-col gap-12 @content:grid @content:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ' +
    '@content:items-center @content:gap-x-16',
  'form-only': 'flex flex-col gap-8',
};
const bodyGridClass = computed(() => GRID_CLASS[variant.value]);
const hasForm = computed(() => !isDetailsOnly.value);

/* ---------------------------------------------------------------------- */
/* Form                                                                    */
/* ---------------------------------------------------------------------- */

const formTitle = computed(() => data.value.formTitle || t('contact.formTitleDefault'));
const showOrderNumber = computed(() => data.value.showOrderNumber ?? false);
const topics = computed(() =>
  (data.value.topics ?? []).filter((item) => (item.label ?? '').trim() !== '')
);
const hasTopics = computed(() => topics.value.length > 0);
const topicOptions = computed<SelectOption[]>(() =>
  topics.value.map((item) => ({ value: item.label, label: item.label }))
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const name = ref('');
const emailValue = ref('');
const orderNumber = ref('');
const topic = ref(topics.value[0]?.label ?? '');
const message = ref('');

const nameError = ref<string | null>(null);
const emailError = ref<string | null>(null);
const messageError = ref<string | null>(null);

/** Clears each field's own error as soon as it changes — see file doc's focus/retry note. */
watch(name, () => {
  if (nameError.value) nameError.value = null;
});
watch(emailValue, () => {
  if (emailError.value) emailError.value = null;
});
watch(message, () => {
  if (messageError.value) messageError.value = null;
});

const sending = ref(false);
const serverError = ref(false);
const sent = ref(false);
const sentFirstName = ref('');
const sentEmail = ref('');

const summaryRef = ref<HTMLElement | null>(null);
const statusRef = ref<HTMLElement | null>(null);

const invalidCount = computed(
  () => [nameError.value, emailError.value, messageError.value].filter(Boolean).length
);
const hasFormError = computed(() => invalidCount.value > 0 || serverError.value);
const summaryTitle = computed(() =>
  invalidCount.value === 1
    ? t('contact.summaryTitleOne')
    : t('contact.summaryTitleMany', { count: String(invalidCount.value) })
);

function runValidation(): boolean {
  nameError.value = name.value.trim() === '' ? t('contact.nameRequiredError') : null;
  emailError.value = EMAIL_PATTERN.test(emailValue.value.trim())
    ? null
    : t('contact.emailInvalidError');
  messageError.value = message.value.trim() === '' ? t('contact.messageRequiredError') : null;
  return !nameError.value && !emailError.value && !messageError.value;
}

async function focusSummary(): Promise<void> {
  await nextTick();
  summaryRef.value?.focus();
}

function focusField(id: string): void {
  document.getElementById(id)?.focus();
}

async function sendForm(): Promise<void> {
  serverError.value = false;
  sending.value = true;

  const payload: Record<string, string> = {
    recipient: data.value.recipient,
    name: name.value.trim(),
    email: emailValue.value.trim(),
    message: message.value.trim(),
  };
  if (showOrderNumber.value && orderNumber.value.trim() !== '') {
    payload.orderNumber = orderNumber.value.trim();
  }
  if (hasTopics.value && topic.value !== '') payload.topic = topic.value;

  const result = await storefront.forms.sendMessage(payload);
  sending.value = false;

  if (!result.ok) {
    serverError.value = true;
    await focusSummary();
    return;
  }

  sentFirstName.value = name.value.trim().split(/\s+/)[0] ?? '';
  sentEmail.value = emailValue.value.trim();
  sent.value = true;
  await nextTick();
  statusRef.value?.focus();
}

async function onSubmit(payload: FormLayoutSubmitPayload): Promise<void> {
  payload.event.preventDefault();
  if (!runValidation()) {
    await focusSummary();
    return;
  }
  await sendForm();
}

/** `FormLayout` itself intercepts a retry submit once a field's `aria-invalid` is already set (see
 * file doc) and emits this instead of `submit`. */
async function onInvalid(): Promise<void> {
  if (!runValidation()) await focusSummary();
}

async function onSendAnother(): Promise<void> {
  name.value = '';
  emailValue.value = '';
  orderNumber.value = '';
  topic.value = topics.value[0]?.label ?? '';
  message.value = '';
  nameError.value = null;
  emailError.value = null;
  messageError.value = null;
  serverError.value = false;
  sent.value = false;
  await nextTick();
  focusField(nameFieldId);
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? params[key]! : match
  );
}

const successText = computed(() =>
  interpolate(data.value.successText || t('contact.successTextDefault'), { email: sentEmail.value })
);
</script>

<template>
  <Section background="none" spacing="md" :labelled-by="headingId">
    <Container :width="containerWidth">
      <div class="flex flex-col gap-12">
        <div class="grid gap-3">
          <VisuallyHidden v-if="hideHeadingVisually && heading" as="h2" :id="headingId">{{
            heading
          }}</VisuallyHidden>
          <h2 v-else-if="heading" :id="headingId" :class="headingClass">{{ heading }}</h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('contact.headingHintLabel')"
            :help="t('contact.headingHintHelp')"
          />
          <p v-if="hasIntro" class="text-muted text-body-lg max-w-[42rem]">{{ intro }}</p>
          <EditorPlaceholder
            v-else-if="showIntroHint"
            inline
            :label="t('contact.introHintLabel')"
          />
        </div>

        <div :class="bodyGridClass">
          <!-- Details -->
          <div v-if="hasDetails && !isFormOnly">
            <ul role="list" class="flex flex-col gap-6">
              <li v-for="row in detailRows" :key="row.kind" class="flex gap-4">
                <span
                  class="bg-surface-strong text-text flex size-10 shrink-0 items-center justify-center rounded-md"
                >
                  <EldraIcon :name="row.icon" size="lg" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-label text-text mb-1 font-semibold">{{ row.label }}</p>
                  <p v-if="row.kind === 'address'" class="text-muted text-base whitespace-pre-line">
                    {{ address }}
                  </p>
                  <div
                    v-else-if="row.kind === 'hours'"
                    class="text-muted grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base"
                  >
                    <template v-for="(item, index) in hours" :key="index">
                      <span>{{ item.days }}</span>
                      <span>{{ item.time }}</span>
                    </template>
                  </div>
                  <Link
                    v-else-if="row.kind === 'phone' && telHref"
                    :href="telHref"
                    variant="inline"
                    >{{ phone }}</Link
                  >
                  <span v-else-if="row.kind === 'phone'">{{ phone }}</span>
                  <Link
                    v-else-if="row.kind === 'email' && mailtoHref"
                    :href="mailtoHref"
                    variant="inline"
                    >{{ email }}</Link
                  >
                  <span v-else-if="row.kind === 'email'">{{ email }}</span>
                </div>
              </li>
            </ul>
          </div>
          <EditorPlaceholder
            v-else-if="showDetailsHint"
            :label="t('contact.detailsHintLabel')"
            :help="t('contact.detailsHintHelp')"
          />

          <!-- Form -->
          <div v-if="hasForm" class="bg-surface @tablet:p-8 rounded-lg p-6">
            <template v-if="!sent">
              <FormLayout
                layout="two"
                novalidate
                :focus-on-invalid="false"
                :heading="formTitle"
                :heading-level="3"
                :submitting="sending"
                @submit="onSubmit"
                @invalid="onInvalid"
              >
                <template v-if="hasFormError" #errorSummary>
                  <div ref="summaryRef" tabindex="-1">
                    <template v-if="serverError">
                      <p>{{ t('contact.serverError', { email: data.recipient }) }}</p>
                    </template>
                    <template v-else>
                      <p class="font-semibold">{{ summaryTitle }}</p>
                      <ul class="mt-1 list-disc pl-4">
                        <li v-if="nameError">
                          <a
                            :href="`#${nameFieldId}`"
                            class="underline"
                            @click.prevent="focusField(nameFieldId)"
                            >{{ t('contact.nameLabel') }}</a
                          >
                        </li>
                        <li v-if="emailError">
                          <a
                            :href="`#${emailFieldId}`"
                            class="underline"
                            @click.prevent="focusField(emailFieldId)"
                            >{{ t('contact.emailFieldLabel') }}</a
                          >
                        </li>
                        <li v-if="messageError">
                          <a
                            :href="`#${messageFieldId}`"
                            class="underline"
                            @click.prevent="focusField(messageFieldId)"
                            >{{ t('contact.messageLabel') }}</a
                          >
                        </li>
                      </ul>
                    </template>
                  </div>
                </template>

                <FieldWrapper
                  :id="nameFieldId"
                  :label="t('contact.nameLabel')"
                  required
                  :error="nameError ?? undefined"
                >
                  <Input v-model="name" name="name" autocomplete="name" />
                </FieldWrapper>

                <FieldWrapper
                  :id="emailFieldId"
                  :label="t('contact.emailFieldLabel')"
                  required
                  :error="emailError ?? undefined"
                >
                  <Input v-model="emailValue" type="email" name="email" autocomplete="email" />
                </FieldWrapper>

                <FieldWrapper
                  v-if="showOrderNumber"
                  :id="orderFieldId"
                  :label="t('contact.orderNumberLabel')"
                  optional
                >
                  <Input
                    v-model="orderNumber"
                    name="orderNumber"
                    :placeholder="t('contact.orderNumberPlaceholder')"
                  />
                </FieldWrapper>

                <FieldWrapper v-if="hasTopics" :id="topicFieldId" :label="t('contact.topicLabel')">
                  <Select v-model="topic" name="topic" :options="topicOptions" />
                </FieldWrapper>

                <FieldWrapper
                  :id="messageFieldId"
                  :label="t('contact.messageLabel')"
                  required
                  full
                  :error="messageError ?? undefined"
                >
                  <Textarea
                    v-model="message"
                    name="message"
                    min-height="8rem"
                    :classes="{ control: '@tablet:min-h-44' }"
                  />
                </FieldWrapper>

                <template #actions>
                  <Button variant="primary" type="submit" size="lg" :label="t('contact.sending')">{{
                    t('contact.sendMessage')
                  }}</Button>
                  <p class="text-muted text-body-sm">{{ t('contact.replyTime') }}</p>
                </template>
              </FormLayout>
            </template>
            <div v-else ref="statusRef" role="status" tabindex="-1" class="grid gap-4 text-center">
              <EldraIcon name="circle-check" size="xl" class="text-success mx-auto" />
              <p class="text-h4 font-heading font-semibold">
                {{ t('contact.successTitle', { name: sentFirstName }) }}
              </p>
              <p class="text-muted text-base">{{ successText }}</p>
              <Button variant="outline" type="button" class="mx-auto" @click="onSendAnother">{{
                t('contact.sendAnother')
              }}</Button>
            </div>
          </div>

          <!-- Map -->
          <div v-if="hasMapArea" data-part="map" :class="[isSplit && '@content:col-span-2']">
            <div :class="mapFrameClass">
              <UiImage
                v-if="hasMapImage"
                :src="data.mapImage!.url"
                :alt="data.mapImage!.altText ?? ''"
                rounded="lg"
                fill
                :classes="{ frame: 'border-border border' }"
              />
              <iframe
                v-else-if="trustedEmbedSrc"
                :src="trustedEmbedSrc"
                :title="mapEmbedTitle"
                loading="lazy"
                class="border-border h-full w-full rounded-lg border"
              />
              <div
                v-if="showMapBar"
                class="bg-background text-body-sm @tablet:inset-x-4 @tablet:bottom-4 absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2 shadow-sm"
              >
                <span v-if="mapNote" class="text-muted">{{ mapNote }}</span>
                <Link
                  v-if="hasMapLink"
                  :href="mapLinkHref!"
                  :as="mapLinkAs"
                  variant="standalone"
                  arrow
                  external
                  :classes="{ root: 'text-body-sm font-semibold' }"
                  >{{ mapLinkLabel }}</Link
                >
              </div>
            </div>
          </div>
          <EditorPlaceholder
            v-else-if="showMapHint"
            :label="t('contact.mapHintLabel')"
            :help="t('contact.mapHintHelp')"
          />
        </div>
      </div>
    </Container>
  </Section>
</template>
