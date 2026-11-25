<script setup lang="ts">
/**
 * Feature grid: a grid of short benefits or facts, each an icon or image with a title and a
 * sentence (spec `02-blocks.md` 857–972, "Feature grid").
 *
 * `variant` maps onto `@eldrajs/ui`'s `FeatureCard`'s own two shapes (`cards` → `surface`,
 * `plain` → `plain`). `mediaType` picks whether every item shows a resolved Tabler icon through
 * `FeatureCard`'s own icon tile, or a 3:2 `UiImage` rendered as a sibling above the card (the icon
 * tile suppressed via `classes.iconTile` for that case — `FeatureCard` has no image slot of its
 * own, only a fixed icon tile, spec → Layout: "the card's icon tile is replaced by … `UiImage`").
 *
 * The item's own link renders through `FeatureCard`'s built-in `href`/`cue`/`linkAs`: the title
 * becomes the card's one stretched link — this design system's established "the whole card is one
 * tab stop" pattern, shared with `ContentCard`/`ProductCard` (see `stretchedLink.ts`) — and `cue`
 * renders the item's own `linkLabel` in the same weight-600-plus-arrow shape a standalone `Link`
 * uses. Only one `<a>` renders per item (the title's), so links never nest and every item link
 * plus the head link are reachable with `Tab` in DOM order (spec → Keyboard & accessibility).
 * `classes.titleLink` and the head `Link`'s own `underline="false"` both give up the "underlined at
 * rest" default (`@eldrajs/ui`'s package-wide decision) for the same "no underline until hover" shape
 * spec's own States row wants ("Link hover: the standalone link underlines…") — the existing
 * feature-grid block's long-standing opt-out from `Link`'s rest-state underline, carried forward
 * here onto the two places a link actually renders. `classes.cue` adds `mt-auto`, which
 * `FeatureCard`'s own cue does not have (unlike `ContentCard`'s) — restoring it here is what pins
 * the link to the bottom of a stretched card so links line up across a row (spec → Sizes,
 * "pushed to the bottom of the item").
 *
 * **`arched`** is the design's "shop by category" row: each item an arch-topped 3:4 photo (full
 * radius on top, `radius-lg` below) with a centred serif title and a muted line, and the whole
 * tile one link — the title and line are the link's text, the photo is decorative. One row of
 * equal tiles from 1101px of block width; below that the same row keeps a 9rem minimum per tile
 * and scrolls sideways, bleeding to the block edge so the next tile peeks in. Every tile is a
 * link, so `Tab` walks the row and the browser scrolls each into view — no tab stop of its own is
 * needed for the scroll area (axe's `scrollable-region-focusable` is satisfied by its links).
 * `columns` and `mediaType` do not apply to it.
 *
 * Spec States → Empty (freshly inserted): "two 'Add a feature' items ('Pick an icon or image,
 * then a title and a sentence')" — the same per-item editor hint shape `team`'s/`stats`' own
 * repeaters use. `isItemEmpty` treats an item with neither icon nor image nor title as empty;
 * `editorItems` synthesizes two blank items when the whole `items` list is still empty, so the
 * hint has somewhere to render even before Studio's repeater has seeded anything; `renderedItems`
 * shows every item while editing (a still-empty row renders its own hint instead of vanishing) but
 * filters empty ones out live (Global Constraints, "Editor vs live").
 */
