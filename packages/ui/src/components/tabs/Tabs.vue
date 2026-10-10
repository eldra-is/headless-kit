<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { TABS_KEY, type TabsContext, type TabsEntry } from './context';
import Tab from './Tab.vue';
import TabPanel from './TabPanel.vue';
import type { TabsProps } from './types';

const props = withDefaults(defineProps<TabsProps>(), {
  modelValue: undefined,
  variant: 'underline',
  activation: 'auto',
  items: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Spec "Tabs" → Events: "`change`: fires with the new selected value." */
  change: [value: string];
}>();

const id = useUiId('tabs');

/**
 * `''` is the uncontrolled starting value — no real tab is ever named `''`, the same trick
 * `RadioGroup`'s own model plays — so `selectedValue` below can tell "nothing chosen yet" (fall
 * back to the first registered tab) apart from a parent actually controlling the value.
 */
const model = useControllableModel<string>(props, emit, () => '');

/** See `context.ts`'s own comment: filled by each `Tab`'s `onMounted`/`onBeforeUnmount`, in DOM
 *  order, and read nowhere but here and `moveFocus`/`focusEdge` below. */
const registry = ref<TabsEntry[]>([]);

function register(entry: TabsEntry): () => void {
  registry.value = [...registry.value, entry];
  return () => {
    registry.value = registry.value.filter((registered) => registered !== entry);
  };
}

/** Spec "Tabs" → Properties, `value` row: "Default first tab." */
const selectedValue = computed(() => (model.value === '' ? registry.value[0]?.value : model.value));

function isSelected(value: string): boolean {
  return selectedValue.value === value;
}

function select(value: string): void {
  model.value = value;
  emit('change', value);
}

function moveFocus(current: string, delta: 1 | -1): void {
  const tabs = registry.value;
  if (tabs.length === 0) return;
  const index = tabs.findIndex((tab) => tab.value === current);
  const nextIndex = index === -1 ? 0 : (index + delta + tabs.length) % tabs.length;
  activate(tabs[nextIndex]!);
}

function focusEdge(edge: 'first' | 'last'): void {
  const tabs = registry.value;
  if (tabs.length === 0) return;
  activate(edge === 'first' ? tabs[0]! : tabs[tabs.length - 1]!);
}

/** Moves DOM focus, and — spec "Tabs" → Behaviour & motion: "With automatic activation, moving
 *  focus selects the tab" — selects too, but only under `auto`. */
function activate(entry: TabsEntry): void {
  entry.focus();
  if (props.activation === 'auto') select(entry.value);
}

const context: TabsContext = {
  selectedValue,
  activation: computed(() => props.activation),
  variant: computed(() => props.variant),
  isSelected,
  select,
  register,
  moveFocus,
  focusEdge,
  tabId: (value) => `${id.value}-tab-${value}`,
  panelId: (value) => `${id.value}-panel-${value}`,
};
provide(TABS_KEY, context);

/** `min-w-0` is the usual flex/grid fix (see `RadioGroup`'s own root): without it, a `Tabs` inside
 *  a flex row never shrinks below its content's natural width, and the list's own `overflow-x-auto`
 *  (below) never gets a chance to engage. */
const rootClass = computed(() => partClass('min-w-0', props.classes, 'root'));

/**
 * The room the pills list keeps for a focused tab's ring, on both axes, plus the scroll padding
 * that keeps the inline half in the scrollport. The value in every one of them is the ring's own
 * reach outside the element it is drawn on — `--eldra-focus-offset` (the `focus-inner` gap) plus
 * `--eldra-focus-width` (the `focus` band), `tailwind.css`'s "The one focus ring" — rather than the
 * `0.25rem` the two add up to by default; see `listClass` below for what the literal cost.
 *
 * **Written out, never interpolated.** Tailwind has no runtime: it scans source *text* for class
 * names, so a name assembled at runtime from a constant
 * (`` `px-[${REACH}]` ``) is never in the text a consumer's build reads, and their stylesheet gets
 * no rule at all — the exact failure `carouselPerViewStyle` documents (`useCarousel.ts`), which
 * shipped once because the package's own Storybook scans the very `.vue` file that holds the
 * pattern. `src/__tests__/source-scan.spec.ts` compiles what a consumer's stylesheet says against
 * `dist/` and asserts all five of these declarations come out of it.
 */
const PILLS_RING_RESERVE =
  'py-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))] ' +
  '-my-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))] ' +
  'px-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))] ' +
  '-mx-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))] ' +
  'scroll-px-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))]';

/**
 * Spec "Tabs" → Anatomy, point 1 and → Sizes: the list "scrolls horizontally when the tabs
 * overflow (never wraps), scrollbar hidden" — `overflow-x-auto` plus the `eldra-scrollbar-hide`
 * utility (`src/styles/tailwind.css`; no stock Tailwind equivalent). Underline adds the list's own
 * 1px hairline and a 0.25rem tab gap; pills a 0.5rem gap plus the ring reservation below.
 *
 * **The reservation is sized from the ring tokens, not from the `0.25rem` they happen to add up to
 * (fixed 2026-10-05).** `overflow-x-auto` forces `overflow-y` to compute `auto` as well — a scroll
 * container cannot mix `visible` with a non-`visible` axis (CSSOM "Overflow") — so this element
 * clips anything a tab paints outside its own border box, on **every** side, and a pill's
 * `eldra-focus` ring is exactly that. The spec's own answer is "padding 0.25rem with a −0.25rem
 * margin, so the outside focus ring isn't clipped by the scrolling list", and `p-1`/`-m-1` was
 * written as that literal: 4px, which is precisely the default reach, leaving the ring flush with
 * the clip edge and **zero** slack. Raise either token — a consumer restyling the indicator, or
 * this package's own `[--eldra-focus-offset:4px]` on a `Tabs` nested in a `Carousel` slide, since
 * plain custom properties inherit — and the ring is cut off flat on every edge by the difference
 * (measured: a 2px band of page colour where the ring should be, on the left/top/bottom of a pill
 * at the start of the list and the right/top/bottom of one at the end). `calc()` over the two
 * variables reserves whatever the ring actually is, and the matching negative margin pulls the
 * list's box back in by the same amount, so its rendered footprint — the hairline's position in the
 * underline variant included, were it ever to carry one — is unchanged.
 *
 * **Per axis, not one uniform `p-[…]`/`-m-[…]`.** `padding`/`padding-inline` are different
 * `tailwind-merge` groups, so a `classes.list` of `px-6` would leave both alive and then win in the
 * cascade (Tailwind emits every `padding-inline` rule after every `padding` one) — the exact way
 * `Carousel`'s first uniform reservation lost its inline half on a deployed page. Written as
 * `px-*`/`py-*` a consumer's own `px-*` replaces ours outright instead, which at least shows up as
 * the consumer's own gutter rather than as a reservation silently reduced to `0px`; a gutter wider
 * than the ring (`blocks/tabs` in the starter bleeds the list by `--eldra-gutter-mobile`) is itself
 * all the room the ring needs. `Carousel`'s `--eldra-carousel-bleed` is the shape to reach for if a
 * pills list ever needs to do both at once.
 *
 * **`scroll-px-*` because it is the scrollport that clips, not the box.** The reserved inline
 * padding is part of the scrollable area, so it can be scrolled out of the visible box like any
 * other content; scroll padding keeps a tab the browser scrolls into view — which is what focusing
 * one through the roving tabindex does — from landing flush against the scrollport edge with its
 * ring outside it. The same line `Carousel`'s track carries, for the same reason.
 *
 * The underline variant needs none of it: its tabs draw `eldra-focus-inset`, the spec's own answer
 * for this list ("inset focus ring … so the scrolling list never clips it"), which paints inside
 * the tab's border box and so has nothing for this element to clip. Adding the block-axis
 * reservation there would push the list's 1px hairline down away from the tabs it underlines, for
 * no ring at all.
 */
const listClass = computed(() =>
  partClass(
    cx(
      'flex items-center overflow-x-auto eldra-scrollbar-hide',
      props.variant === 'underline'
        ? 'gap-1 border-b border-border'
        : cx('gap-2', PILLS_RING_RESERVE)
    ),
    props.classes,
    'list'
  )
);

/** Forwarded onto every internally-rendered `Tab`/`TabPanel` in the `items` API, so a consumer's
 *  `classes.tab`/`.indicator`/`.panel` reaches them exactly as it would a standalone `<Tab>`. */
const childClasses = computed(() => ({
  tab: props.classes?.tab,
  indicator: props.classes?.indicator,
  panel: props.classes?.panel,
}));
</script>

<template>
  <div data-part="root" :class="rootClass">
    <!-- Per the ARIA APG tabs pattern, the tablist contains tab elements only — panels are
         siblings after it, not inside it. -->
    <div role="tablist" data-part="list" :aria-label="ariaLabel" :class="listClass">
      <template v-if="items">
        <Tab
          v-for="item in items"
          :key="item.value"
          :value="item.value"
          :title="item.title"
          :classes="childClasses"
        />
      </template>
      <slot v-else name="tabs" />
    </div>
    <template v-if="items">
      <TabPanel v-for="item in items" :key="item.value" :value="item.value" :classes="childClasses">
        {{ item.content }}
      </TabPanel>
    </template>
    <slot v-else />
  </div>
</template>
