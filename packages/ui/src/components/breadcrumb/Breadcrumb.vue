<script setup lang="ts">
import { computed, nextTick, ref, type Component, type ComponentPublicInstance } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import type { BreadcrumbItem, BreadcrumbProps } from './types';

const props = withDefaults(defineProps<BreadcrumbProps>(), {
  collapseAfter: 1,
  keepLast: 2,
  linkAs: undefined,
  classes: undefined,
});

const m = useMessages();

/**
 * `linkAs` follows `Link`'s and `LogoItem`'s own `as` contract exactly (see either component's own
 * comment) — named `linkAs`, not `as`, because this component's own root is spec-fixed (`<nav>`),
 * so `as` would be ambiguous with the root-tag meaning it carries on `Badge`/`Container`/`Section`
 * (see `types.ts`'s own comment and this package's README "as vs linkAs" note): a string tag still
 * takes `href`; a component takes the destination as `to`, matching Vue Router / NuxtLink. One
 * `linkAs` covers every level's link, the same shape `LogoItem` takes one `as` for its own single
 * link.
 */
const isComponentAs = computed(
  () => props.linkAs !== undefined && typeof props.linkAs !== 'string'
);

function hasHref(item: BreadcrumbItem): boolean {
  return item.href !== undefined;
}

function linkTag(item: BreadcrumbItem): string | Component {
  return hasHref(item) ? (props.linkAs ?? 'a') : 'span';
}

function linkAttrs(item: BreadcrumbItem): Record<string, unknown> {
  if (!hasHref(item)) return {};
  return isComponentAs.value ? { to: item.href } : { href: item.href };
}

/**
 * Spec "Breadcrumb" → Variants, Collapsible: "Keeps the first (Home) and the last two levels."
 * `hasMiddle` is `false` whenever there is nothing to hide — a short trail is never collapsible at
 * any width, and `startItems`/`middleItems` stay empty so every level renders through `endItems`
 * unconditionally (see the template).
 */
const hasMiddle = computed(() => props.items.length > props.collapseAfter + props.keepLast);
const startItems = computed(() =>
  hasMiddle.value ? props.items.slice(0, props.collapseAfter) : []
);
const middleItems = computed(() =>
  hasMiddle.value ? props.items.slice(props.collapseAfter, props.items.length - props.keepLast) : []
);
/**
 * Spec "Breadcrumb" → Properties, `items` row: "the last item is the current page and has no
 * `href`." This is the one place that convention is enforced: whichever item ends up last in
 * `endItems` — always `items[items.length - 1]`, whether or not the trail collapses — renders as
 * `<span aria-current="page">` in the template (see `isLast` there), never as a link, regardless
 * of what `href` it happens to carry.
 */
const endItems = computed(() =>
  hasMiddle.value ? props.items.slice(-props.keepLast) : props.items
);

/**
 * Spec "Breadcrumb" → Variants, Expanded: "After the ellipsis is activated: every item shows and
 * the ellipsis hides, for the rest of the page view." This is a one-way switch — there is no way
 * back to collapsed short of remounting — so the ellipsis `v-if`s away for good the moment it is
 * pressed rather than toggling a class the container query could re-hide on a later resize.
 */
const expanded = ref(false);

/**
 * Spec "Breadcrumb" → Behaviour & motion: "Activating the ellipsis ... moves focus to the first
 * revealed link." `middleItems[0]` is always the first item revealed — it is a link whenever
 * `hasMiddle` is true, since only the trail's last item is ever current (see `endItems` above) and
 * that last item is never part of `middleItems`. The ref is only ever attached to that one
 * element (see the template's `v-for` below), so no index bookkeeping is needed here.
 */
const firstRevealedLink = ref<HTMLElement | null>(null);

/** The template only ever binds this to `middleItems[0]`'s rendered link (see the `v-for` below),
 *  so `index === 0` is the whole check — no separate index ref to keep in sync. */
function setFirstRevealedLink(el: Element | ComponentPublicInstance | null, index: number): void {
  if (index !== 0) return;
  firstRevealedLink.value = (el as HTMLElement | null) ?? null;
}

async function expand(): Promise<void> {
  expanded.value = true;
  await nextTick();
  firstRevealedLink.value?.focus();
}

