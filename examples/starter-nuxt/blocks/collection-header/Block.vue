<script setup lang="ts">
/**
 * Collection header: opens a collection page with a breadcrumb, the collection title, an optional
 * clamped description with Read more, the live product count, and an optional image or
 * sub-collection links (spec `02-blocks.md` 3400–3500, "Collection header"). Consumes the
 * storefront source: `title`/`description`/`image` fall back to
 * `useStorefront().catalog.collection(handle)` when their own field is empty, and the product
 * count always comes from the store — never a field, per the spec's own "Don't fake the count"
 * rule.
 *
 * The collection is the `collection` reference field when an author picked one, else the route's
 * own collection (`storefront.route.collectionHandle`) — the same "field wins, route is the
 * fallback" contract the field's own `helpText` describes ("Leave empty on a collection page to
 * use that collection"), for a block dropped straight onto a collection template with nothing
 * filled in at all. The reference replaced a `collectionHandle` string field in version 2, and a
 * retired handle an entry still carries (`collectionHandle__v1`) is not read here.
 *
 * **`scope: 'category'` opens a category page instead.** The source is then the category the route
 * resolved (`useStorefront().catalog.category(route.categoryPath)`): its title fills in behind the
 * `title` field exactly as a collection's does, its ancestors extend the breadcrumb, and the strip
 * under the text is its own **children**, each linking to that child's page — rendered only when
 * there are any, so a leaf category shows no strip rather than an empty row. The collection
 * reference, the authored `subcollections` list and the count are all ignored there: the catalogue's
 * categories carry no count, and a curated collection chip beside a category chip would be two
 * different things in one strip.
 *
 * `variant: 'image'` renders two columns from `@tablet` (48rem: text left, a 3:2 image right,
 * vertically centred) and stacks image-first below it; `variant: 'text-only'` is a single column
 * capped at 48rem with a bottom rule. Neither field nor collection image resolves the `image`
 * variant silently becomes `text-only` — `effectiveVariant` below, never an empty frame (spec
 * States, "No image"; Acceptance: "With no image and no collection image, the block renders as
 * text-only").
 *
 * The description clamps to 3 lines; **Read more** (`@eldrajs/ui`'s `Button variant="link"`) shows
 * only when the clamped box actually overflows, measured on mount (and on resize, while collapsed)
 * by comparing `scrollHeight` to `clientHeight` on the clamped element — the same
 * `typeof ResizeObserver !== 'undefined'` guard `packages/ui`'s own `useCarousel` uses, since jsdom
 * has no `ResizeObserver`. `Esc` — on the button itself, or from inside the expanded text — collapses
 * it and returns focus to the button, the same "manual keydown, not the native default action"
 * shape `navigation`'s own mega-menu triggers use (jsdom does not turn a keydown into a click the
 * way a real browser does either, so Enter/Space are handled the same explicit way).
 *
 * "No required content, no render" (Global Constraints, "Editor vs live"): with no title resolved
 * from either the field or the store, there is nothing to open a collection page with, so the
 * whole header renders nothing on the live site — gated on `hasTitle || editing`, the same as
 * `breadcrumbs`' own `hasTrail` gate. Only the title gets an editor-only hint for that state; the
 * image and description are genuinely optional and simply don't render when neither the field nor
 * the store has anything to show.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Breadcrumb, Button, Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import type { BreadcrumbItem } from '@eldrajs/ui';
import { EldraRichText, type ImageFraming } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { categoryHref, isInternalHref, safeHref } from '../../app/utils/links';
import { collectionSelector, selectorSlug } from '../../app/storefront/collectionSelector';

interface TrailLevel {
  label?: string;
  href?: string;
}

interface Subcollection {
  label?: string;
  href?: string;
  current?: boolean;
}

const props = defineProps<{ entry: EldraBlockEntry<'collection-header'> }>();
const { data, entryId } = useBlockData(props, 'collection-header');
const editing = useEditing();
const t = useT();
const storefront = useStorefront();

const uid = useUiId();
const headingId = `collection-header-title-${uid}`;
const descriptionId = `collection-header-description-${uid}`;
const readMoreId = `collection-header-readmore-${uid}`;

// ---------------------------------------------------------------------------------------------
// Storefront lookup — the picked collection wins, the route's own collection is the fallback.
// ---------------------------------------------------------------------------------------------

/** `catalog.collection()` has no key but the handle, so a collection known only
 *  by id (a page builder draft overlay, or a depth-0 read — see
 *  `app/storefront/collectionSelector.ts`) resolves to nothing and the block
 *  falls back to its own `title`/`description`/`image` fields until the page is
 *  published, exactly as it does with no collection at all. */
