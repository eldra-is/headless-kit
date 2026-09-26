<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import type { PaginationProps } from './types';

const props = withDefaults(defineProps<PaginationProps>(), {
  siblings: 1,
  hrefForPage: undefined,
  compact: false,
  linkAs: undefined,
  ariaLabel: undefined,
  classes: undefined,
});

/**
 * Controller ruling: without `hrefForPage` the controls are `<button type="button">` elements
 * that emit `update:page` instead of real links — see `types.ts`'s own comment on `hrefForPage`
 * and the README's Deviations entry.
 */
const emit = defineEmits<{ 'update:page': [page: number] }>();

const m = useMessages();

/** Spec "Pagination" → Acceptance criteria: "Nothing renders when there's only one page." Also
 *  covers the defensive `0`/negative edge the spec does not name. */
const visible = computed(() => props.totalPages > 1);

const navLabel = computed(() => props.ariaLabel ?? m.value.pagination);

/** `linkAs` follows `Link`'s own `as` contract exactly: a string tag still takes `href`; a
 *  component takes the destination as `to`, matching Vue Router / NuxtLink's own contract. Named
 *  `linkAs`, not `as` — this component's root is spec-fixed (`<nav>`); see `types.ts`'s own
 *  comment and the README's Deviations entry. */
const isComponentAs = computed(
  () => props.linkAs !== undefined && typeof props.linkAs !== 'string'
);

/** With `hrefForPage`, every control is a real link (`linkAs`, defaulting to `<a>`); without it,
 *  every control is a native `<button type="button">` that emits `update:page` on activation
 *  instead. */
const itemTag = computed(() => (props.hrefForPage ? (props.linkAs ?? 'a') : 'button'));

function targetAttrs(page: number): Record<string, unknown> {
  if (!props.hrefForPage) return { type: 'button' };
  const href = props.hrefForPage(page);
  return isComponentAs.value ? { to: href } : { href };
}

function onActivate(page: number): void {
  if (!props.hrefForPage) emit('update:page', page);
}

const prevDisabled = computed(() => props.page <= 1);
const nextDisabled = computed(() => props.page >= props.totalPages);

type PageNode = { type: 'page'; page: number } | { type: 'ellipsis'; after: number };

/**
 * The page window (spec "Pagination" → Properties, `siblings`: "First and last always show; the
 * rest collapse to '…'."). Built from the *set* of pages that must show — `1`, `totalPages`, and
 * `page ± siblings` clamped to range — rather than the more common "two ellipsis slots" bookkeeping:
 * a `Set` naturally absorbs the overlap between the sibling window and the first/last pages (small
 * `totalPages`, `page` near either end, `siblings: 0`), so every edge case is the same one loop
 * instead of a special case each.
 */
function buildWindow(page: number, totalPages: number, siblings: number): PageNode[] {
  const shown = new Set<number>([1, totalPages]);
  const span = Math.max(siblings, 0);
  for (let candidate = page - span; candidate <= page + span; candidate++) {
    if (candidate >= 1 && candidate <= totalPages) shown.add(candidate);
  }
  const sorted = [...shown].sort((a, b) => a - b);
  const nodes: PageNode[] = [];
  for (const [index, current] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && current - previous > 1) {
      nodes.push({ type: 'ellipsis', after: previous });
    }
    nodes.push({ type: 'page', page: current });
  }
  return nodes;
}

const pageWindow = computed(() => buildWindow(props.page, props.totalPages, props.siblings));

const rootClass = computed(() => partClass('@container', props.classes, 'root'));

/** Spec "Pagination" → Variants, Numbered: "Centred, wraps." Sizes: "Gap between items 0.25rem." */
const numberedListClass = computed(() =>
  partClass(
    'hidden @tablet:flex flex-wrap items-center justify-center gap-1',
    props.classes,
    'list'
  )
);

/** Spec → Variants, Compact: "on one line." Below 48rem by default; forced on regardless of width
 *  when `compact` is set, in which case the numbered list above is never rendered at all. */
const compactListClass = computed(() =>
  partClass(
    cx('flex items-center justify-center gap-2', !props.compact && '@tablet:hidden'),
    props.classes,
    'list'
  )
);

