import type { InjectionKey, Ref } from 'vue';

/**
 * Context `UiTabs` provides and `UiTab`/`UiTabPanel` inject. `UiTab` and
 * `UiTabPanel` derive their DOM/ARIA ids from the same `id` prop
 * (`ui-tab-<id>` / `ui-tabpanel-<id>`) instead of the context tracking a
 * registry, so the two only need to agree on one string each — see
 * `UiTab.vue`/`UiTabPanel.vue`.
 */
export interface TabsContext {
  selectedId: Ref<string>;
  select: (id: string) => void;
}

export const TABS_KEY: InjectionKey<TabsContext> = Symbol('eldra-tabs');