/**
 * **Which page this header opens**: a collection page (the default, and every header this theme
 * shipped before) or a **category** page, where the title and the strip of links under it come from
 * the category the route resolved rather than from a collection.
 *
 * A `select` rather than an inference off the route, for the same reason `collection-grid`'s `scope`
 * is one: an author must be able to put a collection header on a page whose route happens to resolve
 * a category and have it stay a collection header. Adding a value to a `select` — or, as here, the
 * whole field — costs no version bump, so no author's configured `trail` or `subcollections` is
 * retired.
 */
const categoryMode = computed(() => data.value.scope === 'category');

/** `catalog.collection()` has no key but the handle, so a collection known only
 *  by id (a page builder draft overlay, or a depth-0 read — see
 *  `app/storefront/collectionSelector.ts`) resolves to nothing and the block
 *  falls back to its own `title`/`description`/`image` fields until the page is
 *  published, exactly as it does with no collection at all.
 *
 *  `null` in category mode, so a category page makes no collection read at all — an **empty
 *  source**, not a live one, because a result's sources are part of its cache key and a key that
 *  resolves differently after hydration misses the payload the build left. */
const handle = computed(() =>
  categoryMode.value
    ? null
    : selectorSlug(collectionSelector(data.value.collection, storefront.route.collectionHandle))
);
const collectionResult = storefront.catalog.collection(handle);
const collectionInfo = computed(() => collectionResult.data.value);

/**
 * The category this page resolved, read **only** in category mode.
 *
 * `route.categoryPath` is the committed route's and is settled before any block on the page is
 * created, so it is captured here rather than read inside a computed: a result is keyed by its
 * sources' values at creation, and a live source would re-key the header onto whatever the shopper
 * clicked towards (`StorefrontResult`'s "sources final at setup time" rule). It is the **same
 * result** `breadcrumbs` on the same page creates — identical method, identical source, therefore
 * an identical prerender key — so one read serves both and the children ride to the browser in the
 * page payload.
 */
const routeCategoryPath = storefront.route.categoryPath;
const categoryPath = computed(() => (categoryMode.value ? routeCategoryPath : null));
const categoryResult = storefront.catalog.category(categoryPath);
const categoryInfo = computed(() => categoryResult.data.value);

// ---------------------------------------------------------------------------------------------
// Title — field, then the store, then nothing.
// ---------------------------------------------------------------------------------------------

const resolvedTitle = computed(
  () =>
    (data.value.title ?? '').trim() ||
    (categoryMode.value
      ? (categoryInfo.value?.title ?? '').trim()
      : (collectionInfo.value?.title ?? '').trim())
);
const hasTitle = computed(() => resolvedTitle.value !== '');
const showTitleHint = computed(() => editing.value && !hasTitle.value);
const showBlock = computed(() => hasTitle.value || editing.value);

// ---------------------------------------------------------------------------------------------
// Description — the field's rich-text doc when it has content, else the store's plain text.
// ---------------------------------------------------------------------------------------------

const fieldDescription = computed(() => data.value.description ?? null);
const hasFieldDescription = computed(
  () =>
    Array.isArray(fieldDescription.value?.content) && fieldDescription.value!.content!.length > 0
);
const storeDescription = computed(() => (collectionInfo.value?.description ?? '').trim());
const hasStoreDescription = computed(() => storeDescription.value !== '');
const hasDescription = computed(() => hasFieldDescription.value || hasStoreDescription.value);

