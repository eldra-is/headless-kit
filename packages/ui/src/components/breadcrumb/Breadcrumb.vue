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
 * Spec "Breadcrumb" → Properties, `items` row: "the last item is the current page and has no
 * `href`" — that invariant (see `BreadcrumbItem`'s own comment) means the trail's true last item
 * can never be swallowed by the collapsible middle, whatever `keepLast` the caller passes. Every
 * computation below reads `effectiveKeepLast`, not the raw prop, for exactly that reason:
 * `keepLast: 0` is clamped up to `1` so the current page always has its own slot in `endItems`,
 * never `middleItems`.
 *
 * This also sidesteps a sharper bug a raw `keepLast: 0` produces on its own: `Array.prototype.
 * slice`'s negative-zero hazard. `slice(-0)` is specified to behave as `slice(0)` (`-0` is not
 * `< 0`), so a bare `props.items.slice(-props.keepLast)` at `keepLast: 0` returned the *whole*
 * array instead of an empty one — review round 1 caught this: the current page leaked into
 * `middleItems` as a demoted, non-current item, and `endItems` duplicated the entire trail on top
 * of it, so every label rendered twice above the 48rem collapse threshold. Every slice below is
 * either unconditional-length-based (`items.length - effectiveKeepLast.value`, never negative
 * while `hasMiddle` is true — see below) or, for `startItems`, never touches `keepLast` at all.
 */
const effectiveKeepLast = computed(() => Math.max(props.keepLast, 1));

/**
 * Spec "Breadcrumb" → Variants, Collapsible: "Keeps the first (Home) and the last two levels."
 * `hasMiddle` is `false` whenever there is nothing to hide — a short trail is never collapsible at
 * any width, and `startItems`/`middleItems` stay empty so every level renders through `endItems`
 * unconditionally (see the template). Reads `effectiveKeepLast`, not the raw prop, so this stays
 * in lock step with `middleItems`/`endItems` below — otherwise a `keepLast: 0` trail exactly as
 * long as `collapseAfter + 1` could compute `hasMiddle: true` (using the raw `0`) while
 * `middleItems` (using the clamped `1`) came out empty, showing an ellipsis for zero hidden
 * levels.
 */
const hasMiddle = computed(
  () => props.items.length > props.collapseAfter + effectiveKeepLast.value
);
const startItems = computed(() =>
  hasMiddle.value ? props.items.slice(0, props.collapseAfter) : []
);
const middleItems = computed(() =>
  hasMiddle.value
    ? props.items.slice(props.collapseAfter, props.items.length - effectiveKeepLast.value)
    : []
);
/**
 * Whichever item ends up last here — always `items[items.length - 1]`, whether or not the trail
 * collapses — renders as `<span aria-current="page">` in the template (see `isLast` there), never
 * as a link, regardless of what `href` it happens to carry. `items.length - effectiveKeepLast.value`
 * (not `-effectiveKeepLast.value`, i.e. never a *negative* `slice` argument) is always `>= 0` here:
 * `hasMiddle` being `true` already proves `items.length > collapseAfter + effectiveKeepLast.value`,
 * and `collapseAfter >= 0`, so `items.length > effectiveKeepLast.value` follows directly.
 */
const endItems = computed(() =>
  hasMiddle.value ? props.items.slice(props.items.length - effectiveKeepLast.value) : props.items
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
 * Spec "Breadcrumb" → Sizes, "Separator" row: "0.375rem square ... rotated 45° (a chevron), 0.125rem
 * extra space after" — the current chevron's own size (`size-1.5`), kept unchanged; see the
 * README's Deviations entry for why it stays an inline Tabler `chevron-right` SVG rather than the
 * spec's own CSS-drawn two-border technique (operator direction, 2026-09-25, predates this fix).
 *
 * The bug the operator reported ("separators render as tiny marks sitting above the baseline") was
 * never the size — it was a single `mt-1.875` used for two siblings of different heights. Every
 * separator sits in the *same* `<li>`, immediately before the one thing it separates from the
 * previous level, and that sibling is one of two shapes:
 *
 * - A **link or the ellipsis button** — always exactly one line, and always `target-min` (1.5rem)
 *   tall from its own `inline-flex`/`min-height` box (`linkClass`/`ellipsisClass` below), not from
 *   `text-body-sm`'s 1.3125rem line-height. `align-self: center` (`self-center`) is exactly right
 *   here: with no wrapping possible, the `<li>`'s own cross-size *is* that 1.5rem box, so the
 *   browser centres the 0.375rem chevron against it with no margin arithmetic at all.
 * - The **current page**, a plain `<span>` with no flex box of its own (`currentClass` below) — the
 *   one item the spec allows to wrap onto several lines ("Product titles are never truncated; the
 *   trail wraps" — see `BreadcrumbItem`'s own comment; proved by the `LongTitles` story). Here
 *   `self-center` would centre the chevron against the *whole* wrapped block, floating it down
 *   toward a middle line instead of the first one — so this case keeps the `<li>`'s own `items-
 *   start` (top-aligned) instead, with `mt-1.875` (0.46875rem) nudging the top-aligned chevron down
 *   to the vertical centre of exactly the first `text-body-sm` line
 *   (`(1.3125rem line-height − 0.375rem separator) ÷ 2`).
 *
 * `alignCenter` is `true` for every separator except the one immediately before the trail's final,
 * current-page item (see the template's own `endItems` loop, the only place `false` is passed).
 * `mx-1` (was `mr-0.5`, right-only) — even spacing on both sides of the mark itself, on top of the
 * list's own 0.5rem item gap (`gap-x-2` above).
 */
function separatorClass(alignCenter: boolean): string {
  return partClass(
    cx('size-1.5 shrink-0 mx-1 text-muted', alignCenter ? 'self-center' : 'mt-1.875'),
    props.classes,
    'separator'
  );
}

/**
 * Spec "Breadcrumb" → Sizes, "Link" row: min-height 1.5rem (`target-min`), corner radius 2px for
 * the focus ring (`eldra-link-radius`, `Link`'s own recipe — see that component's comment).
 *
 * Deviation, operator direction 2026-09-26 (see the README's Deviations entry): the spec's own
 * States row reads "Link: `muted`, underline hidden (transparent)" at rest, underline appearing on
 * hover — the same no-underline-until-hover shape `Link`'s own standalone variant used to have.
 * The operator's "all link elements" underline-at-rest ruling applies here too, so this now uses
 * `Link`'s own shared rest recipe instead (1px at 55% of the text colour, thickening to 2px at
 * hover) — copied here rather than imported because `Link` also bundles a weight-600/`inline-flex`
 * layout and an optional arrow that this component's plain trail links never want. `inline-flex
 * items-center` is still needed alongside `target-min` (unlike `Link`'s own plain inline variant,
 * which never grows past its text): `min-height` does nothing on a plain inline element, only on a
 * block/flex/grid one, and once a long label wraps past 1.5rem the flex box simply grows to fit it,
 * so this never re-introduces the wrapped-title centring problem `separatorClass`'s own comment
 * describes.
 */
const linkClass = computed(() =>
  partClass(
    cx(
      'inline-flex items-center target-min eldra-link-radius eldra-focus',
      'text-body-sm text-muted hover:text-text',
      'underline decoration-1 decoration-current/55 underline-offset-[0.2em]',
      'hover:decoration-2 hover:decoration-current'
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
          :class="separatorClass(true)"
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
          :class="separatorClass(true)"
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
          :class="separatorClass(true)"
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
          :class="separatorClass(index !== endItems.length - 1)"
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
