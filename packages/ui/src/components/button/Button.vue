<script setup lang="ts">
import { computed, inject, useSlots, watchEffect } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { FORM_SUBMITTING_KEY } from '../form-layout/context';
import Icon from '../icon/Icon.vue';
import type { ButtonProps, ButtonSize, ButtonVariant } from './types';

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
  block: false,
  pressed: undefined,
  disabled: false,
  classes: undefined,
});

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const slots = useSlots();

/**
 * Shared box (spec "Button" → Anatomy and Behaviour & motion): 1px border that a variant may
 * colour, `radius-md` through the component's own variable, and the one focus ring.
 *
 * There is deliberately no `transition-*`/`duration-*` utility here. `eldra-focus` owns the
 * element's transition list — background, border, text colour and the 1px press movement at
 * `duration-fast`, the ring itself at `duration-base`, nothing at all under reduced motion — and a
 * second `transition` shorthand on the same element replaces it wholesale, which is what used to
 * stop the ring growing in. See `src/styles/tailwind.css` and
 * `src/__tests__/focus-transition.spec.ts`.
 */
const BASE =
  'relative inline-flex items-center justify-center border border-transparent ' +
  'rounded-[var(--eldra-button-radius,var(--eldra-radius-md))] no-underline eldra-focus';

/**
 * Sizes (spec "Button" → Sizes). `--spacing` is 0.25rem, so `px-3`/`px-4.5`/`px-6` are the spec's
 * 0.75/1.125/1.5rem and `gap-1.5`/`gap-2` its 0.375/0.5rem.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'control-h-sm px-3 gap-1.5 text-button-sm',
  md: 'control-h px-4.5 gap-2 text-button-md',
  lg: 'control-h-lg px-6 gap-2 text-button-lg',
};

/**
 * The touch target (spec "Actions and forms" → Compact controls): "Controls keep their height on
 * mobile. **Only primary action buttons** grow to `target-touch` (2.75rem)." So the growth is the
 * `primary` variant's, at `md`, and not every button's — a row of outline and ghost actions keeps
 * the 2.5rem control height it shares with the inputs beside it.
 *
 * `@max-tablet` is a container query at 48rem, so it measures the *block* the button sits in, not
 * the viewport, which is what the spec's "below a 48rem container" asks for. The nearest container
 * is a ButtonGroup, a FormLayout or the theme's Section.
 */
const TOUCH_GROWTH = '@max-tablet:target-touch';

/** Icon-only is square at its size's height and never grows: the spec lists 2 / 2.5 / 3rem. */
const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: 'control-h-sm aspect-square px-0 text-button-sm',
  md: 'control-h aspect-square px-0 text-button-md',
  lg: 'control-h-lg aspect-square px-0 text-button-lg',
};

/** The link variant is a line box: no control height, no padding, and it never grows to 2.75rem. */
const LINK_SIZE: Record<ButtonSize, string> = {
  sm: 'target-min px-0 gap-1.5 text-button-sm',
  md: 'target-min px-0 gap-2 text-button-md',
  lg: 'target-min px-0 gap-2 text-button-lg',
};

