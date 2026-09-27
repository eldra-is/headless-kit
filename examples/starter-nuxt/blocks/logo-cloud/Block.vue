<script setup lang="ts">
/**
 * Logo cloud: a quiet, monochrome strip of stockist or press logos that adds credibility without
 * competing with products (spec `02-blocks.md` "Logo cloud"). `variant`:
 *
 *  - `grid`: a centred label above hairline-ruled cells, 2 columns below 48rem (6rem cells) and 4
 *    columns from 48rem (7rem cells). The 1px rules are drawn with the well-known "background
 *    peeking through a 1px gap" trick rather than a border on every cell (which would double up
 *    between neighbours): the `<ul>` carries `bg-border` and `gap-px`, and every cell (the plain
 *    `<li>` when unlinked, or `LogoItem`'s own linked `<a>` stretched to fill it via
 *    `classes.root`) carries `bg-background`, so only the 1px gap between cells shows the
 *    `border` colour, reading as a single hairline. `h-full`/`w-full` on that same override is
 *    what makes a *linked* cell's actual tab target the full cell (spec → Keyboard &
 *    accessibility: "at least … the full cell (`grid`)"), not just `LogoItem`'s own default
 *    `min-h-16`.
 *  - `row`: no rules. Below 48rem, 2 columns; 48–64rem wraps, centred; from 64rem one line with
 *    the label on the left (max 11rem) and the logos spread apart. `LogoItem`'s own default
 *    `min-h-16` (4rem) already clears the spec's 3.5rem row target on its own, so `row` needs no
 *    height override.
 *
 * Greyscale-to-colour on hover, the wordmark fallback and the focus ring are all `LogoItem`'s own
 * (see `@eldrajs/ui`'s `LogoItem.vue`) — this block never re-implements them.
 *
 * `linkContext` is this block's own accessible-name suffix for a linked logo (`logoCloud.
 * linkContext`, e.g. " (opens shop website)" — read: opens *that stockist's* own site), passed to
 * every linked `LogoItem` instead of relying on `LogoItem`'s generic default wording.
 *
 * A logo cell counts as empty when it has no `name` (the field every rendering — image alt or
 * wordmark — depends on). Live, empty cells are dropped; editing, they render their own hint
 * instead of vanishing, the same "hint per empty repeater item" shape `testimonials`/`stats` use.
 */
