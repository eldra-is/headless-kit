<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
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
const isSmall = computed(() => context.size.value === 'sm');

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
  'eldra:group eldra:relative eldra:inline-flex eldra:items-center eldra:justify-center eldra:whitespace-nowrap';
const SIZE_MD = 'eldra:target-touch eldra:px-4 eldra:text-variant-pill';

/**
 * `size="sm"`: a tab bar inside a tool panel (the page builder's rail). 2.25rem tall, 13px text
 * (`text-tab-sm`, the caption token's size), a 0.375rem gap between an icon and its label, and no
 * weight change on selection — the colour and the indicator carry it, so the label never shifts.
 * The weight is `font-medium` in every state, see `weightClass`.
 */
const SIZE_SM = 'eldra:h-9 eldra:gap-1.5 eldra:px-3 eldra:text-tab-sm';

/**
 * The `sm` underline tab's own colours, each a per-component variable (the `--eldra-dialog-text`
 * shape) so a panel can colour its tab bar without re-theming `--eldra-color-*` for every other
 * component: `--eldra-tabs-accent` (selected text and the indicator; default the primary colour),
 * `--eldra-tabs-muted` (unselected text; default `muted`) and `--eldra-tabs-hover-bg` (hover
 * background; default the 6% text tint `md` uses). Written out in full, never interpolated: see
 * `Tabs.vue`'s `PILLS_RING_RESERVE`.
 */
const SM_SELECTED_TEXT = 'eldra:text-[color:var(--eldra-tabs-accent,var(--eldra-color-primary))]';
const SM_REST_TEXT = 'eldra:text-[color:var(--eldra-tabs-muted,var(--eldra-color-muted))]';
const SM_HOVER =
  'eldra:hover:text-text eldra:hover:bg-[var(--eldra-tabs-hover-bg,color-mix(in_oklab,var(--eldra-color-text),transparent_94%))]';

/** `fill`: every tab takes an equal share of the list. `min-w-0` lets a long label shrink. */
const FILL = 'eldra:min-w-0 eldra:flex-1';

/** The selected tab's weight: 600 at `md`, 500 at `sm`, where the label must not change width. */
const selectedWeight = computed(() =>
  isSmall.value ? 'eldra:font-medium' : 'eldra:font-semibold'
);

/** States (spec "Tabs" → States, Underline column). Hover text on the tint stays `text`, per the
 *  spec's own contrast row ("hover text on the 6% tint 15.0:1"). */
const UNDERLINE = computed(() => [
  'eldra:rounded-t-sm eldra:eldra-focus-inset eldra:cursor-pointer',
  isSelected.value
    ? [selectedWeight.value, isSmall.value ? SM_SELECTED_TEXT : 'eldra:text-text']
    : isSmall.value
      ? ['eldra:font-medium', SM_REST_TEXT, SM_HOVER]
      : [
          'eldra:font-medium eldra:text-muted eldra:hover:text-text',
          'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
        ],
]);

/** States (spec "Tabs" → States, Pills column). The selected fill carries the state on its own —
 *  the same reading `VariantPicker`'s selected pill gives its own border, see that component's own
 *  comment — so the border only needs a colour when unselected. */
const PILLS = computed(() => [
  'eldra:rounded-full eldra:border eldra:eldra-focus eldra:cursor-pointer',
  isSelected.value
    ? ['eldra:border-primary eldra:bg-primary eldra:text-primary-contrast', selectedWeight.value]
    : [
        'eldra:border-border-strong eldra:font-medium eldra:text-muted eldra:hover:text-text',
        'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      ],
]);

/**
 * A disabled tab (not in the spec's States table, which has no disabled row). It borrows the
 * package's own disabled readings rather than inventing one: unselected, `Pagination`'s disabled
 * page (`muted` at 60%, no hover); selected, the dead "on" every other control draws (`Switch`,
 * `Checkbox`): the selected weight is kept and the `primary` colour becomes `muted` — a `muted`
 * underline bar, or `Button`'s disabled fill (`surface-strong`, `muted` text) for a pill.
 */
const UNDERLINE_DISABLED = computed(() => [
  'eldra:rounded-t-sm eldra:eldra-focus-inset eldra:cursor-not-allowed',
  isSelected.value
    ? [selectedWeight.value, 'eldra:text-muted']
    : 'eldra:font-medium eldra:text-muted/60',
]);
const PILLS_DISABLED = computed(() => [
  'eldra:rounded-full eldra:border eldra:eldra-focus eldra:cursor-not-allowed',
  isSelected.value
    ? ['eldra:border-transparent eldra:bg-surface-strong eldra:text-muted', selectedWeight.value]
    : 'eldra:border-border eldra:font-medium eldra:text-muted/60',
]);

const stateClass = computed(() => {
  if (props.disabled) return isUnderline.value ? UNDERLINE_DISABLED.value : PILLS_DISABLED.value;
  return isUnderline.value ? UNDERLINE.value : PILLS.value;
});

const tabClass = computed(() => [
  BASE,
  isSmall.value ? SIZE_SM : SIZE_MD,
  context.fill.value && FILL,
  stateClass.value,
]);

/**
 * Spec "Tabs" → Anatomy, point 3 and → Sizes: "an underline bar … 0.1875rem tall, inset 0.5rem
 * from each side of the tab, sitting on the list's hairline, rounded top" and → Behaviour & motion:
 * "the indicator does not slide" — so this is a plain child element inside every underline tab,
 * shown or hidden by colour alone (never a shared, position-animated element), which is also what
 * keeps a slide off the table entirely: there is nothing to move, only a colour to transition.
 * Pills have no separate indicator part — the tab's own fill above is the "filled pill" the spec's
 * anatomy names.
 */
const indicatorClass = computed(() => [
  'eldra:pointer-events-none eldra:absolute eldra:bottom-0',
  // `sm`: the rail's 2px bar across the whole tab, square. `md`: the spec's 3px inset bar.
  isSmall.value
    ? // The tab's inset ring is its own box-shadow, which paints under this child: while the tab is
      // keyboard-focused the bar lifts by the ring's reach (offset + width) so the ring's bottom
      // edge shows instead of being covered by it.
      'eldra:inset-x-0 eldra:h-0.5 eldra:group-focus-visible:bottom-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))]'
    : 'eldra:inset-x-2 eldra:h-[0.1875rem] eldra:rounded-t-full',
  'eldra:eldra-transition-colors',
  isSelected.value
    ? props.disabled
      ? 'eldra:bg-muted'
      : isSmall.value
        ? 'eldra:bg-[var(--eldra-tabs-accent,var(--eldra-color-primary))]'
        : 'eldra:bg-primary'
    : 'eldra:bg-transparent',
  props.classes?.indicator,
]);
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
    <!-- With `fill` a long label shares the width: it truncates with an ellipsis instead of
         running into the next tab. Without it the tab sizes to its content, so no wrapper. -->
    <span
      v-if="context.fill.value"
      :data-eldra-slot="eldra.slotHost('default')"
      :data-eldra-scope="eldra.scope"
      data-part="label"
      class="eldra:min-w-0 eldra:truncate"
    >
      <slot>{{ title }}</slot>
    </span>
    <slot v-else>{{ title }}</slot>
    <span
      v-if="isUnderline"
      :data-eldra-scope="eldra.scope"
      aria-hidden="true"
      data-part="indicator"
      :class="indicatorClass"
    />
  </button>
</template>
