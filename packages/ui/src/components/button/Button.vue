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
 * colour, `radius-md` through the component's own variable, and the one focus ring. Background,
 * border, text colour and the 1px press movement transition over `duration-fast` with `ease-out`;
 * with reduced motion there is no transition at all.
 */
const BASE =
  'relative inline-flex items-center justify-center border border-transparent ' +
  'rounded-[var(--eldra-button-radius,var(--eldra-radius-md))] no-underline ' +
  'transition-[color,background-color,border-color,text-decoration-thickness,translate] ' +
  'duration-fast ease-out motion-reduce:transition-none eldra-focus';

/**
 * Sizes (spec "Button" → Sizes). `--spacing` is 0.25rem, so `px-3`/`px-4.5`/`px-6` are the spec's
 * 0.75/1.125/1.5rem and `gap-1.5`/`gap-2` its 0.375/0.5rem. `@max-tablet` is a container query at
 * 48rem, so an md button grows to `target-touch` when the *block* it sits in is narrow — which is
 * what the spec measures, not the viewport. Its nearest container is a ButtonGroup, a FormLayout
 * or the theme's Section.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'control-h-sm px-3 gap-1.5 text-button-sm',
  md: 'control-h @max-tablet:target-touch px-4.5 gap-2 text-button-md',
  lg: 'control-h-lg px-6 gap-2 text-button-lg',
};

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
  return props.iconOnly ? ICON_ONLY_SIZE[props.size] : SIZE[props.size];
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
}

function onClick(event: MouseEvent): void {
  // A native <button disabled> never fires click; an <a> has no disabled, so it is stopped here.
  if (isDisabled.value) {
    event.preventDefault();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <component
    :is="isLink ? 'a' : 'button'"
    data-part="container"
    :class="containerClass"
    :type="isLink ? undefined : type"
    :href="isLink && !isDisabled ? href : undefined"
    :disabled="isLink ? undefined : isDisabled || undefined"
    :aria-disabled="isLink && isDisabled ? 'true' : undefined"
    :aria-busy="isLoading ? 'true' : undefined"
    :aria-pressed="pressed === undefined ? undefined : String(pressed)"
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