import { computed } from 'vue';
import { Container, EditorPlaceholder, LogoItem, Section } from '@eldrajs/ui';
import type { ContainerWidth, ImageMedia, SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import { isInternalHref, safeHref } from '../../app/utils/links';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';

const props = defineProps<{ entry: EldraBlockEntry<'logo-cloud'> }>();
const { data } = useBlockData(props, 'logo-cloud');
const t = useT();
const isEditing = useEditing();
const headingId = `logo-cloud-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'grid');
const isGrid = computed(() => variant.value !== 'row');
const containerWidth = computed<ContainerWidth>(() => (isGrid.value ? 'content' : 'wide'));

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);

interface LogoCloudImage {
  url?: string;
  width?: number;
  height?: number;
}

interface LogoCloudItem {
  image?: LogoCloudImage | null;
  name?: string;
  linkLabel?: string;
  href?: string;
}

function isItemEmpty(item: LogoCloudItem): boolean {
  return (item.name ?? '').trim() === '';
}

const allItems = computed<LogoCloudItem[]>(() => data.value.logos ?? []);
/** Live: only logos with a name render (Global Constraints, "Editor vs live"). Editing: every
 *  logo renders, so an empty one shows its own hint instead of vanishing (spec States → Empty:
 *  "two logo cells"). */
const renderedItems = computed<LogoCloudItem[]>(() =>
  isEditing.value ? allItems.value : allItems.value.filter((item) => !isItemEmpty(item))
);

function mapLogo(image?: LogoCloudImage | null): ImageMedia | null {
  if (!image?.url) return null;
  return { src: image.url, width: image.width, height: image.height };
}

function hrefFor(item: LogoCloudItem): string | null {
  return safeHref(item.href);
}

/** A same-site logo destination is routed like every other link in the starter. */
function asFor(item: LogoCloudItem) {
  const href = hrefFor(item);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** Live, a block without its required heading or without a single named logo renders nothing
 *  (Global Constraints, "Editor vs live"); editing, it renders so the hints can show. */
const hasLogos = computed(() => renderedItems.value.length > 0);
const showBlock = computed(() => isEditing.value || (hasHeading.value && hasLogos.value));

/** Fills the hairline cell (see the module doc comment) and gives a linked cell the full-cell tab
 *  target the `grid` variant's spec requires; `row` draws no rules and needs neither override. */
// `rounded-none` overrides `LogoItem`'s own `rounded-md`: a rounded cell lets the `<ul>`'s hairline
// colour show through at every corner as a small cross-shaped spur where four cells meet.
const GRID_ITEM_CLASSES = { root: 'h-full w-full rounded-none bg-background' } as const;
</script>

<template>
  <Section
    v-if="showBlock"
    :background="sectionBackground"
    spacing="md"
    as="section"
    :labelled-by="headingId"
  >
    <Container :width="containerWidth">
      <template v-if="isGrid">
        <h2
          v-if="hasHeading"
          :id="headingId"
          class="text-muted mb-6 text-center text-base leading-[1.4] font-semibold text-balance"
        >
          {{ heading }}
        </h2>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          :id="headingId"
          inline
          class="mb-6"
          :label="t('logoCloud.headingHintLabel')"
          :help="t('logoCloud.headingHintHelp')"
        />

        <ul
          role="list"
          class="bg-border @tablet:auto-rows-[7rem] @tablet:grid-cols-4 grid auto-rows-[6rem] grid-cols-2 gap-px p-px"
        >
          <template v-for="(item, index) in renderedItems" :key="index">
            <li v-if="isEditing && isItemEmpty(item)" class="bg-background">
              <EditorPlaceholder
                inline
                class="h-full"
                :label="t('logoCloud.itemHintLabel')"
                :help="t('logoCloud.itemHintHelp')"
              />
            </li>
            <LogoItem
              v-else
              :name="item.name!"
              :logo="mapLogo(item.image)"
              :href="hrefFor(item)"
              :as="asFor(item)"
              :link-context="t('logoCloud.linkContext')"
              :classes="GRID_ITEM_CLASSES"
            />
          </template>
        </ul>
      </template>

      <div
        v-else
        class="@content:flex-row @content:items-center @content:justify-between @content:gap-12 @content:text-left flex flex-col items-center gap-6 text-center"
      >
        <h2
          v-if="hasHeading"
          :id="headingId"
          class="text-muted @content:max-w-[11rem] @content:shrink-0 text-base leading-[1.4] font-semibold text-balance"
        >
          {{ heading }}
        </h2>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          :id="headingId"
          inline
          :label="t('logoCloud.headingHintLabel')"
          :help="t('logoCloud.headingHintHelp')"
        />

        <ul
          role="list"
          class="@tablet:flex @tablet:flex-wrap @tablet:items-center @tablet:justify-center @tablet:gap-x-12 @tablet:gap-y-2 @content:flex-1 @content:flex-nowrap @content:justify-between @content:gap-x-6 grid grid-cols-2 gap-x-4 gap-y-2"
        >
          <template v-for="(item, index) in renderedItems" :key="index">
            <li v-if="isEditing && isItemEmpty(item)">
              <EditorPlaceholder
                inline
                :label="t('logoCloud.itemHintLabel')"
                :help="t('logoCloud.itemHintHelp')"
              />
            </li>
            <LogoItem
              v-else
              :name="item.name!"
              :logo="mapLogo(item.image)"
              :href="hrefFor(item)"
              :as="asFor(item)"
              :link-context="t('logoCloud.linkContext')"
            />
          </template>
        </ul>
      </div>
    </Container>
  </Section>
</template>
