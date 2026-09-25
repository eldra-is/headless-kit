<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { cx, partClass } from '../../utils/cx';
import type { MatchParts } from '../select/useOptionList';
import type { SearchBarPart, SearchRow, SearchSection } from './types';

/**
 * The `SearchBar`'s results panel: the non-modal popup below the field.
 *
 * It is deliberately **not** `SelectPanel`. A select's panel is one flat kind of row; this one draws
 * four different views (idle, results, none, loading), rich rows with a thumbnail and a price, chips,
 * a "See all" footer row and a no-results message — and it has no search field of its own, because
 * the search field *is* the control. What the two share is the part that is genuinely the same: the
 * keyboard and the active row (`useListbox`), the open/close wiring (`usePopover`) and the
 * highlight arithmetic (`matchRange`), all of which live outside both panels.
 *
 * Everything here is a prop. The panel owns no state beyond the DOM it draws: the panel element,
 * which `useFloating` positions and `useOverlay` measures "inside" against, the press guard that
 * keeps a press on a row from blurring the field, and scrolling the active row into view.
 */

type Classes = Partial<Record<SearchBarPart, string>>;

const props = withDefaults(
  defineProps<{
    /**
     * The panel element's own id, which is also its `data-eldra-overlay-owner`. `useOverlay`
     * reads that attribute to recognise parts of an overlay that are not inside its content
     * element — and, since this panel is normally teleported to `body`, it is what marks anything
     * a consumer teleports out of the panel's own slots as still belonging to the overlay.
     */
    panelId: string;
    /** The listbox's id — what the field's `aria-controls` points at. */
    listboxId: string;
    /** Which of the spec's four views is showing. Exactly one at a time. */
    view: 'idle' | 'results' | 'none' | 'loading';
    /** The groups to draw, in order. */
    sections: SearchSection[];
    /** The chips of the `none` view, which belong to no group. */
    looseChips: SearchRow[];
    /** The "See all N results" row, when there is one. Always the last option. */
    viewAll?: SearchRow;
    /**
     * The element id of a row, which is what `aria-activedescendant` points at — `undefined` for a
     * value with no row of its own, which is an id the panel then does not write.
     */
    optionId: (value: string) => string | undefined;
    /** The active row's value, or `undefined`. */
    activeValue?: string;
    /** Per row value, where the query matched its title. */
    highlights: Map<string, MatchParts | null>;
    /** The listbox's accessible name ("Search suggestions"). */
    listboxLabel: string;
    /** The `none` view's title and the line under it. */
    emptyTitle: string;
    emptyAdvice: string;
    /** Inline position from `useFloating`, and the placement it resolved to. */
    panelStyle?: Record<string, string>;
    placement?: string;
    classes?: Classes;
  }>(),
  {
    viewAll: undefined,
    activeValue: undefined,
    panelStyle: undefined,
    placement: undefined,
    classes: undefined,
  }
);

const emit = defineEmits<{
  /** A row was chosen with the pointer. The parent decides what that means. */
  select: [row: SearchRow, event: MouseEvent];
  /** The pointer moved onto a row, which makes it active. */
  activate: [value: string];
}>();

const root = ref<HTMLElement | null>(null);

defineExpose({ root });

const isActive = (row: SearchRow): boolean => props.activeValue === row.value;

/**
 * Spec "Search bar" → Sizes, Panel: "0.375rem below it, 0.375rem padding. Max height
 * min(32rem, 70vh), scrolls inside (scrolling doesn't chain to the page). 1px `border`,
 * `radius-lg`, `shadow-md`, `background`. Stacks above page content (z-index 30)." The 0.375rem gap
 * is `useFloating`'s offset, and the width floor is its `matchWidth`.
 *
 * "Stacks above page content" is why the panel is teleported (to `body`, or to the open
 * `<dialog>` the field sits in): a search bar lives in a header, and a header is exactly the kind
 * of element that starts its own stacking context and clips its overflow. `absolute` stays in the
 * class list for a `teleport: false` search bar; the inline `position` from `useFloating` (`fixed`
 * once teleported) is on the element and wins over it either way.
 */
const panelClass = computed(() =>
  partClass(
    cx(
      'absolute z-popover flex flex-col overflow-y-auto overscroll-contain p-1.5',
      'eldra-search-panel-height',
      'rounded-lg border border-border bg-background shadow-md',
      'animate-eldra-popover-in'
    ),
    props.classes,
    'panel'
  )
);

const listboxClass = computed(() => partClass('flex flex-col', props.classes, 'listbox'));

