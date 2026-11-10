<script setup lang="ts">
import {
  Comment,
  Fragment,
  Text,
  computed,
  inject,
  useAttrs,
  useSlots,
  watchEffect,
  type VNode,
} from 'vue';
import { FORM_SUBMITTING_KEY } from '../form-layout/context';
import Icon from '../icon/Icon.vue';
import Spinner from '../spinner/Spinner.vue';
import type { ButtonProps, ButtonSize, ButtonVariant } from './types';
import { useEldraScope } from '../../composables/useEldraScope';
import { mergeClass } from '../../utils/mergeClass';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<ButtonProps>(), {
  size: 'md',
  type: 'button',
  href: undefined,
  iconLeft: undefined,
  iconRight: undefined,
  iconOnly: false,
  icon: undefined,
  label: undefined,
  loading: false,
  spinnerPlacement: 'overlay',
  block: false,
  pressed: undefined,
  disabled: false,
  classes: undefined,
  as: undefined,
  to: undefined,
  keepNameWhileLoading: false,
});

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const slots = useSlots();
/** `class` is merged into the container's own; every other attribute lands on it as before. */
const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

/**
 * Shared box (spec "Button" → Anatomy and Behaviour & motion): 1px border that a variant may
 * colour, `radius-md` through the component's own variable, and the one focus ring.
 *
 * There is deliberately no `transition-*`/`duration-*` utility here. `eldra-focus` owns the
 * element's transition list — background, border, text colour and the press scale at
 * `duration-fast`, the ring itself at `duration-base`, nothing at all under reduced motion — and a
 * second `transition` shorthand on the same element replaces it wholesale, which is what used to
 * stop the ring growing in. See `src/styles/tailwind.css` and
 * `src/__tests__/focus-transition.spec.ts`.
 */
const BASE =
  'eldra:relative eldra:inline-flex eldra:items-center eldra:justify-center ' +
  'eldra:rounded-[var(--eldra-button-radius,var(--eldra-radius-md))] eldra:eldra-focus';

/** The 1px border and no underline, except `link`, which is a borderless underlined line box. */
const BOX = 'eldra:border eldra:no-underline';
const LINK_BOX = 'eldra:border-0';

/**
 * Sizes (spec "Button" → Sizes). `--spacing` is 0.25rem, so `px-3`/`px-4.5`/`px-6` are the spec's
 * 0.75/1.125/1.5rem and `gap-1.5`/`gap-2` its 0.375/0.5rem.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'eldra:control-h-sm eldra:px-3 eldra:gap-1.5 eldra:text-button-sm',
  md: 'eldra:control-h eldra:px-4.5 eldra:gap-2 eldra:text-button-md',
  lg: 'eldra:control-h-lg eldra:px-6 eldra:gap-2 eldra:text-button-lg',
};

/** Icon-only is square at its size's height and never grows: the spec lists 2 / 2.5 / 3rem. */
const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: 'eldra:control-h-sm eldra:aspect-square eldra:px-0 eldra:text-button-sm',
  md: 'eldra:control-h eldra:aspect-square eldra:px-0 eldra:text-button-md',
  lg: 'eldra:control-h-lg eldra:aspect-square eldra:px-0 eldra:text-button-lg',
};

/** The link variant is a line box: no control height, no padding, and it never grows to 2.75rem. */
const LINK_SIZE: Record<ButtonSize, string> = {
  sm: 'eldra:target-min eldra:px-0 eldra:gap-1.5 eldra:text-button-sm',
  md: 'eldra:target-min eldra:px-0 eldra:gap-2 eldra:text-button-md',
  lg: 'eldra:target-min eldra:px-0 eldra:gap-2 eldra:text-button-lg',
};

/**
 * Variants (spec "Button" → Variants, States and On coloured sections).
 *
 * Every hover fill is a `color-mix` of the token variables, so it follows whatever colour a store
 * puts in `primary` or `accent` without a new token: `primary` mixed 14% toward `background`,
 * `accent` and `danger` 15% toward `text`, ghost `text` at 6% (11% pressed down).
 *
 * The `section-primary:`/`section-accent:` rules are the inversions for coloured sections. The
 * section element carries `data-section="primary|accent"`; the focus ring never
 * changes, because its white infill carries the contrast on dark grounds.
 *
 * Every live button is `cursor-pointer` (operator report, 2026-09-25; recorded under Deviations in
 * the README): Tailwind v4's preflight sets `button { cursor: default }`, so nothing here was a
 * pointer until now. `cursorClass` picks it, `cursor-not-allowed` when disabled, or
 * `cursor-progress` while loading.
 *
 * The resting fill and border colour live in `FILL`, apart from the rest, so the toggle-pressed
 * fill can take their place.
 */
