/**
 * The "small chip" recipe (spec "Multi-select" → Sizes, Tags row): "min 1.75rem tall, 0.8125rem
 * text, 0.625rem start padding, `surface-strong` fill, `radius-full`. Remove button 1.5rem circle
 * with a 0.875rem icon (hover `text` at 11%)."
 *
 * `MultiSelect.vue`'s own tag row and `Chip`'s `sm` size (`src/components/chip/Chip.vue`) draw the
 * exact same pill, so the class strings live here once rather than twice — the API contract for
 * `Chip` asks for it explicitly ("reuse the tag recipe: extract it into a shared constant if that
 * avoids duplicating class strings"). It sits in `utils/`, not under either component's folder, so
 * neither one appears to depend on the other: `MultiSelect` shipped first and `Chip` reuses its
 * visual language, but the recipe itself belongs to neither.
 */
export const TAG_FILL = 'bg-surface-strong text-text';

/** The pill shape and type: rounded-full, min 1.75rem tall, the caption size, `space-1` gap. */
export const TAG_SHAPE = 'inline-flex min-h-7 items-center gap-1 rounded-full text-caption';

/**
 * Start padding is 0.625rem either way; the end padding is the remove button's own room, so a tag
 * with no remove button is padded evenly instead of ending short.
 */
export function tagPadding(hasRemoveButton: boolean): string {
  return hasRemoveButton ? 'ps-2.5 pe-0.5' : 'px-2.5';
}

/** The remove button: a 1.5rem circle, `muted` at rest, `text` on hover at 11% opacity. */
export const TAG_REMOVE_BUTTON =
  'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted ' +
  'hover:text-text hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)] ' +
  'eldra-focus';

/** The remove button's icon: Tabler's `x` at 0.875rem, 1.75 stroke. */
export const TAG_REMOVE_ICON_SIZE = 'size-3.5';
