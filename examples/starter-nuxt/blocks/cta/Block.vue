<script setup lang="ts">
/**
 * A focused band asking the visitor to do one thing (spec `02-blocks.md` 745–856). `variant`:
 *  - `primary`: full-width `primary` band, centred copy — `Section background="primary"` already
 *    marks `class="group/section" data-section="primary"` on its own root, which is the package's
 *    own signal that inverts `Button` (a `primary-contrast` fill with `primary` text; `outline`
 *    becomes a transparent `currentColor` box) with no hand-written colour in this block.
 *  - `subtle`: the same centred layout on `Section background="surface"` (no inversion — only
 *    `primary`/`accent` grounds invert).
 *  - `split`: a rounded (`radius-xl`) `surface` panel that clips its own content — copy on the
 *    left, `UiImage` edge to edge on the right, stacking below `@tablet` (48rem, the block's own
 *    width, never the viewport — every breakpoint below is a `@container` query). `surface` never
 *    inverts, so this panel carries no `data-section` at all. With no image it falls back to the
 *    same centred `subtle`-style copy, inside the panel.
 *  - `banner`: a compact `accent` panel the block marks **by hand**
 *    (`class="group/section" data-section="accent"` on the panel `<div>`, not the `Section`, whose
 *    own `background` stays `none` here per the design spec's Section table) — that hand-written
 *    marker is what inverts the one button the same way `Section`'s own `data-section` does
 *    elsewhere. No eyebrow, no secondary action; heading keeps the `h2` tag but is styled at the
 *    `h3` scale.
 *
 * Both actions are `@eldrajs/ui`'s `Button` (`primary` + `outline`, both `lg`) — the design spec's
 * own "Uses" line names `Button`, not `Link`, for this block. The `banner` button additionally
 * switches its own control height with the block's width (spec: "Buttons are 3rem tall (the
 * `banner` button is 2.75rem below 48rem)"): `size="lg"` keeps its `lg` padding/gap/text sizing at
 * every width — the package has no separate size preset for one block's own in-between height, and
 * forking `Button` for it is out of scope (Global Constraints) — while `classes.container:
 * 'control-h @tablet:control-h-lg'` swaps only the height utility itself: `control-h` (the
 * package's own `md`, 2.5rem — the closest token-backed height to the spec's 2.75rem, since there
 * is no `--eldra-control-height-*` step at exactly 2.75rem either) below `@tablet` (48rem of the
 * block's own width), `control-h-lg` (3rem) from `@tablet` on. `cx`'s custom `twMerge` config
 * registers `control-h`/`control-h-sm`/`control-h-lg` as one conflicting group
 * (`packages/ui/src/utils/cx.ts`), so the override cleanly replaces `size="lg"`'s own base
 * `control-h-lg` at the unprefixed (mobile) level without touching its `@tablet:`-scoped one.
 *
 * Full-width-below-`@tablet` buttons elsewhere use the same base/`@tablet:` class pair every other
 * rebuilt block's own container-query classes use (`w-full @tablet:w-auto` on `Button`'s own
 * `container` part) rather than the static `block` prop, since the width itself has to flip at the
 * breakpoint, not stay fixed.
 *
 * The three per-field editor hints spec line 815 lists ("Add a heading", "Add supporting text
 * (optional)", "Add a button") render only via `useEditing()`, each replacing just the empty part
 * it names — `heading`/`primaryCta` are required fields, so their own hint is only ever visible
 * for the moment between a fresh insert and an editor filling them in.
 *
 * The heading's `1.625rem`/`2rem` (`1.25rem`/`1.5rem` in `banner`) and the `split` image's
 * `14rem`/`22rem` minimum heights are the design spec's own literal numbers with no matching
 * `--eldra-*` scale step — the same "no matching token" exception `announcement-bar`'s own
 * `text-[0.875rem]` line documents. Every colour, radius and spacing step elsewhere (`bg-accent`,
 * `rounded-xl`, `gap-4`, `p-6`, …) is a token-backed Tailwind utility, per Global Constraints.
 */
import { computed } from 'vue';
import { Button, Container, EditorPlaceholder, Section } from '@eldrajs/ui';
import type { ContainerWidth, SectionBackground, SectionSpacing } from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'cta'> }>();
const { data, entryId } = useBlockData(props, 'cta');
const t = useT();
const isEditing = useEditing();
const headingId = `cta-heading-${useUiId()}`;

type Variant = 'primary' | 'subtle' | 'split' | 'banner';
const variant = computed<Variant>(() => data.value.variant ?? 'primary');
const isPrimary = computed(() => variant.value === 'primary');
const isSplit = computed(() => variant.value === 'split');
const isBanner = computed(() => variant.value === 'banner');

const SECTION_BACKGROUND: Record<Variant, SectionBackground> = {
  primary: 'primary',
  subtle: 'surface',
  split: 'none',
  banner: 'none',
};
const sectionBackground = computed(() => SECTION_BACKGROUND[variant.value]);
const sectionSpacing = computed<SectionSpacing>(() => (isBanner.value ? 'sm' : 'md'));
const containerWidth = computed<ContainerWidth>(() =>
  isSplit.value || isBanner.value ? 'wide' : 'content'
);

