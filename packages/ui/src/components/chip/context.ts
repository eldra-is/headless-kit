import type { ComputedRef, InjectionKey } from 'vue';

/**
 * What a `ChipGroup` tells the `Chip`s inside it.
 *
 * A `ChipGroup` does not render its children — a consumer places `<Chip>`s in its default slot,
 * same as `ButtonGroup` — so a child cannot be told its selected state or how to toggle through
 * props the group would otherwise have to thread down manually. Context is what lets a bare
 * `<Chip value="wool" selectable>` inside a `<ChipGroup>` need no wiring of its own: it injects
 * this optionally (`inject(CHIP_GROUP_KEY, null)`), and only a `Chip` with both a `value` and a
 * group above it defers to it — everywhere else, `Chip`'s own `selected` prop and
 * `update:selected` emit are the only source of truth (see `Chip.vue`'s own comment).
 */
export interface ChipGroupContext {
  /** Whether `value` is in the group's `modelValue`. */
  isSelected: (value: string) => boolean;
  /** Flips `value` in the group's `modelValue` and emits `update:modelValue`. */
  toggle: (value: string) => void;
  /** The group's own `disabled`, which a member `Chip` combines with its own (either disables it). */
  disabled: boolean;
}

/** The key a `ChipGroup` provides its `ChipGroupContext` on. */
export const CHIP_GROUP_KEY: InjectionKey<ComputedRef<ChipGroupContext>> =
  Symbol('eldra-ui:chip-group');
