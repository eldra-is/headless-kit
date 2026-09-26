import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Anything `cx` accepts: a class string, a falsy placeholder for a branch that
 * did not apply, or an object whose truthy keys are class names.
 */
export type ClassValue = string | false | null | undefined | Record<string, boolean>;

/**
 * Stock `twMerge` only knows Tailwind's own utilities: it has no idea `text-button-md` is a
 * "font-size" utility, so a consumer's `classes.container: 'text-lg'` used to land *beside* it
 * instead of replacing it, and CSS source order (not the override) decided which one painted.
 *
 * `src/styles/tailwind.css`'s `@utility` rules are invisible to `tailwind-merge` the same way —
 * it never reads the package's CSS, it only pattern-matches class names against its built-in
 * config — so every custom utility that shares a *concern* with a stock group (a font size, a
 * height, a duration, a z-index, an animation, a border radius) is registered here under that
 * group's id. The three with no stock equivalent (`eldra-focus*`, `target-min`, `target-touch`)
 * get their own group ids instead, so they still conflict with each other without conflicting
 * with unrelated utilities.
 *
 * `src/__tests__/custom-utility-coverage.spec.ts` parses every `@utility <name>` out of
 * `tailwind.css` and fails if `cx(name, name)` does not collapse to one token, so a new custom
 * utility that is never added here (as `eldra-link-radius` first shipped) is caught by a test
 * instead of shipping unmerged.
 */
const twMerge = extendTailwindMerge<
  | 'target-min'
  | 'target-touch'
  | 'eldra-scrollbar-hide'
  | 'eldra-focus'
  | 'eldra-focus-always'
  | 'eldra-focus-inset-always'
  | 'eldra-focus-open'
  | 'eldra-focus-proxy'
  | 'eldra-field-invalid'
  | 'eldra-radio-card-selected'
  | 'eldra-switch-thumb-offset'
  | 'eldra-select-match'
  | 'eldra-select-swatch'
  | 'eldra-select-option-active'
  | 'eldra-select-option-selected'
  | 'eldra-variant-pill-selected-line'
  | 'eldra-skeleton'
  | 'eldra-rating-half'
  | 'eldra-image-placeholder-hatch'
  | 'eldra-editor-placeholder-border'