const FILL: Record<ButtonVariant, string> = {
  primary: 'eldra:bg-primary eldra:border-transparent',
  secondary: 'eldra:bg-accent eldra:border-transparent',
  outline: 'eldra:bg-background eldra:border-border-strong',
  ghost: 'eldra:bg-transparent eldra:border-transparent',
  link: 'eldra:bg-transparent eldra:border-transparent',
  danger: 'eldra:bg-danger eldra:border-transparent',
};
const VARIANT: Record<ButtonVariant, string> = {
  primary: [
    'eldra:text-primary-contrast',
    'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]',
    'eldra:section-primary:bg-primary-contrast',
    'eldra:section-primary:text-primary',
    'eldra:section-primary:hover:bg-[color-mix(in_oklab,var(--eldra-color-primary-contrast),var(--eldra-color-primary)_14%)]',
    'eldra:section-accent:bg-accent-contrast',
    'eldra:section-accent:text-accent',
    'eldra:section-accent:hover:bg-[color-mix(in_oklab,var(--eldra-color-accent-contrast),var(--eldra-color-accent)_14%)]',
  ].join(' '),
  secondary: [
    'eldra:text-accent-contrast',
    'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-accent),var(--eldra-color-text)_15%)]',
    'eldra:section-accent:bg-transparent',
    'eldra:section-accent:border-current',
    'eldra:section-accent:text-current',
    'eldra:section-accent:hover:bg-[color-mix(in_oklab,currentColor,transparent_88%)]',
  ].join(' '),
  outline: [
    'eldra:text-text',
    'eldra:hover:border-text eldra:hover:bg-surface',
    'eldra:section-primary:bg-transparent',
    'eldra:section-primary:border-current',
    'eldra:section-primary:text-current',
    'eldra:section-primary:hover:border-current',
    'eldra:section-primary:hover:bg-[color-mix(in_oklab,currentColor,transparent_88%)]',
    'eldra:section-accent:bg-transparent',
    'eldra:section-accent:border-current',
    'eldra:section-accent:text-current',
    'eldra:section-accent:hover:border-current',
    'eldra:section-accent:hover:bg-[color-mix(in_oklab,currentColor,transparent_88%)]',
  ].join(' '),
  ghost: [
    'eldra:text-text',
    'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
    'eldra:active:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)]',
    'eldra:section-primary:text-current',
    'eldra:section-primary:hover:bg-[color-mix(in_oklab,currentColor,transparent_94%)]',
    'eldra:section-accent:text-current',
    'eldra:section-accent:hover:bg-[color-mix(in_oklab,currentColor,transparent_94%)]',
  ].join(' '),
  link: [
    'eldra:text-text',
    'eldra:underline eldra:decoration-1 eldra:underline-offset-[0.2em] eldra:hover:decoration-2',
    'eldra:section-primary:text-current',
    'eldra:section-accent:text-current',
  ].join(' '),
  danger: [
    'eldra:text-background',
    'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-danger),var(--eldra-color-text)_15%)]',
  ].join(' '),
};

/**
 * Disabled (spec "Button" → States): `surface-strong` fill, `muted` text, transparent border, no
 * press movement. Ghost and link keep no fill. These replace the variant's classes rather than
 * layering over them, so a `:hover` rule can never win back the live colours on a dead control.
 */
const FILLED_DISABLED = 'eldra:bg-surface-strong eldra:text-muted eldra:border-transparent';
const DISABLED: Record<ButtonVariant, string> = {
  primary: FILLED_DISABLED,
  secondary: FILLED_DISABLED,
  outline: FILLED_DISABLED,
  danger: FILLED_DISABLED,
  ghost: 'eldra:bg-transparent eldra:text-muted eldra:border-transparent',
  link: 'eldra:bg-transparent eldra:text-muted eldra:border-transparent eldra:underline eldra:decoration-1 eldra:underline-offset-[0.2em]',
};

