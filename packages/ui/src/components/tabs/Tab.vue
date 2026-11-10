<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { cx, partClass } from '../../utils/kitClass';
import { TABS_KEY, type TabsContext } from './context';
import type { TabProps } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<TabProps>(), {
  title: undefined,
  disabled: false,
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
  unregister = context.register({
    value: props.value,
    focus: () => el.value?.focus(),
    disabled: () => props.disabled,
  });
});
onBeforeUnmount(() => unregister?.());

const isSelected = computed(() => context.isSelected(props.value));
const isUnderline = computed(() => context.variant.value === 'underline');

function select(): void {
  if (props.disabled) return;
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
  'eldra:relative eldra:inline-flex eldra:items-center eldra:justify-center eldra:whitespace-nowrap eldra:cursor-pointer ' +
  'eldra:target-touch eldra:px-4 eldra:text-variant-pill';

/** States (spec "Tabs" → States, Underline column). Hover text on the tint stays `text`, per the
 *  spec's own contrast row ("hover text on the 6% tint 15.0:1"). */
const UNDERLINE = computed(() =>
  cx(
    'eldra:rounded-t-sm eldra:eldra-focus-inset',
    isSelected.value
      ? 'eldra:font-semibold eldra:text-text'
      : cx(
          'eldra:font-medium eldra:text-muted eldra:hover:text-text',
          'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
        )
  )
);

/** States (spec "Tabs" → States, Pills column). The selected fill carries the state on its own —
 *  the same reading `VariantPicker`'s selected pill gives its own border, see that component's own
 *  comment — so the border only needs a colour when unselected. */
const PILLS = computed(() =>
  cx(
    'eldra:rounded-full eldra:border eldra:eldra-focus',
    isSelected.value
      ? 'eldra:border-primary eldra:bg-primary eldra:font-semibold eldra:text-primary-contrast'
      : cx(
          'eldra:border-border-strong eldra:font-medium eldra:text-muted eldra:hover:text-text',
          'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]'
        )
  )
);

/**
 * A disabled tab (not in the spec's States table, which has no disabled row). It borrows the
 * package's own disabled readings rather than inventing one: unselected, `Pagination`'s disabled
 * page (`muted` at 60%, no hover); selected, the dead "on" every other control draws (`Switch`,
 * `Checkbox`): the selected weight is kept and the `primary` colour becomes `muted` — a `muted`
 * underline bar, or `Button`'s disabled fill (`surface-strong`, `muted` text) for a pill.
 */
const UNDERLINE_DISABLED = computed(() =>
  cx(
    'eldra:rounded-t-sm eldra:eldra-focus-inset eldra:cursor-not-allowed',
    isSelected.value
      ? 'eldra:font-semibold eldra:text-muted'
      : 'eldra:font-medium eldra:text-muted/60'
  )
);
const PILLS_DISABLED = computed(() =>
  cx(
    'eldra:rounded-full eldra:border eldra:eldra-focus eldra:cursor-not-allowed',
    isSelected.value
      ? 'eldra:border-transparent eldra:bg-surface-strong eldra:font-semibold eldra:text-muted'
      : 'eldra:border-border eldra:font-medium eldra:text-muted/60'
  )
);

const stateClass = computed(() => {
  if (props.disabled) return isUnderline.value ? UNDERLINE_DISABLED.value : PILLS_DISABLED.value;
  return isUnderline.value ? UNDERLINE.value : PILLS.value;
});

const tabClass = computed(() => partClass(cx(BASE, stateClass.value), props.classes, 'tab'));

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
      'eldra:pointer-events-none eldra:absolute eldra:inset-x-2 eldra:bottom-0 eldra:h-[0.1875rem] eldra:rounded-t-full',
      'eldra:transition-colors eldra:duration-fast eldra:ease-out',
      isSelected.value
        ? props.disabled
          ? 'eldra:bg-muted'
          : 'eldra:bg-primary'
        : 'eldra:bg-transparent'
    ),
    props.classes,
    'indicator'
  )
);
</script>

<template>
  <button
    :data-eldra-slot="eldra.slotHost('default')"
    :id="context.tabId(value)"
    ref="el"
    type="button"
    role="tab"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="tab"
    :aria-selected="isSelected ? 'true' : 'false'"
    :aria-controls="context.panelId(value)"
    :aria-disabled="disabled ? 'true' : undefined"
    :tabindex="isSelected ? 0 : -1"
    :class="tabClass"
    @click="select"
    @keydown="onKeydown"
  >
    <slot>{{ title }}</slot>
    <span
      v-if="isUnderline"
      :data-eldra-scope="eldra.scope"
      aria-hidden="true"
      data-part="indicator"
      :class="indicatorClass"
    />
  </button>
</template>
