<script setup lang="ts">
/**
 * One large pull quote from the founder, a maker or the press, with attribution and an optional
 * portrait (spec `02-blocks.md` 2302–2396, "Quote"). `variant`:
 *
 *  - `centered`: quote mark, quote and attribution centred in the narrow (40rem) column. The
 *    name/role block beside the avatar always stays left-aligned itself — it sits inside a
 *    horizontal flex row whose own width tracks its content, so centring the row (via the figure's
 *    `items-center`) never centres the two lines of text stacked inside it.
 *  - `with-image`: from 48rem block width, a portrait (4:5, `radius-xl`) sits in a `5fr` column
 *    beside the left-aligned quote in `7fr` (3rem gap, 4rem from 64rem, vertically centred); below
 *    48rem the image stacks above. With no image chosen yet it falls back to the same single,
 *    left-aligned column `centered` would use if it weren't centred — `figureAlignClass` alone
 *    (not `showImageLayout`) decides that alignment, so the fallback needs no extra branch.
 *
 * **Icon size and stroke (package wins).** The spec's quote mark is 3rem at a thin 1.25 stroke;
 * `@eldrajs/ui`'s `Icon` only goes up to `xl` (2rem, `size-8`) and always draws at its own fixed
 * 1.75 stroke — the same trade `feature-grid`'s and `pricing-table`'s own doc comments make for
 * their icons, taken here rather than reaching around the primitive for a literal size or stroke.
 *
 * **`sourceLink`.** The spec's field → layout mapping is explicit: "role → line under the name
 * (wrapped in `sourceLink` when set)" — the link's visible text is the role line itself, not a
 * second, separately-worded string. `sourceLinkLabel` therefore becomes the link's accessible name
 * (`aria-label`, passed straight through as a fallthrough attribute — `Link` has no such prop of
 * its own) rather than separate visible copy: a role line like "Winter gift guide, 2025" doesn't
 * describe its own destination on its own (WCAG 2.4.4), so a friendlier name ("Read the guide")
 * announces instead while the shorter, dated line stays what's printed. The external example link
 * in `mock.json` is not a same-site destination (`isInternalHref` is false for an absolute
 * `https://` URL), so it renders as a plain `Link` with `href` — no `EldraRouterLink` routing.
 *
 * **Colour on `primary`/`accent`.** `Section` already sets the ground's own text colour on its root
 * (`text-text` on `none`/`surface`/`surface-strong`, `text-primary-contrast`/`text-accent-contrast`
 * on the two inverting grounds), and that is a normal inherited CSS `color` — so the quote paragraph
 * and the `<cite>` name carry no colour class of their own and simply inherit whichever one is
 * right. `Link` already inverts its own `muted` tone through its `group-data-[section=…]/section:`
 * classes, so the role line needs no extra handling when it is a link. Only the two parts with no
 * such built-in mechanism branch by hand: the quote mark (`accent` by default, since an `accent`
 * mark would vanish on an `accent` ground) and the plain-text role line for when there is no
 * `sourceLinkHref` to hand it to `Link`.
 */