>({
  extend: {
    classGroups: {
      // Type styles (tailwind.css "Type styles" + "Button type"): all `text-*` utilities, so a
      // consumer's `text-lg` replaces `text-button-md` instead of landing beside it.
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'h4',
            'body-lg',
            'body',
            'body-sm',
            'caption',
            'overline',
            'label',
            'code',
            'button-sm',
            'button-md',
            'button-lg',
            'control-sm',
            'control',
            'control-lg',
            'control-mobile',
            'counter',
            'field-note',
            'card-title',
            'switch-label',
            'switch-description',
            'select-group',
            'select-option',
            'select-pill',
            'stepper-value',
            'stepper-value-sm',
            'search-meta',
            'search-title',
            'search-kbd',
            'variant-legend',
            'variant-pill',
            'logo-wordmark',
            'badge',
            'stock-status',
            'price-sm',
            'price-lg',
            'price-current',
            'price-secondary',
            'price-unit',
            'avatar-initials-sm',
            'avatar-initials-md',
            'avatar-initials-lg',
            'avatar-initials-xl',
            'empty-state-title',
            'content-card-title',
            'content-card-excerpt',
            'dialog-title',
          ],
        },
      ],
      // Control heights (tailwind.css "Control heights and targets"): whole class names, not a
      // `h-*` suffix, but the same "h" group as Tailwind's own `h-*` scale.
      h: ['control-h', 'control-h-sm', 'control-h-lg'],
      // The Dialog panel's own width (tailwind.css "Dialog"): whole class names rather than a
      // `w-*` suffix, but Tailwind's own "w" group, so a consumer's `classes.panel: 'w-full'`
      // replaces the clamp instead of landing beside it. The two are mutually exclusive (`size`
      // picks one), so they still need to conflict with each other the same way `eldra-select-
      // panel-height`/`-width` do not need to (those are two different CSS properties).
      w: ['eldra-dialog-width', 'eldra-dialog-width-sm'],
      // The user-icon fallback's size (tailwind.css "Avatar"): whole class names, not a `size-*`
      // suffix, but the same "size" group Tailwind's own `size-*` scale belongs to, so a
      // consumer's `classes.icon: 'size-6'` replaces one of these instead of landing beside it.
      size: [
        'eldra-avatar-icon-sm',
        'eldra-avatar-icon-md',
        'eldra-avatar-icon-lg',
        'eldra-avatar-icon-xl',
      ],
      // No stock Tailwind group covers a minimum-target utility, so each gets its own group.
      'target-min': ['target-min'],
      'target-touch': ['target-touch'],
      // The Tabs list's hidden scrollbar (tailwind.css "Tabs"): no stock group covers hiding a
      // scrollbar either, so it gets its own.
      'eldra-scrollbar-hide': ['eldra-scrollbar-hide'],
      // Border widths (tailwind.css "A field's own boundary" and "The Checkbox box"): whole class
      // names rather than a `border-*` suffix, but the same "border-w" group as Tailwind's own
      // `border`/`border-2`, so a consumer's `border-2` replaces them and — the reason the two
      // checkbox widths exist — the invalid width replaces the ordinary one.
      'border-w': [
        'eldra-field-border',
        'eldra-checkbox-border',
        'eldra-checkbox-border-invalid',
        'eldra-radio-card-border',
        'eldra-switch-track-border',
        'eldra-variant-pill-border',
        'eldra-variant-swatch-ring',
        'eldra-variant-swatch-edge',
        'eldra-editor-placeholder-border',
      ],
      // The field error boundary (tailwind.css "The error boundary of a field"): a pseudo-element
      // inset line with no stock Tailwind equivalent, so it gets its own group.
      'eldra-field-invalid': ['eldra-field-invalid'],
      // The radio Card's selected boundary (tailwind.css "The selected Card's boundary"): the same
      // shape as `eldra-field-invalid` — a pseudo-element inset line with no stock equivalent — so
      // it gets its own group too.
      'eldra-radio-card-selected': ['eldra-radio-card-selected'],
      // The Switch thumb's rest inset (tailwind.css "The Switch thumb's rest position"): a logical
      // `inset-inline-start` with no stock Tailwind equivalent, so it gets its own group too.
      'eldra-switch-thumb-offset': ['eldra-switch-thumb-offset'],
      // The Select popover's own box (tailwind.css "Select"): whole class names rather than a
      // `max-h-*`/`max-w-*` suffix, but Tailwind's own groups, so a consumer's
      // `classes.panel: 'max-h-64'` replaces the height and leaves the width clamp alone.
      'max-h': [
        'eldra-select-panel-height',
        'eldra-search-panel-height',
        'eldra-dialog-max-height',
      ],
      // `max-w-narrow`/`-content`/`-wide` (tailwind.css's `@theme` block, "Container and section"):
      // Tailwind generates these from the `--container-*` theme namespace, not from an `@utility`
      // this package writes, so `custom-utility-coverage.spec.ts`'s scan (which only reads
      // `@utility` names) cannot catch a missing entry here the way it does for the rest of this
      // file — proven by mutation: without this line, `cx('max-w-narrow', 'max-w-full')` keeps
      // both instead of letting `Container`'s own `full` (or a consumer's `classes.root`) win.
      'max-w': ['eldra-select-panel-width', 'max-w-narrow', 'max-w-content', 'max-w-wide'],
      // A filtered option's matched run, and an option's swatch edge: a weight-plus-underline
      // bundle and an inset box-shadow, neither of which maps onto a stock group, so each gets its
      // own. (`font-weight` is stock, but this utility is not only a weight — folding it into that
      // group would let a `font-semibold` beside it drop the underline as well.)
      'eldra-select-match': ['eldra-select-match'],
      'eldra-select-swatch': ['eldra-select-swatch'],
      // The forced-colours boundaries of an active and a selected option row. Two groups, not one:
      // a row can be both at once, and folding them together would let `cx` drop one of them.
      'eldra-select-option-active': ['eldra-select-option-active'],
      'eldra-select-option-selected': ['eldra-select-option-selected'],
      // The sold-out-and-selected pill's inset line (tailwind.css "Variant picker"): no stock
      // group covers it, so it gets its own. Both a pill's and a swatch's own sold-out *line* are
      // inline SVGs in `VariantPicker.vue`, not classes — see that component's own comment.
      'eldra-variant-pill-selected-line': ['eldra-variant-pill-selected-line'],
      // The one focus ring (tailwind.css "The one focus ring"). `eldra-focus` and
      // `eldra-focus-inset` are mutually exclusive — one draws the ring outside the element, the
      // other inside — so they share a group with no stock Tailwind equivalent.
      'eldra-focus': ['eldra-focus', 'eldra-focus-inset'],
      // `eldra-focus-always` is NOT one of those two: it adds the `:focus` rule that makes a text
      // field show the ring on pointer focus as well, and it carries no base of its own. Putting
      // it in the same group as `eldra-focus` made `cx('eldra-focus eldra-focus-always')` collapse
      // to `eldra-focus-always` alone, which left an Input with a `:focus` rule and no ring to
      // grow — the outline, the infill and the whole transition list live in `eldra-focus`. It
      // gets its own group, so it still cannot be written twice. `eldra-focus-inset-always` is the
      // same modifier for the inset ring (a select's search field), and the two are mutually
      // exclusive — an element draws its ring either outside or inside — so they share this group.
      'eldra-focus-always': ['eldra-focus-always', 'eldra-focus-inset-always'],
      // `eldra-focus-proxy` is the third of that family and gets a group of its own for the same
      // reason: it is a *modifier* of `eldra-focus`, adding the rule that turns the ring on when a
      // descendant is focus-visible (the Checkbox's visually hidden input inside its drawn box).
      // It carries no base, so sharing a group with what it modifies would let `cx` drop the ring
      // and keep only the trigger. A modifier never shares a group with the thing it modifies.
      'eldra-focus-proxy': ['eldra-focus-proxy'],
      // `eldra-focus-open` is the fourth of that family and gets its own group for the same reason
      // again: it is a *modifier* of `eldra-focus` that turns the ring on while the element's own
      // `aria-expanded` is `"true"` (a Select trigger with its popover open, which a pointer press
      // leaves focused but not `:focus-visible`). It carries no base, so sharing a group with what
      // it modifies would let `cx` drop the ring and keep only the trigger.
      'eldra-focus-open': ['eldra-focus-open'],
      // Link's focus-ring corner radius (tailwind.css "eldra-link-radius"): the same "rounded"
      // group as `rounded-*`, so a consumer's `classes.root: 'rounded-full'` replaces it.
      rounded: ['eldra-link-radius', 'eldra-select-check-radius'],
      // Motion durations (tailwind.css "Motion"): the same "duration" group as `duration-150`.
      duration: ['duration-fast', 'duration-base', 'duration-slow'],
      // The skeleton shimmer (tailwind.css "The skeleton shimmer"): a `surface-strong` fill plus a
      // moving highlight `::after`, no stock Tailwind equivalent, so it gets its own group. Shared
      // by `Price`'s loading state and, later, `Skeleton` itself.
      'eldra-skeleton': ['eldra-skeleton'],
      // The Rating half star's clip overlay (tailwind.css "Rating"): a one-off `clip-path` with no
      // stock Tailwind group, so it gets its own.
      'eldra-rating-half': ['eldra-rating-half'],
      // The Image placeholder's diagonal hatching (tailwind.css "The live 'No image' placeholder's
      // hatching"): a `background-color` plus a repeating-gradient `background-image`, no stock
      // group, so it gets its own.
      'eldra-image-placeholder-hatch': ['eldra-image-placeholder-hatch'],
      // Layers (tailwind.css "Layers"): the same "z" group as `z-10`.
      z: ['z-sticky', 'z-popover', 'z-drawer', 'z-dialog', 'z-toast'],
      // The button spinner's keyframes (tailwind.css "The Button spinner"): the same "animate"
      // group as `animate-spin`.
      animate: [
        'animate-eldra-spin',
        'animate-eldra-pulse',
        'animate-eldra-popover-in',
        'animate-eldra-dialog-in',
        'animate-eldra-dialog-in-reduced',
      ],
    },
  },
});

/**
 * Join class values, then resolve Tailwind conflicts so the last one wins.
 *
 * Every component builds its classes with this, which is what makes the
 * `classes` prop work without `!important`: a consumer's `px-6` replaces the
 * component's `px-4` instead of landing beside it and losing to source order.
 */
export function cx(...inputs: ClassValue[]): string {
  const parts: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      parts.push(input);
      continue;
    }
    for (const [name, enabled] of Object.entries(input)) {
      if (enabled) parts.push(name);
    }
  }
  return twMerge(parts.join(' '));
}

/**
 * The classes for one named part of a component: the part's own classes with
 * the consumer's override for that part merged over them.
 *
 * `Part` is the union of the part names in the component's spec anatomy, so a
 * typo in a `classes` key is a type error rather than a silently ignored
 * override.
 */
export function partClass<P extends string>(
  base: string,
  classes: Partial<Record<P, string>> | undefined,
  part: P
): string {
  return cx(base, classes?.[part]);
}