/**
 * Variants (spec "Button" → Variants, States and On coloured sections).
 *
 * Every hover fill is a `color-mix` of the token variables, so it follows whatever colour a store
 * puts in `primary` or `accent` without a new token: `primary` mixed 14% toward `background`,
 * `accent` and `danger` 15% toward `text`, ghost `text` at 6% (11% pressed down).
 *
 * The `group-data-[section=…]/section:` rules are the inversions for coloured sections. The section
 * element carries `class="group/section" data-section="primary|accent"`; the focus ring never
 * changes, because its white infill carries the contrast on dark grounds.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: [
    'bg-primary text-primary-contrast border-transparent',
    'hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]',
    'group-data-[section=primary]/section:bg-primary-contrast',
    'group-data-[section=primary]/section:text-primary',
    'group-data-[section=primary]/section:hover:bg-[color-mix(in_oklab,var(--eldra-color-primary-contrast),var(--eldra-color-primary)_14%)]',
    'group-data-[section=accent]/section:bg-accent-contrast',
    'group-data-[section=accent]/section:text-accent',
    'group-data-[section=accent]/section:hover:bg-[color-mix(in_oklab,var(--eldra-color-accent-contrast),var(--eldra-color-accent)_14%)]',
  ].join(' '),
  secondary: [
    'bg-accent text-accent-contrast border-transparent',
    'hover:bg-[color-mix(in_oklab,var(--eldra-color-accent),var(--eldra-color-text)_15%)]',
    'group-data-[section=accent]/section:bg-transparent',
    'group-data-[section=accent]/section:border-current',
    'group-data-[section=accent]/section:text-current',
    'group-data-[section=accent]/section:hover:bg-[color-mix(in_oklab,currentColor,transparent_88%)]',
  ].join(' '),
  outline: [
    'bg-background border-border-strong text-text',
    'hover:border-text hover:bg-surface',
    'group-data-[section=primary]/section:bg-transparent',
    'group-data-[section=primary]/section:border-current',
    'group-data-[section=primary]/section:text-current',
    'group-data-[section=primary]/section:hover:border-current',
    'group-data-[section=primary]/section:hover:bg-[color-mix(in_oklab,currentColor,transparent_88%)]',
    'group-data-[section=accent]/section:bg-transparent',
    'group-data-[section=accent]/section:border-current',
    'group-data-[section=accent]/section:text-current',
    'group-data-[section=accent]/section:hover:border-current',
    'group-data-[section=accent]/section:hover:bg-[color-mix(in_oklab,currentColor,transparent_88%)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-text border-transparent',
    'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
    'active:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)]',
    'group-data-[section=primary]/section:text-current',
    'group-data-[section=primary]/section:hover:bg-[color-mix(in_oklab,currentColor,transparent_94%)]',
    'group-data-[section=accent]/section:text-current',
    'group-data-[section=accent]/section:hover:bg-[color-mix(in_oklab,currentColor,transparent_94%)]',
  ].join(' '),
  link: [
    'bg-transparent text-text border-0',
    'underline decoration-1 underline-offset-[0.2em] hover:decoration-2',
    'group-data-[section=primary]/section:text-current',
    'group-data-[section=accent]/section:text-current',
  ].join(' '),
  danger: [
    'bg-danger text-background border-transparent',
    'hover:bg-[color-mix(in_oklab,var(--eldra-color-danger),var(--eldra-color-text)_15%)]',
  ].join(' '),
};

/**
 * Disabled (spec "Button" → States): `surface-strong` fill, `muted` text, transparent border, no
 * press movement. Ghost and link keep no fill. These replace the variant's classes rather than
 * layering over them, so a `:hover` rule can never win back the live colours on a dead control.
 */
const FILLED_DISABLED = 'bg-surface-strong text-muted border-transparent cursor-not-allowed';
const DISABLED: Record<ButtonVariant, string> = {
  primary: FILLED_DISABLED,
  secondary: FILLED_DISABLED,
  outline: FILLED_DISABLED,
  danger: FILLED_DISABLED,
  ghost: 'bg-transparent text-muted border-transparent cursor-not-allowed',
  link: 'bg-transparent text-muted border-0 underline decoration-1 underline-offset-[0.2em] cursor-not-allowed',
};

/**
 * The submitting flag a `FormLayout` provides. A submit button becomes a loading button; every
 * other action in that form is disabled while the submit is in flight.
 */
const formSubmitting = inject(FORM_SUBMITTING_KEY, undefined);

const isLink = computed(() => props.href !== undefined);
const isSubmit = computed(() => !isLink.value && props.type === 'submit');
const submitting = computed(() => formSubmitting?.value === true);

const isLoading = computed(() => props.loading || (submitting.value && isSubmit.value));
const isDisabled = computed(() => props.disabled || (submitting.value && !isSubmit.value));

const sizeClass = computed(() => {
  if (props.variant === 'link') return LINK_SIZE[props.size];
  if (props.iconOnly) return ICON_ONLY_SIZE[props.size];
  return cx(SIZE[props.size], props.size === 'md' && props.variant === 'primary' && TOUCH_GROWTH);
});

const stateClass = computed(() =>
  isDisabled.value
    ? DISABLED[props.variant]
    : // The toggle pressed state is a fill, not only a colour shift (1.4.1). The spec gives it for
      // the outline variant, the one it calls a toggle button.
      cx(
        VARIANT[props.variant],
        'active:translate-y-px',
        props.pressed === true &&
          props.variant === 'outline' &&
          'bg-surface-strong border-border-strong'
      )
);

const containerClass = computed(() =>
  partClass(
    cx(
      BASE,
      sizeClass.value,
      stateClass.value,
      props.block && 'w-full',
      isLoading.value && 'cursor-progress'
    ),
    props.classes,
    'container'
  )
);

/** Hidden, not removed: the label and icons keep their space so the width never jumps. */
const hiddenWhileLoading = computed(() => (isLoading.value ? 'invisible' : ''));

