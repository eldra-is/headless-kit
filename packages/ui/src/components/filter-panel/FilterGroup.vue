<script setup lang="ts">
/**
 * One facet group of the `FilterPanel`: the disclosure, and nothing about the values inside it.
 *
 * **Not `Accordion`/`AccordionItem`.** The design spec's "Filter panel" → Accessibility is
 * explicit that a group trigger is "an `h3` containing a `<button type="button">` with
 * `aria-expanded` ... and `aria-controls` pointing at the body", and its Anatomy puts a count
 * badge and a collapsed summary *inside* that trigger. `AccordionItem` is a native
 * `<details>`/`<summary>` whose trigger content is a plain `title` string: it exposes no
 * `aria-expanded`/`aria-controls` of its own, has nowhere a `Badge` or a summary could go, and
 * cannot express the spec's own keyboard row — "`Esc` ... on an expanded trigger, or anywhere
 * inside its body, collapse the group and return focus to the trigger" — because `<details>`
 * does not take `Esc`. So the disclosure is drawn here.
 *
 * The body is a `<fieldset>` with a visually hidden `<legend>` naming the facet, and it is
 * **`v-show`n rather than `v-if`ed**: a facet keeps its own list state (what the shopper typed
 * into its search field, whether they pressed **Show all N**) across a collapse, and unmounting
 * the body would silently throw both away on every close.
 */
import { computed, ref } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import Badge from '../badge/Badge.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import type { FilterFacet, FilterPanelPart } from './types';
import type { UiMessages } from '../../messages/en-US';

const props = withDefaults(
  defineProps<{
    facet: FilterFacet;
    /** Whether the body is on screen. The panel owns it; this component only asks to flip it. */
    open: boolean;
    /** The badge's number. Hidden entirely at 0 (spec → Behaviour). */
    count: number;
    /** The selected labels, drawn as the summary while the group is collapsed. */
    summary: string[];
    triggerId: string;
    panelId: string;
    /**
     * Whether to draw the rule **above** this group. Spec → Sizes, Group row: "1px `border` rule
     * above every group and below the last. A group that comes first in the panel (no head) has no
     * top rule" — every group draws the rule below itself, so only the first one needs this, and
     * only when something (the head, the applied chips) sits above it.
     */
    topRule?: boolean;
    /** `Esc` collapses a group in the sidebar; in the drawer `Esc` belongs to the dialog. */
    escCollapses?: boolean;
    classes?: Partial<Record<FilterPanelPart, string>>;
    messages?: Partial<UiMessages>;
  }>(),
  { topRule: false, escCollapses: true, classes: undefined, messages: undefined }
);

const emit = defineEmits<{
  /** The trigger was activated: open or close me. */
  toggle: [];
  /** `Esc` inside the body: close me and take focus back to the trigger. */
  collapse: [];
}>();

const m = useMessages(() => props.messages);

const triggerEl = ref<HTMLButtonElement | null>(null);

/** Spec → Behaviour: the summary "lists the selected labels, comma-separated". */
const summaryText = computed(() => props.summary.join(', '));

function onEscape(event: KeyboardEvent): void {
  if (!props.escCollapses) return;
  // Stopped here so the drawer around a sidebar-mode panel — if there ever is one — never also
  // closes on the same press. The spec gives this key to the group while a group is expanded.
  event.stopPropagation();
  emit('collapse');
  triggerEl.value?.focus();
}

/* ------------------------------------------------------------------ classes */

/**
 * Spec → Sizes, Group row. Drawn as a rule *below* every group plus one above the first, which is
 * the same set of lines the spec names with no doubling where two groups meet — see `topRule`.
 */
const GROUP_BASE = 'border-border border-b';

/**
 * Spec → Sizes, Trigger row: "Full width, min 3rem tall, padding 0.75rem 0, gap 0.5rem,
 * `radius-sm`, 0.9375rem weight 600, left-aligned."
 *
 * `eldra-focus` owns this element's transition list, so there is deliberately no
 * `transition-*`/`duration-*` utility here (`src/__tests__/focus-transition.spec.ts`); the
 * chevron, a child, carries its own.
 */
const TRIGGER_BASE =
  'flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-sm py-3 text-start eldra-focus';

