import { getCurrentInstance } from 'vue';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Anything `cx` accepts: a class string, a falsy placeholder for a branch that
 * did not apply, or an object whose truthy keys are class names.
 *
 * An **array is deliberately not in this union**, and neither is it in a
 * `classes` prop's own `Partial<Record<Part, string>>` type: this package's
 * `classes` contract is one string per part, so a TypeScript consumer writing
 * `classes: { root: ['a', 'b'] }` gets a type error where it belongs — at the
 * call. `cx` still *flattens* one at runtime (see `flattenClassValue` below),
 * and `partClass` warns about it in dev, because the type cannot help a
 * JavaScript consumer, a `v-bind` of an untyped object, or a value that arrived
 * from JSON.
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
  | 'eldra-accordion-chevron'
  | 'eldra-accordion-panel'
  | 'eldra-tooltip-arrow'
  | 'eldra-carousel-slide'
  | 'eldra-carousel-track'
  | 'eldra-carousel-dot'
  | 'eldra-range-thumb'
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
            'accordion-title',
            'drawer-title',
            'tooltip',
            'toast-title',
            'search-modal-field',
            'search-modal-foot',
            'search-modal-kbd',
          ],
        },
      ],
      // Control heights (tailwind.css "Control heights and targets"): whole class names, not a
      // `h-*` suffix, but the same "h" group as Tailwind's own `h-*` scale.
      h: ['control-h', 'control-h-sm', 'control-h-lg', 'eldra-range-track'],
      // The Range slider rail's own touch band (tailwind.css "Range slider"): a `min-height` with
      // a container-query step, in Tailwind's own `min-h` group so a consumer's `min-h-0` on the
      // rail replaces it rather than landing beside it.
      'min-h': ['eldra-range-rail'],
      // The gutter that keeps a thumb inside the control (tailwind.css "Range slider"): a
      // `padding-inline` in Tailwind's own `px` group, so `classes.group: 'px-0'` replaces it.
      px: ['eldra-range-gutter'],
      // The Dialog panel's own width (tailwind.css "Dialog"): whole class names rather than a
      // `w-*` suffix, but Tailwind's own "w" group, so a consumer's `classes.panel: 'w-full'`
      // replaces the clamp instead of landing beside it. The two are mutually exclusive (`size`
      // picks one), so they still need to conflict with each other the same way `eldra-select-
      // panel-height`/`-width` do not need to (those are two different CSS properties).
      // `eldra-drawer-width` (tailwind.css "Drawer") is the same shape: a consumer's
      // `classes.panel: 'w-full'` should replace the width-plus-viewport-cap-plus-full-screen-
      // media-query utility outright, not land beside it.
      w: [
        'eldra-dialog-width',
        'eldra-dialog-width-sm',
        'eldra-drawer-width',
        'eldra-toast-width',
        'eldra-search-modal-width',
      ],
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
        'eldra-search-modal-max-height',
      ],
      // The Search modal's own position (tailwind.css "Search modal"): "8vh from the top, centred
      // horizontally" on desktop, no margin (full screen) below 48rem — one bundled `margin`
      // shorthand, the same technique `eldra-drawer-width` uses for its own viewport exception, in
      // Tailwind's own `m` group so a consumer's `classes.root: 'm-0'` replaces it outright.
      m: ['eldra-search-modal-position'],
      // `max-w-narrow`/`-content`/`-wide` (tailwind.css's `@theme` block, "Container and section"):
      // Tailwind generates these from the `--container-*` theme namespace, not from an `@utility`
      // this package writes, so `custom-utility-coverage.spec.ts`'s scan (which only reads
      // `@utility` names) cannot catch a missing entry here the way it does for the rest of this
      // file — proven by mutation: without this line, `cx('max-w-narrow', 'max-w-full')` keeps
      // both instead of letting `Container`'s own `full` (or a consumer's `classes.root`) win.
      // `eldra-container-narrow`/`-content`/`-wide` (tailwind.css, "Container's own max-width
      // utilities") are `Container`'s actual width utilities — real `@utility` declarations, so
      // `custom-utility-coverage.spec.ts` does catch a missing entry for these on its own — but they
      // still belong in this same group: they are mutually exclusive with each other, with the
      // three stock ones above, with `max-w-none` (`Container`'s own `full`), and with a consumer's
      // `classes.root` override.
      'max-w': [
        'eldra-select-panel-width',
        'max-w-narrow',
        'max-w-content',
        'max-w-wide',
        'eldra-container-narrow',
        'eldra-container-content',
        'eldra-container-wide',
      ],
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
      // The revalidating dim (tailwind.css "A value that is still on screen…"): the same "opacity"
      // group as `opacity-90`, so a consumer's own `opacity-*` override on a dimmed part replaces
      // the dim instead of landing beside it and losing to source order.
      opacity: ['eldra-revalidating'],
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
      // The Tooltip arrow's shape (tailwind.css "Tooltip"): a sized, rotated, filled square with no
      // stock Tailwind group, so it gets its own.
      'eldra-tooltip-arrow': ['eldra-tooltip-arrow'],
      // Layers (tailwind.css "Layers"): the same "z" group as `z-10`.
      z: ['z-sticky', 'z-popover', 'z-drawer', 'z-dialog', 'z-toast'],
      // Accordion's chevron rotation and panel fade (tailwind.css "Accordion"): each a bundled
      // rule with no stock Tailwind equivalent, so each gets its own group, the same shape as
      // `eldra-skeleton`.
      'eldra-accordion-chevron': ['eldra-accordion-chevron'],
      'eldra-accordion-panel': ['eldra-accordion-panel'],
      // A Carousel slide's own sizing (tailwind.css "Carousel"): a `flex`/width/`scroll-snap-align`
      // bundle with no stock Tailwind equivalent, so it gets its own group, the same shape as
      // `eldra-skeleton`. A Carousel dot's visible ring/pill shape is the same shape again.
      'eldra-carousel-slide': ['eldra-carousel-slide'],
      // The track's own per-view switch (`eldra-carousel-track`): three container-query steps that
      // resolve `--eldra-carousel-per-view` from the inline properties `carouselPerViewStyle` binds
      // (see its own comment) — a custom-property declaration bundle with no stock Tailwind group,
      // so it gets its own, the same shape as `eldra-carousel-slide` above.
      'eldra-carousel-track': ['eldra-carousel-track'],
      'eldra-carousel-dot': ['eldra-carousel-dot'],
      // A Range slider thumb's own shape (tailwind.css "Range slider"): the circle's size, its
      // 1.5px edge, the hover/drag halo and the pointer target in one bundle with no stock
      // Tailwind equivalent, so it gets its own group, the same shape as `eldra-carousel-dot`.
      'eldra-range-thumb': ['eldra-range-thumb'],
      // The button spinner's keyframes (tailwind.css "The Button spinner"): the same "animate"
      // group as `animate-spin`.
      animate: [
        'animate-eldra-spin',
        'animate-eldra-pulse',
        'animate-eldra-popover-in',
        'animate-eldra-dialog-in',
        'animate-eldra-dialog-in-reduced',
        'animate-eldra-drawer-in-right',
        'animate-eldra-drawer-in-left',
        'animate-eldra-toast-in',
        'animate-eldra-lightbox-in',
      ],
    },
  },
});

