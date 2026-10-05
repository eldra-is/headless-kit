<script setup lang="ts">
import { computed, inject, ref, useSlots, watch, watchEffect } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { TAG_FILL, TAG_REMOVE_BUTTON, TAG_SHAPE, tagPadding } from '../../utils/tagRecipe';
import Avatar from '../avatar/Avatar.vue';
import { CHIP_GROUP_KEY } from './context';
import type { ChipProps, ChipSize } from './types';

const props = withDefaults(defineProps<ChipProps>(), {
  size: 'md',
  removable: false,
  selectable: false,
  selected: undefined,
  disabled: false,
  icon: undefined,
  avatar: undefined,
  value: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  /** Fires when the remove button — or `Backspace`/`Delete` on a focused removable chip — is
   *  activated. Never fires the chip's own selection out of it: removing and selecting are
   *  different actions on different targets (see the root-element comment below). */
  remove: [];
  /** The two-way pair for `selected`. Does not fire for a chip a `ChipGroup` derives selection
   *  for (a `value` set with a group above it) — the group's own `update:modelValue` is that
   *  chip's source of truth instead. */
  'update:selected': [selected: boolean];
  /** Fires on every toggle, grouped or not — `MultiSelect`'s own `change` is the same shape:
   *  every toggle, not only an uncontrolled one. */
  select: [selected: boolean];
}>();

const slots = useSlots();
const m = useMessages();

/**
 * See `context.ts`. Optional: a `Chip` outside any `ChipGroup` reads nothing from it and behaves
 * entirely off its own props.
 */
const group = inject(CHIP_GROUP_KEY, null);

/** A group derives this chip's selection only when the chip actually has a value to key it by. */
const inGroup = computed(() => group !== null && props.value !== undefined);

/** The group's own `disabled` reaches every chip under it, addressable or not — see `types.ts`. */
const effectiveDisabled = computed(() => props.disabled || group?.value.disabled === true);

/**
 * A controllable `selected`, the same shape `useControllableModel` gives every other stateful
 * control in this package — except keyed to `selected`/`update:selected` rather than
 * `modelValue`/`update:modelValue`, which that composable's signature hard-codes, so it is
 * reimplemented here in miniature rather than reused under a name that does not fit it.
 */
const internalSelected = ref(props.selected ?? false);
watch(
  () => props.selected,
  (value) => {
    if (value !== undefined) internalSelected.value = value;
  }
);
const localSelected = computed<boolean>({
  get: () => (props.selected === undefined ? internalSelected.value : props.selected),
  set: (value) => {
    if (props.selected === undefined) internalSelected.value = value;
    emit('update:selected', value);
  },
});

/** The value actually painted: the group's, when this chip is one of its addressable members. */
const effectiveSelected = computed(() =>
  inGroup.value ? (group?.value.isSelected(props.value as string) ?? false) : localSelected.value
);

/**
 * **A removable chip's root is never the selection toggle, whatever `selectable` says.**
 *
 * The API contract's rule is simple on its face — "a selectable chip is a `<button>`; the remove control
 * is a separate `<button>`" — but taken literally for a chip that is *both* `selectable` and
 * `removable` it would nest a real `<button>` (remove) inside a real `<button>` (root), which is
 * invalid HTML (interactive content cannot contain interactive content) and exactly the trap the
 * private library's own `FilterChip` was built to avoid: its `CLAUDE.md` states the rule outright
 * — "removable mode is display-only for the chip body; only the close button is interactive. Do
 * not make a removable chip itself selectable." This component keeps that rule: `removable` wins,
 * the root is a plain (but still visually "selected" when `selected`/the group says so) `<span>`,
 * and only the remove button is interactive. A chip that needs to be both belongs in a
 * `ChipGroup` of removable, non-selectable tags next to a separate selectable control — not one
 * element playing both roles.
 */
const isInteractiveRoot = computed(() => props.selectable && !props.removable);

/**
 * A removable, non-interactive root still needs to be reachable: "`Backspace`/`Delete` on a
 * focused removable chip's root … emits `remove`" (the API contract) is only possible if the root can be
 * focused at all. `tabindex="0"` does that without giving the element a role it is not (it stays a
 * plain `<span>`, named by its own visible text) — the same lightweight pattern a chip-input's own
 * tag row uses elsewhere, rather than inventing an ARIA role this shape does not have.
 */
const isFocusableRoot = computed(() => props.removable && !effectiveDisabled.value);

const rootTag = computed(() => (isInteractiveRoot.value ? 'button' : 'span'));

/** Only a real button's toggle state takes `aria-pressed` — `<a>` has none, and neither does a
 *  plain `<span>`; see `Button.vue`'s own `ariaPressed` for the same rule on the link form. */
const ariaPressed = computed(() =>
  isInteractiveRoot.value ? String(effectiveSelected.value) : undefined
);

function toggle(): void {
  if (effectiveDisabled.value) return;
  const next = !effectiveSelected.value;
  if (inGroup.value) {
    group?.value.toggle(props.value as string);
  } else {
    localSelected.value = next;
  }
  emit('select', next);
}

function onRootClick(): void {
  if (isInteractiveRoot.value) toggle();
}

/**
 * Shared by the root (when focusable-but-not-a-button) and the remove button — which is a *child*
 * of the root whenever the root is focusable at all (the interactive-button root never renders a
 * remove button; see `isInteractiveRoot`'s comment), so a key handled on the remove button is
 * stopped here too, or it would bubble straight back up to the root's own listener and double-fire.
 */
function onRemoveKey(event: KeyboardEvent): void {
  if (!props.removable || effectiveDisabled.value) return;
  if (event.key === 'Backspace' || event.key === 'Delete') {
    // A `Backspace` with nothing else on the page consuming it can trigger a browser "back"
    // navigation in some contexts; this element is never an input, so nothing else prevents it.
    event.preventDefault();
    event.stopPropagation();
    emit('remove');
  }
}

function onRemoveClick(event: MouseEvent): void {
  // Stops a future ancestor click handler (a consumer's own wrapper) from also reacting — the
  // remove button's own click is the only thing this press should do.
  event.stopPropagation();
  if (effectiveDisabled.value) return;
  emit('remove');
}

if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (props.removable && props.selectable) {
      console.warn(
        '[@eldrajs/ui] <Chip removable selectable> renders a non-interactive root: a removable ' +
          "chip's body is never also the selection toggle (nested buttons are invalid HTML). Put " +
          'a separate selectable control next to the tag instead, or drop one of the two props.'
      );
    }
  });
  watchEffect(() => {
    if (props.avatar !== undefined && props.avatar !== null && props.icon !== undefined) {
      console.warn(
        '[@eldrajs/ui] <Chip avatar icon> ignores `icon`: `avatar` takes priority when both are given.'
      );
    }
  });
}