// ---------------------------------------------------------------------------------------------
// Read more — the clamped box overflows once its content is taller than its clamped height.
// ---------------------------------------------------------------------------------------------

const descriptionRef = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
const expanded = ref(false);

function measureOverflow(): void {
  const el = descriptionRef.value;
  if (!el) return;
  isOverflowing.value = el.scrollHeight > el.clientHeight;
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  measureOverflow();
  if (typeof ResizeObserver !== 'undefined' && descriptionRef.value) {
    resizeObserver = new ResizeObserver(() => {
      // Only while collapsed: expanded removes the clamp, so `clientHeight` grows to match
      // `scrollHeight` and would otherwise be mistaken for "no longer overflowing".
      if (!expanded.value) measureOverflow();
    });
    resizeObserver.observe(descriptionRef.value);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());

// A description that only becomes non-empty after mount (e.g. the storefront result resolving on
// the next tick — see `demo.ts`'s `createDemoResult`) still gets measured once its box exists.
watch(hasDescription, async (has) => {
  if (!has) return;
  await nextTick();
  measureOverflow();
});

function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

function collapseAndFocusButton(): void {
  expanded.value = false;
  document.getElementById(readMoreId)?.focus();
}

/** Enter/Space toggle and Escape collapses, all handled explicitly rather than relying on the
 *  browser's own default action — see the module doc comment. */
function onReadMoreKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleExpanded();
  } else if (event.key === 'Escape' && expanded.value) {
    event.preventDefault();
    collapseAndFocusButton();
  }
}

function onDescriptionKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && expanded.value) {
    event.preventDefault();
    collapseAndFocusButton();
  }
}

const descriptionClass = computed(() => [
  'text-muted max-w-[60ch]',
  !expanded.value ? 'line-clamp-3' : '',
]);

// ---------------------------------------------------------------------------------------------
// Count — always the store's own number, never a field.
// ---------------------------------------------------------------------------------------------

/** Collection pages only: the catalogue's categories carry no count of their own, and the grid's
 *  own total is the filtered set rather than the category's size — so there is nothing honest to
 *  show here on a category page. */
const showCount = computed(() => !categoryMode.value && data.value.showCount !== false);
const productCount = computed(() => collectionInfo.value?.productCount ?? null);
const hasCount = computed(() => showCount.value && productCount.value !== null);
const countText = computed(() =>
  productCount.value === 1
    ? t('collection.countOne')
    : t('collection.countMany', { count: productCount.value ?? 0 })
);

// ---------------------------------------------------------------------------------------------
// Image — field, then the collection's own image, then none (never an empty frame).
// ---------------------------------------------------------------------------------------------

interface ResolvedImage {
  src: string;
  alt: string;
  framing: ImageFraming | null;
  fromField: boolean;
}

const resolvedImage = computed<ResolvedImage | null>(() => {
  const field = data.value.image;
  if (field?.url) {
    return {
      src: field.url,
      alt: field.altText ?? '',
      framing: field.framing ?? null,
      fromField: true,
    };
  }
  const collectionImage = collectionInfo.value?.image;
  if (collectionImage) {
    return { src: collectionImage.src, alt: collectionImage.alt, framing: null, fromField: false };
  }
  return null;
});

const requestedVariant = computed(() => data.value.variant ?? 'image');
/** Spec States, "No image": the `image` variant with nothing to show falls back to `text-only`. */
const effectiveVariant = computed(() =>
  requestedVariant.value === 'image' && resolvedImage.value !== null ? 'image' : 'text-only'
);
const isImageVariant = computed(() => effectiveVariant.value === 'image');

// ---------------------------------------------------------------------------------------------
// Breadcrumb — `trail`, root first, then the resolved title as the current, href-less page.
// ---------------------------------------------------------------------------------------------

const showBreadcrumb = computed(() => data.value.showBreadcrumb !== false);

