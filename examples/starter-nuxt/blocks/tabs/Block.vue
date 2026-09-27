<script setup lang="ts">
/**
 * Tabs: related content — care guides, materials, "how it works" by product type — grouped into
 * tabs, each with a heading, rich text, an optional image and a link (spec `02-blocks.md` "Tabs",
 * 2194–2300). Use for 2 to 6 parallel topics; sequential steps belong in Timeline, questions in
 * FAQ. No `variant` field — the underline tab list is the only composition.
 *
 * **Never an accordion.** `@eldrajs/ui`'s `Tabs`/`Tab`/`TabPanel` own the roles, roving tabindex,
 * arrow/Home/End keys and the underline indicator at every width (spec → "Mobile behaviour: tabs
 * scroll sideways, not an accordion"). Below 48rem of block width the tab row bleeds past the
 * `Container`'s own gutter with a matching negative margin, inline padding and scroll padding —
 * `--eldra-gutter-mobile`, the exact variable `Container.vue` itself reads for that breakpoint, is
 * what `tabListClasses` below reads too, since no `-mx-*` bleed precedent exists elsewhere in
 * `blocks/*` to follow instead.
 *
 * **Accessible name.** `Tabs` exposes only an `ariaLabel` prop for the tablist itself — there is no
 * `aria-labelledby`-style prop the way `Section`'s own `labelledBy` works (see `packages/ui/src/
 * components/tabs/types.ts`) — so the tablist's accessible name is the heading's own text passed
 * as plain `ariaLabel`, while `Section` is still `labelled-by` the same heading `id` for the
 * block's own landmark name, exactly like every other rebuilt block.
 *
 * **`defaultTab`.** The spec's own `defaultTab` select can't enumerate a dynamic tab list, so the
 * field is a 1-based `int` (`block.json`), clamped into `[1, tabs.length]` here and turned into a
 * zero-based tab value that seeds `Tabs`' `v-model` once, read synchronously at setup — the same
 * one-shot-seed idea `faq`'s own `itemOpen()` uses for `AccordionItem`, except this one must be a
 * real two-way `v-model`, not a one-way `:model-value`: `useControllableModel` (`@eldrajs/ui`)
 * treats any *defined* `modelValue` as fully controlled and stops mirroring further selections into
 * the value its own `selectedValue` getter reads, so a one-way bind would freeze the display on the
 * initial tab forever the moment a real click or arrow key fired `select()`.
 *
 * `tabs[].body` is full rich text rendered through `EldraRichText` with no `api-id`, for the same
 * reason `faq`'s `items[].answer` and `split-content`'s `rows[].text` have none —
 * `useEldraBlockField`/`isBlockFieldLocalized` only resolve a flat, top-level `fieldId`, and
 * `tabs[].body` lives one level inside a `list` item.
 *
 * "Live site renders nothing without tabs" (spec → States, "Empty (freshly inserted)"): the whole
 * `<Section>` gates on `hasTabs || editing`. The editor's own empty-state hint is a single,
 * non-interactive placeholder tab ("Tab 1") plus a placeholder panel — not a real `Tabs` instance
 * with zero real tabs, which would have nothing to mark `aria-selected` and nothing for arrow keys
 * to move between — so that branch is plain, `aria-hidden` decorative markup, never the package
 * component fed an empty list.
 */
import { computed, ref } from 'vue';
import { Container, EditorPlaceholder, Link, Section, Tab, TabPanel, Tabs } from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING, EldraRichText, type ImageFraming } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

interface TabItem {
  label?: string;
  heading?: string;
  body?: { content?: unknown[] } | null;
  image?: { url: string; altText?: string | null; framing?: ImageFraming | null } | null;
  linkLabel?: string;
  href?: string;
}

const props = defineProps<{ entry: EldraBlockEntry<'tabs'> }>();
const { data, entryId } = useBlockData(props, 'tabs');
const editing = useEditing();
const t = useT();

const uiId = useUiId();
const headingId = `tabs-heading-${uiId}`;

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => editing.value && !hasHeading.value);
const headingClass =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] @tablet:text-h2';

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const showIntroHint = computed(() => editing.value && !hasIntro.value);

const tabs = computed<TabItem[]>(() => data.value.tabs ?? []);
const hasTabs = computed(() => tabs.value.length > 0);

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');

function tabValue(index: number): string {
  return String(index);
}

/** Clamps the 1-based `defaultTab` field into `[1, tabs.length]` and returns the matching
 *  zero-based index — see the module doc comment for why this only ever runs once, at setup. */
function clampedDefaultIndex(): number {
  const count = tabs.value.length;
  if (count === 0) return 0;
  const raw = data.value.defaultTab;
  const requested = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 1;
  return Math.min(Math.max(requested, 1), count) - 1;
}
const selectedTab = ref(tabValue(clampedDefaultIndex()));

function tabHasImage(tab: TabItem): boolean {
  return Boolean(tab.image);
}
function tabImageFraming(tab: TabItem): ImageFraming | undefined {
  return tab.image?.framing ?? DEFAULT_IMAGE_FRAMING;
}

