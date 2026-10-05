<script setup lang="ts">
/**
 * Site footer (spec `eldra-starter-spec/02-blocks.md` lines 440–597). `variant`:
 *  - `default`: brand (wordmark, description, social), link groups, an optional newsletter
 *    sign-up. Legal row below a hairline, with the locale/currency selectors.
 *  - `minimal`: brand, a flat row of links, social. Then the same legal row.
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
 * left out rather than doing either. The currency slot below renders its own "credit-card" icon
 * directly as an `EldraIcon` (not through `Select.leadingIcon`), so that constraint does not apply
 * to it.
 *
 * Every group/flat/legal destination is a `link` value — a collection, product, page or entry the
 * platform knows, or an external URL — resolved once through `useEldraLink()`. A row whose target
 * has been deleted, or that the site has no route for, keeps its label and renders as plain text
 * rather than a dead anchor; a row with no label renders nothing. A same-site path routes through
 * `EldraRouterLink` (see `app/utils/links.ts`). `tone="muted"` + `:underline="false"` is the
 * spec's tertiary link, turning `text` with an underline only on hover; legal links keep the
 * package's own underline-at-rest default (spec: "always underlined").
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
 * The currency selector is different: the spec was written for a multi-currency store, but the
 * platform supports exactly one currency per store today. So its options are derived from the
 * store (`useMoney().currency`, `app/storefront/money.ts`), not from a constant list, and there is
 * at most one of them — `currencyLabel()` names it "ISK kr" style (code + the narrow sign
 * `@eldrajs/ui` writes the store's prices with in the content locale, falling back to the code
 * alone when the locale has no sign distinct from it). With exactly one option
 * there is nothing to select, so it renders as plain text with the same leading icon and a visually
 * hidden "Currency" label, not a `Select` — a native-looking control a visitor could try to open
 * with nothing inside it would be worse than no control at all. With no currency published, the
 * slot renders nothing. The `Select` branch stays for the day the derived list carries two or more
 * entries; which branch renders is driven by that list's length, not by a separate flag.
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
import { useEldraLink, useEldraLocale } from '@eldrajs/theme-vue';
import type { ResolvedLink } from '@eldrajs/theme-vue';
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
  useEldraUiLocale,
  VisuallyHidden,
  type FormLayoutSubmitPayload,
  type SelectOption,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import { useStorefront } from '../../app/composables/useStorefront';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import type { ThemeIconName } from '../../app/icons';
import { currencyLabel, useMoney } from '../../app/storefront/money';
import { isInternalHref, safeHref } from '../../app/utils/links';
import type { MessageKey } from '../../app/i18n/messages';

type FooterLink = {
  label: string;
  href: string | undefined;
  as: typeof EldraRouterLink | undefined;
};

const props = defineProps<{ entry: EldraBlockEntry<'footer'> }>();
const { data } = useBlockData(props, 'footer');
const t = useT();
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
const background = computed(() => data.value.background ?? 'surface-strong');

/** Section spacing (spec "Footer" → Container/spacing): the shared `sm`/`md`/`lg` scale doesn't
 * carry these exact steps, so `spacing="none"` on `Section` and the padding is written here. */