const labelClass = computed(() =>
  partClass(cx('whitespace-nowrap', hiddenWhileLoading.value), props.classes, 'label')
);
const leadingIconClass = computed(() =>
  partClass(cx('inline-flex shrink-0', hiddenWhileLoading.value), props.classes, 'leadingIcon')
);
const trailingIconClass = computed(() =>
  partClass(cx('inline-flex shrink-0', hiddenWhileLoading.value), props.classes, 'trailingIcon')
);
const spinnerClass = computed(() =>
  partClass('absolute inset-0 flex items-center justify-center', props.classes, 'spinner')
);

/** An icon-only button draws `icon`; everything else draws `iconLeft`. */
const leadingIcon = computed(() =>
  props.iconOnly ? (props.icon ?? props.iconLeft) : props.iconLeft
);
const hasLeading = computed(
  () => leadingIcon.value !== undefined || slots.leadingIcon !== undefined
);
const hasTrailing = computed(
  () => !props.iconOnly && (props.iconRight !== undefined || slots.trailingIcon !== undefined)
);

/**
 * The accessible name (spec "Button" → Accessibility): an icon-only button is named by `label`,
 * and while loading the name becomes the loading label ("Adding to cart") because the visible one
 * is hidden.
 */
const ariaLabel = computed(() => (props.iconOnly || isLoading.value ? props.label : undefined));

/**
 * `aria-pressed` is a toggle-button state, and `button` is the only role that takes it — an `<a>`
 * is a link, and a link cannot be pressed. A `pressed` prop on a link button is therefore dropped
 * from the DOM rather than emitted onto a role that would make it invalid.
 */
const ariaPressed = computed(() =>
  isLink.value || props.pressed === undefined ? undefined : String(props.pressed)
);

if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (props.iconOnly && props.label === undefined) {
      console.warn(
        '[@eldrajs/ui] <Button icon-only> has no `label`, so it has no accessible name. ' +
          'Give it one that names the action and the object, e.g. ' +
          'label="Add Merino crew sweater to wishlist".'
      );
    }
  });

  /**
   * The states table gives the toggle-pressed row a value for `outline` only, and "n/a" for every
   * other variant: the pressed state has to be a fill, not a hue (1.4.1), and the other five
   * either already have a fill or are meant to have none. `aria-pressed` is still emitted — the
   * state is real and a screen reader should hear it — but the button will look identical pressed
   * and unpressed, which is the bug worth naming.
   */
  watchEffect(() => {
    if (props.pressed !== undefined && !isLink.value && props.variant !== 'outline') {
      console.warn(
        `[@eldrajs/ui] <Button variant="${props.variant}" pressed> shows no pressed state: the ` +
          'design spec gives the toggle fill to the `outline` variant only, so this button looks ' +
          'the same pressed and unpressed. Use variant="outline" for a toggle.'
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
    if (isLoading.value && !props.iconOnly && props.label === undefined) {
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
const linkTabindex = computed(() => (isLink.value && isDisabled.value ? '-1' : undefined));
</script>

<template>
  <component
    :is="isLink ? 'a' : 'button'"
    data-part="container"
    :class="containerClass"
    :type="isLink ? undefined : type"
    :href="isLink ? href : undefined"
    :tabindex="linkTabindex"
    :disabled="isLink ? undefined : isDisabled || undefined"
    :aria-disabled="isLink && isDisabled ? 'true' : undefined"
    :aria-busy="isLoading ? 'true' : undefined"
    :aria-pressed="ariaPressed"
    :aria-label="ariaLabel"
    @click="onClick"
  >
    <span v-if="hasLeading" data-part="leadingIcon" :class="leadingIconClass">
      <slot name="leadingIcon">
        <Icon v-if="leadingIcon" :icon="leadingIcon" />
      </slot>
    </span>
    <span v-if="!iconOnly" data-part="label" :class="labelClass">
      <slot>{{ label }}</slot>
    </span>
    <span v-if="hasTrailing" data-part="trailingIcon" :class="trailingIconClass">
      <slot name="trailingIcon">
        <Icon v-if="iconRight" :icon="iconRight" />
      </slot>
    </span>
    <span v-if="isLoading" data-part="spinner" :class="spinnerClass">
      <!-- 1.125rem circle, 2px stroke in the label colour. The viewBox is 18 units wide so a
           stroke of 2 user units renders as exactly 2px at that size. One turn every 700ms; with
           reduced motion it pulses at 60-100% opacity instead (spec "Behaviour & motion"). -->
      <svg
        class="animate-eldra-spin motion-reduce:animate-eldra-pulse size-4.5"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="2" stroke-opacity="0.3" />
        <path
          d="M17 9a8 8 0 0 0-8-8"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </span>
  </component>
</template>
