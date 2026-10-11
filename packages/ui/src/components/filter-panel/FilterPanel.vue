<script setup lang="ts">
/**
 * The design spec's **Filter panel**: the faceted product filter for collection and search pages,
 * in a sidebar or inside the filter Drawer.
 *
 * Three things about its shape are worth knowing before reading the rest.
 *
 * 1. **It is a `<form>` that never submits** (`@submit.prevent`), named "Product filters". That is
 *    the spec's own structure, and it is what gives every control inside it one named grouping
 *    without a `role` of this component's invention. `Enter` in a Min or Max field therefore has
 *    to be prevented twice over — the field commits on it, and the form must not reload the page.
 *
 * 2. **It is controlled and URL-free.** The selection goes out as `update:modelValue`/`change` and
 *    the owning block decides what to do with it: the URL, the debounce window, the result count
 *    and the drawer's pending-count probe all stay there. A published component that wrote a query
 *    string would hard-wire a router into every store that installed it. `mode` is the one thing
 *    the panel knows about that difference: `drawer` draws the foot that batches, `sidebar` does
 *    not, and in both modes every edit is reported as it happens.
 *
 * 3. **The groups are not `Accordion`.** See `FilterGroup.vue`'s own comment: the spec puts a count
 *    badge and a collapsed summary inside a trigger that has to expose `aria-expanded` and
 *    `aria-controls`, and gives `Esc` a meaning `<details>` cannot express.
 *
 * Every rule it runs on — the selection model, the badge count, the summary, the 6-and-12
 * thresholds, which values are disabled — is a pure function in `useFilterPanel.ts`, and the check
 * mark's ink is `swatchInk.ts`. This file is the markup and the focus management.
 */
import { computed, ref } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import Button from '../button/Button.vue';
import Chip from '../chip/Chip.vue';
import ColourFacet from './facets/ColourFacet.vue';
import ListFacet from './facets/ListFacet.vue';
import RangeFacet from './facets/RangeFacet.vue';
import SizeFacet from './facets/SizeFacet.vue';
import ToggleFacet from './facets/ToggleFacet.vue';
import FilterGroup from './FilterGroup.vue';
import {
  appliedFilters,
  clearedSelection,
  dropOmittedFacets,
  facetSelectedCount,
  facetStartsOpen,
  facetSummaryLabels,
  hasSelection,
  removeValue,
  renderableFacets,
  setRange,
  toggleValue,
} from './useFilterPanel';
import type { AppliedFilter, FilterFacet, FilterPanelProps, FilterSelection } from './types';
import type { UiMessages } from '../../messages/en-US';