/**
 * Sizes. `sm` is `MultiSelect`'s own small-chip recipe verbatim (`src/utils/tagRecipe.ts`); `md`
 * is this component's own larger recipe — 2.25rem min height, matching `space-2.5`/`space-3`
 * padding steps and `space-1.5` gap, the same numbers `Button`'s own `md` size scales by.
 */
const SHAPE: Record<ChipSize, string> = {
  sm: TAG_SHAPE,
  md: 'inline-flex min-h-9 items-center gap-1.5 rounded-full text-body-sm',
};

function padding(size: ChipSize, hasRemoveButton: boolean): string {
  if (size === 'sm') return tagPadding(hasRemoveButton);
  return hasRemoveButton ? 'ps-3 pe-1' : 'px-3';
}

/** The leading visual's (icon or avatar) size, matched to the chip's own scale. */
const LEADING_SIZE: Record<ChipSize, string> = { sm: 'size-3.5', md: 'size-4' };

/** Badge's own icon stroke reasoning applies here too: a 0.875rem icon needs a heavier stroke
 * than the package's stock 1.75 to stay legible at that size; `md`'s 1rem icon uses the stock
 * weight `Icon.vue` itself uses. */
const ICON_STROKE_WIDTH: Record<ChipSize, number> = { sm: 2.25, md: 1.75 };

const REMOVE_SIZE: Record<ChipSize, string> = { sm: 'size-6', md: 'size-7' };
const REMOVE_ICON_SIZE: Record<ChipSize, string> = { sm: 'size-3.5', md: 'size-4' };

/**
 * Fill (derived from Badge's States table and Button's press/hover formulas): `surface-strong` at
 * rest, `primary`/`primary-contrast` selected — the same pair Badge's `primary` tone fills with —
 * and Button's own `FILLED_DISABLED` muted treatment once disabled, replacing either colour
 * outright rather than layering over it, so a stale `:hover` rule can never win back a live colour
 * on a dead chip.
 *
 * The hover mixes only ever apply to the root when the root itself is the clickable thing
 * (`isInteractiveRoot`): a removable or purely static chip's body is not a button, and giving it a
 * hover colour would claim an interaction the body does not have — the same reasoning Badge's own
 * "badges are static; they have no hover" rule and `MultiSelect`'s own tag (no hover on the pill
 * itself, only on its remove button) both already follow.
 */
const FILL_SELECTED = 'bg-primary text-primary-contrast';
const FILL_DISABLED = 'bg-surface-strong text-muted cursor-not-allowed';
/** Button's own `primary` hover mix: 14% toward `background`. */
const HOVER_SELECTED =
  'hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]';
/** Button's own `ghost` hover mix, adapted for a solid fill rather than a transparent one: 6%
 *  toward `text` instead of a 94%-transparent overlay of it. */
const HOVER_BASE =
  'hover:bg-[color-mix(in_oklab,var(--eldra-color-surface-strong),var(--eldra-color-text)_6%)]';

const fillClass = computed(() => {
  if (effectiveDisabled.value) return FILL_DISABLED;
  const base = effectiveSelected.value ? FILL_SELECTED : TAG_FILL;
  if (!isInteractiveRoot.value) return base;
  return cx(base, effectiveSelected.value ? HOVER_SELECTED : HOVER_BASE);
});

/** Button's own press, verbatim: the whole control scales to 98% rather than moving, felt rather
 *  than seen (see `Button.vue`'s own comment for why). */