/** `eyebrow` and `secondaryCta` ("Not shown in `banner`", the field table's own note) both drop
 * out of `banner` regardless of what an editor filled in. */
const eyebrow = computed(() => (isBanner.value ? '' : (data.value.eyebrow ?? '').trim()));
const heading = computed(() => (data.value.heading ?? '').trim());
const text = computed(() => (data.value.text ?? '').trim());

/** Eyebrow/text colour: `primary-contrast` on the `primary` band, `accent-contrast` on the
 * `banner` panel (the eyebrow itself never renders there — `eyebrow` is forced empty above — but
 * `text` does), `accent`/`muted` on the two grounds that never invert (`subtle`, `split`). */
const eyebrowToneClass = computed(() =>
  isPrimary.value ? 'text-primary-contrast' : 'text-accent'
);
const textToneClass = computed(() => {
  if (isPrimary.value) return 'text-primary-contrast/90';
  if (isBanner.value) return 'text-accent-contrast/90';
  return 'text-muted';
});

const primaryHref = computed(() => safeHref(data.value.primaryCtaHref));
const secondaryHref = computed(() => safeHref(data.value.secondaryCtaHref));
/**
 * Only a same-site destination routes through the router — see `EldraRouterLink`. `Button` takes
 * the same `as` `Link` does, so a routed action navigates client-side instead of reloading the
 * document; both actions in this block are gated the same way.
 */
const routerLinkAs = (href: string | null) =>
  href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
const primaryAs = computed(() => routerLinkAs(primaryHref.value));
const secondaryAs = computed(() => routerLinkAs(secondaryHref.value));

const hasPrimaryCta = computed(
  () => (data.value.primaryCtaLabel ?? '').trim() !== '' && primaryHref.value !== null
);
const hasSecondaryCta = computed(
  () =>
    !isBanner.value &&
    (data.value.secondaryCtaLabel ?? '').trim() !== '' &&
    secondaryHref.value !== null
);

const hasImage = computed(() => isSplit.value && data.value.image != null);
const framing = computed(() => data.value.image?.framing ?? DEFAULT_IMAGE_FRAMING);

/** Empty (freshly inserted) hints — spec line 815, editor-only (`useEditing()`); the live site
 * simply omits an empty optional part (Global Constraints, "Editor vs live"). */
const showHeadingHint = computed(() => isEditing.value && heading.value === '');
const showTextHint = computed(() => isEditing.value && text.value === '');
const showButtonHint = computed(() => isEditing.value && !hasPrimaryCta.value);
</script>