function tabHref(tab: TabItem): string | null {
  return safeHref(tab.href);
}
function tabHasLink(tab: TabItem): boolean {
  return Boolean(tab.linkLabel) && tabHref(tab) !== null;
}
function tabLinkAs(tab: TabItem): typeof EldraRouterLink | undefined {
  const href = tabHref(tab);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** Spec → Layout: "panel heading 1.5rem (1.25rem below 48rem)" — the block-heading bracket-value
 *  pattern every rebuilt block already uses for its own `h2` (see `headingClass` above), stepped
 *  down to `text-h3`'s own numbers (`--eldra-text-h3-*`, `packages/ui/src/styles/tokens.css`) at
 *  48rem instead of `text-h2`'s. */
const panelHeadingClass =
  'font-heading text-[1.25rem] leading-[1.3] font-semibold tracking-[-0.01em] @tablet:text-h3';

/** Spec → Layout: "the tab row bleeds to the container edges" below 48rem — negative gutter
 *  margin plus matching inline and scroll padding, reset once the row sits inside the container
 *  from 48rem. `--eldra-gutter-mobile` is the same variable `Container.vue` itself reads for its
 *  own mobile gutter; no `-mx-*` bleed precedent exists elsewhere in `blocks/*` to follow instead. */
const tabListClasses = {
  list:
    '-mx-[var(--eldra-gutter-mobile)] px-[var(--eldra-gutter-mobile)] ' +
    'scroll-px-[var(--eldra-gutter-mobile)] @tablet:mx-0 @tablet:px-0 @tablet:scroll-px-0',
};
/** Spec → Layout: "Panel: 2rem top padding." `TabPanel`'s own baked-in default is 1.5rem (see that
 *  component's own doc comment) — overridden through the package's sanctioned per-part `classes`
 *  prop, never by patching the component itself. */
const tabPanelClasses = { panel: 'pt-8' };

/** Image | copy grid, only when the panel has an image (spec → Layout): stacked below 48rem, two
 *  equal columns 48–64rem, `7fr`/`5fr` from 64rem — the same gap steps `split-content`'s own row
 *  grid uses for its 48–64rem/64rem+ breakpoints. */
const IMAGE_PANEL_GRID =
  'gap-6 @tablet:grid-cols-2 @tablet:items-center @tablet:gap-12 @content:grid-cols-[7fr_5fr] @content:gap-16';

const panelsRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(panelsRoot, (caption) => caption ?? t('tabsBlock.richTextTableLabel'));
</script>

<template>
  <Section
    v-if="hasTabs || editing"
    :background="sectionBackground"
    spacing="md"
    :labelled-by="headingId"
  >
    <Container width="content">
      <div class="flex flex-col gap-3">
        <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ heading }}</h2>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          :id="headingId"
          inline
          :label="t('tabsBlock.headingHintLabel')"
        />
        <p v-if="hasIntro" class="text-muted text-body-lg">{{ intro }}</p>
        <EditorPlaceholder
          v-else-if="showIntroHint"
          inline
          :label="t('tabsBlock.introHintLabel')"
        />
      </div>

      <div ref="panelsRoot" class="mt-8">
        <Tabs
          v-if="hasTabs"
          v-model="selectedTab"
          variant="underline"
          :aria-label="heading"
          activation="auto"
          :classes="tabListClasses"
        >
          <template #tabs>
            <Tab
              v-for="(tab, index) in tabs"
              :key="index"
              :value="tabValue(index)"
              :title="tab.label"
            />
          </template>
          <TabPanel
            v-for="(tab, index) in tabs"
            :key="index"
            :value="tabValue(index)"
            :classes="tabPanelClasses"
          >
            <div class="grid" :class="tabHasImage(tab) ? IMAGE_PANEL_GRID : ''">
              <UiImage
                v-if="tabHasImage(tab)"
                :src="tab.image!.url"
                :alt="tab.image!.altText ?? ''"
                :framing="tabImageFraming(tab)"
                :entry-id="entryId"
                :field-path="`tabs.${index}.image`"
                aspect="4/3"
                rounded="xl"
              />
              <div class="flex flex-col gap-4" :class="tabHasImage(tab) ? '' : 'max-w-[40rem]'">
                <h3 :class="panelHeadingClass">{{ tab.heading }}</h3>
                <EldraRichText
                  class="prose-eldra [&>*+*]:mt-3"
                  :entry-id="entryId"
                  :field="`tabs.${index}.body`"
                  :doc="tab.body"
                />
                <Link
                  v-if="tabHasLink(tab)"
                  :href="tabHref(tab)!"
                  :as="tabLinkAs(tab)"
                  variant="standalone"
                  arrow
                >
                  {{ tab.linkLabel }}
                </Link>
              </div>
            </div>
          </TabPanel>
        </Tabs>

        <template v-else-if="editing">
          <div class="border-border flex min-h-[2.75rem] items-center border-b" aria-hidden="true">
            <span
              class="border-primary text-body-sm text-text border-b-[0.1875rem] px-4 py-2 font-semibold"
            >
              {{ t('tabsBlock.tabPlaceholderLabel') }}
            </span>
          </div>
          <EditorPlaceholder
            class="mt-6"
            :label="t('tabsBlock.itemHintLabel')"
            :help="t('tabsBlock.itemHintHelp')"
          />
        </template>
      </div>
    </Container>
  </Section>
</template>