/**
 * The submitting flag a `FormLayout` provides. A submit button becomes a loading button; every
 * other action in that form is disabled while the submit is in flight.
 */
const formSubmitting = inject(FORM_SUBMITTING_KEY, undefined);

const isLink = computed(() => props.href !== undefined);

/**
 * `as` follows `Link`'s contract exactly (see `Link.vue`): a string is used as the tag directly
 * and still receives `href`; a component receives the destination as its `to` prop instead,
 * matching Vue Router / NuxtLink's own contract. A component `as` only applies to the link form
 * — with no `href` (or `to`) this is a `<button>`, because a "button" that is really a router link
 * with no destination is not a thing the spec has. A string tag with no `href` is `isStatic`.
 */
const isComponentAs = computed(() => props.as !== undefined && typeof props.as !== 'string');

/** An `as` component given its destination as `to` rather than `href` (a route object, say). */
const isRouted = computed(() => !isLink.value && isComponentAs.value && props.to !== undefined);

/**
 * A string `as` other than `button`/`a` with no `href`: that tag with the button look and nothing
 * interactive — no `type`, `disabled`, `tabindex`, `aria-pressed`, `aria-disabled` or `aria-label`,
 * because a generic element takes none of them. For a button-looking part inside another control.
 */
const isStatic = computed(
  () => !isLink.value && typeof props.as === 'string' && props.as !== 'button' && props.as !== 'a'
);

/** Whether the root is the native `<button>`: no `href`, no routed `as`, no static tag. */
const isNativeButton = computed(() => !isLink.value && !isRouted.value && !isStatic.value);

const isSubmit = computed(() => isNativeButton.value && props.type === 'submit');
const submitting = computed(() => formSubmitting?.value === true);

const isLoading = computed(() => props.loading || (submitting.value && isSubmit.value));
const isDisabled = computed(() => props.disabled || (submitting.value && !isSubmit.value));

/**
 * **A disabled routed link is never rendered as the router component.**
 *
 * `onClick` below calls `preventDefault()` on a disabled button, which is enough for a native
 * `<a>`: the default action is the navigation, and preventing it stops it. A router link does not
 * navigate by a default action — `RouterLink`/`NuxtLink` install their *own* click listener and
 * call `router.push()` from it. That listener is on the component's own root, so it runs before
 * the handler `Button` passes down through fall-through attributes, and the route change had
 * already happened by the time `preventDefault()` was reached. A "disabled" call to action
 * navigated on click, which is the one thing disabled has to mean.
 *
 * So a disabled link falls back to the plain element for the same destination — an `<a href>`,
 * which `preventDefault()` does stop (or a `<span>` if there is somehow no destination, which
 * `isLink` makes unreachable today and is kept so the fallback cannot produce a routed tag).
 * Everything else about the disabled link is unchanged: the `href` stays so the element keeps
 * `role="link"` and a screen reader still names what it is, with `aria-disabled="true"` and
 * `tabindex="-1"` making it inert. Re-enabling the button routes again, with no change from the
 * caller.
 */
const routesThroughComponent = computed(
  () => isLink.value && isComponentAs.value && !isDisabled.value
);
const rootTag = computed(() => {
  if (isRouted.value || isStatic.value) return props.as!;
  if (!isLink.value) return 'button';
  if (isComponentAs.value && isDisabled.value) return props.href === undefined ? 'span' : 'a';
  return props.as ?? 'a';
});
const linkAttrs = computed<Record<string, unknown>>(() => {
  if (isRouted.value) return { to: props.to };
  if (!isLink.value) return {};
  return routesThroughComponent.value ? { to: props.href } : { href: props.href };
});

const sizeClass = computed(() => {
  if (props.variant === 'link') return LINK_SIZE[props.size];
  if (props.iconOnly) return ICON_ONLY_SIZE[props.size];
  return SIZE[props.size];
});