/**
 * Spec "Breadcrumb" → Sizes, "Collapse threshold": "the breadcrumb's own width below 48rem" —
 * driven by a `@container` query on this root, not the viewport (Behaviour & motion: "The collapse
 * is driven by the breadcrumb's own width, not the viewport"). `--container-tablet` (`tailwind.css`
 * "Container and section") is exactly that 48rem edge already; `@max-tablet:hidden` hides a middle
 * item below it and `hidden @max-tablet:list-item` shows the ellipsis only there, so the same two
 * utilities that already exist for `Container`'s gutters draw this component's whole responsive
 * behaviour with no JavaScript width measurement at all. Once `expanded` is true the middle items
 * drop the container-query class entirely — visible at every width, matching "for the rest of the
 * page view" above.
 */
const rootClass = computed(() => partClass('@container', props.classes, 'root'));

const listClass = computed(() =>
  partClass('flex flex-wrap list-none gap-x-2 gap-y-1 p-0 m-0', props.classes, 'list')
);

/** `collapsible` items (the middle run) carry the container-query hidden class only while the
 *  trail is not `expanded` — see the `expanded` ref's own comment above for why that flip is
 *  permanent. Called directly from the template rather than wrapped in its own `computed`, so it
 *  still re-evaluates on every render exactly like one, tracking `expanded`/`props.classes` the
 *  same way. */
function itemClass(collapsible: boolean): string {
  return partClass(
    cx('inline-flex items-start gap-2', collapsible && !expanded.value && '@max-tablet:hidden'),
    props.classes,
    'item'
  );
}

const ellipsisItemClass = computed(() =>
  partClass('hidden @max-tablet:inline-flex @max-tablet:items-start', props.classes, 'item')
);

/**
 * Spec "Breadcrumb" → Sizes: "Separator ... 0.125rem extra space after" — on top of the list's own
 * 0.5rem item gap (`gap-x-2` above), not in place of it. `items-start` on the `<li>` (not `items-
 * center`) plus this `mt-1.875` is a long current-page title's own fix: a title never truncates
 * (see `BreadcrumbItem`'s own comment), so it can wrap to several lines inside its `<li>`, and a
 * `<li>` that centred the separator across the *whole* wrapped block would float it down toward
 * the middle line rather than beside the first one — `mt-1.875` (0.46875rem) nudges the top-aligned
 * separator down to the vertical centre of exactly one `text-body-sm` line
 * (`(1.3125rem line-height − 0.375rem separator) ÷ 2`), which reads identically to the old
 * `items-center` result for every item that never wraps, and correctly for the ones that do.
 */
const separatorClass = computed(() =>
  partClass('size-1.5 shrink-0 mr-0.5 mt-1.875 text-muted', props.classes, 'separator')
);

/**
 * Spec "Breadcrumb" → Sizes, "Link" row: min-height 1.5rem (`target-min`), corner radius 2px for
 * the focus ring (`eldra-link-radius`, `Link`'s own recipe — see that component's comment). States:
 * "Link: `muted`, underline hidden (transparent)" at rest, "Link hover: `text`, underline visible,
 * 0.2em offset" — the same no-underline-until-hover shape `Link`'s own standalone variant uses,
 * copied here rather than imported because `Link` bundles a weight-600/`inline-flex` layout and an
 * optional arrow that this component's plain trail links never want. `inline-flex items-center` is
 * still needed alongside `target-min` (unlike `Link`'s own plain inline variant, which never grows
 * past its text): `min-height` does nothing on a plain inline element, only on a block/flex/grid
 * one, and once a long label wraps past 1.5rem the flex box simply grows to fit it, so this never
 * re-introduces the wrapped-title centring problem `separatorClass`'s own comment describes.
 */
const linkClass = computed(() =>
  partClass(
    cx(
      'inline-flex items-center target-min eldra-link-radius eldra-focus no-underline',
      'text-body-sm text-muted hover:text-text hover:underline hover:decoration-1',
      'hover:decoration-current hover:underline-offset-[0.2em]'
    ),
    props.classes,
    'link'
  )
);

/** Spec "Breadcrumb" → States, "Current page": "none / `text`, weight 500 / none." */
const currentClass = computed(() =>
  partClass('text-body-sm text-text font-medium', props.classes, 'current')
);

/**
 * Spec "Breadcrumb" → Sizes, "Ellipsis button" row: min 1.5rem × 1.5rem (`target-min` gives both
 * the min-height and min-width), padding 0 0.25rem, `radius-sm`, weight 600, letter-spacing 0.08em.
 * States: "Ellipsis rest / hover: none / `text` at 6%" background, "`muted` / `text`" foreground —
 * the same 6%-of-`text` hover fill `Button`'s ghost variant uses (`Button.vue`'s own `VARIANT.ghost`
 * comment), copied verbatim rather than shared, since neither component depends on the other.
 * `cursor-pointer` follows this package's "every enabled `<button>` is a pointer" convention
 * (`Button.vue`'s own comment on its `VARIANT` table).
 */
