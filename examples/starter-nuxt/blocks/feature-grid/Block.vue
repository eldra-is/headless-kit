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
 * rest" default (`@eldrajs/ui`'s package-wide ruling) for the same "no underline until hover" shape
 * spec's own States row wants ("Link hover: the standalone link underlines…") — the existing
 * feature-grid block's long-standing opt-out from `Link`'s rest-state underline, carried forward
 * here onto the two places a link actually renders. `classes.cue` adds `mt-auto`, which
 * `FeatureCard`'s own cue does not have (unlike `ContentCard`'s) — restoring it here is what pins
 * the link to the bottom of a stretched card so links line up across a row (spec → Sizes,
 * "pushed to the bottom of the item").
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
import { useEldraIcon } from '../../app/composables/useEldraIcon';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'feature-grid'> }>();
const { data } = useBlockData(props, 'feature-grid');
const t = useT();
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

const isCards = computed(() => (data.value.variant ?? 'cards') !== 'plain');
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

/**
 * Resolves a Tabler icon name to a bare, already-bound icon component — the same body-only
 * `<svg>` shape `app/components/EldraIcon.vue`'s own internal adapter builds around
 * `useEldraIcon`'s fetched markup, reused here because `FeatureCard`'s `icon` prop takes a
 * component with no props of its own (see `Icon.vue`'s `<component :is="icon">`), not a name —
 * `EldraIcon` itself cannot be handed straight through, it still needs a `name` bound. Cached per
 * name (module scope, shared by every mounted grid) so a reactive re-render of `data` never
 * creates a new component identity for the same icon, which would otherwise remount — and
 * re-fetch — it on every keystroke in the Studio editor.
 */
const iconCache = new Map<string, Component>();
function resolveIconComponent(name: string): Component {
  const cached = iconCache.get(name);
  if (cached) return cached;
  const component = defineComponent({
    name: 'FeatureGridIcon',
    setup() {
      const svg = useEldraIcon(computed(() => name));
      return () => {
        const markup = svg.value;
        if (markup === null) return h('svg', { viewBox: '0 0 24 24' });
        const body = markup.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
        return h('svg', {
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          innerHTML: body,
        });
      };
    },
  });
  iconCache.set(name, component);
  return component;
}
/** Fed to `FeatureCard` whenever there is no icon to show (image media, or an icon item with none
 * chosen yet) — the prop is required, and the tile itself is hidden via `classes.iconTile`, so an
 * inert empty `<svg>` is all it ever needs to render. */
const EMPTY_ICON: Component = defineComponent({
  name: 'FeatureGridEmptyIcon',
  setup: () => () => h('svg', { viewBox: '0 0 24 24' }),
});

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

const items = computed(() =>
  renderedItems.value.map((item) => {
    const href = safeHref(item.href);
    const hasIcon = !isImageMedia.value && Boolean(item.icon);
    return {
      isEmpty: isEditing.value && isItemEmpty(item),
      icon: hasIcon && item.icon ? resolveIconComponent(item.icon) : EMPTY_ICON,
      showIconTile: hasIcon,
      hasImage: Boolean(item.image),
      image: item.image,
      title: item.title,
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
            class="font-heading text-text @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
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

      <ul role="list" :class="gridClass">
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
              :classes="{
                root: 'h-full',
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