const itemClass = computed(() => partClass('', props.classes, 'item'));

/** Spec → Sizes: "Page link: min 2.5rem × 2.5rem, padding 0 0.5rem, radius-md, weight 500, tabular
 *  numbers." `min-w-10`/`min-h-10` (10 × the shared 0.25rem spacing unit) is the 2.5rem the spec
 *  gives with no dedicated token of its own — the same arbitrary-multiple shape `Button`'s own
 *  `px-4.5` uses, not a hand-written `min-w-[2.5rem]`. Hover: `text` at 6%, the same tint formula
 *  `Button`'s ghost variant uses. */
const pageClass = computed(() =>
  partClass(
    cx(
      'inline-flex min-w-10 min-h-10 items-center justify-center rounded-md px-2 font-medium',
      'tabular-nums text-text cursor-pointer eldra-focus',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
    ),
    props.classes,
    'page'
  )
);

/** Spec → States, Current: "`primary` fill, `primary-contrast` text, weight 600" — not only a
 *  colour change (1.4.1): the fill and weight carry the state, `aria-current="page"` carries it to
 *  assistive tech. */
const currentClass = computed(() =>
  partClass(
    'inline-flex min-w-10 min-h-10 items-center justify-center rounded-md px-2 font-semibold ' +
      'tabular-nums bg-primary text-primary-contrast cursor-pointer eldra-focus',
    props.classes,
    'current'
  )
);

/** Spec → Sizes: "Gap ('…'): min-width 2rem, centred." `min-w-8` is the 2rem the spec gives (8 ×
 *  the shared spacing unit). */
const ellipsisClass = computed(() =>
  partClass('inline-flex min-w-8 items-center justify-center text-muted', props.classes, 'ellipsis')
);

/** Spec → Sizes: "Previous / next: 2.5rem tall, padding 0 0.75rem, gap 0.25rem, 1rem chevron." The
 *  height reuses the shared `control-h` token (also 2.5rem) rather than a second name for the same
 *  number. */
const prevNextClass = computed(() =>
  cx(
    'inline-flex control-h items-center gap-1 rounded-md px-3 font-medium text-text cursor-pointer',
    'eldra-focus',
    'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
  )
);

/** Spec → States, "Disabled previous / next": "`muted` at 60% opacity, not a link, no pointer
 *  events." `text-muted/60` is Tailwind's own opacity modifier over the shared `muted` token. */
const prevNextDisabledClass =
  'inline-flex control-h items-center gap-1 rounded-md px-3 font-medium text-muted/60 pointer-events-none';

/** Spec → Sizes: "Compact arrows: 2.75rem square outline icon buttons." `target-touch` is the
 *  shared 2.75rem token/utility (also the minimum touch target elsewhere in this package). */
const compactArrowClass = computed(() =>
  cx(
    'inline-flex target-touch shrink-0 items-center justify-center rounded-md border',
    'border-border-strong bg-background text-text cursor-pointer eldra-focus',
    'hover:border-text hover:bg-surface'
  )
);

const compactArrowDisabledClass =
  'inline-flex target-touch shrink-0 items-center justify-center rounded-md border ' +
  'border-transparent text-muted/60 pointer-events-none';

/** Spec → Sizes: "Compact status: 0.9375rem, padding 0 0.75rem, tabular numbers, no wrap." Reuses
 *  the shared `text-control` type style (also 0.9375rem, the form controls' own font size) rather
 *  than a new per-component variable for the identical number. */
const compactStatusClass = 'text-control text-muted tabular-nums whitespace-nowrap px-3';

/**
 * Spec → States: "numbers `text` weight 600" inside the compact status sentence ("Page **2** of
 * **12**"). The sentence itself is one translated string (`m.pageOfTotal`) with no seam of its own
 * to split the digits back out of — this splits on digit *runs* (`/(\d+)/`, keeping the capturing
 * group so `String.split` returns the matched runs too) rather than changing the message contract
 * itself, so a translator still writes one plain sentence and `messages/__tests__/parity.spec.ts`
 * sees no new key. Presentation only: `text` (`compactStatusClass`'s own `text-muted`) already
 * applies to both bold and non-bold segments, and only the font-weight differs.
 */