/**
 * Flattens one `cx` input into the class names it contributes.
 *
 * The array branch is the one that is not in `ClassValue`, and it exists
 * because the alternative is silent nonsense rather than an error. `Object.
 * entries(['flex', 'gap-4'])` yields `[['0', 'flex'], ['1', 'gap-4']]`, so the
 * object branch below used to read an array's *indices* as class names and emit
 * `"0 1"` — two classes that style nothing, in place of the two the consumer
 * wrote. Flattening (recursively, so a nested array works the way Vue's own
 * `:class` array syntax does) is what a caller passing one always meant;
 * `partClass` is where it also gets told, in dev, that this package's `classes`
 * prop takes a string per part.
 */
function flattenClassValue(input: unknown, out: string[]): void {
  if (!input) return;
  if (typeof input === 'string') {
    out.push(input);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) flattenClassValue(item, out);
    return;
  }
  if (typeof input !== 'object') return;
  for (const [name, enabled] of Object.entries(input)) {
    if (enabled) out.push(name);
  }
}

/**
 * Join class values, then resolve Tailwind conflicts so the last one wins.
 *
 * Every component builds its classes with this, which is what makes the
 * `classes` prop work without `!important`: a consumer's `px-6` replaces the
 * component's `px-4` instead of landing beside it and losing to source order.
 */