<template>
  <Section :background="sectionBackground" :spacing="sectionSpacing" :labelled-by="headingId">
    <Container :width="containerWidth">
      <!-- banner: compact accent row, hand-marked so the package inverts its one button -->
      <div
        v-if="isBanner"
        class="group/section bg-accent text-accent-contrast @tablet:flex-row @tablet:flex-wrap @tablet:items-center @tablet:justify-between @tablet:gap-x-8 @tablet:gap-y-5 @tablet:px-12 @tablet:py-8 flex flex-col gap-4 rounded-xl p-6"
        data-section="accent"
      >
        <div class="grid max-w-[40rem] gap-2 text-left">
          <h2
            v-if="heading"
            :id="headingId"
            class="@tablet:text-[1.5rem] text-[1.25rem] leading-tight font-semibold text-balance"
          >
            {{ heading }}
          </h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('cta.headingHintLabel')"
            :help="t('cta.headingHintHelp')"
          />
          <p v-if="text" class="text-base leading-[1.6]" :class="textToneClass">{{ text }}</p>
          <EditorPlaceholder v-else-if="showTextHint" inline :label="t('cta.textHintLabel')" />
        </div>
        <div v-if="hasPrimaryCta" class="shrink-0">
          <Button
            variant="primary"
            size="lg"
            :href="primaryHref!"
            :as="primaryAs"
            :classes="{ container: 'control-h @tablet:control-h-lg w-full @tablet:w-auto' }"
          >
            {{ data.primaryCtaLabel }}
          </Button>
        </div>
        <EditorPlaceholder
          v-else-if="showButtonHint"
          inline
          :label="t('cta.buttonHintLabel')"
          class="shrink-0"
        />
      </div>

      <!-- split: a clipping surface panel, copy left / image right, or the centred fallback -->
      <div
        v-else-if="isSplit"
        class="bg-surface text-text @tablet:grid @tablet:grid-cols-2 @tablet:items-stretch flex flex-col overflow-hidden rounded-xl"
      >
        <div
          v-if="hasImage"
          class="@tablet:px-12 @tablet:py-12 flex flex-col justify-center gap-4 px-6 py-8 text-left"
        >
          <div class="grid gap-4">
            <p
              v-if="eyebrow"
              class="text-xs font-semibold tracking-wide uppercase"
              :class="eyebrowToneClass"
            >
              {{ eyebrow }}
            </p>
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
              :label="t('cta.headingHintLabel')"
              :help="t('cta.headingHintHelp')"
            />
            <p v-if="text" class="max-w-[34rem] text-base leading-[1.6]" :class="textToneClass">
              {{ text }}
            </p>
            <EditorPlaceholder v-else-if="showTextHint" inline :label="t('cta.textHintLabel')" />
          </div>
          <div class="@tablet:flex-row @tablet:items-center flex flex-col items-stretch gap-3">
            <Button
              v-if="hasPrimaryCta"
              variant="primary"
              size="lg"
              :href="primaryHref!"
              :as="primaryAs"
              :classes="{ container: 'w-full @tablet:w-auto' }"
            >
              {{ data.primaryCtaLabel }}
            </Button>
            <EditorPlaceholder
              v-else-if="showButtonHint"
              inline
              :label="t('cta.buttonHintLabel')"
            />
            <Button
              v-if="hasSecondaryCta"
              variant="outline"
              size="lg"
              :href="secondaryHref!"
              :as="secondaryAs"
              :classes="{ container: 'w-full @tablet:w-auto' }"
            >
              {{ data.secondaryCtaLabel }}
            </Button>
          </div>
        </div>
        <!-- No image: falls back to the centred `subtle` layout inside the panel (states table,
             "No image (split)"). -->
        <div
          v-else
          class="@tablet:col-span-2 mx-auto grid w-full max-w-[40rem] gap-4 p-8 text-center"
        >
          <p
            v-if="eyebrow"
            class="text-xs font-semibold tracking-wide uppercase"
            :class="eyebrowToneClass"
          >
            {{ eyebrow }}
          </p>
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
            :label="t('cta.headingHintLabel')"
            :help="t('cta.headingHintHelp')"
          />
          <p
            v-if="text"
            class="mx-auto max-w-[34rem] text-base leading-[1.6]"
            :class="textToneClass"
          >
            {{ text }}
          </p>
          <EditorPlaceholder v-else-if="showTextHint" inline :label="t('cta.textHintLabel')" />
          <div
            class="@tablet:flex-row @tablet:items-center mt-3 flex flex-col items-stretch justify-center gap-3"
          >
            <Button
              v-if="hasPrimaryCta"
              variant="primary"
              size="lg"
              :href="primaryHref!"
              :as="primaryAs"
              :classes="{ container: 'w-full @tablet:w-auto' }"
            >
              {{ data.primaryCtaLabel }}
            </Button>
            <EditorPlaceholder
              v-else-if="showButtonHint"
              inline
              :label="t('cta.buttonHintLabel')"
            />
            <Button
              v-if="hasSecondaryCta"
              variant="outline"
              size="lg"
              :href="secondaryHref!"
              :as="secondaryAs"
              :classes="{ container: 'w-full @tablet:w-auto' }"
            >
              {{ data.secondaryCtaLabel }}
            </Button>
          </div>
        </div>
        <div
          v-if="hasImage"
          class="@tablet:aspect-auto @tablet:min-h-[22rem] relative aspect-[4/3] min-h-[14rem] w-full"
        >
          <UiImage
            :src="data.image!.url"
            :alt="data.image!.altText ?? ''"
            :framing="framing"
            :entry-id="entryId"
            field-path="image"
            fill
          />
        </div>
      </div>

      <!-- primary / subtle: plain centred band -->
      <div v-else class="mx-auto grid max-w-[40rem] gap-4 text-center">
        <p
          v-if="eyebrow"
          class="text-xs font-semibold tracking-wide uppercase"
          :class="eyebrowToneClass"
        >
          {{ eyebrow }}
        </p>
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
          :label="t('cta.headingHintLabel')"
          :help="t('cta.headingHintHelp')"
        />
        <p v-if="text" class="mx-auto max-w-[34rem] text-base leading-[1.6]" :class="textToneClass">
          {{ text }}
        </p>
        <EditorPlaceholder v-else-if="showTextHint" inline :label="t('cta.textHintLabel')" />
        <div
          class="@tablet:flex-row @tablet:items-center mt-3 flex flex-col items-stretch justify-center gap-3"
        >
          <Button
            v-if="hasPrimaryCta"
            variant="primary"
            size="lg"
            :href="primaryHref!"
            :as="primaryAs"
            :classes="{ container: 'w-full @tablet:w-auto' }"
          >
            {{ data.primaryCtaLabel }}
          </Button>
          <EditorPlaceholder v-else-if="showButtonHint" inline :label="t('cta.buttonHintLabel')" />
          <Button
            v-if="hasSecondaryCta"
            variant="outline"
            size="lg"
            :href="secondaryHref!"
            :as="secondaryAs"
            :classes="{ container: 'w-full @tablet:w-auto' }"
          >
            {{ data.secondaryCtaLabel }}
          </Button>
        </div>
      </div>
    </Container>
  </Section>
</template>