import { computed, defineComponent, h, type Component } from 'vue';
import {
  Container,
  EditorPlaceholder,
  FeatureCard,
  Link,
  Section,
  type FeatureCardVariant,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { EMPTY_ICON, iconComponent } from '../../app/composables/iconComponent';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';

const props = defineProps<{ entry: EldraBlockEntry<'feature-grid'> }>();
const { data } = useBlockData(props, 'feature-grid');
const { t } = useI18n();
const isEditing = useEditing();

const headingId = `feature-grid-heading-${useUiId()}`;

const hasHeading = computed(() => (data.value.heading ?? '').trim() !== '');
const sectionLabelledBy = computed(() => (hasHeading.value ? headingId : undefined));
const sectionAriaLabel = computed(() =>
  hasHeading.value ? undefined : t('featureGrid.fallbackLabel')
);
const hasIntro = computed(() => (data.value.intro ?? '').trim() !== '');
const showHeadingHint = computed(() => !hasHeading.value && isEditing.value);

const headLinkHref = computed(() => safeHref(data.value.headLinkHref));
const hasHeadLink = computed(
  () => Boolean(data.value.headLinkLabel) && headLinkHref.value !== null
);
const headLinkAs = computed(() =>
  headLinkHref.value !== null && isInternalHref(headLinkHref.value) ? EldraRouterLink : undefined
);

const hasHead = computed(
  () => hasHeading.value || hasIntro.value || hasHeadLink.value || showHeadingHint.value
);

const isArched = computed(() => data.value.variant === 'arched');
const isCards = computed(() => !isArched.value && (data.value.variant ?? 'cards') !== 'plain');
const featureCardVariant = computed<FeatureCardVariant>(() =>
  isCards.value ? 'surface' : 'plain'
);
const isImageMedia = computed(() => (data.value.mediaType ?? 'icon') === 'image');

/** `columns` from 64rem of block width (spec → Layout); below that every variant is 1 column
 * until `@two-col` (36rem), then 2 — see `gridClass` below. */
const COLUMNS: Record<'2' | '3' | '4', string> = {
  '2': '@content:grid-cols-2',
  '3': '@content:grid-cols-3',
  '4': '@content:grid-cols-4',
};
const gridClass = computed(() => [
  'grid grid-cols-1 @two-col:grid-cols-2',
  COLUMNS[data.value.columns ?? '4'],
  isCards.value ? 'gap-4 @content:gap-6' : 'gap-8 @content:gap-x-8 @content:gap-y-12',
]);

// `FeatureCard`'s `icon` prop takes a component with no props of its own (see `Icon.vue`'s
// `<component :is="icon">`), not a name, so `EldraIcon` cannot be handed straight through — the
// theme's shared name→component adapter (`app/composables/iconComponent.ts`) is what builds one,
// cached per name at module scope so a reactive re-render of `data` never creates a new identity
// for the same icon (which would remount, and re-fetch, it on every keystroke in the Studio
// editor). `EMPTY_ICON` from the same module is the inert stand-in for an item with no icon to
// show (image media, or an icon item nobody has chosen yet): the prop is required and the tile
// itself is hidden through `classes.iconTile`.

/** `@eldrajs/ui`'s `Link` gives this exact recipe to its own `underline: false` opt-out
 * (`Link.vue`'s `UNDERLINE_OPT_OUT`): no underline at rest, appearing on hover and held through
 * `:active`. Applied to `FeatureCard`'s title link here since the item link *is* that title, not a
 * `Link` component of its own. */
const NO_UNDERLINE_UNTIL_HOVER =
  'no-underline hover:underline hover:decoration-1 hover:decoration-current ' +
  'hover:underline-offset-[0.2em] active:underline active:decoration-2 active:underline-offset-[0.2em]';

type FeatureGridItem = NonNullable<EldraBlockData['feature-grid']['items']>[number];

/** No icon/image and no title yet — a repeater row Studio has created but the editor hasn't
 *  filled in (spec States → Empty (freshly inserted): "two 'Add a feature' items"). */
function isItemEmpty(item: Partial<FeatureGridItem>): boolean {
  return !item.icon && !item.image && (item.title ?? '').trim() === '';
}

const allItems = computed<FeatureGridItem[]>(() => data.value.items ?? []);
/** Editing always shows at least two items: a genuinely empty `items` list (a block just dragged
 *  onto the page, before Studio's own repeater has seeded anything) still gets two synthetic
 *  blank items so the "Add a feature" hint has somewhere to render — the same synthesis
 *  `team.editorPeople`'s own comment explains, sized to match this block's own spec text. */
const editorItems = computed<Partial<FeatureGridItem>[]>(() =>
  allItems.value.length > 0 ? allItems.value : [{}, {}]
);
/** Live: only items with real content render (Global Constraints, "Editor vs live"); editing:
 *  every item renders, so a still-empty repeater row shows its own hint instead of vanishing. */
const renderedItems = computed(() =>
  isEditing.value ? editorItems.value : allItems.value.filter((item) => !isItemEmpty(item))
);
const hasItems = computed(() => renderedItems.value.length > 0);

/** The arched row: equal tiles in one row from 1101px, a sideways-scrolling row below with the
 *  track bleeding to the block edge (the same negative-gutter recipe `trust-strip`'s scroll layout
 *  uses, matched to `Container`'s own gutter at each step). */
const ARCHED_LIST_CLASS =
  'grid grid-flow-col auto-cols-[minmax(9rem,1fr)] gap-6 overflow-x-auto eldra-scrollbar-hide ' +
  'snap-x pt-1 pb-2 scroll-px-[var(--eldra-gutter-mobile)] ' +
  '-mx-[var(--eldra-gutter-mobile)] px-[var(--eldra-gutter-mobile)] ' +
  '@tablet:-mx-[var(--eldra-gutter-tablet)] @tablet:px-[var(--eldra-gutter-tablet)] @tablet:scroll-px-[var(--eldra-gutter-tablet)] ' +
  '@content:-mx-[var(--eldra-gutter-desktop)] @content:px-[var(--eldra-gutter-desktop)] @content:scroll-px-[var(--eldra-gutter-desktop)] ' +
  '@min-[68.8125rem]:auto-cols-fr @min-[68.8125rem]:overflow-visible @min-[68.8125rem]:mx-0 ' +
  '@min-[68.8125rem]:px-0 @min-[68.8125rem]:snap-none';
const ARCH_TILE_CLASS =
  'group grid justify-items-center gap-3.5 text-center text-text no-underline rounded-lg';
const ARCH_FRAME_CLASS =
  'relative block w-full overflow-hidden bg-surface rounded-t-full rounded-b-lg aspect-[3/4]';

const items = computed(() =>
  renderedItems.value.map((item) => {
    const href = safeHref(item.href);
    const hasIcon = !isImageMedia.value && Boolean(item.icon);
    return {
      isEmpty: isEditing.value && isItemEmpty(item),
      icon: hasIcon && item.icon ? iconComponent(item.icon) : EMPTY_ICON,
      showIconTile: hasIcon,
      hasImage: Boolean(item.image),
      image: item.image,
      title: item.title ?? '',
      text: item.text ?? '',
      cue: item.linkLabel || undefined,
      href,
      linkAs: href !== null && isInternalHref(href) ? EldraRouterLink : undefined,
    };
  })
);
</script>

<template>
  <Section
    v-if="hasItems || isEditing"
    spacing="md"
    :labelled-by="sectionLabelledBy"
    :aria-label="sectionAriaLabel"
  >
    <Container width="wide">
      <div v-if="hasHead" class="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div class="max-w-[40rem]">
          <h2
            v-if="hasHeading"
            :id="headingId"
            class="font-heading text-text text-[1.75rem] leading-[1.1] font-medium tracking-[-0.01em] text-balance @min-[47.5625rem]:text-[2.25rem]"
          >
            {{ data.heading }}
          </h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            inline
            :label="t('featureGrid.headingHintLabel')"
          />
          <p v-if="hasIntro" class="text-body-lg text-muted mt-3">{{ data.intro }}</p>
        </div>
        <Link
          v-if="hasHeadLink"
          :href="headLinkHref!"
          :as="headLinkAs"
          variant="standalone"
          arrow
          :underline="false"
        >
          {{ data.headLinkLabel }}
        </Link>
      </div>

      <ul v-if="isArched" role="list" :class="ARCHED_LIST_CLASS">
        <li v-for="(item, index) in items" :key="index" class="snap-start">
          <EditorPlaceholder
            v-if="item.isEmpty"
            inline
            class="aspect-[3/4] h-auto rounded-t-full rounded-b-lg"
            :label="t('featureGrid.itemHintLabel')"
            :help="t('featureGrid.itemHintHelp')"
          />
          <component
            :is="item.href ? (item.linkAs ?? 'a') : 'div'"
            v-else
            v-bind="item.href ? (item.linkAs ? { to: item.href } : { href: item.href }) : {}"
            :class="[ARCH_TILE_CLASS, item.href ? focusRing : '']"
          >
            <span :class="ARCH_FRAME_CLASS">
              <UiImage
                v-if="item.hasImage"
                :src="item.image!.url"
                alt=""
                :framing="item.image!.framing ?? null"
                fill
                class="motion-safe:transition-transform motion-safe:duration-[250ms] motion-safe:group-hover:scale-[1.04]"
              />
              <EditorPlaceholder
                v-else-if="isEditing"
                inline
                class="h-full"
                :label="t('featureGrid.imageHintLabel')"
              />
            </span>
            <span class="grid gap-0.5">
              <span
                class="font-heading text-[1.25rem] leading-[1.3] font-medium group-hover:underline group-hover:underline-offset-[0.2em]"
                >{{ item.title }}</span
              >
              <span v-if="item.text" class="text-muted text-sm">{{ item.text }}</span>
            </span>
          </component>
        </li>
      </ul>

      <ul v-else role="list" :class="gridClass">
        <li v-for="(item, index) in items" :key="index" class="h-full">
          <EditorPlaceholder
            v-if="item.isEmpty"
            inline
            class="h-full"
            :label="t('featureGrid.itemHintLabel')"
            :help="t('featureGrid.itemHintHelp')"
          />
          <template v-else>
            <UiImage
              v-if="isImageMedia && item.hasImage"
              :src="item.image!.url"
              :alt="item.image!.altText ?? ''"
              :framing="item.image!.framing ?? null"
              aspect="3/2"
              rounded="lg"
              class="mb-2"
            />
            <EditorPlaceholder
              v-else-if="isImageMedia && !item.hasImage && isEditing"
              inline
              class="mb-2"
              :label="t('featureGrid.imageHintLabel')"
            />
            <FeatureCard
              :icon="item.icon"
              :title="item.title"
              :body="item.text"
              :href="item.href"
              :cue="item.cue"
              :link-as="item.linkAs"
              :variant="featureCardVariant"
              :heading-level="3"
              class="h-full"
              :classes="{
                iconTile: item.showIconTile ? undefined : 'hidden',
                titleLink: NO_UNDERLINE_UNTIL_HOVER,
                cue: 'mt-auto',
              }"
            />
          </template>
        </li>
      </ul>
    </Container>
  </Section>
</template>
