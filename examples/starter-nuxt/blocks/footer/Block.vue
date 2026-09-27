<script setup lang="ts">
/**
 * Site footer (spec `eldra-starter-spec/02-blocks.md` lines 440–597). `variant`:
 *  - `default`: brand (wordmark, description, social), link groups, an optional newsletter
 *    sign-up. Legal row below a hairline, with the locale/currency selectors.
 *  - `minimal`: brand, a flat row of links, social. Then the same legal row.
 *
 * Landmark naming follows the spec literally per variant (line 549): `default`'s `<footer>` is
 * `aria-labelledby` a visually hidden `<h2>` ("Site footer"); `minimal` has no heading of its own
 * (no groups, no newsletter title), so it names the landmark directly with `aria-label` instead —
 * both are real, valid accessible names, this is just which mechanism supplies it.
 *
 * The locale/currency `Select`s render with no `leadingIcon` (spec: decorative "world"/
 * "credit-card" icons). `Select.leadingIcon` needs a synchronous `IconComponent`; this theme's
 * only icon resolution path (`EldraIcon`/`useEldraIcon`) is name-based and asynchronous (an HTTP
 * fetch under Nuxt, with no client-side raw-SVG source to resolve one synchronously from). Wiring
 * one in would mean either forking `@eldrajs/ui`'s `Select` or hand-rolling a second, parallel
 * icon-loading path outside `useEldraIcon` for a purely decorative detail with no acceptance
 * criterion or test coverage — left out rather than doing either.
 *
 * Every group/flat/legal link is resolved once through `resolveLinks` below: `safeHref` drops an
 * unsafe destination (the link is then not rendered at all) and a same-site path routes through
 * `EldraRouterLink` (see `app/utils/links.ts`). `tone="muted"` + `:underline="false"` is the
 * spec's tertiary link, turning `text` with an underline only on hover; legal links keep the
 * package's own underline-at-rest default (spec: "always underlined").
 *
 * The two selectors (country/language, currency) are **not** CMS content — the spec calls their
 * options "mock-independent theme constants" (a handful of example locales/currencies), so they
 * are local constants translated through `useT()` rather than `mock.json` fields. `Select` commits
 * only on `Enter` or a click (its own contract; arrow keys alone only move the active option), so
 * nothing extra is needed here to satisfy "prices reload only after Enter or a click" (3.2.2).
 *
 * The newsletter zone posts through `useStorefront().forms.subscribe`. Email format is validated
 * locally (empty/malformed never reaches the storefront); a backend `{ ok: false }` shows the same
 * error slot. Both failure paths return focus to the email field — `FormLayout`'s own submit
 * handler only refuses a *second* submit while a field is already marked invalid, so the first
 * invalid attempt's error + refocus is this block's own job.
 *
 * A backend failure (`{ ok: false }` for a reason other than the address itself) marks the field
 * invalid the same way a malformed address does, but nothing about the *value* is wrong — the
 * visitor's natural next move is pressing Subscribe again, unchanged. `FormLayout`'s own submit
 * handler refuses to emit `submit` at all while any field still carries `aria-invalid="true"` (see
 * that component's own doc comment), so an unchanged resubmit after a backend failure would
 * otherwise be silently swallowed forever — the exact gap `blocks/newsletter/Block.vue` fixed
 * first (`retryable` + `@invalid`, ported here verbatim): `retryable` remembers that the current
 * error came from the service, not the address, and `onNewsletterInvalid` (wired to `FormLayout`'s
 * `@invalid`) clears the stale mark and re-dispatches the same submit once, the moment the gate
 * actually fires.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  Button,
  Container,
  FieldWrapper,
  FormLayout,
  Input,
  Link,
  Section,
  Select,
  VisuallyHidden,
  type FormLayoutSubmitPayload,
  type SelectOption,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import { useStorefront } from '../../app/composables/useStorefront';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import type { MessageKey } from '../../app/i18n/messages';

type FooterLinkField = { label: string; href: string };
type ResolvedLink = { label: string; href: string; as: typeof EldraRouterLink | undefined };

const props = defineProps<{ entry: EldraBlockEntry<'footer'> }>();
const { data } = useBlockData(props, 'footer');
const t = useT();
const storefront = useStorefront();

const headingId = `footer-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'default');
const background = computed(() => data.value.background ?? 'surface-strong');

/** Section spacing (spec "Footer" → Container/spacing): the shared `sm`/`md`/`lg` scale doesn't
 * carry these exact steps, so `spacing="none"` on `Section` and the padding is written here. */
