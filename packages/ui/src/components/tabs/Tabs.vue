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
 * Spec "Tabs" → Anatomy, point 1 and → Sizes: the list "scrolls horizontally when the tabs
 * overflow (never wraps), scrollbar hidden" — `overflow-x-auto` plus the new `eldra-scrollbar-hide`
 * utility (`src/styles/tailwind.css`; no stock Tailwind equivalent). Underline adds the list's own
 * 1px hairline and a 0.25rem tab gap; pills add a 0.5rem gap plus "padding 0.25rem with a
 * −0.25rem margin, so the outside focus ring isn't clipped by the scrolling list."
 */
const listClass = computed(() =>
  partClass(
    cx(
      'flex items-center overflow-x-auto eldra-scrollbar-hide',
      props.variant === 'underline' ? 'gap-1 border-b border-border' : 'gap-2 -m-1 p-1'
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
