<script setup lang="ts">
import { computed, inject, onMounted, onUpdated, ref } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { TABS_KEY, type TabsContext } from './context';
import type { TabPanelProps } from './types';

const props = withDefaults(defineProps<TabPanelProps>(), { classes: undefined });

const injected = inject(TABS_KEY);
if (!injected) {
  throw new Error('<TabPanel> must be used inside <Tabs>');
}
/** See `Tab.vue`'s identical comment: narrowed once to a `const` of the non-optional type, since
 *  the guard above does not narrow inside the closures below. */
const context: TabsContext = injected;

const isSelected = computed(() => context.isSelected(props.value));

const el = ref<HTMLDivElement | null>(null);

/**
 * Spec "Tabs" → Accessibility gives every panel `tabindex="0"`; the APG tabs pattern's own reason
 * for that is narrower — a panel needs to be a `Tab` stop only when it has no focusable content of
 * its own to land on instead, or the sequence gets two stops for the same thing. This is the
 * brief's "panel focusability rule": `hasFocusable` starts `true` (so the panel is reachable from
 * the very first paint, before this can run) and `checkFocusable` narrows it to the real answer
 * once there is a live DOM to ask, re-run on every update so a panel whose content changes (an
 * empty panel that later gets a button) keeps the rule accurate.
 */
const hasFocusable = ref(true);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], ' +
  'audio[controls], video[controls]';

function checkFocusable(): void {
  hasFocusable.value = el.value !== null && el.value.querySelector(FOCUSABLE_SELECTOR) !== null;
}

onMounted(checkFocusable);
onUpdated(checkFocusable);

const tabindexAttr = computed(() => (hasFocusable.value ? undefined : '0'));

/** Spec "Tabs" → Sizes: "Panel padding-top 1.5rem." Focus-visible (→ States, Panel row): the
 *  standard ring with the default 2px/2px offsets is already exactly "a 0.25rem `focus-inner` gap,
 *  the ring sitting 4px outside the panel" — see `eldra-focus`'s own tokens — so no override is
 *  needed beyond the utility itself, at the panel's own `radius-sm` corner. */
const panelClass = computed(() =>
  partClass(cx('rounded-sm pt-6 eldra-focus'), props.classes, 'panel')
);
</script>

<template>
  <div
    :id="context.panelId(value)"
    ref="el"
    role="tabpanel"
    data-part="panel"
    :aria-labelledby="context.tabId(value)"
    :hidden="!isSelected"
    :tabindex="tabindexAttr"
    :class="panelClass"
  >
    <slot />
  </div>
</template>
