/**
 * Slides per view at each breakpoint (spec "Carousel" → Properties, `perView` row: "Product rows:
 * `{ base: 1.25, md: 3, lg: 4 }` so mobile shows a peek of the next card"). `md` is the 48rem edge
 * — the same one `Container`'s own gutter step reads as `@tablet` — and `lg` is the 64rem edge
 * `Container` reads as `@content` (the desktop block width the spec's own product-row formula,
 * `(100% − 3 × 1rem) / 4`, is written against). Either may be omitted to keep the narrower
 * breakpoint's own value at that width.
 */
export interface CarouselPerViewBreakpoints {
  base: number;
  md?: number;
  lg?: number;
}

/**
 * `header` (default): arrows sit in the block header, beside the `header` slot's own heading —
 * the product-row variant. `below`: a control bar under the track holds Pause/Play, dots, then
 * the arrows with the counter between them — the single-slide gallery variant (spec "Carousel" →
 * Variants).
 */
export type CarouselControls = 'header' | 'below';

/**
 * The parts a consumer can restyle through `Carousel`'s `classes`, named after the spec's own
 * anatomy (`root`, `track`, `slide`, `prev`, `next`, `dots`, `dot`, `counter`, `pause`), plus
 * `header` — the row `controls: 'header'` renders for the arrows and the `header` slot, which the
 * spec's own numbered anatomy does not name but this component does render and style through the
 * same prop as everything else. `slide` is not an element `Carousel` renders itself: it is applied
 * to each of the default slot's own top-level children (see `Carousel.vue`'s own comment), so a
 * `classes.slide` override reaches them the same way `data-part="slide"` and `aria-roledescription`
 * do. `instructions` is the visually hidden keyboard hint the root's own `aria-describedby` points
 * at, rendered only while the slides hold something focusable and the roving keyboard is therefore
 * live (see `Carousel.vue`'s own `instructionsId` comment) — it is not in the spec's anatomy
 * either, and restyling it is almost always a mistake, but a consumer replacing the sentence's own
 * `sr-only` treatment (a visible instruction line, say) should not have to fork the component.
 */
export type CarouselPart =
  | 'root'
  | 'header'
  | 'instructions'
  | 'track'
  | 'slide'
  | 'prev'
  | 'next'
  | 'dots'
  | 'dot'
  | 'counter'
  | 'pause';

export interface CarouselProps {
  /**
   * The carousel's accessible name (spec "Carousel" → Properties, `label` row: "Accessible name
   * of the carousel (or it's labelled by the visible heading)"), put on the
   * `<section aria-roledescription="carousel">` wrapper as `aria-label`. Package convention: an
   * accessible-name-only prop is named `ariaLabel`, never `label` — the block's own visible
   * heading is the `header` slot's content, not a prop this component owns.
   */
  ariaLabel: string;
  /**
   * Slides per view — a single number for every breakpoint, or `{ base, md, lg }`. Default `1.25`
   * (a peek of the next slide, ~80% width). Product rows: `{ base: 1.25, md: 3, lg: 4 }`. Never
   * reactive to viewport width in JavaScript: `Carousel.vue` turns this into container-query
   * classes once, so resizing costs nothing.
   */
  perView?: number | CarouselPerViewBreakpoints;
  /** `header` (default) or `below`. See `CarouselControls`. */
  controls?: CarouselControls;
  /** Shows dots, one per slide. Spec: "Use only for single-slide galleries." Default `false`. */
  dots?: boolean;
  /** Shows the "n / total" counter between the arrows. Default `false`. */
  counter?: boolean;
  /**
   * Milliseconds between automatic advances; `0` (default) is off. Any non-zero value always
   * renders the Pause/Play button (WCAG 2.2.2), regardless of `controls`/`dots`/`counter`, and
   * never starts under `prefers-reduced-motion: reduce` (spec "Carousel" → Behaviour & motion).
   * Spec Do/Don't: "Don't autoplay product rows" — never set this alongside `controls: 'header'`.
   */
  autoplay?: number;
  /**
   * Enables mouse/pen pointer drag on the track — grab the track and drag it, released with a
   * snap to the nearest slide (operator ruling: "the carousel should be
   * draggable/swipeable"). Default `true`. Touch already swipes for free through native
   * scroll-snap regardless of this prop; it only governs the added pointer-drag behaviour. See
   * `useCarousel`'s own drag state machine for the mechanics.
   */
  draggable?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<CarouselPart, string>>;
}