const trailItems = computed<BreadcrumbItem[]>(() =>
  (data.value.trail ?? []).flatMap((level: TrailLevel) => {
    const href = safeHref(level.href);
    if (href === null || !level.label) return [];
    return [{ label: level.label, href }];
  })
);

/**
 * The category's own ancestors as crumbs, root first, each a link to its own page — the levels
 * between the authored `trail` and this category. Empty in collection mode and for a root category.
 */
const categoryAncestorItems = computed<BreadcrumbItem[]>(() =>
  (categoryInfo.value?.ancestors ?? []).flatMap((ancestor) => {
    const href = safeHref(categoryHref(ancestor.path));
    return href === null ? [] : [{ label: ancestor.title, href }];
  })
);

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  if (!hasTitle.value) return [];
  return [...trailItems.value, ...categoryAncestorItems.value, { label: resolvedTitle.value }];
});

const breadcrumbLinkAs = computed(() =>
  breadcrumbItems.value.every((item) => item.href === undefined || isInternalHref(item.href))
    ? EldraRouterLink
    : undefined
);

// ---------------------------------------------------------------------------------------------
// Sub-collection pills.
// ---------------------------------------------------------------------------------------------

interface ResolvedPill {
  label: string;
  href: string;
  current: boolean;
  as: typeof EldraRouterLink | undefined;
}

/**
 * **The strip under the text**: the author's own `subcollections` on a collection page, and on a
 * **category** page the current category's own **children**, each linking to its page
 * (`categoryHref`).
 *
 * The two are different lists with different meanings — curated collections against levels of the
 * catalogue's own tree — so the category strip is the tree's and the authored list is ignored there
 * rather than merged into it: a merged strip would put a collection chip beside a category chip with
 * nothing to tell them apart. None of the category chips is ever `current`: the current category is
 * the page's own `h1`, and its children are all somewhere else.
 *
 * It renders only when there are children, which is the whole of the rule: a leaf category shows no
 * strip at all rather than an empty row (the `v-if="hasPills"` the authored list already had).
 */
const pills = computed<ResolvedPill[]>(() => {
  if (categoryMode.value) {
    return (categoryInfo.value?.children ?? []).flatMap((child) => {
      const href = safeHref(categoryHref(child.path));
      if (href === null) return [];
      return [
        {
          label: child.title,
          href,
          current: false,
          as: isInternalHref(href) ? EldraRouterLink : undefined,
        },
      ];
    });
  }
  return (data.value.subcollections ?? []).flatMap((item: Subcollection) => {
    const href = safeHref(item.href);
    if (href === null || !item.label) return [];
    return [
      {
        label: item.label,
        href,
        current: item.current === true,
        as: isInternalHref(href) ? EldraRouterLink : undefined,
      },
    ];
  });
});
const hasPills = computed(() => pills.value.length > 0);
/** The strip's accessible name: the two lists are different things, so they are named differently
 *  (`collection.subcategories` against `collection.subcollections`). */
const pillsLabel = computed(() =>
  categoryMode.value ? t('collection.subcategories') : t('collection.subcollections')
);

function pillClass(pill: ResolvedPill): string {
  const base =
    'inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border px-4 ' +
    'text-[0.875rem] font-medium @tablet:h-9 motion-safe:transition-colors motion-safe:duration-fast';
  if (pill.current) {
    return `${base} bg-primary text-primary-contrast border-transparent font-semibold`;
  }
  return `${base} border-border-strong text-text hover:border-text hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]`;
}

// ---------------------------------------------------------------------------------------------
// Layout.
// ---------------------------------------------------------------------------------------------

/** Spec "Collection header" → Container/Section spacing: the shared `sm`/`md`/`lg` scale doesn't
 *  carry these exact asymmetric steps, so `spacing="none"` on `Section` and the padding is written
 *  here — the same pattern `footer`'s own `paddingClass` uses. */
