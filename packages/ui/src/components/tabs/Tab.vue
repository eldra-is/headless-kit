<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { TABS_KEY, type TabsContext } from './context';
import type { TabProps } from './types';

const props = withDefaults(defineProps<TabProps>(), {
  title: undefined,
  classes: undefined,
});

const injected = inject(TABS_KEY);
if (!injected) {
  throw new Error('<Tab> must be used inside <Tabs>');
}
/** Narrowed once, to a `const` of the non-optional type — TypeScript's control-flow narrowing
 *  from the guard above does not reach into the closures below, which run later. */
const context: TabsContext = injected;

const el = ref<HTMLButtonElement | null>(null);

/** See `context.ts`'s own comment: registering in `onMounted`, not at `setup()`, is what makes the
 *  registration order match DOM order. */
let unregister: (() => void) | undefined;
onMounted(() => {
  unregister = context.register({ value: props.value, focus: () => el.value?.focus() });
});
onBeforeUnmount(() => unregister?.());

const isSelected = computed(() => context.isSelected(props.value));
const isUnderline = computed(() => context.variant.value === 'underline');

function select(): void {
  context.select(props.value);
}

/**
 * Spec "Tabs" → Keyboard: `→`/`←` move (wrapping) and, under automatic activation, select;
 * `Home`/`End` jump to the ends. `Enter`/`Space` need no handler here at all — this is a real
 * `<button>`, so the browser already turns either key into a `click`, which `select()` below
 * already handles; adding a second path here would risk firing it twice.
 */
function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault();
      context.moveFocus(props.value, 1);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      context.moveFocus(props.value, -1);
      break;
    case 'Home':
      event.preventDefault();
      context.focusEdge('first');
      break;
    case 'End':
      event.preventDefault();
      context.focusEdge('last');
      break;
  }
}

/**
 * Sizes (spec "Tabs" → Sizes): "min-height 2.75rem, padding 0 1rem" — `target-touch` is exactly
 * that 2.75rem minimum (`src/styles/tailwind.css`'s "Control heights and targets", the same
 * utility every other control's touch target reads), so no new utility is needed for it.
 *
 * `text-variant-pill` gives the exact size/line-height the spec's tab label wants — "0.9375rem …
 * weight 500; weight 600 when selected" — with no weight baked into its shorthand, the same reason
 * `VariantPicker`'s own pill text reuses it rather than `text-control` (see that component's own
 * comment): one size, two weights depending on state, and a `font` shorthand cannot express that,
 * so the weight is a separate `font-medium`/`font-semibold` utility paired with it here instead.
 */
const BASE =
  'relative inline-flex items-center justify-center whitespace-nowrap cursor-pointer ' +
  'target-touch px-4 text-variant-pill';

/** States (spec "Tabs" → States, Underline column). Hover text on the tint stays `text`, per the
 *  spec's own contrast row ("hover text on the 6% tint 15.0:1"). */
const UNDERLINE = computed(() =>
  cx(
    'rounded-t-sm eldra-focus-inset',
    isSelected.value
      ? 'font-semibold text-text'
      : cx(
          'font-medium text-muted hover:text-text',
          'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
        )
  )
);

/** States (spec "Tabs" → States, Pills column). The selected fill carries the state on its own —
 *  the same reading `VariantPicker`'s selected pill gives its own border, see that component's own
 *  comment — so the border only needs a colour when unselected. */
const PILLS = computed(() =>
  cx(
    'rounded-full border eldra-focus',
    isSelected.value
      ? 'border-primary bg-primary font-semibold text-primary-contrast'
      : cx(
          'border-border-strong font-medium text-muted hover:text-text',
          'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
        )
  )
);

const tabClass = computed(() =>
  partClass(cx(BASE, isUnderline.value ? UNDERLINE.value : PILLS.value), props.classes, 'tab')
);

/**
 * Spec "Tabs" → Anatomy, point 3 and → Sizes: "an underline bar … 0.1875rem tall, inset 0.5rem
 * from each side of the tab, sitting on the list's hairline, rounded top" and → Behaviour & motion:
 * "the indicator does not slide" — so this is a plain child element inside every underline tab,
 * shown or hidden by colour alone (never a shared, position-animated element), which is also what
 * keeps a slide off the table entirely: there is nothing to move, only a colour to transition.
 * Pills have no separate indicator part — the tab's own fill above is the "filled pill" the spec's
 * anatomy names.
 */
const indicatorClass = computed(() =>
  partClass(
    cx(
      'pointer-events-none absolute inset-x-2 bottom-0 h-[0.1875rem] rounded-t-full',
      'transition-colors duration-fast ease-out',
      isSelected.value ? 'bg-primary' : 'bg-transparent'
    ),
    props.classes,
    'indicator'
  )
);
</script>

<template>
  <button
    :id="context.tabId(value)"
    ref="el"
    type="button"
    role="tab"
    data-part="tab"
    :aria-selected="isSelected ? 'true' : 'false'"
    :aria-controls="context.panelId(value)"
    :tabindex="isSelected ? 0 : -1"
    :class="tabClass"
    @click="select"
    @keydown="onKeydown"
  >
    <slot>{{ title }}</slot>
    <span v-if="isUnderline" aria-hidden="true" data-part="indicator" :class="indicatorClass" />
  </button>
</template>
