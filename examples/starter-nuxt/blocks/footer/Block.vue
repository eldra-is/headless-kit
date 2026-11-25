<script setup lang="ts">
/**
 * Site footer (spec `eldra-starter-spec/02-blocks.md` lines 440–597, restyled to the Northwind
 * design: a dark `primary` ground by default). `variant`:
 *  - `default`: brand (wordmark, optional description, the store's address, phone · email and
 *    opening hours, social), link groups as columns, an optional newsletter sign-up on a light card.
 *    Bottom bar below a hairline: the legal line and links, and the locale/currency selectors.
 *  - `minimal`: brand, a flat row of links, social. Then the same bottom bar.
 *
 * Editor hints (`EditorPlaceholder`, gated by `useEditing()`) cover the spec's three Footer
 * "States" rows — description, link groups, newsletter — on the `default` variant; see `editing`
 * below.
 *
 * Landmark naming follows the spec literally per variant (line 549): `default`'s `<footer>` is
 * `aria-labelledby` a visually hidden `<h2>` ("Site footer"); `minimal` has no heading of its own
 * (no groups, no newsletter title), so it names the landmark directly with `aria-label` instead —
 * both are real, valid accessible names, this is just which mechanism supplies it.
 *
 * The locale `Select` renders with no `leadingIcon` (spec: decorative "world" icon).
 * `Select.leadingIcon` needs a synchronous `IconComponent`; this theme's only icon resolution path
 * (`EldraIcon`/`useEldraIcon`) is name-based and asynchronous (an HTTP fetch under Nuxt, with no
 * client-side raw-SVG source to resolve one synchronously from). Wiring one in would mean either
 * forking `@eldrajs/ui`'s `Select` or hand-rolling a second, parallel icon-loading path outside
 * `useEldraIcon` for a purely decorative detail with no acceptance criterion or test coverage —
 * left out rather than doing either. The single-currency slot is the design's "Currency USD $"
 * line: a visible label and the store's currency, no icon.
 *
 * Every group/flat/legal destination is a `link` value — a collection, product, page or entry the
 * platform knows, or an external URL — resolved once through `useEldraLink()`. A row whose target
 * has been deleted, or that the site has no route for, keeps its label and renders as plain text
 * rather than a dead anchor; a row with no label renders nothing. A same-site path routes through
 * `EldraRouterLink` (see `app/utils/links.ts`). Column and flat links are `:underline="false"`
 * (a list of links, not links in running text), underlined on hover; the phone and email links sit
 * in a line of text and the legal links keep the package's own underline-at-rest default (spec:
 * "always underlined").
 *
 * The locale selector is **not** CMS content, and it is not a theme constant either: its options are
 * the organisation's own content locales (`useEldraLocale().supported`, read once at build onto the
 * runtime config by `@eldrajs/theme-nuxt`). The spec called them "mock-independent theme constants"
 * and the block shipped a `us-en / ca-en / ca-fr` demo list, which named three locales no store has
 * and switched to none of them. Each option is labelled with the locale's **own** name through
 * `Intl.DisplayNames(tag, { type: 'language' })` — "íslenska (Ísland)", not "Icelandic" — because a
 * visitor looking for their language is looking for it written the way they write it; the raw tag is
 * the fallback for a locale the runtime has no name for. Choosing one navigates to the same page
 * under that locale (`select()`), and with a single locale there is nothing to choose, so it renders
 * nothing at all — the same rule the currency slot already follows. `Select` commits only on `Enter`
 * or a click (its own contract; arrow keys alone only move the active option), so nothing extra is
 * needed here to satisfy "prices reload only after Enter or a click" (3.2.2).
 *
 * The currency selector drives the same choice as the header's picker; one currency is plain text.
 *
 * The newsletter zone posts through `useStorefront().forms.submit('newsletter', …)` — the platform's
 * seeded `newsletter` form, the same one the newsletter block defaults to. Email format is validated
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
import { useEldraLink, useEldraLocale } from '@eldrajs/theme-vue';
import type { ResolvedLink } from '@eldrajs/theme-vue';
import {
  Button,
  Container,
  CurrencyPicker,
  EditorPlaceholder,
  FieldWrapper,
  FormLayout,
  Input,
  Link,
  Section,
  Select,
  useEldraUiLocale,
  VisuallyHidden,
  type FormLayoutSubmitPayload,
  type SelectOption,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import { useFormSpam } from '../../app/composables/useFormSpam';
import { useStorefront } from '../../app/composables/useStorefront';
import EldraIcon from '../../app/components/EldraIcon.vue';
import FormHoneypot from '../../app/components/FormHoneypot.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import type { ThemeIconName } from '../../app/icons';
import { currencyLabel, useMoney } from '../../app/storefront/money';
import { isInternalHref, safeHref } from '../../app/utils/links';

type FooterLink = {
  label: string;
  href: string | undefined;
  as: typeof EldraRouterLink | undefined;
};

/** The seeded form the footer's sign-up zone submits to (`app/formSeeds.ts`). */
const NEWSLETTER_FORM_KEY = 'newsletter';