const paddingClass = computed(() =>
  variant.value === 'minimal' ? 'py-8' : 'pt-12 pb-6 @tablet:pt-16 @tablet:pb-8'
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
  return t('footer.socialLinkName', { brand: data.value.brandText, network: t(key) });
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
 * `Intl.DisplayNames` is constructed per locale, not per render: this runs inside a `computed` that
 * every footer render reads, and the constructor is the expensive part of the lookup. A store has a
 * handful of locales, so the cache is a few entries that never need evicting.
 */
const localeNames = new Map<string, string>();

/**
 * One locale's name **in that locale** — "íslenska (Ísland)", "American English". The tag itself is
 * the fallback twice over: for a runtime that has no name for it (`of()` answers the tag back), and
 * for one that refuses the tag outright (`Intl` throws `RangeError` for a malformed one, and this
 * runs inside a `computed` where a throw takes the whole footer down).
 */
function localeDisplayName(tag: string): string {
  const cached = localeNames.get(tag);
  if (cached !== undefined) return cached;
  let name = tag;
  try {
    name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    name = tag;
  }
  localeNames.set(tag, name);
  return name;
}

const localeOptions = computed<SelectOption[]>(() =>
  activeLocale.supported.map((tag) => ({ value: tag, label: localeDisplayName(tag) }))
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

/**
 * The currency selector's option list, derived from the store rather than the spec's hard-coded
 * USD/CAD/EUR demo list: the platform supports exactly one currency per store today, so this is
 * either empty (the store publishes none) or a single entry — the store's currency, named "ISK
 * kr" style by `currencyLabel()` (code + the same narrow sign every price on the page is written
 * with). Kept as a list, not a single value, so the day the platform supports more than one
 * currency, this grows to match and the template's `Select` branch (below) is already there.
 */
const currencyOptions = computed<SelectOption[]>(() => {
  const code = money.currency.value;
  return code === undefined ? [] : [{ value: code, label: currencyLabel(code, uiLocale.value) }];
});

/** Whether the currency slot renders anything: `showCurrency` on *and* a currency to show it. */
const showCurrencySelector = computed(() => showCurrency.value && currencyOptions.value.length > 0);

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
/** Only reached once `currencyOptions` carries two or more entries — see the template. */
const currency = ref<string>(currencyOptions.value[0]?.value ?? '');

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
          <EditorPlaceholder
            v-else-if="editing"
            inline
            class="mt-4"
            :label="t('footer.descriptionHintLabel')"
          />

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

        <EditorPlaceholder
          v-if="groups.length === 0 && editing"
          class="@tablet:col-span-2 @content:col-span-1"
          :label="t('footer.groupsHintLabel')"
          :help="t('footer.groupsHintHelp')"
        />
        <nav
          v-else-if="groups.length > 0"
          :aria-label="t('footer.nav')"
          class="@tablet:col-span-2 @content:col-span-1"
        >
          <div class="@content:grid-cols-3 grid grid-cols-2 gap-x-6 gap-y-8">
            <div v-for="(group, index) in groups" :key="index">
              <h3 class="text-text text-base font-semibold">{{ group.title }}</h3>
              <ul class="mt-2 space-y-1">
                <li v-for="(link, linkIndex) in group.links" :key="linkIndex">
                  <Link
                    v-if="link.href"
                    :href="link.href"
                    :as="link.as"
                    tone="muted"
                    :underline="false"
                    :classes="{ root: 'inline-flex min-h-9 items-center text-base' }"
                    >{{ link.label }}</Link
                  >
                  <span v-else class="text-muted inline-flex min-h-9 items-center text-base">{{
                    link.label
                  }}</span>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <EditorPlaceholder
          v-if="!showNewsletter && editing"
          class="@tablet:col-span-2 @content:col-span-1"
          :label="t('footer.newsletterHintLabel')"
        />
        <div v-else-if="showNewsletter" class="@tablet:col-span-2 @content:col-span-1">
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
                v-if="link.href"
                :href="link.href"
                :as="link.as"
                tone="muted"
                :underline="false"
                :classes="{ root: 'inline-flex min-h-9 items-center text-base' }"
                >{{ link.label }}</Link
              >
              <span v-else class="text-muted inline-flex min-h-9 items-center text-base">{{
                link.label
              }}</span>
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
        v-if="hasLegalRow"
        class="border-border text-muted @tablet:flex-row @tablet:items-center @tablet:justify-between mt-12 flex flex-col gap-4 border-t pt-6 text-[0.8125rem] leading-[1.4]"
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p v-if="data.legalText">{{ data.legalText }}</p>
          <ul v-if="legalLinks.length > 0" class="flex flex-wrap gap-x-4 gap-y-2" role="list">
            <li v-for="(link, index) in legalLinks" :key="index">
              <Link
                v-if="link.href"
                :href="link.href"
                :as="link.as"
                tone="muted"
                :classes="{ root: 'inline-flex min-h-6 items-center' }"
                >{{ link.label }}</Link
              >
              <span v-else class="inline-flex min-h-6 items-center">{{ link.label }}</span>
            </li>
          </ul>
        </div>

        <div v-if="hasSelectors" class="@tablet:flex-row @tablet:items-center flex flex-col gap-2">
          <FieldWrapper
            v-if="showLocale"
            :label="t('footer.localeLabel')"
            :classes="{ root: 'w-full @tablet:w-auto', label: 'sr-only' }"
          >
            <!-- Not `searchable`: a store has a handful of content locales, and a search field
                 over three options is one more thing between a visitor and their language. -->
            <Select v-model="locale" :options="localeOptions" placement="above" />
          </FieldWrapper>
          <!--
            With exactly one currency there is nothing to select — see the file doc comment — so
            this renders the currency as plain text (same leading icon, a visually hidden
            "Currency" label) rather than a `Select` a visitor could open onto an empty list. The
            `Select` branch stays for the day `currencyOptions` carries two or more entries.
          -->
          <p
            v-if="showCurrencySelector && currencyOptions.length === 1"
            class="text-text @tablet:w-auto flex w-full items-center gap-1.5 text-[0.8125rem] font-medium"
          >
            <EldraIcon name="credit-card" size="sm" class="text-muted shrink-0" />
            <VisuallyHidden>{{ t('footer.currencyLabel') }}</VisuallyHidden>
            {{ currencyOptions[0]!.label }}
          </p>
          <FieldWrapper
            v-else-if="showCurrencySelector"
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