const paddingClass = computed(() =>
  variant.value === 'minimal' ? 'py-8' : 'pt-12 pb-6 @tablet:pt-16 @tablet:pb-8'
);

/** Drops an unsafe destination and resolves a same-site one through the router (see file doc). */
function resolveLinks(links: FooterLinkField[] | undefined): ResolvedLink[] {
  return (links ?? []).flatMap((link) => {
    const href = safeHref(link.href);
    if (href === null) return [];
    return [{ label: link.label, href, as: isInternalHref(href) ? EldraRouterLink : undefined }];
  });
}

const groups = computed(() =>
  (data.value.groups ?? []).map((group) => ({
    title: group.title,
    links: resolveLinks(group.links),
  }))
);
const minimalLinks = computed(() => resolveLinks(data.value.links));
const legalLinks = computed(() => resolveLinks(data.value.legalLinks));

const SOCIAL_ICON_NAMES: Record<string, string> = {
  instagram: 'brand-instagram',
  facebook: 'brand-facebook',
  pinterest: 'brand-pinterest',
  tiktok: 'brand-tiktok',
  youtube: 'brand-youtube',
};

const SOCIAL_NAME_KEYS: Record<string, MessageKey> = {
  instagram: 'footer.social.instagram',
  facebook: 'footer.social.facebook',
  pinterest: 'footer.social.pinterest',
  tiktok: 'footer.social.tiktok',
  youtube: 'footer.social.youtube',
};

const socialLinks = computed(() =>
  (data.value.social ?? []).flatMap((item) => {
    const href = safeHref(item.href);
    if (href === null) return [];
    return [
      {
        network: item.network,
        href,
        as: isInternalHref(href) ? EldraRouterLink : undefined,
        icon: SOCIAL_ICON_NAMES[item.network] ?? 'link',
      },
    ];
  })
);

function socialLinkName(network: string): string {
  const key = SOCIAL_NAME_KEYS[network] ?? 'footer.social.instagram';
  return t('footer.socialLinkName', { brand: data.value.brandText, network: t(key) });
}

const showLocale = computed(() => data.value.showLocale ?? true);
const showCurrency = computed(() => data.value.showCurrency ?? true);
const hasSelectors = computed(() => showLocale.value || showCurrency.value);

/** The spec's own example locales/currencies (not CMS content — see file doc). */
const LOCALE_VALUES = ['us-en', 'ca-en', 'ca-fr'] as const;
const CURRENCY_VALUES = ['USD', 'CAD', 'EUR'] as const;

const localeOptions = computed<SelectOption[]>(() => [
  { value: 'us-en', label: t('footer.localeOptions.usEnglish') },
  { value: 'ca-en', label: t('footer.localeOptions.caEnglish') },
  { value: 'ca-fr', label: t('footer.localeOptions.caFrench') },
]);
const currencyOptions = computed<SelectOption[]>(() => [
  { value: 'USD', label: t('footer.currencyOptions.usd') },
  { value: 'CAD', label: t('footer.currencyOptions.cad') },
  { value: 'EUR', label: t('footer.currencyOptions.eur') },
]);

const locale = ref<string>(LOCALE_VALUES[0]);
const currency = ref<string>(CURRENCY_VALUES[0]);

/* ---------------------------------------------------------------------- */
/* Newsletter                                                              */
/* ---------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = ref('');
const emailError = ref<string | null>(null);
const newsletterState = ref<'idle' | 'submitting' | 'success'>('idle');
const emailFieldRoot = ref<HTMLElement | null>(null);

const showNewsletter = computed(
  () => variant.value === 'default' && (data.value.showNewsletter ?? true)
);

/** Mirrors `blocks/newsletter/Block.vue`'s own comment: an error has to clear itself the moment
 *  its own condition is fixed (the visitor edits the address), not only inside a later successful
 *  `onNewsletterSubmit` — otherwise a corrected but still-marked field wedges every future submit
 *  behind `FormLayout`'s own invalid gate before this handler ever runs. */
watch(email, () => {
  emailError.value = null;
  retryable.value = false;
});

/** See the module doc comment: a sign-up-service failure is retryable — nothing about the value
 *  itself is wrong — so the field is remembered as such and, when `FormLayout`'s invalid gate
 *  fires on the unchanged resubmit, the stale mark is cleared and the same submit is re-dispatched. */