/** "0.125rem block padding. Each group after the first has a 1px `border` hairline above." */
const sectionClass = (index: number): string =>
  partClass(
    cx('py-0.5', index > 0 && 'border-border mt-1 border-t pt-1.5'),
    props.classes,
    'section'
  );

/** "0.75rem, 600, uppercase, 0.06em tracking, `muted`, min 1.75rem row, padding 0.25rem 0.5rem." */
const headingClass = computed(() =>
  partClass(
    'text-select-group text-muted flex min-h-7 items-center px-2 py-1',
    props.classes,
    'sectionHeading'
  )
);

/**
 * An option row (spec → Sizes, Option): "min 2.5rem, padding 0.375rem 0.5rem, 0.75rem gap,
 * `radius-md`", and → States, Active option: "`surface-strong` fill, and the arrow appears at the
 * end" — never colour alone, and `eldra-select-option-active` keeps that boundary real in
 * forced-colours mode, where every fill is replaced.
 *
 * Rows carry no focus ring of their own: "focus stays in the input and the active row is the
 * visual cue".
 */
const rowClass = (row: SearchRow, part: SearchBarPart = 'item'): string =>
  partClass(
    cx(
      'flex min-h-10 scroll-my-1 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5',
      'text-select-option text-text no-underline',
      // 'Minor rows ("Clear recent searches"): title 0.8125rem `muted`.'
      row.kind === 'clearRecent' && 'text-caption text-muted',
      isActive(row) && 'bg-surface-strong eldra-select-option-active'
    ),
    props.classes,
    part
  );

/** "See all" is 600 with the arrow always showing, 0.25rem below the last group. */
const viewAllClass = computed(() =>
  props.viewAll === undefined ? '' : cx(rowClass(props.viewAll, 'viewAll'), 'mt-1 font-semibold')
);

/** "Thumbnail / icon tile: 2.5rem square, `radius-sm`. Thumbnails sit on `surface-strong`." */
const imageClass = (row: SearchRow): string =>
  partClass(
    cx(
      'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm',
      row.item?.image === undefined ? 'bg-surface text-muted' : 'bg-surface-strong'
    ),
    props.classes,
    'itemImage'
  );

/** "Title and sub truncate with an ellipsis on one line." */
const titleClass = computed(() => partClass('min-w-0 flex-1 truncate', props.classes, 'itemTitle'));

/** "Meta: 0.875rem 600 tabular." */
const metaClass = computed(() =>
  partClass('ms-3 shrink-0 text-search-meta tabular-nums', props.classes, 'itemMeta')
);

/** "1rem `arrow-right`, `text`, at the end of the row. Visible only on the active row." */
const arrowClass = computed(() => partClass('size-4 shrink-0', props.classes, 'itemArrow'));

/** A recent row's own leading icon: "a 1.125rem `muted` leading icon instead" of a tile. */
const LEADING_ICON = 'size-4.5 shrink-0 text-muted';

const recentClass = computed(() => partClass('', props.classes, 'recent'));
const popularClass = computed(() =>
  partClass('flex flex-wrap gap-1.5 px-2 pt-1 pb-2', props.classes, 'popular')
);

/**
 * "Chips: min 2rem, padding 0 0.75rem, 1px `border-strong`, `radius-full`, 0.875rem, 0.375rem gap
 * between chips, optional 0.875rem `muted` icon", and → States, Active chip: "`surface-strong`
 * fill, border `text`".
 */
const chipClass = (row: SearchRow): string =>
  partClass(
    cx(
      'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3',
      'text-body-sm text-text no-underline',
      isActive(row)
        ? 'bg-surface-strong border-text eldra-select-option-active'
        : 'border-border-strong'
    ),
    props.classes,
    'chip'
  );

/** "No-results message: centred, padding 1.5rem 1rem 0.75rem. Title 1rem 600 … advice 0.875rem." */
const emptyClass = computed(() => partClass('px-4 pt-6 pb-3 text-center', props.classes, 'empty'));

const loadingClass = computed(() => partClass('flex flex-col gap-1', props.classes, 'loading'));

/** The three skeleton rows: "a 2.5rem square + two text lines". */
const SKELETON_ROWS = [0, 1, 2];

/**
 * Spec "Search bar" → Behaviour: the active option "is scrolled into view". The row's own
 * `scroll-my-1` is the 0.25rem margin, the same shape `SelectPanel` uses.
 */
