import { cx, partClass } from '../../utils/cx';
import type { SelectOption, SelectPart } from './types';

/**
 * The `classes` prop of any control in the select family.
 *
 * `MultiSelectPart` is a superset of `SelectPart`, so a multi-select's own `classes` object is
 * assignable to this without a cast — and the panel parts are named the same in both controls,
 * which is the point: a consumer styles `option` once and both controls take it.
 */
export type PanelClasses = Partial<Record<SelectPart, string>>;

/**
 * Every class the **panel** of a select draws, in one place, because `Select` and `MultiSelect`
 * draw the same panel. They are plain functions rather than computeds so that both `SelectPanel`
 * (which renders the panel) and a trigger (which reuses an option's swatch and icon for the chosen
 * option's mark) can call them.
 *
 * Each ends in `partClass`, so a consumer's per-part override merges over ours through
 * `tailwind-merge` rather than landing beside it.
 */

/**
 * The popover (spec "Select" → Sizes, Popover row). Not a dialog and never teleported: it is a
 * non-modal popup (non-negotiable 2), positioned by `useFloating` against the trigger and kept
 * inside the component's own root so a consumer's `classes` and `data-part` selectors still reach
 * it. `z-popover` puts it over the sticky header, `overflow-hidden` keeps the search field's top
 * corners on the popover's radius, and the list — not the panel — is what scrolls.
 */
export function panelClass(classes: PanelClasses | undefined): string {
  return partClass(
    cx(
      'absolute z-popover flex flex-col overflow-hidden',
      'eldra-select-panel-height eldra-select-panel-width',
      'rounded-md border border-border bg-background shadow-md',
      'animate-eldra-popover-in'
    ),
    classes,
    'panel'
  );
}

/** Spec "Select" → Sizes, Search field: 2.5rem tall, text from 2.125rem, inset focus ring. */
export function searchClass(classes: PanelClasses | undefined): string {
  return partClass(
    cx(
      'control-h w-full min-w-0 rounded-t-md bg-transparent ps-8.5 pe-3',
      'text-control-sm max-md:text-control-mobile text-text placeholder:text-muted',
      'eldra-focus-inset eldra-focus-inset-always'
    ),
    classes,
    'search'
  );
}

export function listboxClass(classes: PanelClasses | undefined, hasOptions: boolean): string {
  return partClass(
    cx(
      'overflow-y-auto overscroll-contain',
      // An empty listbox still renders (see `hasOptions`), so it takes no room of its own.
      hasOptions ? 'min-h-0 flex-1 p-1' : 'h-0'
    ),
    classes,
    'listbox'
  );
}

/** Spec: "Every group after the first gets a 1px `border` hairline and 0.25rem gap above it." */
export function groupClass(classes: PanelClasses | undefined, index: number): string {
  return partClass(cx(index > 0 && 'mt-1 border-t border-border'), classes, 'group');
}

export function groupLabelClass(classes: PanelClasses | undefined, index: number): string {
  return partClass(
    cx('text-select-group text-muted px-2 pb-1', index > 0 ? 'pt-2.5' : 'pt-2'),
    classes,
    'groupLabel'
  );
}

/**
 * Spec "Select" → Sizes, Option row, and → States for active / selected / disabled.
 *
 * `multiple` is the one difference the spec draws between the two controls' rows: a multi-select's
 * selection is carried by the filled box, so its label is "weight 500 (not 600)" (spec
 * "Multi-select" → States, Option selected).
 */
export function optionClass(
  classes: PanelClasses | undefined,
  option: SelectOption,
  state: { active: boolean; selected: boolean; multiple: boolean }
): string {
  return partClass(
    cx(
      'flex min-h-9 scroll-my-1 items-center gap-2 rounded-sm px-2 py-1.5 text-select-option',
      // Forced colours replaces every fill and drops the weight difference, so the two states that
      // are otherwise carried by a fill and by weight each get a real boundary of their own there.
      state.active && 'bg-surface-strong eldra-select-option-active',
      state.selected && (state.multiple ? 'font-medium' : 'font-semibold'),
      state.selected && 'eldra-select-option-selected',
      option.disabled === true ? 'text-muted cursor-not-allowed' : 'text-text cursor-pointer'
    ),
    classes,
    'option'
  );
}