const ellipsisClass = computed(() =>
  partClass(
    cx(
      'target-min px-1 rounded-sm eldra-focus font-semibold tracking-[0.08em] text-body-sm',
      'text-muted cursor-pointer',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] hover:text-text'
    ),
    props.classes,
    'ellipsis'
  )
);

/**
 * Spec "Breadcrumb" → Behaviour & motion: "Emit `BreadcrumbList` structured data from the same
 * items." The current page's own `item` URL is omitted, matching schema.org's own guidance for a
 * `BreadcrumbList`'s last entry (and this component's own rule that the last item is never a link
 * — see `endItems` above) — the full, uncollapsed `items` prop feeds this regardless of whether the
 * trail is visually collapsed, since collapsing is a display concern only.
 */
const structuredData = computed(() =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: props.items.map((item, index) => {
      const isCurrent = index === props.items.length - 1;
      const element: Record<string, unknown> = {
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
      };
      if (!isCurrent && hasHref(item)) element.item = item.href;
      return element;
    }),
  })
);
</script>

<template>
  <nav data-part="root" :aria-label="m.breadcrumbLabel" :class="rootClass">
    <ol data-part="list" :class="listClass">
      <li
        v-for="(item, index) in startItems"
        :key="`start-${index}`"
        data-part="item"
        :class="itemClass(false)"
      >
        <svg
          v-if="index > 0"
          data-part="separator"
          :class="separatorClass"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 6l6 6l-6 6" />
        </svg>
        <component :is="linkTag(item)" data-part="link" :class="linkClass" v-bind="linkAttrs(item)">
          {{ item.label }}
        </component>
      </li>

      <li v-if="hasMiddle && !expanded" data-part="item" :class="ellipsisItemClass">
        <svg
          v-if="startItems.length > 0"
          data-part="separator"
          :class="separatorClass"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 6l6 6l-6 6" />
        </svg>
        <button
          type="button"
          data-part="ellipsis"
          :class="ellipsisClass"
          :aria-label="m.showMoreLevels(middleItems.length)"
          @click="expand"
        >
          &hellip;
        </button>
      </li>

      <li
        v-for="(item, index) in middleItems"
        :key="`middle-${index}`"
        data-part="item"
        :class="itemClass(true)"
      >
        <svg
          data-part="separator"
          :class="separatorClass"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 6l6 6l-6 6" />
        </svg>
        <component
          :is="linkTag(item)"
          :ref="(el: Element | ComponentPublicInstance | null) => setFirstRevealedLink(el, index)"
          data-part="link"
          :class="linkClass"
          v-bind="linkAttrs(item)"
        >
          {{ item.label }}
        </component>
      </li>

      <li
        v-for="(item, index) in endItems"
        :key="`end-${index}`"
        data-part="item"
        :class="itemClass(false)"
      >
        <svg
          v-if="hasMiddle || index > 0"
          data-part="separator"
          :class="separatorClass"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 6l6 6l-6 6" />
        </svg>
        <span
          v-if="index === endItems.length - 1"
          data-part="current"
          aria-current="page"
          :class="currentClass"
        >
          {{ item.label }}
        </span>
        <component
          v-else
          :is="linkTag(item)"
          data-part="link"
          :class="linkClass"
          v-bind="linkAttrs(item)"
        >
          {{ item.label }}
        </component>
      </li>
    </ol>
    <!-- `<component :is="'script'">`, not a literal `<script>` tag: Vue's SFC compiler refuses a
         literal `<script>`/`<style>` anywhere in a template ("tags with side effect are ignored in
         client component templates") — a dynamic `:is` resolves to a plain element at runtime
         instead of tripping that compile-time check. `v-text` (not `{{ }}`): `<script>` is a
         RAWTEXT element, so a literal mustache would never even parse as an expression inside one
         — `v-text` sets `el.textContent` directly, which also sidesteps `innerHTML`'s HTML-
         fragment reparsing (and the `</script`-breakout risk that comes with it) entirely. -->
    <component :is="'script'" type="application/ld+json" v-text="structuredData" />
  </nav>
</template>