const PRESS = 'active:scale-[0.98] motion-reduce:active:scale-100';

const interactionClass = computed(() => {
  if (effectiveDisabled.value) return '';
  if (isInteractiveRoot.value) return cx('cursor-pointer eldra-focus', PRESS);
  if (isFocusableRoot.value) return 'eldra-focus';
  return '';
});

const rootClass = computed(() =>
  partClass(
    cx(
      SHAPE[props.size],
      padding(props.size, props.removable),
      fillClass.value,
      interactionClass.value,
      'whitespace-nowrap max-w-full'
    ),
    props.classes,
    'root'
  )
);

const hasAvatar = computed(
  () => (props.avatar !== undefined && props.avatar !== null) || slots.avatar !== undefined
);
const hasIcon = computed(
  () => !hasAvatar.value && (props.icon !== undefined || slots.icon !== undefined)
);

const avatarWrapClass = computed(() => partClass('inline-flex shrink-0', props.classes, 'avatar'));
const avatarSizeClass = computed(() => LEADING_SIZE[props.size]);

/**
 * `Avatar`'s own icon/initials fallbacks are drawn for its own sizes (`sm` = 2rem), not for
 * sitting inside a chip's much smaller leading slot (`size-3.5`/`size-4` = 0.875rem/1rem) — passing
 * only `classes: { root: avatarSizeClass }` shrinks the circle but leaves `eldra-avatar-icon-sm`
 * (0.857rem) and `text-avatar-initials-sm` (0.76rem) unchanged, so a failed image (`Avatar` is
 * given `label` as its `name` below, so initials are reachable, not just the icon) nearly fills a
 * 0.875rem box with icon, or overflows it with initials. `Avatar`'s own icon-to-diameter ratio is
 * a consistent 3/7 across every size (0.857/2, 1.071/2.5, 1.5/3.5, 2.571/6 all reduce to 3/7);
 * initials is a consistent 0.38 (0.76/2, 0.95/2.5). These scale that same ratio down to the chip's
 * own leading size instead of guessing a value. `leading-none`/`font-semibold` replace the
 * weight/line-height the overridden `text-avatar-initials-*` utility's own `font` shorthand would
 * otherwise have set — `tailwind-merge` drops that whole utility once its font-size conflicts with
 * the override, not just the size.
 */
const AVATAR_ICON_CLASS: Record<ChipSize, string> = { sm: 'size-1.5', md: 'size-1.75' };
const AVATAR_INITIALS_CLASS: Record<ChipSize, string> = {
  sm: 'text-[0.33rem] leading-none font-semibold',
  md: 'text-[0.38rem] leading-none font-semibold',
};
const avatarIconClass = computed(() => AVATAR_ICON_CLASS[props.size]);
const avatarInitialsClass = computed(() => AVATAR_INITIALS_CLASS[props.size]);

const iconWrapClass = computed(() =>
  partClass(cx(LEADING_SIZE[props.size], 'shrink-0'), props.classes, 'icon')
);

const labelClass = computed(() => partClass('min-w-0 truncate', props.classes, 'label'));

const removeButtonClass = computed(() =>
  partClass(
    cx(TAG_REMOVE_BUTTON, REMOVE_SIZE[props.size], effectiveDisabled.value && 'cursor-not-allowed'),
    props.classes,
    'removeButton'
  )
);
</script>

<template>
  <component
    :is="rootTag"
    data-part="root"
    :class="rootClass"
    :type="isInteractiveRoot ? 'button' : undefined"
    :disabled="isInteractiveRoot ? effectiveDisabled || undefined : undefined"
    :tabindex="isFocusableRoot ? '0' : undefined"
    :aria-pressed="ariaPressed"
    :aria-disabled="!isInteractiveRoot && effectiveDisabled ? 'true' : undefined"
    @click="onRootClick"
    @keydown="onRemoveKey"
  >
    <span v-if="hasAvatar" data-part="avatar" :class="avatarWrapClass">
      <slot name="avatar">
        <Avatar
          :src="avatar"
          :name="label"
          size="sm"
          :decorative="true"
          :classes="{
            root: avatarSizeClass,
            icon: avatarIconClass,
            initials: avatarInitialsClass,
          }"
        />
      </slot>
    </span>
    <span v-else-if="hasIcon" data-part="icon" :class="iconWrapClass">
      <slot name="icon">
        <component
          :is="icon"
          :stroke-width="ICON_STROKE_WIDTH[size]"
          aria-hidden="true"
          focusable="false"
        />
      </slot>
    </span>

    <span data-part="label" :class="labelClass">
      <slot>{{ label }}</slot>
    </span>

    <button
      v-if="removable"
      data-part="removeButton"
      type="button"
      :class="removeButtonClass"
      :aria-label="m.removeTag(label)"
      :disabled="effectiveDisabled || undefined"
      @click="onRemoveClick"
      @keydown="onRemoveKey"
    >
      <!-- Tabler's `x`, sized and stroked like `MultiSelect`'s own tag remove button. -->
      <svg
        :class="REMOVE_ICON_SIZE[size]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  </component>
</template>
