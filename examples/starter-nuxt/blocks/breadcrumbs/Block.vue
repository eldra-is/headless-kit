<script setup lang="ts">
/**
 * Breadcrumbs · a trail from Home to the current page, wrapping `@eldrajs/ui`'s `Breadcrumb`.
 *
 * The design spec (`02-blocks.md` "Breadcrumbs") builds the trail from the page tree, but a block
 * cannot read the route (no Nuxt globals here, and `useEldraPage()` is page-level, not
 * block-level — see `block.json`'s own `description`). `trail` is this theme's stand-in: a flat
 * list of `{label, href}` levels the page
 * author fills by hand, root first, with `currentTitle` standing in for "the page title" the spec
 * assumes is always available.
 *
 * **`fromProduct` is the one level this block can fill by itself**: on a product page, the store's
 * own category trail for the product the route resolved — root category down to the product's own,
 * each level a link into the catalogue filtered by it
 * (`app/storefront/categories.ts`). It exists because the seeded product
 * *template* has no authored `trail` and cannot have one: a template renders whatever product its
 * `:slug` matched, so `app/templates.ts` empties the list, and the breadcrumbs on a merchant's first
 * product page were the Home crumb alone — one item, which is fewer than two, which is nothing.
 *
 * It reads `storefront.catalog.product()` for the route's own handle, which is the **same result**
 * `product-detail` on the same page creates: identical method, identical sources, therefore an
 * identical prerender key, so Nuxt's `useAsyncData` answers both from one read and the trail rides
 * to the browser in the page payload with the rest of the product. Nothing is fetched when the
 * option is off or the route names no product (the source is `null`, which makes no request).
 *
 * Resolved item order: `homeLabel` (when `showHome`) → `trail`, in order → the product's category
 * trail (when `fromProduct`) → `currentTitle` (when `showCurrent` and non-empty). The authored levels
 * come first because they are the page-tree levels *above* the catalogue, while a category is the
 * level nearest the product. Spec "Empty (freshly inserted)" row: on a top-level page (empty
 * `trail`, no `currentTitle`) there is nothing to show a trail *between*, so with fewer than two
 * resolved items nothing renders live at all — only the editor sees a hint explaining why.
 */
import { computed, ref, watchEffect } from 'vue';
import { Breadcrumb, Container, EditorPlaceholder } from '@eldrajs/ui';
import type { BreadcrumbItem } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'breadcrumbs'> }>();
const { data } = useBlockData(props, 'breadcrumbs');
const editing = useEditing();
const storefront = useStorefront();
const t = useT();

const showHome = computed(() => data.value.showHome !== false);
/**
 * **On unless the author turned it off**, which is what `!== false` means here and nowhere else in
 * this block (`showHome` and `showCurrent` read the same way, and for the same reason).
 *
 * It matters because of what "absent" is. A `fromProduct` the page document does not carry is not
 * an author's "no" — it is a product template written before the field existed, which is every
 * site deployed up to now: Core stores the block data a seed wrote and does not backfill a field
 * added later. Reading an absent value as `false` therefore left the trail switched off on exactly
 * the pages it exists for, with nothing in the inspector to explain it, while the seeded template
 * beside it also turns Product detail's own `showCategory` off — so a live product page had no
 * category trail in either place.
 *
 * Nothing is duplicated by the flip: the option can only add crumbs on a **product route**, which
 * is served by the product route template, and that template's seed is the one that carries
 * `showCategory: false` (`pages/product.page.json`).
 *
 * `preview.json` turns it off for the generated story and the preview tile alone, because the demo
 * storefront's route *is* a product by default (`app/storefront/demo.ts`) — so without the overlay
 * this block's own tile would draw the demo product's category on top of `mock.json`'s authored
 * levels, which is a picture of two trails rather than of this block.
 */
const fromProduct = computed(() => data.value.fromProduct !== false);
const homeLabel = computed(() => data.value.homeLabel || 'Home');
const showCurrent = computed(() => data.value.showCurrent !== false);
const currentTitle = computed(() => data.value.currentTitle?.trim() ?? '');
const containerWidth = computed(() => data.value.container ?? 'wide');

/**
 * Each trail level's `href` is page-author content, not a trusted literal (unlike the hard-coded
 * `/` below), so it goes through `safeHref` like every other field-sourced destination in this
 * theme. A level with no safe href or no label is dropped rather than rendered with a broken link.
 */
const trailItems = computed<BreadcrumbItem[]>(() =>
  (data.value.trail ?? []).flatMap((level) => {
    const href = safeHref(level.href);
    if (href === null || !level.label) return [];
    return [{ label: level.label, href }];
  })
);

/**
 * The product **this page** resolved, read once rather than watched — `null` whenever `fromProduct`
 * is off, so a page that does not want the store's trail makes no read at all.
 *
 * `route.productHandle` is the committed route's and is settled before any block on the page is
 * created, which is what makes this result's key the one the prerender left a payload under
 * (`StorefrontResult`'s "sources final at setup time" rule). Reading it *inside* the computed made
 * it a live source instead, and this block sits on pages that are not product pages: a click on a
 * product card commits the destination route while the collection page is still mounted, so the
 * collection page's own breadcrumbs re-keyed onto the clicked product and fetched it — a second
 * read of a product the destination page already has in its payload. Capturing the value here keeps
 * a block on a non-product page at `null` for its whole life, and the destination page's own blocks
 * are created fresh against the committed route.
 */