import { computed } from 'vue';
import {
  Avatar,
  Container,
  EditorPlaceholder,
  Link,
  Section,
  VisuallyHidden,
  type ContainerWidth,
  type SectionBackground,
} from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING, type ImageFraming } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'quote'> }>();
const { data, entryId } = useBlockData(props, 'quote');
const t = useT();
const isEditing = useEditing();
const headingId = `quote-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'centered');
const isWithImage = computed(() => variant.value === 'with-image');

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');
const containerWidth = computed<ContainerWidth>(() => (isWithImage.value ? 'content' : 'narrow'));

const quoteText = computed(() => (data.value.quote ?? '').trim());
const hasQuote = computed(() => quoteText.value !== '');
const nameText = computed(() => (data.value.name ?? '').trim());
const hasName = computed(() => nameText.value !== '');
const roleText = computed(() => (data.value.role ?? '').trim());
const hasRole = computed(() => roleText.value !== '');

/** Live: the whole block — the `Section` root included — renders nothing without a quote (spec
 *  States → Empty: "Live site renders nothing without a quote."), the same "gate the root itself"
 *  shape `announcement-bar`'s own empty state uses. Editing: always renders, so the empty-quote and
 *  empty-name hints have somewhere to show. */
const showBlock = computed(() => hasQuote.value || isEditing.value);

const image = computed(() => data.value.image ?? null);
const hasImage = computed(() => Boolean(image.value?.url));
/** `with-image` with no image yet falls back to the plain single column (spec States → "No
 *  image") — `figureAlignClass` below applies the same left alignment either way. */
const showImageLayout = computed(() => isWithImage.value && hasImage.value);
const imageFraming = computed<ImageFraming>(() => image.value?.framing ?? DEFAULT_IMAGE_FRAMING);

const avatarSrc = computed(() => data.value.avatar?.url);

const sourceHref = computed(() => safeHref(data.value.sourceLinkHref));
const sourceLinkLabelText = computed(() => (data.value.sourceLinkLabel ?? '').trim());
/** Nothing to wrap without a role line to show (see the module doc comment's `sourceLink` note). */
const hasSourceLink = computed(() => hasRole.value && sourceHref.value !== null);
const sourceLinkAs = computed(() =>
  sourceHref.value !== null && isInternalHref(sourceHref.value) ? EldraRouterLink : undefined
);
const sourceLinkAriaLabel = computed(() =>
  sourceLinkLabelText.value !== '' ? sourceLinkLabelText.value : undefined
);

/** The mark is `accent` at rest; on `primary`/`accent` it switches to that ground's contrast
 *  colour, same as the quote and the name (spec States → "On primary"/"On accent"). */
const markClass = computed(() => {
  if (sectionBackground.value === 'primary') return 'text-primary-contrast';
  if (sectionBackground.value === 'accent') return 'text-accent-contrast';
  return 'text-accent';
});

/** Only for the plain-text role line (no `sourceLinkHref`) — `Link` already inverts its own
 *  `muted` tone when it is one. */
const roleToneClass = computed(() => {
  if (sectionBackground.value === 'primary') return 'text-primary-contrast/90';
  if (sectionBackground.value === 'accent') return 'text-accent-contrast/90';
  return 'text-muted';
});

/** `centered`: quote mark, quote and attribution row centred. `with-image` (image or not): a
 *  single left-aligned column — see the module doc comment. */
const figureAlignClass = computed(() =>
  isWithImage.value ? 'items-start text-left' : 'items-center text-center'
);

/** Spec Layout: 1.5rem below 48rem, 2rem from 48rem, 2.25rem from 64rem for `centered` — `with-
 *  image` stays at 2rem from 64rem. */
const quoteClass = computed(() => [
  'font-heading font-medium leading-[1.3] tracking-[-0.01em] text-balance',
  'text-[1.5rem] @tablet:text-[2rem]',
  isWithImage.value ? '' : '@content:text-[2.25rem]',
]);
</script>

<template>
  <Section v-if="showBlock" :background="sectionBackground" spacing="md" :labelled-by="headingId">
    <Container :width="containerWidth">
      <VisuallyHidden as="h2" :id="headingId">{{
        t('quote.headingFor', { name: nameText })
      }}</VisuallyHidden>

      <div
        class="grid gap-8"
        :class="
          showImageLayout
            ? '@tablet:grid-cols-[5fr_7fr] @tablet:items-center @tablet:gap-12 @content:gap-16'
            : ''
        "
      >
        <UiImage
          v-if="showImageLayout"
          :src="image!.url!"
          :alt="image!.altText ?? ''"
          :framing="imageFraming"
          :entry-id="entryId"
          field-path="image"
          aspect="4/5"
          rounded="xl"
        />

        <figure class="flex flex-col gap-6" :class="figureAlignClass">
          <EldraIcon name="quote" size="xl" :class="markClass" />

          <blockquote v-if="hasQuote" :class="quoteClass">
            <p>{{ quoteText }}</p>
          </blockquote>
          <EditorPlaceholder
            v-else-if="isEditing"
            inline
            :label="t('quote.quoteHintLabel')"
            :help="t('quote.quoteHintHelp')"
          />

          <figcaption v-if="hasQuote" class="flex items-center gap-3 text-left">
            <Avatar :src="avatarSrc" :name="nameText" size="lg" decorative />
            <div class="min-w-0">
              <cite v-if="hasName" class="block text-base font-semibold not-italic">{{
                nameText
              }}</cite>
              <EditorPlaceholder v-else-if="isEditing" inline :label="t('quote.nameHintLabel')" />

              <Link
                v-if="hasSourceLink"
                :href="sourceHref!"
                :as="sourceLinkAs"
                tone="muted"
                class="block text-sm"
                :aria-label="sourceLinkAriaLabel"
              >
                {{ roleText }}
              </Link>
              <span v-else-if="hasRole" class="block text-sm" :class="roleToneClass">{{
                roleText
              }}</span>
            </div>
          </figcaption>
        </figure>
      </div>
    </Container>
  </Section>
</template>