function splitDigitRuns(text: string): Array<{ text: string; bold: boolean }> {
  return text
    .split(/(\d+)/)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, bold: /^\d+$/.test(part) }));
}

const compactStatusParts = computed(() =>
  splitDigitRuns(m.value.pageOfTotal(props.page, props.totalPages))
);
</script>

<template>
  <nav v-if="visible" data-part="root" :class="rootClass" :aria-label="navLabel">
    <ul v-if="!compact" data-part="list" :class="numberedListClass">
      <li data-part="item" :class="itemClass">
        <span
          v-if="prevDisabled"
          data-part="prev"
          :class="prevNextDisabledClass"
          aria-disabled="true"
        >
          <svg
            class="size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M15 6l-6 6l6 6" />
          </svg>
          <span>{{ m.previousPage }}</span>
        </span>
        <component
          :is="itemTag"
          v-else
          data-part="prev"
          :rel="hrefForPage ? 'prev' : undefined"
          :class="prevNextClass"
          v-bind="targetAttrs(page - 1)"
          @click="onActivate(page - 1)"
        >
          <svg
            class="size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M15 6l-6 6l6 6" />
          </svg>
          <span>{{ m.previousPage }}</span>
        </component>
      </li>

      <li
        v-for="node in pageWindow"
        :key="node.type === 'page' ? `page-${node.page}` : `ellipsis-${node.after}`"
        data-part="item"
        :class="itemClass"
      >
        <span
          v-if="node.type === 'ellipsis'"
          data-part="ellipsis"
          :class="ellipsisClass"
          aria-hidden="true"
          >…</span
        >
        <component
          :is="itemTag"
          v-else
          :data-part="node.page === page ? 'current' : 'page'"
          :class="node.page === page ? currentClass : pageClass"
          :aria-current="node.page === page ? 'page' : undefined"
          :aria-label="node.page === page ? m.pageN(node.page, true) : m.pageN(node.page)"
          v-bind="targetAttrs(node.page)"
          @click="onActivate(node.page)"
        >
          {{ node.page }}
        </component>
      </li>

      <li data-part="item" :class="itemClass">
        <span
          v-if="nextDisabled"
          data-part="next"
          :class="prevNextDisabledClass"
          aria-disabled="true"
        >
          <span>{{ m.nextPage }}</span>
          <svg
            class="size-4 shrink-0"
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
        </span>
        <component
          :is="itemTag"
          v-else
          data-part="next"
          :rel="hrefForPage ? 'next' : undefined"
          :class="prevNextClass"
          v-bind="targetAttrs(page + 1)"
          @click="onActivate(page + 1)"
        >
          <span>{{ m.nextPage }}</span>
          <svg
            class="size-4 shrink-0"
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
        </component>
      </li>
    </ul>

    <div data-part="list" :class="compactListClass">
      <span
        v-if="prevDisabled"
        data-part="prev"
        :class="compactArrowDisabledClass"
        aria-disabled="true"
      >
        <svg
          class="size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M15 6l-6 6l6 6" />
        </svg>
      </span>
      <component
        :is="itemTag"
        v-else
        data-part="prev"
        :rel="hrefForPage ? 'prev' : undefined"
        :class="compactArrowClass"
        :aria-label="m.previousPage"
        v-bind="targetAttrs(page - 1)"
        @click="onActivate(page - 1)"
      >
        <svg
          class="size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M15 6l-6 6l6 6" />
        </svg>
      </component>

      <span :class="compactStatusClass"
        ><template v-for="(part, index) in compactStatusParts" :key="index"
          ><strong v-if="part.bold">{{ part.text }}</strong
          ><template v-else>{{ part.text }}</template></template
        ></span
      >

      <span
        v-if="nextDisabled"
        data-part="next"
        :class="compactArrowDisabledClass"
        aria-disabled="true"
      >
        <svg
          class="size-4.5"
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
      </span>
      <component
        :is="itemTag"
        v-else
        data-part="next"
        :rel="hrefForPage ? 'next' : undefined"
        :class="compactArrowClass"
        :aria-label="m.nextPage"
        v-bind="targetAttrs(page + 1)"
        @click="onActivate(page + 1)"
      >
        <svg
          class="size-4.5"
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
      </component>
    </div>
  </nav>
</template>