const retryable = ref(false);

function onNewsletterInvalid(): void {
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

async function onNewsletterSubmit(payload: FormLayoutSubmitPayload): Promise<void> {
  payload.event.preventDefault();
  // Spec "Newsletter submitting": repeat submits are ignored while one is already in flight (the
  // submit Button stays clickable while loading — see `Button.vue`'s own comment on that).
  if (newsletterState.value === 'submitting') return;

  const value = String(payload.data.get('email') ?? '').trim();

  if (!EMAIL_PATTERN.test(value)) {
    emailError.value = t('footer.emailInvalid');
    await focusEmailField();
    return;
  }

  emailError.value = null;
  newsletterState.value = 'submitting';
  const result = await storefront.forms.subscribe({ email: value, list: 'footer-newsletter' });

  if (result.ok) {
    newsletterState.value = 'success';
    return;
  }

  newsletterState.value = 'idle';
  const serviceFailed = result.reason !== 'invalid';
  retryable.value = serviceFailed;
  emailError.value = serviceFailed ? t('footer.emailError') : t('footer.emailInvalid');
  await focusEmailField();
}
</script>

<template>
  <Section
    as="footer"
    :background="background"
    spacing="none"
    :labelled-by="variant === 'default' ? headingId : undefined"
    :aria-label="variant === 'minimal' ? t('footer.title') : undefined"
    :classes="{ root: paddingClass }"
  >
    <Container width="wide">
      <VisuallyHidden v-if="variant === 'default'" :id="headingId" as="h2">{{
        t('footer.title')
      }}</VisuallyHidden>

      <!-- Default variant: brand · link groups · newsletter -->
      <div
        v-if="variant === 'default'"
        class="@tablet:grid-cols-2 @content:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3.5fr)] @content:gap-12 grid gap-10"
      >
        <div class="max-w-[22rem]">
          <Link
            href="/"
            :as="EldraRouterLink"
            variant="standalone"
            :underline="false"
            :classes="{
              root: 'inline-flex items-center hover:no-underline active:no-underline',
              label: 'font-heading text-text text-xl leading-[1.2] font-bold tracking-[-0.015em]',
            }"
          >
            <img
              v-if="data.brandLogo"
              :src="data.brandLogo.url"
              :alt="data.brandText"
              class="h-10 w-auto max-w-none"
              loading="eager"
              decoding="async"
            />
            <template v-else>{{ data.brandText }}</template>
          </Link>
          <p v-if="data.description" class="text-muted mt-4 text-base leading-relaxed">
            {{ data.description }}
          </p>

          <ul v-if="socialLinks.length > 0" class="mt-6 -ml-3 flex flex-wrap gap-1" role="list">
            <li v-for="social in socialLinks" :key="social.network">
              <Button
                icon-only
                variant="ghost"
                :href="social.href"
                :as="social.as"
                target="_blank"
                rel="noopener"
                :label="socialLinkName(social.network)"
                :classes="{ container: 'size-11' }"
              >
                <template #leadingIcon>
                  <EldraIcon :name="social.icon" size="md" />
                </template>
              </Button>
            </li>
          </ul>
        </div>

        <nav
          v-if="groups.length > 0"
          :aria-label="t('footer.nav')"
          class="@tablet:col-span-2 @content:col-span-1"
        >
          <div class="@content:grid-cols-3 grid grid-cols-2 gap-x-6 gap-y-8">
            <div v-for="(group, index) in groups" :key="index">
              <h3 class="text-text text-base font-semibold">{{ group.title }}</h3>
              <ul class="mt-2 space-y-1">
                <li v-for="(link, linkIndex) in group.links" :key="linkIndex">
                  <Link
                    :href="link.href"
                    :as="link.as"
                    tone="muted"
                    :underline="false"
                    :classes="{ root: 'inline-flex min-h-9 items-center text-base' }"
                    >{{ link.label }}</Link
                  >
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <div v-if="showNewsletter" class="@tablet:col-span-2 @content:col-span-1">
          <template v-if="newsletterState !== 'success'">
            <FormLayout
              layout="inline"
              :heading="data.newsletterTitle || undefined"
              :heading-level="3"
              :aria-label="data.newsletterTitle ? undefined : t('footer.newsletterAriaLabel')"
              :submitting="newsletterState === 'submitting'"
              @submit="onNewsletterSubmit"
              @invalid="onNewsletterInvalid"
            >
              <p
                v-if="data.newsletterText"
                class="text-muted mb-1 w-full text-base leading-relaxed"
              >
                {{ data.newsletterText }}
              </p>
              <div ref="emailFieldRoot" class="contents">
                <FieldWrapper
                  :label="t('footer.emailLabel')"
                  :error="emailError ?? undefined"
                  :classes="{ label: 'sr-only' }"
                >
                  <Input
                    v-model="email"
                    type="email"
                    name="email"
                    autocomplete="email"
                    :placeholder="t('footer.emailLabel')"
                  />
                </FieldWrapper>
              </div>
              <template #actions>
                <Button type="submit" variant="primary" :label="t('footer.subscribing')">{{
                  t('footer.subscribe')
                }}</Button>
              </template>
            </FormLayout>
          </template>
          <p v-else role="status" class="text-text flex items-center gap-2 text-base">
            <EldraIcon name="circle-check" size="md" class="text-success" />
            {{ t('footer.subscribed') }}
          </p>
        </div>
      </div>

      <!-- Minimal variant: brand · flat links · social -->
      <div v-else class="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <Link
          href="/"
          :as="EldraRouterLink"
          variant="standalone"
          :underline="false"
          :classes="{
            root: 'inline-flex items-center hover:no-underline active:no-underline',
            label: 'font-heading text-text text-xl leading-[1.2] font-bold tracking-[-0.015em]',
          }"
        >
          <img
            v-if="data.brandLogo"
            :src="data.brandLogo.url"
            :alt="data.brandText"
            class="h-10 w-auto max-w-none"
            loading="eager"
            decoding="async"
          />
          <template v-else>{{ data.brandText }}</template>
        </Link>

        <nav v-if="minimalLinks.length > 0" :aria-label="t('footer.nav')">
          <ul class="flex flex-wrap items-center gap-x-6 gap-y-2" role="list">
            <li v-for="(link, index) in minimalLinks" :key="index">
              <Link
                :href="link.href"
                :as="link.as"
                tone="muted"
                :underline="false"
                :classes="{ root: 'inline-flex min-h-9 items-center text-base' }"
                >{{ link.label }}</Link
              >
            </li>
          </ul>
        </nav>

        <ul v-if="socialLinks.length > 0" class="flex flex-wrap gap-1" role="list">
          <li v-for="social in socialLinks" :key="social.network">
            <Button
              icon-only
              variant="ghost"
              :href="social.href"
              :as="social.as"
              target="_blank"
              rel="noopener"
              :label="socialLinkName(social.network)"
              :classes="{ container: 'size-11' }"
            >
              <template #leadingIcon>
                <EldraIcon :name="social.icon" size="md" />
              </template>
            </Button>
          </li>
        </ul>
      </div>

      <!-- Legal row -->
      <div
        class="border-border text-muted @tablet:flex-row @tablet:items-center @tablet:justify-between mt-12 flex flex-col gap-4 border-t pt-6 text-[0.8125rem] leading-[1.4]"
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p v-if="data.legalText">{{ data.legalText }}</p>
          <ul v-if="legalLinks.length > 0" class="flex flex-wrap gap-x-4 gap-y-2" role="list">
            <li v-for="(link, index) in legalLinks" :key="index">
              <Link
                :href="link.href"
                :as="link.as"
                tone="muted"
                :classes="{ root: 'inline-flex min-h-6 items-center' }"
                >{{ link.label }}</Link
              >
            </li>
          </ul>
        </div>

        <div v-if="hasSelectors" class="@tablet:flex-row @tablet:items-center flex flex-col gap-2">
          <FieldWrapper
            v-if="showLocale"
            :label="t('footer.localeLabel')"
            :classes="{ root: 'w-full @tablet:w-auto', label: 'sr-only' }"
          >
            <Select
              v-model="locale"
              :options="localeOptions"
              placement="above"
              searchable
              :search-placeholder="t('footer.localeSearchPlaceholder')"
            />
          </FieldWrapper>
          <FieldWrapper
            v-if="showCurrency"
            :label="t('footer.currencyLabel')"
            :classes="{ root: 'w-full @tablet:w-auto', label: 'sr-only' }"
          >
            <Select
              v-model="currency"
              :options="currencyOptions"
              placement="above"
              :searchable="false"
            />
          </FieldWrapper>
        </div>
      </div>
    </Container>
  </Section>
</template>