export function optionLabelClass(classes: PanelClasses | undefined, option: SelectOption): string {
  return partClass(cx('block', option.disabled === true && 'line-through'), classes, 'optionLabel');
}

export function optionHintClass(classes: PanelClasses | undefined): string {
  return partClass('text-caption text-muted block', classes, 'optionHint');
}

const META_TONE = {
  warning: 'text-warning font-semibold',
  danger: 'text-danger font-semibold',
} as const;

export function optionMetaClass(classes: PanelClasses | undefined, option: SelectOption): string {
  return partClass(
    cx(
      'ms-3 shrink-0 text-caption tabular-nums',
      option.metaTone === undefined ? 'text-muted' : META_TONE[option.metaTone]
    ),
    classes,
    'optionMeta'
  );
}

export function optionSwatchClass(classes: PanelClasses | undefined): string {
  return partClass('size-4 shrink-0 rounded-full eldra-select-swatch', classes, 'optionSwatch');
}

export function optionIconClass(classes: PanelClasses | undefined): string {
  return partClass('size-4.5 shrink-0', classes, 'optionIcon');
}

/** Spec "Select" → States, Option selected: "check mark in `text` (never colour alone)". */
export function optionCheckClass(classes: PanelClasses | undefined): string {
  return partClass('size-4.5 shrink-0 text-text', classes, 'optionCheck');
}

/**
 * A multi-select option's checkbox (spec "Multi-select" → Sizes, "Checkbox in option"): "1rem
 * square, 1.5px `border-strong`, 0.25rem radius, `background` fill. Checked: `primary` fill and
 * border with a `primary-contrast` tick."
 *
 * It is the `optionCheck` part — the same part a single select's check mark is — so "the mark that
 * says this row is chosen" is one styling hook in both controls. The border width is `Checkbox`'s
 * own `eldra-checkbox-border`, so a consumer that has restyled their checkboxes' boundary has
 * restyled these; the radius is the spec's smaller 0.25rem, on its own variable.
 */
export function optionBoxClass(
  classes: PanelClasses | undefined,
  state: { selected: boolean; disabled: boolean }
): string {
  return partClass(
    cx(
      'relative inline-flex size-4 shrink-0 items-center justify-center',
      'eldra-checkbox-border eldra-select-check-radius',
      // Spec "Multi-select" -> Behaviour & motion: "The checkbox fill and tick scale over
      // `duration-fast`." No focus ring on this element, so nothing else owns its transition list;
      // reduced motion needs no class, because `tokens.css` zeroes the duration.
      'transition-colors duration-fast ease-out',
      state.selected
        ? 'bg-primary border-primary'
        : state.disabled
          ? 'bg-surface-strong border-border border-dashed'
          : 'bg-background border-border-strong'
    ),
    classes,
    'optionCheck'
  );
}

/** Spec "Select" → Sizes, Empty state: "0.875rem, `muted`, centred, padding 1rem 0.75rem". */
export function emptyClass(classes: PanelClasses | undefined): string {
  return partClass('px-3 py-4 text-center text-body-sm text-muted', classes, 'empty');
}

/**
 * The tick inside that box (spec "Multi-select" → Sizes: "a `primary-contrast` tick (0.25 × 0.5rem,
 * 2px stroke)").
 *
 * The svg is drawn at the tick's own size — 0.5rem × 0.25rem, which is `w-2 h-1` on the 0.25rem
 * spacing step — over an 8 × 4 viewBox, so one viewBox unit is one pixel of the drawn mark and
 * `stroke-width="2"` is the spec's 2px. (The same relationship `Checkbox` has at its own larger
 * size; a 10-unit viewBox squeezed into 0.5rem would render that same `2` as 1.6px.)
 *
 * It is always rendered and scaled from 0, rather than added and removed, so it can grow in over
 * `duration-fast` the way `Checkbox`'s does.
 */
export function optionTickClass(selected: boolean): string {
  return cx(
    'text-primary-contrast pointer-events-none h-1 w-2 transition-transform duration-fast ease-out',
    selected ? 'scale-100' : 'scale-0'
  );
}