const routeProductHandle = storefront.route.productHandle;
const productHandle = computed<string | null>(() =>
  fromProduct.value ? routeProductHandle : null
);
const productResult = storefront.catalog.product(productHandle);

/**
 * The store's category trail for that product, through the same `safeHref` gate the authored levels
 * pass. Empty for every honest absence — no product, a product with no category, a category read
 * that failed — and an empty one simply leaves the trail as the author's own.
 */
const productTrailItems = computed<BreadcrumbItem[]>(() =>
  (productResult.data.value?.categoryTrail ?? []).flatMap((level) => {
    const href = safeHref(level.href);
    if (href === null || !level.label) return [];
    return [{ label: level.label, href }];
  })
);

const items = computed<BreadcrumbItem[]>(() => {
  const resolved: BreadcrumbItem[] = [];
  if (showHome.value) resolved.push({ label: homeLabel.value, href: '/' });
  resolved.push(...trailItems.value);
  resolved.push(...productTrailItems.value);
  if (showCurrent.value && currentTitle.value !== '') {
    resolved.push({ label: currentTitle.value });
  }
  return resolved;
});

/** Spec "States every block must handle" → Empty row, this block's own reading of it (see the
 *  top-of-file comment): fewer than two levels means there is no trail to show. */
const hasTrail = computed(() => items.value.length >= 2);

/**
 * `Breadcrumb.linkAs` applies to every level alike (see `BreadcrumbProps.linkAs`'s own comment) —
 * there is no per-item override — so this picks one tag for the whole trail rather than per link,
 * unlike `cta`'s/`feature-grid`'s per-link `isInternalHref` check. The trail is the page tree
 * (`homeLabel` → `/`, always same-site; `trail` levels are meant to be site-internal collection/
 * category paths too), so every safe href here is ordinarily internal; the `every(...)` guard
 * still falls back to a plain `<a>` for the whole trail if a page author ever puts an absolute
 * off-site URL in a level, rather than silently routing an external destination through the
 * router.
 */
const linkAs = computed(() =>
  items.value.every((item) => item.href === undefined || isInternalHref(item.href))
    ? EldraRouterLink
    : undefined
);

/**
 * Spec "Breadcrumbs" → Layout, "From 64rem": "The current title truncates with an ellipsis at
 * 40ch (single line)." — a per-consumer override of `Breadcrumb`'s own default (the primitive
 * itself deliberately never truncates a label; see `packages/ui/README.md`'s Deviations entry),
 * applied only through the sanctioned `classes` extension point, and only from the package's own
 * `@content` container-query breakpoint (64rem, the same one `Container`'s desktop gutter reads —
 * `Breadcrumb`'s own root is itself a `@container`, so this measures the trail's own rendered
 * width, matching the spec's "the breadcrumb responds to its own width" rule). Below that width
 * the trail keeps the primitive's own default wrapping behaviour, per the spec's "may wrap to a
 * second line" note for narrow widths.
 */
const currentClasses = { current: '@content:truncate @content:max-w-[40ch]' };

/**
 * 40ch CSS truncation only ever *visually* clips text — the full string stays in the DOM and in
 * the accessible name either way — but the spec's own acceptance criterion additionally wants the
 * full text "in `title`" (a hover tooltip for sighted mouse users). `Breadcrumb` has no per-item
 * `title` hook (nor a slot to render the current item itself), so this reaches the rendered
 * current-page element the same sanctioned way `classes` does: by its stable `data-part="current"`
 * anatomy name (see the package README's "composed children are addressed by `data-part`" rule).
 * `breadcrumbRoot` is a plain DOM ref (not a component ref) so this stays framework-idiomatic and
 * SSR-safe: it is `null` until the client mounts, `watchEffect` re-runs once it appears, and it
 * re-runs again whenever the resolved label changes (e.g. a live edit in the page-builder).
 */
const breadcrumbRoot = ref<HTMLElement | null>(null);
const lastItemLabel = computed(() => items.value.at(-1)?.label ?? '');
watchEffect(() => {
  const currentEl = breadcrumbRoot.value?.querySelector('[data-part="current"]');
  currentEl?.setAttribute('title', lastItemLabel.value);
});
/**
 * Spec "Breadcrumbs" → Container/Section line: "Section background none (inherits the page
 * ground) · Section spacing none". This root is a plain `@container` wrapper, never `@eldrajs/ui`'s
 * `Section` — `Section` marks every ground, including `none`, with `data-section-bg` so its own
 * adjacent-same-background CSS rule can drop the *next* sibling's top padding. Breadcrumbs sits
 * directly under the header on product/collection/article pages and must never trigger that rule
 * against the block that follows it: the spec's page narrative treats it as a thin trail, not a
 * section the following block's padding collapses against. Omitting `data-section`/`data-section-bg`
 * here (while still giving `Container` a `@container` ancestor for its own gutter breakpoints) is
 * what keeps the next block's full top padding intact.
 */
</script>

<template>
  <div v-if="hasTrail" class="bg-background text-text @container">
    <Container :width="containerWidth" :classes="{ root: 'py-3' }">
      <div ref="breadcrumbRoot" class="contents">
        <Breadcrumb
          :items="items"
          :collapse-after="1"
          :keep-last="2"
          :link-as="linkAs"
          :classes="currentClasses"
        />
      </div>
    </Container>
  </div>
  <EditorPlaceholder
    v-else-if="editing"
    :label="t('breadcrumbs.hintLabel')"
    :help="t('breadcrumbs.hintHelp')"
  />
</template>