function scrollActiveIntoView(): void {
  const value = props.activeValue;
  if (value === undefined || typeof document === 'undefined') return;
  const id = props.optionId(value);
  if (id === undefined) return;
  document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' });
}

onMounted(scrollActiveIntoView);
watch(
  () => props.activeValue,
  () => void nextTick(scrollActiveIntoView)
);

/**
 * Spec "Search bar" → Behaviour, Closing: "A pointer press on an option doesn't blur the field."
 * `mousedown`'s default action is what moves focus, so preventing it keeps the caret in the field
 * while the click — and a link row's navigation — still lands. Nothing inside the panel needs focus
 * of its own: every row is reached through `aria-activedescendant`.
 */
function onPanelMouseDown(event: MouseEvent): void {
  event.preventDefault();
}
</script>

<template>
  <div
    ref="root"
    :id="panelId"
    data-part="panel"
    :data-eldra-overlay-owner="panelId"
    :class="panelClass"
    :style="panelStyle"
    :data-placement="placement"
    :data-view="view"
    @mousedown="onPanelMouseDown"
  >
    <!-- Spec → Panel views, `none`: the title, the advice, then the suggestion chips under it.
         A sibling of the listbox, and before it, because a listbox may own only options and groups
         while the chips below this message are options. -->
    <div v-if="view === 'none'" data-part="empty" :class="emptyClass">
      <slot name="empty">
        <p class="text-search-title break-words">{{ emptyTitle }}</p>
        <p class="text-body-sm text-muted mt-1">{{ emptyAdvice }}</p>
      </slot>
    </div>

    <!-- Spec → Panel views, `loading`: "Three skeleton rows (a 2.5rem square + two text lines)." -->
    <div v-if="view === 'loading'" data-part="loading" :class="loadingClass">
      <div
        v-for="row in SKELETON_ROWS"
        :key="row"
        class="flex min-h-10 items-center gap-3 px-2 py-1.5"
        aria-hidden="true"
      >
        <span class="bg-surface-strong size-10 shrink-0 rounded-sm" />
        <span class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span class="bg-surface-strong h-2.5 w-3/4 rounded-sm" />
          <span class="bg-surface-strong h-2.5 w-1/3 rounded-sm" />
        </span>
      </div>
    </div>

    <!-- Spec → Accessibility: 'The panel is `role="listbox"` named "Search suggestions"'. It is the
         element `aria-controls` points at, and it always renders while the panel is showing — a
         `role="combobox"` must point at something real — so the no-results message and the loading
         rows are its siblings rather than invalid children of a listbox. -->
    <div
      :id="listboxId"
      data-part="listbox"
      role="listbox"
      :class="listboxClass"
      :aria-label="listboxLabel"
    >
      <div
        v-for="(section, index) in sections"
        :key="section.key"
        data-part="section"
        role="group"
        :class="sectionClass(index)"
        :aria-labelledby="section.headingId"
      >
        <div
          :id="section.headingId"
          data-part="sectionHeading"
          role="presentation"
          :class="headingClass"
        >
          {{ section.heading }}
        </div>

        <!-- The popular list is a row of chips; every other section is a list of rows. Both
             wrappers are `role="presentation"`: a `role="group"` may own options and groups, and a
             plain element between the two would otherwise be a node in the tree that names
             nothing. -->
        <div
          v-if="section.kind === 'popular'"
          data-part="popular"
          role="presentation"
          :class="popularClass"
        >
          <a
            v-for="row in section.rows"
            :key="row.value"
            :id="optionId(row.value)"
            data-part="chip"
            role="option"
            tabindex="-1"
            aria-selected="false"
            :class="chipClass(row)"
            @click="emit('select', row, $event)"
            @mouseenter="emit('activate', row.value)"
          >
            <!-- Tabler's `search` at 0.875rem, decorative: the chip is named by its text. -->
            <svg
              class="text-muted size-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
              <path d="M21 21l-6 -6" />
            </svg>
            {{ row.label }}
          </a>
        </div>

        <div
          v-else
          role="presentation"
          :data-part="section.kind === 'recent' ? 'recent' : undefined"
          :class="section.kind === 'recent' ? recentClass : undefined"
        >
          <a
            v-for="row in section.rows"
            :key="row.value"
            :id="optionId(row.value)"
            :data-part="row.kind === 'clearRecent' ? 'clearRecent' : 'item'"
            role="option"
            tabindex="-1"
            aria-selected="false"
            :href="row.href"
            :class="rowClass(row, row.kind === 'clearRecent' ? 'clearRecent' : 'item')"
            @click="emit('select', row, $event)"
            @mouseenter="emit('activate', row.value)"
          >
            <template v-if="row.kind === 'result' && row.item">
              <slot name="item" :item="row.item" :type="row.type">
                <span data-part="itemImage" :class="imageClass(row)">
                  <img
                    v-if="row.item.image"
                    :src="row.item.image"
                    :alt="row.item.imageAlt ?? ''"
                    class="size-full object-cover"
                  />
                  <!-- The icon tile, at the spec's 1.125rem: Tabler's `photo` for a product with
                       no image (the Imagery foundation's own placeholder icon), `package` for a
                       collection, `file-text` for a journal article and `info-circle` for a help
                       page. Decorative: the row is named by its title. -->
                  <svg
                    v-else
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
                    <template v-if="row.type === 'products'">
                      <path d="M15 8h.01" />
                      <path
                        d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"
                      />
                      <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
                      <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
                    </template>
                    <template v-else-if="row.type === 'collections'">
                      <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
                      <path d="M12 12l8 -4.5" />
                      <path d="M12 12l0 9" />
                      <path d="M12 12l-8 -4.5" />
                    </template>
                    <template v-else-if="row.type === 'pages'">
                      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                      <path d="M12 9h.01" />
                      <path d="M11 12h1v4h1" />
                    </template>
                    <template v-else>
                      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                      <path
                        d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"
                      />
                      <path d="M9 9l1 0" />
                      <path d="M9 13l6 0" />
                      <path d="M9 17l6 0" />
                    </template>
                  </svg>
                </span>
                <span data-part="itemTitle" :class="titleClass">
                  <template v-if="highlights.get(row.value)"
                    >{{ highlights.get(row.value)?.before
                    }}<mark class="eldra-select-match bg-transparent text-inherit">{{
                      highlights.get(row.value)?.match
                    }}</mark
                    >{{ highlights.get(row.value)?.after }}</template
                  >
                  <template v-else>{{ row.label }}</template>
                </span>
                <span v-if="row.item.price" data-part="itemMeta" :class="metaClass">
                  {{ row.item.price }}
                </span>
              </slot>
            </template>

            <template v-else>
              <!-- Tabler's `clock` for a recent row, `x` for the clear row. Both decorative. -->
              <svg
                :class="LEADING_ICON"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <template v-if="row.kind === 'clearRecent'">
                  <path d="M18 6l-12 12" />
                  <path d="M6 6l12 12" />
                </template>
                <template v-else>
                  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                  <path d="M12 7v5l3 3" />
                </template>
              </svg>
              <span data-part="itemTitle" :class="titleClass">{{ row.label }}</span>
            </template>

            <!-- Spec → Sizes, Active arrow: "visible only on the active row". -->
            <svg
              v-if="isActive(row)"
              data-part="itemArrow"
              :class="arrowClass"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 12l14 0" />
              <path d="M13 18l6 -6" />
              <path d="M13 6l6 6" />
            </svg>
          </a>
        </div>
      </div>

      <!-- The no-results view's suggestion chips, which belong to no group. -->
      <div
        v-if="looseChips.length > 0"
        data-part="popular"
        role="presentation"
        :class="[popularClass, 'justify-center']"
      >
        <a
          v-for="row in looseChips"
          :key="row.value"
          :id="optionId(row.value)"
          data-part="chip"
          role="option"
          tabindex="-1"
          aria-selected="false"
          :class="chipClass(row)"
          @click="emit('select', row, $event)"
          @mouseenter="emit('activate', row.value)"
        >
          <svg
            class="text-muted size-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M21 21l-6 -6" />
          </svg>
          {{ row.label }}
        </a>
      </div>

      <!-- Spec → Anatomy, item 10: '"See all" row: always the last option in results.' -->
      <a
        v-if="viewAll"
        :id="optionId(viewAll.value)"
        data-part="viewAll"
        role="option"
        tabindex="-1"
        aria-selected="false"
        :href="viewAll.href"
        :class="viewAllClass"
        @click="emit('select', viewAll, $event)"
        @mouseenter="emit('activate', viewAll.value)"
      >
        <span class="min-w-0 flex-1 truncate">{{ viewAll.label }}</span>
        <!-- Always visible on this row, unlike every other. -->
        <svg
          data-part="itemArrow"
          :class="arrowClass"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 12l14 0" />
          <path d="M13 18l6 -6" />
          <path d="M13 6l6 6" />
        </svg>
      </a>
    </div>
  </div>
</template>