/** Spec → Sizes, Trigger row: "0.9375rem weight 600"; → States, hover: "name underlined 1px". */
const LABEL_BASE =
  'min-w-0 shrink-0 text-control font-semibold text-text ' +
  'group-hover/trigger:underline group-hover/trigger:decoration-1 ' +
  'group-hover/trigger:underline-offset-[0.2em]';

/**
 * Spec → Sizes, Trigger row: "Summary: 0.8125rem weight 400 `muted`, pushed to the end before the
 * chevron, one line, truncated with an ellipsis"; → States, "Trigger, expanded": "summary hidden
 * (it keeps its space)".
 *
 * `invisible` rather than `v-if`, for both halves of that sentence at once: the space is kept, so
 * the trigger does not jump when a group opens, and `visibility: hidden` also takes the text out
 * of the accessibility tree — which is what makes the summary part of the trigger's name while the
 * group is collapsed ("Colour, 2 selected, Brown, Natural") and not a word of it once it is open.
 */
const SUMMARY_BASE = 'ms-auto min-w-0 truncate text-caption text-muted';

/** Spec → Sizes, Trigger row: "Chevron 1.125rem `muted`, pushed to the end." */
const CHEVRON_BASE =
  'ms-auto size-4.5 shrink-0 text-muted transition-[rotate] duration-base ease-out ' +
  'motion-reduce:transition-none';

/** Spec → Body: "1.25rem bottom padding." `min-w-0` so a long label wraps rather than widening. */
const BODY_BASE = 'min-w-0 border-0 p-0 pb-5';

const groupClass = computed(() =>
  partClass(cx(GROUP_BASE, props.topRule && 'border-t'), props.classes, 'group')
);
const triggerClass = computed(() =>
  partClass(cx('group/trigger', TRIGGER_BASE), props.classes, 'trigger')
);
const labelClass = computed(() => partClass(LABEL_BASE, props.classes, 'groupLabel'));
const summaryClass = computed(() =>
  partClass(cx(SUMMARY_BASE, props.open && 'invisible'), props.classes, 'summary')
);
const chevronClass = computed(() =>
  partClass(
    cx(CHEVRON_BASE, props.open && 'rotate-180', props.summary.length > 0 && 'ms-0'),
    props.classes,
    'chevron'
  )
);
const bodyClass = computed(() => partClass(BODY_BASE, props.classes, 'body'));
const legendClass = computed(() => partClass('', props.classes, 'legend'));
/**
 * Spec → Sizes, Trigger row: the badge is "1.25rem tall, min 1.25rem wide, 0 0.3125rem padding,
 * `radius-full`, 0.75rem weight 700, tabular figures". `Badge`'s own `pill` shape carries the
 * radius and the type; the height, the minimum width and the figures are this panel's.
 */
const BADGE_BASE = 'h-5 min-w-5 shrink-0 justify-center px-1.25 tabular-nums';
const badgeClass = computed(() => partClass(BADGE_BASE, props.classes, 'badge'));
</script>

<template>
  <div data-part="group" :data-facet="facet.id" :class="groupClass">
    <!-- The heading level is fixed at `h3` by the spec: the panel's own title is the `h2`. -->
    <h3 class="m-0">
      <button
        ref="triggerEl"
        type="button"
        data-part="trigger"
        :id="triggerId"
        :class="triggerClass"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="panelId"
        @click="emit('toggle')"
      >
        <span data-part="groupLabel" :class="labelClass">{{ facet.label }}</span>

        <!-- The visible digit alone is not a name (spec → Accessibility), so the number is
             decorative and `hiddenSuffix` carries "2 selected". -->
        <Badge
          v-if="count > 0"
          tone="primary"
          pill
          data-part="badge"
          :classes="{ root: badgeClass }"
          :hidden-suffix="m.selectedCount(count)"
        >
          <span aria-hidden="true">{{ count }}</span>
        </Badge>

        <span v-if="summary.length > 0" data-part="summary" :class="summaryClass">
          {{ summaryText }}
        </span>

        <!-- Tabler's `chevron-down`, decorative; turns 180° over `duration-base` when open. -->
        <svg
          data-part="chevron"
          :class="chevronClass"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </button>
    </h3>

    <fieldset
      v-show="open"
      data-part="body"
      :id="panelId"
      :class="bodyClass"
      @keydown.esc="onEscape"
    >
      <VisuallyHidden as="legend" :classes="{ root: legendClass }">{{
        facet.label
      }}</VisuallyHidden>
      <slot />
    </fieldset>
  </div>
</template>