const props = defineProps<{ entry: EldraBlockEntry<'footer'> }>();
const { data } = useBlockData(props, 'footer');
const { t } = useI18n();
/**
 * The spec's three Footer "States" hints (`eldra-starter-spec/02-blocks.md`): a freshly inserted
 * footer has no description, no link groups and — on a page that already carries a Newsletter
 * block — no newsletter form, so on the live site that band renders almost empty and in the editor
 * there was nothing at all telling an editor what goes where, while all 32 sibling blocks show
 * dashed placeholders. Editor-only, like every other hint in the theme: `useEditing()` is true
 * only in Studio's edit mode, never on the live site and never in read-only preview.
 *
 * Only on the `default` variant — `minimal` has no description, groups or newsletter zone at all,
 * so a hint there would point at fields that variant ignores.
 */
const editing = useEditing();
const storefront = useStorefront();
const money = useMoney();
const uiLocale = useEldraUiLocale();

const headingId = `footer-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'default');
/**
 * The Northwind design is a dark footer: the `primary` ground with light text. That is the look an
 * unset field gets; `surface-strong` stays available for a theme that wants a light footer.
 */
const background = computed(() => data.value.background ?? 'primary');

/**
 * The colours this block writes itself, per ground. `@eldrajs/ui`'s `Link` and `Button` invert on a
 * primary `Section` on their own (`section-primary:`); plain text, rules and the select trigger do
 * not, so each one is picked here. Every pair clears WCAG AA: on primary, 85% of
 * `primary-contrast` is about 8:1 and 75% about 6:1 against the ground; on `surface-strong` the
 * `muted` role is about 5.6:1.
 */
const TONES = {
  primary: {
    body: 'text-primary-contrast/85',
    strong: 'text-primary-contrast',
    heading: 'text-primary-contrast/75',
    rule: 'border-primary-contrast/20',
    ring: 'border-primary-contrast/40 hover:border-primary-contrast',
    trigger:
      'bg-transparent text-primary-contrast border-primary-contrast/60 hover:border-primary-contrast',
    chevron: 'text-primary-contrast/75',
    pickerLabel: '[&>[data-part=label]]:text-primary-contrast/85',
  },
  'surface-strong': {
    body: 'text-muted',
    strong: 'text-text',
    heading: 'text-muted',
    rule: 'border-border',
    ring: 'border-border-strong hover:border-text',
    trigger: undefined,
    chevron: undefined,
    pickerLabel: '[&>[data-part=label]]:text-muted',
  },
} as const;
const tone = computed(() => TONES[background.value] ?? TONES.primary);
/** The bottom bar's selectors: an outlined, transparent trigger on the dark ground (the design's),
 *  the package's own light field on a light one. */
const selectClasses = computed(() =>
  tone.value.trigger ? { trigger: tone.value.trigger, chevron: tone.value.chevron } : undefined
);

/** Section spacing (the design's 4rem top, 2rem bottom): the shared `sm`/`md`/`lg` scale doesn't
 * carry these exact steps, so `spacing="none"` on `Section` and the padding is written here. */
const paddingClass = computed(() => (variant.value === 'minimal' ? 'py-8' : 'pt-16 pb-8'));

/* ---------------------------------------------------------------------- */
/* Store details                                                           */
/* ---------------------------------------------------------------------- */

const address = computed(() => (data.value.address ?? '').trim());
const hours = computed(() => (data.value.hours ?? '').trim());
const phone = computed(() => (data.value.phone ?? '').trim());
const storeEmail = computed(() => (data.value.email ?? '').trim());
/**
 * A `tel:` link only for a number with a digit in it — `safeHref` alone would let `tel:` with
 * nothing after it through, an inert link. Same rule as the contact block's.
 */
const telHref = computed(() => {
  const digits = phone.value.replace(/[^\d+]/g, '');
  return /\d/.test(digits) ? safeHref(`tel:${digits}`) : null;
});
const mailtoHref = computed(() =>
  storeEmail.value === '' ? null : safeHref(`mailto:${storeEmail.value}`)
);
const hasContactLine = computed(() => phone.value !== '' || storeEmail.value !== '');
const hasStoreDetails = computed(
  () => address.value !== '' || hasContactLine.value || hours.value !== ''
);

const resolveLink = useEldraLink();

/** Drops a row with nothing to show, and resolves a same-site destination through the router (see
 *  file doc). A row whose target no longer resolves keeps its label and loses its href. */
function resolveLinks(links: unknown[] | undefined): FooterLink[] {
  return (links ?? []).flatMap((value) => {
    const resolved = resolveLink(value);
    return resolved === null ? [] : toRows([resolved]);
  });
}

/** The same drop-and-route rule over links that are already resolved — a group's children. */
function toRows(resolved: readonly ResolvedLink[]): FooterLink[] {
  return resolved.flatMap((link) => {
    if (link.label === null) return [];
    const href = link.href ?? undefined;
    return [
      {
        label: link.label,
        href,
        as: href !== undefined && isInternalHref(href) ? EldraRouterLink : undefined,
      },
    ];
  });
}

/**
 * A link group is one link whose label is the column heading and whose children are the column's
 * links — the same shape the header's mega-menu uses. A group's own destination is never rendered,
 * for the same reason the header's is not: the row that heads a column is a heading, not a link.
 */
const groups = computed(() =>
  (data.value.groups ?? []).flatMap((value) => {
    const resolved = resolveLink(value);
    if (resolved === null || resolved.label === null) return [];
    return [{ title: resolved.label, links: toRows(resolved.children) }];
  })
);
const minimalLinks = computed(() => resolveLinks(data.value.links));
const legalLinks = computed(() => resolveLinks(data.value.legalLinks));

/** Typed against the theme's own icon set, so a name it does not bundle is a type error. */
const SOCIAL_ICON_NAMES: Record<string, ThemeIconName> = {
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
  return t('footer.socialLinkName', {
    brand: data.value.brandText,
    network: t(key),
  });
}

/**
 * The site's own locales, and which one this page is in.
 *
 * `supported` is empty on a store that has configured none and on every render outside a Nuxt site
 * (a story, a unit mount), which is the same thing as far as this block is concerned: nothing to
 * switch between.
 */
const activeLocale = useEldraLocale();

/**
 * Each option is labelled with the locale's **own** name — "íslenska (Ísland)", not "Icelandic" —
 * which `useEldraLocale().name` answers from `Intl.DisplayNames` with the tag as the fallback.
 *
 * The lookup is not done here, and that is the whole point: it is ICU data, and the renderer and
 * the browser do not always have the same of it (Node answers "íslenska (Ísland)" for `is-IS` where
 * a reduced-ICU browser build answers "Icelandic (Iceland)"), so a block that computed its own
 * labels shipped a prerendered footer that hydrated into a mismatch and repainted — on every page
 * of the site. The adapter resolves them once, on the server, and carries them to the browser.
 */
const localeOptions = computed<SelectOption[]>(() =>
  activeLocale.supported.map((tag) => ({
    value: tag,
    label: activeLocale.name(tag),
  }))
);

/**
 * The switcher renders only when there is a choice to make. A single-locale store — which is most
 * of them, and every Storybook story — gets no control at all rather than a combobox a visitor can
 * open onto one option, exactly as the currency slot does.
 */
const showLocale = computed(
  () => (data.value.showLocale ?? true) && localeOptions.value.length > 1
);
const showCurrency = computed(() => data.value.showCurrency ?? true);

const currencyStore = storefront.currency;
/** The currencies the store offers, or the one `Price` formats in. */
const currencyCodes = computed<readonly string[]>(() => {
  const offered = currencyStore.offered.value;
  const store = money.currency.value;
  return offered.length > 0 ? offered : store === undefined ? [] : [store];
});
const showCurrencySelector = computed(() => showCurrency.value && currencyCodes.value.length > 0);

const hasSelectors = computed(() => showLocale.value || showCurrencySelector.value);

/**
 * The legal row carries the rule that separates it from the zone above, so a row with nothing in it
 * is a hairline across the footer under empty space. A footer with no legal line, no legal links and
 * both selectors off has exactly that, which is a shape an author can reach from the panel — and the
 * shape a store that has not written its policy pages yet starts from — so the row goes when there is
 * nothing to rule off.
 */
const hasLegalRow = computed(
  () => Boolean(data.value.legalText) || legalLinks.value.length > 0 || hasSelectors.value
);

/**
 * The selector's value is the page's own locale, and setting it is a navigation — there is no local
 * state to keep. The page the visitor lands on is this same page under the chosen locale's prefix,
 * which is what re-renders this footer with the new value; a `ref` of its own would have shown the
 * choice immediately and then disagreed with the page if the navigation was refused or slow.
 */
const locale = computed<string>({
  get: () => activeLocale.active ?? '',
  set: (value) => {
    if (value !== '' && value !== activeLocale.active) activeLocale.select(value);
  },
});

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
// Only a footer that shows the sign-up reads the form's definition (its honeypot and Turnstile).
const {
  definition,
  honeypot,
  honeypotField,
  siteKey,
  consentSentence,
  turnstileRoot,
  challenge,
  signals,
  reset,
} = useFormSpam(computed(() => (showNewsletter.value ? NEWSLETTER_FORM_KEY : '')));
const consentSentenceId = `footer-consent-sentence-${useUiId()}`;
// The merchant's own label and placeholder on the form's email field; the theme's wording stands in until the
// definition has loaded.
const emailField = computed(() => definition.value?.fields.find((field) => field.type === 'email'));
const emailLabel = computed(() => emailField.value?.label || t('footer.emailLabel'));
const emailPlaceholder = computed(() => emailField.value?.placeholder || undefined);

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

  // Turnstile is on and not passed: nothing about the address is wrong, so a retry is welcome.
  const blocked = challenge();
  if (blocked !== null) {
    retryable.value = true;
    emailError.value = blocked;
    await focusEmailField();
    return;
  }

  emailError.value = null;
  newsletterState.value = 'submitting';
  const result = await storefront.forms.submit(NEWSLETTER_FORM_KEY, {
    values: { email: value },
    ...signals(),
  });
  // A Turnstile token is single-use, whatever the outcome.
  reset();

  if (result.ok) {
    newsletterState.value = 'success';
    return;
  }

  newsletterState.value = 'idle';
  const serviceFailed = result.reason !== 'invalid';
  retryable.value = serviceFailed;
  emailError.value = serviceFailed
    ? t('footer.emailError')
    : (result.errors.email?.[0] ?? t('footer.emailInvalid'));
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
    :class="paddingClass"
  >
    <Container width="wide">
      <VisuallyHidden v-if="variant === 'default'" :id="headingId" as="h2">{{
        t('footer.title')
      }}</VisuallyHidden>

      <!-- Default variant: brand and store details · link columns · optional newsletter.
           Four columns from 1100px (brand 1.4fr), three below that with the brand on its own row,
           two below 760px. -->
      <div
        v-if="variant === 'default'"
        class="grid grid-cols-2 gap-10 @min-[47.5rem]:grid-cols-3 @min-[68.75rem]:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]"
      >
        <div class="col-span-full min-w-0 @min-[68.75rem]:col-span-1">
          <Link
            href="/"
            :as="EldraRouterLink"
            variant="standalone"
            :underline="false"
            class="mb-4 inline-flex max-w-full items-center hover:no-underline active:no-underline"
            :classes="{
              label: ['font-heading text-[2.5rem] leading-none font-medium', tone.strong].join(' '),
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
          <p v-if="data.description" :class="['mb-3 text-base leading-relaxed', tone.body]">
            {{ data.description }}
          </p>
          <EditorPlaceholder
            v-else-if="editing"
            inline
            class="mb-3"
            :label="t('footer.descriptionHintLabel')"
          />

          <div v-if="hasStoreDetails" :class="['space-y-1 text-base leading-relaxed', tone.body]">
            <address v-if="address || hasContactLine" class="space-y-1 not-italic">
              <p v-if="address">{{ address }}</p>
              <p v-if="hasContactLine" class="flex flex-wrap items-baseline gap-x-2">
                <template v-if="phone">
                  <Link v-if="telHref" :href="telHref">{{ phone }}</Link>
                  <span v-else>{{ phone }}</span>
                </template>
                <span v-if="phone && storeEmail" aria-hidden="true">·</span>
                <template v-if="storeEmail">
                  <Link v-if="mailtoHref" :href="mailtoHref" class="break-all">{{
                    storeEmail
                  }}</Link>
                  <span v-else class="break-all">{{ storeEmail }}</span>
                </template>
              </p>
            </address>
            <p v-if="hours">{{ hours }}</p>
          </div>

          <ul v-if="socialLinks.length > 0" class="mt-5 flex flex-wrap gap-2" role="list">
            <li v-for="social in socialLinks" :key="social.network">
              <Button
                icon-only
                variant="outline"
                :href="social.href"
                :as="social.as"
                target="_blank"
                rel="noopener"
                :label="socialLinkName(social.network)"
                :class="['size-11 rounded-full', tone.ring]"
              >
                <template #leadingIcon>
                  <EldraIcon :name="social.icon" size="md" />
                </template>
              </Button>
            </li>
          </ul>
        </div>

        <EditorPlaceholder
          v-if="groups.length === 0 && editing"
          class="col-span-full @min-[68.75rem]:col-span-3"
          :label="t('footer.groupsHintLabel')"
          :help="t('footer.groupsHintHelp')"
        />
        <!-- One labelled `nav` over every column, laid on the parent grid's own tracks. -->
        <nav
          v-else-if="groups.length > 0"
          :aria-label="t('footer.nav')"
          class="col-span-full grid grid-cols-subgrid gap-y-10 @min-[68.75rem]:col-span-3"
        >
          <div v-for="(group, index) in groups" :key="index" class="min-w-0">
            <h3
              :class="[
                'font-body mb-3.5 text-xs leading-normal font-bold tracking-[0.14em] uppercase',
                tone.heading,
              ]"
            >
              {{ group.title }}
            </h3>
            <ul class="grid gap-2" role="list">
              <li v-for="(link, linkIndex) in group.links" :key="linkIndex">
                <Link
                  v-if="link.href"
                  :href="link.href"
                  :as="link.as"
                  :underline="false"
                  class="text-base leading-relaxed"
                  >{{ link.label }}</Link
                >
                <span v-else :class="['text-base leading-relaxed', tone.body]">{{
                  link.label
                }}</span>
              </li>
            </ul>
          </div>
        </nav>

        <EditorPlaceholder
          v-if="!showNewsletter && editing"
          class="col-span-full"
          :label="t('footer.newsletterHintLabel')"
        />
        <!-- The sign-up sits on a light card of its own (`data-section="none"` stops the primary
             ground's inversions inside it), so the form's own label, error and button colours are
             the ones `@eldrajs/ui` draws on a light ground, whatever the footer's background. -->
        <div
          v-else-if="showNewsletter"
          data-section="none"
          class="bg-background text-text col-span-full rounded-xl p-6 @min-[47.5rem]:p-8"
        >
          <template v-if="newsletterState !== 'success'">
            <FormLayout
              layout="inline"
              :heading="data.newsletterTitle || undefined"
              :heading-level="3"
              :aria-label="data.newsletterTitle ? undefined : t('footer.newsletterAriaLabel')"
              :submitting="newsletterState === 'submitting'"
              :classes="{ actions: 'w-full mt-3' }"
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
                  :label="emailLabel"
                  :error="emailError ?? undefined"
                  class="block w-full"
                >
                  <Input
                    v-model="email"
                    type="email"
                    name="email"
                    autocomplete="email"
                    :placeholder="emailPlaceholder"
                  />
                </FieldWrapper>
              </div>
              <FormHoneypot v-model="honeypot" :name="honeypotField" />
              <div v-if="siteKey" ref="turnstileRoot" class="w-full" />
              <template #actions>
                <div class="grid w-full grid-cols-[minmax(0,1fr)] gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    block
                    :label="t('footer.subscribing')"
                    :aria-describedby="consentSentence ? consentSentenceId : undefined"
                    >{{ t('footer.subscribe') }}</Button
                  >
                  <p
                    v-if="consentSentence"
                    :id="consentSentenceId"
                    data-part="consent-sentence"
                    class="text-muted text-body-sm"
                  >
                    {{ consentSentence }}
                  </p>
                </div>
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
          class="inline-flex max-w-full items-center hover:no-underline active:no-underline"
          :classes="{
            label: ['font-heading text-[1.75rem] leading-none font-medium', tone.strong].join(' '),
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
                v-if="link.href"
                :href="link.href"
                :as="link.as"
                :underline="false"
                class="inline-flex min-h-9 items-center text-base"
                >{{ link.label }}</Link
              >
              <span v-else :class="['inline-flex min-h-9 items-center text-base', tone.body]">{{
                link.label
              }}</span>
            </li>
          </ul>
        </nav>

        <ul v-if="socialLinks.length > 0" class="flex flex-wrap gap-2" role="list">
          <li v-for="social in socialLinks" :key="social.network">
            <Button
              icon-only
              variant="outline"
              :href="social.href"
              :as="social.as"
              target="_blank"
              rel="noopener"
              :label="socialLinkName(social.network)"
              :class="['size-11 rounded-full', tone.ring]"
            >
              <template #leadingIcon>
                <EldraIcon :name="social.icon" size="md" />
              </template>
            </Button>
          </li>
        </ul>
      </div>

      <!-- Bottom bar: legal line and links · selectors. Stacks below 760px. -->
      <div
        v-if="hasLegalRow"
        :class="[
          'mt-12 flex flex-col items-start gap-4 border-t pt-6 text-sm leading-normal @min-[47.5rem]:flex-row @min-[47.5rem]:flex-wrap @min-[47.5rem]:items-center @min-[47.5rem]:justify-between',
          tone.rule,
          tone.body,
        ]"
      >
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p v-if="data.legalText">{{ data.legalText }}</p>
          <ul v-if="legalLinks.length > 0" class="flex flex-wrap gap-x-6 gap-y-2" role="list">
            <li v-for="(link, index) in legalLinks" :key="index">
              <Link
                v-if="link.href"
                :href="link.href"
                :as="link.as"
                class="inline-flex min-h-6 items-center"
                >{{ link.label }}</Link
              >
              <span v-else class="inline-flex min-h-6 items-center">{{ link.label }}</span>
            </li>
          </ul>
        </div>

        <div v-if="hasSelectors" class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FieldWrapper
            v-if="showLocale"
            :label="t('footer.localeLabel')"
            class="w-auto"
            :classes="{ label: 'sr-only' }"
          >
            <!-- Not `searchable`: a store has a handful of content locales, and a search field
                 over three options is one more thing between a visitor and their language. -->
            <Select
              v-model="locale"
              :options="localeOptions"
              placement="above"
              :classes="selectClasses"
            />
          </FieldWrapper>
          <!-- One currency is plain text: there is nothing to pick. -->
          <p
            v-if="showCurrencySelector && currencyCodes.length === 1"
            class="flex items-center gap-2"
          >
            <span>{{ t('footer.currencyLabel') }}</span>
            <span :class="['font-medium', tone.strong]">{{
              currencyLabel(currencyCodes[0]!, uiLocale)
            }}</span>
          </p>
          <CurrencyPicker
            v-else-if="showCurrencySelector"
            :currencies="currencyCodes"
            :model-value="currencyStore.active.value"
            :busy="currencyStore.busy.value"
            :label="t('footer.currencyLabel')"
            show-label
            size="sm"
            placement="above"
            :class="['flex items-center gap-2', tone.pickerLabel]"
            :classes="selectClasses"
            @update:model-value="currencyStore.choose"
          />
        </div>
      </div>
    </Container>
  </Section>
</template>