export function cx(...inputs: ClassValue[]): string {
  const parts: string[] = [];
  for (const input of inputs) flattenClassValue(input, parts);
  return twMerge(parts.join(' '));
}

/**
 * The name of the component whose render is currently running, for a dev
 * warning's sake only.
 *
 * `partClass` is called from a `computed` in every component, and a component's
 * class computeds are first evaluated while that component renders — which is
 * exactly when Vue has a current instance (`getCurrentInstance()` reads the
 * rendering instance as well as the setup one). So the name is available
 * without every one of the ~60 call sites passing it, and a call from outside a
 * render (a consumer composing classes in a plain function) still degrades to a
 * readable label rather than throwing.
 *
 * `name` before `__name`: `name` is what a component sets explicitly, `__name`
 * what the SFC compiler derives from the filename.
 */
function currentComponentName(): string {
  const type = getCurrentInstance()?.type as { name?: string; __name?: string } | undefined;
  return type?.name ?? type?.__name ?? 'an @eldrajs/ui component';
}

/**
 * Parts already warned about, keyed by component **and** part: one warning per
 * component/part pair, not one per render — `partClass` runs on every render of
 * every component, so an unkeyed `console.warn` would flood a dev console with
 * the same line hundreds of times, which is how a warning stops being read.
 */
const warnedArrayParts = new Set<string>();

/**
 * Warns, once, that a `classes` part was given an array (see
 * `flattenClassValue` for what happens to it).
 *
 * Dev only (`import.meta.env?.DEV`, the same guard `formatDate`,
 * `Section`, `Chip`, `Image`, `Drawer`, `Popover` and `Tooltip` use for their
 * own warnings), so a production bundle carries no message text and does
 * nothing at runtime: this is a wrong-shape-of-prop mistake a developer fixes
 * once, never a condition a visitor's browser should spend anything on.
 */
function warnArrayClassesValue(part: string): void {
  if (!import.meta.env?.DEV) return;
  const component = currentComponentName();
  const key = `${component}.${part}`;
  if (warnedArrayParts.has(key)) return;
  warnedArrayParts.add(key);
  console.warn(
    `[@eldrajs/ui] ${component} received an array for \`classes.${part}\`. Every \`classes\` ` +
      'part takes a single class string — the array is flattened for you, but pass ' +
      `\`classes: { ${part}: 'a b' }\` (or a template literal) instead.`
  );
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
  const override = classes?.[part] as unknown;
  // `Partial<Record<P, string>>` says this is a string, so the `Array.isArray`
  // check is about the callers TypeScript cannot reach: a JavaScript consumer, a
  // `v-bind` of an untyped object, a `classes` value that came out of JSON. The
  // array is flattened by `cx` either way (`flattenClassValue`); this is only
  // where the developer is told, once, that the prop takes a string per part.
  if (Array.isArray(override)) {
    warnArrayClassesValue(part);
    return cx(base, ...(override as ClassValue[]));
  }
  return cx(base, override as ClassValue);
}