const props = withDefaults(defineProps<FilterPanelProps>(), {
  modelValue: undefined,
  facets: () => [],
  mode: 'sidebar',
  title: undefined,
  showHead: true,
  showApplied: false,
  label: undefined,
  locale: undefined,
  currency: undefined,
  resultCount: null,
  dense: false,
  idPrefix: undefined,
  classes: undefined,
  messages: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [selection: FilterSelection];
  /**
   * Spec → Events: "fires with the new value after every check, switch, range move or committed
   * Min/Max field. In sidebar mode the owning block re-queries the results. In drawer mode it is
   * the pending selection, and the block only updates `resultCount`."
   */
  change: [selection: FilterSelection];
  /** Spec → Events: drawer mode only, when **Show N products** is pressed. */
  apply: [selection: FilterSelection];
  /** Spec → Events: **Clear all**, after every facet (ranges included) has been reset. */
  clear: [];
  /** Spec → Events: an applied chip was removed. */
  remove: [removal: { facetId: string; value: string }];
}>();

const m = useMessages(() => props.messages);
const ambientLocale = useEldraUiLocale();
const locale = computed(() => props.locale ?? ambientLocale.value);

const generatedPrefix = useUiId('filter-panel', () => props.idPrefix);
const idPrefix = computed(() => generatedPrefix.value);

const model = useControllableModel<FilterSelection>(props, emit, () => ({}));

const titleEl = ref<HTMLElement | null>(null);
const chipEls = ref<Array<HTMLElement | null>>([]);

/**
 * Which groups the shopper has opened or closed by hand. Unset until they touch a trigger, so the
 * first answer stays the facet's own `collapsed` — overridden by the spec's "a group with a
 * selected value always starts open", which is what `facetStartsOpen` decides.
 */
const openOverride = ref<Record<string, boolean>>({});

function isOpen(facet: FilterFacet): boolean {
  return openOverride.value[facet.id] ?? facetStartsOpen(facet, model.value);
}

function toggleGroup(facet: FilterFacet): void {
  openOverride.value = { ...openOverride.value, [facet.id]: !isOpen(facet) };
}

function collapseGroup(facet: FilterFacet): void {
  openOverride.value = { ...openOverride.value, [facet.id]: false };
}

/**
 * The facets that are actually drawn. A range with fewer than two distinct values is dropped
 * here — see `facetIsRenderable` — and everything downstream reads this list rather than the prop,
 * so an omitted facet has no group, no chip, and no say in whether **Clear all** is on screen.
 */
const drawn = computed<FilterFacet[]>(() => renderableFacets(props.facets));

const chips = computed<AppliedFilter[]>(() => appliedFilters(drawn.value, model.value));
const anySelected = computed(() => hasSelection(drawn.value, model.value));

/**
 * One write, one pair of events: the model and `change` never disagree about what happened.
 *
 * Every write also drops any key belonging to a facet the panel is not drawing, which is what
 * "cleared on the next change" means for a range whose span has collapsed: a `?price=80-160`
 * inherited from a URL would otherwise keep narrowing the results with no control on screen that
 * could widen them again. It is done on write rather than on mount so the panel never emits a
 * change nobody asked for — a store that hands it a collapsed range and never touches the panel
 * again sees exactly the selection it passed in.
 */
function write(selection: FilterSelection): void {
  const next = dropOmittedFacets(selection, props.facets);
  if (next === model.value) return;
  model.value = next;
  emit('change', next);
}

function onToggleValue(facet: FilterFacet, value: string, checked: boolean): void {
  write(toggleValue(model.value, facet.id, value, checked));
}

/**
 * A range **move** is not a change yet: `RangeSlider` reports every step of a drag and every
 * arrow key, and a filter that re-queried on each of them would send one request per pixel. The
 * facet keeps the thumb in its own state while a gesture is in flight and the committed pair is
 * what arrives here — see `RangeFacet`'s own comment.
 */
function onCommitRange(facet: FilterFacet, range: [number, number]): void {
  write(setRange(model.value, facet, range));
}

function onRemoveChip(chip: AppliedFilter): void {
  write(removeValue(model.value, chip.facetId, chip.value));
  emit('remove', { facetId: chip.facetId, value: chip.value });
}

/**
 * Spec → Behaviour: "**Clear all** unchecks every checkbox, switches every switch off, returns
 * every range to its limits, and moves focus to the panel title (focusable programmatically). In
 * the drawer foot, **Clear all** resets the pending selection and focus stays on it."
 */
function onClear(moveFocus: boolean): void {
  write(clearedSelection());
  emit('clear');
  if (moveFocus) focusTitle();
}

/** Spec → Events: `apply` carries the selection the drawer was holding. */
function onApply(): void {
  emit('apply', model.value);
}

function focusTitle(): void {
  titleEl.value?.focus();
}

/**
 * Focus one applied chip's remove button — what a consumer calls after removing a chip of its own,
 * and what keeps focus inside the chip row rather than at the top of the page.
 */
function focusChip(index: number): void {
  const chip = chipEls.value[index];
  chip?.querySelector<HTMLElement>('button')?.focus();
}

defineExpose({ focusTitle, focusChip });

defineSlots<{
  /**
   * The drawer foot (spec → Anatomy item 14). Its default content is **Clear all** and **Show N
   * products**, which is what the spec draws, so a consumer fills this only to replace them — the
   * slot is handed the selection, the live count and the two callbacks, so a replacement foot is
   * still this panel's foot rather than a second source of truth beside it.
   */
  foot?: (props: {
    selection: FilterSelection;
    resultCount: number | null;
    clear: () => void;
    apply: () => void;
  }) => unknown;
  /**
   * One facet's body, for a facet type this package does not draw — the escape hatch that keeps a
   * store from forking the panel to add one group of its own. The head, the chips, the disclosure,
   * the badge and the summary are all still the panel's.
   */
  facet?: (props: {
    facet: FilterFacet;
    selection: FilterSelection;
    toggle: (value: string, checked: boolean) => void;
  }) => unknown;
}>();

/** Which messages a per-chip remove button takes, so it reads "Remove filter Colour: Brown". */
function chipMessages(chip: AppliedFilter): Partial<UiMessages> {
  return { removeTag: () => m.value.filterPanelRemoveFilter(chip.facetLabel, chip.label) };
}

/* ------------------------------------------------------------------ classes */

/**
 * The root is a width **container**, which is what the colour facet's own two-column rule measures
 * against: the spec's breakpoint is the width of the panel, not of the viewport, so a 15rem
 * sidebar keeps one column and the same panel in a 26rem drawer takes two.
 *
 * It carries **no padding of its own**, deliberately: `container-type: inline-size` queries the
 * *content* box, so a gutter here would shift the 26rem edge by its own width and the panel would
 * take two columns a gutter later than the spec says. The gutter the rows' bleed needs
 * (`FILTER_GUTTER`) is on every direct child instead — the head, the chips, each group's trigger
 * and body, the foot — which also lets a group's rule span the panel edge to edge the way the
 * spec draws it.
 */
const ROOT_BASE = '@container min-w-0 text-control text-text';

/**
 * The gutter the rows' own bleed needs, and it is load-bearing. The spec gives every option and
 * swatch row a negative side margin so its hover tint "bleeds into the gutter" — which is wider
 * than the panel's text column by design, and therefore wider than the panel itself unless
 * something reserves it. Without this, a panel dropped into a 320px drawer with no padding of its
 * own scrolls sideways by the width of that bleed, against the spec's own 320px reflow line
 * (`filterPanelRing.browser.spec.ts` measures exactly that). With it, a row's text and the head's
 * text align on the same 0.5rem, because the row's negative margin is the same 0.5rem back out.
 */
const FILTER_GUTTER = 'px-2';
/** Spec → Sizes, Head row: "Flex row, space-between, 0.75rem gap, 0.75rem below." */
const HEAD_BASE = `mb-3 flex min-w-0 items-center justify-between gap-3 ${FILTER_GUTTER}`;
/** Spec → Sizes, Head row: "Title 1.125rem heading font, weight 600, line height 1.35." */
const TITLE_BASE = 'm-0 min-w-0 text-h4 text-text';
/** Spec → Sizes, Active filters row: "Wrapping row, 0.375rem gaps, 0.75rem below." */
const APPLIED_BASE = `mb-3 flex list-none flex-wrap gap-1.5 py-0 ${FILTER_GUTTER}`;
/**
 * Spec → Sizes, Drawer foot: "2 columns (`auto | 1fr`), 0.75rem gap." The `1fr` track is
 * `minmax(0, 1fr)`: a `1fr` track is never narrower than its content, and the primary button's
 * one-line label is content, so with a wide-rendering font the foot ran past a 320px drawer
 * rather than letting that label wrap.
 */
const FOOT_BASE = `mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-3 ${FILTER_GUTTER}`;
/** The default foot's primary label may wrap: the drawer is narrow and the count is live. */
const FOOT_APPLY_CLASSES = { label: 'whitespace-normal' } as const;

const rootClass = computed(() => partClass(ROOT_BASE, props.classes, 'root'));
const headClass = computed(() => partClass(HEAD_BASE, props.classes, 'head'));
/** `tabindex="-1"` and no focus ring: focus arrives here only programmatically, after Clear all. */
const titleClass = computed(() =>
  partClass(cx(TITLE_BASE, 'outline-none'), props.classes, 'title')
);
const clearClass = computed(() => partClass('', props.classes, 'clear'));
const appliedClass = computed(() => partClass(APPLIED_BASE, props.classes, 'applied'));
const chipClass = computed(() => partClass('', props.classes, 'chip'));
const footClass = computed(() => partClass(FOOT_BASE, props.classes, 'foot'));

const groupId = (facet: FilterFacet, part: string): string =>
  `${idPrefix.value}-${part}-${facet.id.replaceAll(/[^\w-]/g, '-')}`;
</script>

<template>
  <!-- Spec → Accessibility: 'The panel is a `<form>` labelled "Product filters" that never
       submits.' `novalidate` as well as the prevented submit: nothing here is a field a browser
       should validate, and a native validation bubble over a filter would be nonsense. -->
  <form
    data-part="root"
    :class="rootClass"
    :aria-label="label ?? m.filterPanelLabel"
    novalidate
    @submit.prevent
  >
    <div v-if="showHead" data-part="head" :class="headClass">
      <!-- `h2` is fixed by the spec: the group triggers are the `h3`s under it. In the sidebar the
           surrounding `<aside>` is labelled by this heading; in the drawer the drawer's own title
           is the heading, which is why `showHead` exists. -->
      <h2 ref="titleEl" tabindex="-1" data-part="title" :class="titleClass">
        {{ title ?? m.filterPanelTitle }}
      </h2>
      <!-- Spec → States, "Clear all (head)": "hidden while nothing is selected and every range is
           at its limits." -->
      <Button
        v-if="anySelected"
        variant="link"
        size="sm"
        type="button"
        data-part="clear"
        :classes="{ container: clearClass }"
        @click="onClear(true)"
      >
        {{ m.filterPanelClearAll }}
      </Button>
    </div>

    <!-- Spec → Anatomy item 2: "a list of removable chips (sm), one per selected value, labelled
         'Active filters'." A range contributes none — a span has no one value a chip could take
         off (see `appliedFilters`). -->
    <ul
      v-if="showApplied && chips.length > 0"
      data-part="applied"
      :class="appliedClass"
      :aria-label="m.filterPanelApplied"
    >
      <li
        v-for="(chip, index) in chips"
        :key="`${chip.facetId}:${chip.value}`"
        :ref="(el) => (chipEls[index] = el as HTMLElement | null)"
        data-part="chip"
        class="min-w-0"
      >
        <!-- `data-part` goes on the `<li>`, not on `<Chip>`: Vue applies fallthrough attributes
             after a child's own template bindings, so a bare `data-part` here would *replace*
             `Chip`'s own `data-part="root"` on that element rather than supplement it. The same
             convention `ProductCard` uses for its composed children. -->
        <Chip
          size="sm"
          removable
          :label="chip.label"
          :classes="{ root: chipClass }"
          :messages="chipMessages(chip)"
          @remove="onRemoveChip(chip)"
        />
      </li>
    </ul>

    <FilterGroup
      v-for="(facet, index) in drawn"
      :key="facet.id"
      :facet="facet"
      :open="isOpen(facet)"
      :count="facetSelectedCount(facet, model)"
      :summary="facetSummaryLabels(facet, model)"
      :trigger-id="groupId(facet, 'trigger')"
      :panel-id="groupId(facet, 'panel')"
      :top-rule="index === 0 && (showHead || (showApplied && chips.length > 0))"
      :esc-collapses="mode === 'sidebar'"
      :classes="classes"
      :messages="messages"
      @toggle="toggleGroup(facet)"
      @collapse="collapseGroup(facet)"
    >
      <slot
        name="facet"
        :facet="facet"
        :selection="model"
        :toggle="(value: string, checked: boolean) => onToggleValue(facet, value, checked)"
      >
        <ListFacet
          v-if="facet.type === 'list'"
          :facet="facet"
          :selection="model"
          :id-prefix="groupId(facet, 'facet')"
          :dense="dense"
          :classes="classes"
          :messages="messages"
          @toggle="(value, checked) => onToggleValue(facet, value, checked)"
        />
        <ColourFacet
          v-else-if="facet.type === 'colour'"
          :facet="facet"
          :selection="model"
          :id-prefix="groupId(facet, 'facet')"
          :dense="dense"
          :classes="classes"
          :messages="messages"
          @toggle="(value, checked) => onToggleValue(facet, value, checked)"
        />
        <SizeFacet
          v-else-if="facet.type === 'size'"
          :facet="facet"
          :selection="model"
          :id-prefix="groupId(facet, 'facet')"
          :dense="dense"
          :classes="classes"
          :messages="messages"
          @toggle="(value, checked) => onToggleValue(facet, value, checked)"
        />
        <ToggleFacet
          v-else-if="facet.type === 'toggle'"
          :facet="facet"
          :selection="model"
          :id-prefix="groupId(facet, 'facet')"
          :dense="dense"
          :classes="classes"
          :messages="messages"
          @toggle="(value, checked) => onToggleValue(facet, value, checked)"
        />
        <RangeFacet
          v-else
          :facet="facet"
          :selection="model"
          :id-prefix="groupId(facet, 'facet')"
          :dense="dense"
          :locale="locale"
          :currency="currency"
          :classes="classes"
          :messages="messages"
          @commit="(range) => onCommitRange(facet, range)"
        />
      </slot>
    </FilterGroup>

    <!-- Spec → Variants, `drawer` mode: "foot with **Clear all** and **Show N products**". The
         count is live from `resultCount`, which is the owning block's own pending-count read; with
         no count yet the button says the words without a number nobody can trust. -->
    <div v-if="mode === 'drawer'" data-part="foot" :class="footClass">
      <slot
        name="foot"
        :selection="model"
        :result-count="resultCount"
        :clear="() => onClear(false)"
        :apply="onApply"
      >
        <Button variant="outline" type="button" @click="onClear(false)">
          {{ m.filterPanelClearAll }}
        </Button>
        <Button
          variant="primary"
          type="button"
          block
          :classes="FOOT_APPLY_CLASSES"
          @click="onApply"
        >
          {{
            resultCount === null ? m.filterPanelShowProducts : m.filterPanelShowResults(resultCount)
          }}
        </Button>
      </slot>
    </div>
  </form>
</template>