/**
 * The press (operator decision, 2026-09-25; recorded under Deviations in the README). The design
 * spec's States table says a pressed button "moves down 1px", and a 1px downward translate is what
 * this shipped. A 1px move is below the threshold at which a press reads as tactile — it looks
 * like a rendering artefact rather than a button being pushed — so the press is a scale instead:
 * the whole control shrinks to 98%, which is roughly half the 4% the private Eldra library's
 * button uses and is felt rather than seen.
 *
 * The class it replaced is deliberately not written out anywhere under `src/`, comments included:
 * Tailwind's source scan reads this directory to build `dist/style.css`, so naming it in prose
 * emitted a real CSS rule for a class nothing uses. `src/__tests__/source-scan.spec.ts` fails if
 * one comes back.
 *
 * `transform-origin` is left at its initial `center`, which is what makes the button shrink toward
 * its own middle rather than toward a corner; nothing has to declare it.
 *
 * `scale` is an independent transform property in Tailwind v4 (`scale: 0.98`, not a `transform`
 * shorthand), so it is in `eldra-focus`'s transition list beside `translate` and arrives over
 * `duration-fast` — see `src/styles/tailwind.css`. Reduced motion needs **both** halves: the
 * utility's `transition: none` removes the animation, and `motion-reduce:active:scale-100` removes
 * the movement itself, because an instant 2% jump under a press is still motion.
 *
 * `link` is excluded, as the spec's own link row is: a link button is a line box with no fill and
 * no box to press. A disabled or loading button has no press feedback either, which falls out of
 * `isDisabled` below replacing the whole state class.
 */
const PRESS = 'eldra:active:scale-[0.98] eldra:motion-reduce:active:scale-100';

/**
 * The toggle-pressed fill (spec "Button" → States, toggle pressed): `surface-strong` with the
 * `border-strong` boundary. The spec gives it to `outline`; `ghost` takes the same look, because a
 * ghost toggle in a toolbar (bold, italic, a view switch) has no other way to show it is on, and
 * the `border-strong` boundary is what keeps the state at 3:1 against the page (1.4.11) where the
 * fill alone would not be. Only `pressed === true` draws it, in place of the variant's `FILL`, so
 * `aria-pressed="true"` and the look always go together. The filled variants already carry a fill,
 * and `link` is a line box.
 */
const PRESSED_FILL = 'eldra:bg-surface-strong eldra:border-border-strong';
const TOGGLE_VARIANTS: readonly ButtonVariant[] = ['outline', 'ghost'];

const stateClass = computed(() =>
  isDisabled.value
    ? DISABLED[props.variant]
    : // The toggle pressed state is a fill, not only a colour shift (1.4.1). See PRESSED_FILL.
      [
        props.pressed === true && TOGGLE_VARIANTS.includes(props.variant)
          ? PRESSED_FILL
          : FILL[props.variant],
        VARIANT[props.variant],
        // A loading button is still clickable (the spec keeps it focusable and named), but the
        // action is already under way — pressing it again is not a thing that happens, so it gets
        // no press feedback, the same as a disabled one.
        props.variant !== 'link' && !isLoading.value && PRESS,
      ]
);

const cursorClass = computed(() => {
  if (isLoading.value) return 'eldra:cursor-progress';
  return isDisabled.value ? 'eldra:cursor-not-allowed' : 'eldra:cursor-pointer';
});

// MultiSelect's footer Clear overrides the container.
const containerClass = computed(() =>
  mergeClass(
    [
      BASE,
      props.variant === 'link' ? LINK_BOX : BOX,
      sizeClass.value,
      stateClass.value,
      cursorClass.value,
      props.block && 'eldra:w-full',
    ],
    attrs.class
  )
);

const isOverlaySpinner = computed(() => props.spinnerPlacement !== 'start');
const isInlineSpinner = computed(() => isLoading.value && !isOverlaySpinner.value);

/** Hidden, not removed: the label and icons keep their space so the width never jumps. An inline
 *  spinner hides nothing: it takes the leading icon's place and the label stays readable. */
const hiddenWhileLoading = computed(() =>
  isLoading.value && isOverlaySpinner.value ? 'eldra:invisible' : ''
);

/** With `keepNameWhileLoading` the label is transparent instead, so it stays in the accessibility
 *  tree and the slot content keeps naming the button. */
const labelHiddenWhileLoading = computed(() =>
  hiddenWhileLoading.value && props.keepNameWhileLoading
    ? 'eldra:opacity-0'
    : hiddenWhileLoading.value
);

/** Whether slot output holds anything but text, which then lays out in the button's own gap. */
function hasElements(nodes: VNode[]): boolean {
  return nodes.some((node) => {
    if (node.type === Comment || node.type === Text) return false;
    if (node.type === Fragment)
      return Array.isArray(node.children) && hasElements(node.children as VNode[]);
    return true;
  });
}

