import type { ComputedRef, InjectionKey } from 'vue';
import type { TabsActivation, TabsVariant } from './types';

/** What a mounted `Tab` gives the `Tabs` root that owns it, so the root can move focus to it and
 *  place it in the registration order without owning any of its DOM itself. */
export interface TabsEntry {
  value: string;
  /** Moves real DOM focus to this tab's `<button>`. */
  focus: () => void;
}

/**
 * What `Tabs` provides, and every `Tab`/`TabPanel` injects.
 *
 * `Tabs` does not render its children when the slots API is used — a consumer places `<Tab>`s in
 * the `tabs` slot and `<TabPanel>`s in the default slot, the same shape `ChipGroup` and
 * `ButtonGroup` already use for theirs — so this context is the only channel a child has to the
 * selected value, the activation model, the variant, and the keyboard table's cross-tab moves.
 *
 * **Registration, not a DOM query.** Arrow-key navigation and the spec's "defaults to the first
 * tab" rule (see `TabsProps.modelValue`) both need to know the tabs' order, but `Tabs` cannot see
 * its own children's `value`s or order through props alone — the slots API hands it opaque vnodes,
 * and the `items` API is rendered through this exact same `Tab` component (see `Tabs.vue`), so one
 * mechanism has to serve both. Each `Tab` calls `register` in its own `onMounted` and the matching
 * unregister function in `onBeforeUnmount`; Vue mounts sibling components in document order, so the
 * array `Tabs.vue` builds from these calls is DOM order without either side ever touching the DOM
 * to find out.
 */
export interface TabsContext {
  /** The selected value, or `undefined` before any `Tab` has registered. */
  selectedValue: ComputedRef<string | undefined>;
  activation: ComputedRef<TabsActivation>;
  variant: ComputedRef<TabsVariant>;
  isSelected: (value: string) => boolean;
  /** Selects `value` and emits `update:modelValue`/`change`. */
  select: (value: string) => void;
  /** Adds a `Tab` to the registration order. Returns the function that removes it again. */
  register: (entry: TabsEntry) => () => void;
  /** `ArrowRight` (`delta` 1) / `ArrowLeft` (`delta` -1) from `current`: moves focus to the next
   *  tab, wrapping at the ends, and — under automatic activation — selects it too. */
  moveFocus: (current: string, delta: 1 | -1) => void;
  /** `Home` (`'first'`) / `End` (`'last'`): same as `moveFocus`, but to an end of the list. */
  focusEdge: (edge: 'first' | 'last') => void;
  /** The `id` a `Tab` with this value renders, and what its `TabPanel`'s `aria-labelledby` reads. */
  tabId: (value: string) => string;
  /** The `id` a `TabPanel` with this value renders, and what its `Tab`'s `aria-controls` reads. */
  panelId: (value: string) => string;
}

/** The key `Tabs` provides its `TabsContext` on. */
export const TABS_KEY: InjectionKey<TabsContext> = Symbol('eldra-ui:tabs');