const PADDING_CLASS = 'pt-6 pb-8 @tablet:pt-8 @tablet:pb-12';
const sectionClasses = computed(() => ({
  root: isImageVariant.value ? PADDING_CLASS : `${PADDING_CLASS} border-border border-b`,
}));

const rootClass = computed(() =>
  isImageVariant.value
    ? 'grid grid-cols-1 gap-6 @tablet:grid-cols-2 @tablet:items-center @tablet:gap-12'
    : 'flex max-w-[48rem] flex-col'
);
const textColumnClass = computed(() =>
  isImageVariant.value
    ? 'flex flex-col gap-4 @tablet:order-1 @content:max-w-[40rem]'
    : 'flex flex-col gap-4'
);
</script>

<template>
  <Section
    v-if="showBlock"
    as="header"
    spacing="none"
    :labelled-by="headingId"
    :classes="sectionClasses"
  >
    <Container width="wide">
      <div :class="rootClass">
        <div v-if="isImageVariant" class="@tablet:order-2">
          <UiImage
            :src="resolvedImage!.src"
            :alt="resolvedImage!.alt"
            :framing="resolvedImage!.framing"
            :entry-id="resolvedImage!.fromField ? entryId : undefined"
            :field-path="resolvedImage!.fromField ? 'image' : undefined"
            aspect="3/2"
            rounded="xl"
            class="w-full"
          />
        </div>

        <div :class="textColumnClass">
          <Breadcrumb
            v-if="showBreadcrumb && breadcrumbItems.length > 0"
            :items="breadcrumbItems"
            :link-as="breadcrumbLinkAs"
          />

          <h1
            v-if="hasTitle"
            :id="headingId"
            class="font-heading @content:text-[2.75rem] text-[2.125rem] leading-[1.1] font-bold text-balance"
          >
            {{ resolvedTitle }}
          </h1>
          <EditorPlaceholder
            v-else-if="showTitleHint"
            :id="headingId"
            inline
            :label="t('collection.titleHintLabel')"
            :help="t('collection.titleHintHelp')"
          />

          <div v-if="hasDescription" class="flex flex-col gap-2">
            <div
              :id="descriptionId"
              ref="descriptionRef"
              :class="descriptionClass"
              @keydown="onDescriptionKeydown"
            >
              <!-- Under this block's own `h1` (the collection title), so the description's own
                   headings start at `h2` — an inserted `h1` can never become a second one on the
                   collection page. A floor, never an offset: h2/h3 in the document stay put. -->
              <EldraRichText
                v-if="hasFieldDescription"
                class="prose-eldra text-muted"
                :entry-id="entryId"
                field="description"
                api-id="collection-header"
                :doc="fieldDescription"
                :min-heading-level="2"
              />
              <p v-else>{{ storeDescription }}</p>
            </div>

            <Button
              v-if="isOverflowing"
              :id="readMoreId"
              variant="link"
              size="sm"
              :aria-expanded="expanded ? 'true' : 'false'"
              :aria-controls="descriptionId"
              class="self-start"
              @click="toggleExpanded"
              @keydown="onReadMoreKeydown"
            >
              {{ expanded ? t('collection.readLess') : t('collection.readMore') }}
              <template #trailingIcon>
                <EldraIcon
                  name="chevron-down"
                  size="sm"
                  :class="[
                    'motion-safe:duration-base motion-safe:transition-transform',
                    expanded ? 'rotate-180' : '',
                  ]"
                />
              </template>
            </Button>
          </div>

          <div v-if="hasCount || hasPills" class="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p v-if="hasCount" class="text-muted text-[0.875rem] tabular-nums">{{ countText }}</p>
            <ul v-if="hasPills" :aria-label="pillsLabel" class="flex flex-wrap gap-2">
              <li v-for="pill in pills" :key="pill.href">
                <Link
                  :href="pill.href"
                  :as="pill.as"
                  :underline="false"
                  :aria-current="pill.current ? 'page' : undefined"
                  :classes="{ root: pillClass(pill) }"
                >
                  {{ pill.label }}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Container>
  </Section>
</template>