/**
 * The label. Read during render, because it calls the slot. Plain text keeps the label an inline
 * run; slot content with elements in it (an icon beside the text) makes the label a flex row with
 * the container's own `gap`, so the icon sits exactly as `iconLeft` would.
 */
function labelClass(): string {
  const rich = slots.default !== undefined && hasElements(slots.default());
  // FilterPanel's footer Apply overrides the label.
  return mergeClass(
    [
      'eldra:whitespace-nowrap',
      rich && 'eldra:inline-flex eldra:items-center eldra:gap-[inherit]',
      labelHiddenWhileLoading.value,
    ],
    props.classes?.label
  );
}
const leadingIconClass = computed(() => [
  'eldra:inline-flex eldra:shrink-0',
  hiddenWhileLoading.value,
  props.classes?.leadingIcon,
]);
const trailingIconClass = computed(() => [
  'eldra:inline-flex eldra:shrink-0',
  hiddenWhileLoading.value,
  props.classes?.trailingIcon,
]);
const spinnerClass = computed(() => [
  isOverlaySpinner.value
    ? 'eldra:absolute eldra:inset-0 eldra:flex eldra:items-center eldra:justify-center'
    : 'eldra:inline-flex eldra:shrink-0',
  props.classes?.spinner,
]);

/** An icon-only button draws `icon`; everything else draws `iconLeft`. */
const leadingIcon = computed(() =>
  props.iconOnly ? (props.icon ?? props.iconLeft) : props.iconLeft
);
const hasLeading = computed(
  () =>
    !isInlineSpinner.value && (leadingIcon.value !== undefined || slots.leadingIcon !== undefined)
);
const hasTrailing = computed(
  () => !props.iconOnly && (props.iconRight !== undefined || slots.trailingIcon !== undefined)
);

/**
 * The accessible name (spec "Button" → Accessibility): an icon-only button is named by `label`,
 * and while loading the name becomes the loading label ("Adding to cart") because the visible one
 * is hidden.
 */
const ariaLabel = computed(() =>
  !isStatic.value && (props.iconOnly || (isLoading.value && isOverlaySpinner.value))
    ? props.label
    : undefined
);

/**
 * `aria-pressed` is a toggle-button state, and `button` is the only role that takes it — an `<a>`
 * is a link, and a link cannot be pressed. A `pressed` prop on a link button is therefore dropped
 * from the DOM rather than emitted onto a role that would make it invalid.
 */
const ariaPressed = computed(() =>
  !isNativeButton.value || props.pressed === undefined ? undefined : String(props.pressed)
);

if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (props.iconOnly && props.label === undefined && !isStatic.value) {
      console.warn(
        '[@eldrajs/ui] <Button icon-only> has no `label`, so it has no accessible name. ' +
          'Give it one that names the action and the object, e.g. ' +
          'label="Add Merino crew sweater to wishlist".'
      );
    }
  });

  /**
   * The toggle-pressed fill is drawn for `outline` and `ghost` only (see `PRESSED_FILL`): the
   * pressed state has to be a fill, not a hue (1.4.1), and the other four either already have a
   * fill or are meant to have none. `aria-pressed` is still emitted — the state is real and a
   * screen reader should hear it — but the button will look identical pressed and unpressed,
   * which is the bug worth naming.
   */
  watchEffect(() => {
    if (props.pressed !== undefined && !isLink.value && !TOGGLE_VARIANTS.includes(props.variant)) {
      console.warn(
        `[@eldrajs/ui] <Button variant="${props.variant}" pressed> shows no pressed state: the ` +
          'toggle fill is drawn for the `outline` and `ghost` variants only, so this button looks ' +
          'the same pressed and unpressed. Use variant="outline" or "ghost" for a toggle.'
      );
    }
  });

  /** A link cannot be pressed, so `pressed` is dropped rather than put on the wrong role. */
  watchEffect(() => {
    if (props.pressed !== undefined && isLink.value) {
      console.warn(
        '[@eldrajs/ui] <Button href pressed> ignores `pressed`: an <a href> is a link, and ' +
          '`aria-pressed` is only valid on a button. Drop `href`, or drop `pressed`.'
      );
    }
  });

  /**
   * While `loading`, the visible label is hidden (`invisible`) and `label` becomes the button's
   * only accessible name (see `ariaLabel` above). An empty `label` here is the icon-only warning's
   * sibling case: the button loses its name the moment it starts loading, not at mount, so it is
   * easy to miss in a quick manual check.
   */
  watchEffect(() => {
    if (
      isLoading.value &&
      isOverlaySpinner.value &&
      !props.iconOnly &&
      props.label === undefined &&
      !isStatic.value &&
      !(props.keepNameWhileLoading && slots.default !== undefined)
    ) {
      console.warn(
        '[@eldrajs/ui] <Button loading> has no `label`, so it loses its accessible name while ' +
          'loading (the visible label is hidden). Give it one that describes the action in ' +
          'progress, e.g. label="Adding to cart".'
      );
    }
  });
}

function onClick(event: MouseEvent): void {
  // A native <button disabled> never fires click; an <a> has no disabled, so it is stopped here.
  if (isDisabled.value) {
    event.preventDefault();
    return;
  }
  emit('click', event);
}

/**
 * A disabled link button (spec "Button" → Accessibility, and WAI-ARIA's `aria-disabled` pattern).
 *
 * `<a>` has no `disabled`, and dropping the `href` would turn the element into a generic — it
 * loses `role="link"`, so a screen reader stops announcing what it is at exactly the moment the
 * user needs to be told it is unavailable. So the `href` stays and three things make it inert:
 * `aria-disabled="true"` for the announcement, `tabindex="-1"` to take it out of the tab order the
 * way a disabled button is, and `preventDefault()` above so a pointer or programmatic click never
 * navigates.
 */
/**
 * A routed `as` component given `to` has no `href` to fall back to an `<a>` with when disabled, so
 * it stays that component, whose own click listener navigates. Its click is handled in the
 * capture phase, which reaches it first: Vue Router's handler skips a click whose default is
 * already prevented.
 */
const rootListeners = computed(() =>
  isRouted.value ? { clickCapture: onClick } : { click: onClick }
);

const isInertLink = computed(() => !isNativeButton.value && !isStatic.value && isDisabled.value);
const linkTabindex = computed(() => (isInertLink.value ? '-1' : undefined));
</script>

<template>
  <component
    :is="rootTag"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="container"
    :class="containerClass"
    :type="isNativeButton ? type : undefined"
    :tabindex="linkTabindex"
    :disabled="isNativeButton ? isDisabled || undefined : undefined"
    :aria-disabled="isInertLink ? 'true' : undefined"
    :aria-busy="isLoading ? 'true' : undefined"
    :aria-pressed="ariaPressed"
    :aria-label="ariaLabel"
    v-on="rootListeners"
    v-bind="{ ...linkAttrs, ...forwardedAttrs }"
  >
    <span v-if="isInlineSpinner" data-part="spinner" :class="spinnerClass">
      <Spinner class="eldra:size-4.5" />
    </span>
    <span
      v-if="hasLeading"
      :data-eldra-slot="eldra.slotHost('leadingIcon')"
      data-part="leadingIcon"
      :class="leadingIconClass"
    >
      <slot name="leadingIcon">
        <Icon v-if="leadingIcon" :icon="leadingIcon" />
      </slot>
    </span>
    <span
      v-if="!iconOnly"
      :data-eldra-slot="eldra.slotHost('default')"
      data-part="label"
      :class="labelClass()"
    >
      <slot>{{ label }}</slot>
    </span>
    <span
      v-if="hasTrailing"
      :data-eldra-slot="eldra.slotHost('trailingIcon')"
      data-part="trailingIcon"
      :class="trailingIconClass"
    >
      <slot name="trailingIcon">
        <Icon v-if="iconRight" :icon="iconRight" />
      </slot>
    </span>
    <span v-if="isLoading && isOverlaySpinner" data-part="spinner" :class="spinnerClass">
      <!-- 1.125rem circle, 2px stroke in the label colour, one turn every 700ms; with reduced
           motion it pulses at 60-100% opacity instead (spec "Behaviour & motion"). The shape
           itself is `Spinner.vue`, shared with `LoadMore`, `Price` and `StockBadge`. -->
      <Spinner class="eldra:size-4.5" />
    </span>
  </component>
</template>
