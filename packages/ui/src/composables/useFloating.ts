import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating as useFloatingUi,
  type Middleware,
  type Placement,
  type ReferenceElement,
} from '@floating-ui/vue';
import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';

/**
 * Where the panel goes.
 *
 * `auto` and `above` are the design spec's own words (Select and Multi-select take
 * `placement: "auto" | "above"`): `auto` opens below and flips above when there is no room, and
 * `above` always opens above — the footer's selectors, where below is off-screen by definition. The
 * remaining values are `@floating-ui/dom` placements for anything that wants to be explicit —
 * `top-end`/`bottom-end` are `Tooltip`'s own `align="end"`, added alongside the `-start` pair
 * already here for `align="start"`. The `left`/`right` family is for a panel that opens beside its
 * reference (a submenu, a toolbar flyout); like every explicit placement it flips to the other side.
 */
export type FloatingPlacement =
  | 'auto'
  | 'above'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end';

export interface UseFloatingOptions {
  /**
   * Default `'auto'` — below, flipping above when it does not fit. A ref or getter is followed: the
   * panel repositions when it changes.
   */
  placement?: MaybeRefOrGetter<FloatingPlacement>;
  /** Gap between the reference and the panel, in pixels. Default `4` (the spec's 0.25rem). Followed
   *  when a ref or getter. */
  offset?: MaybeRefOrGetter<number | undefined>;
  /** The least room `shift` keeps between the panel and the viewport edge, in pixels. Default `8`.
   *  Followed when a ref or getter. */
  padding?: MaybeRefOrGetter<number | undefined>;
  /**
   * Tie the panel's width to the reference's.
   *
   * `true` adds a `minWidth` equal to the reference's, so a panel is never narrower than the
   * control it belongs to — a *minimum* rather than a fixed width, because that is what the Select
   * spec asks for: "Min width = trigger, grows to fit its content up to min(22rem, 90vw)", where
   * the upper clamp is the panel's own `max-width` rather than anything this composable sets.
   *
   * `'exact'` adds a `maxWidth` to match, for a panel whose spec says it *matches* its control —
   * the Search bar's results panel ("Matches the field's width"). It has to be said rather than
   * inherited: a panel positioned against the viewport has the viewport as its containing block,
   * so nothing else would stop it growing to the full width of the window.
   */
  matchWidth?: boolean | 'exact';
  /** Override the flipping that the placement implies: on for `auto`, off for `above`. */
  flip?: boolean;
  /**
   * Which coordinate space the returned `top`/`left` are in, and the `position` they come with.
   * Default `'absolute'` — the panel is positioned against its nearest positioned ancestor, which
   * is what a panel rendered inside its own control needs.
   *
   * `'fixed'` is for a panel that has been moved out of the control's subtree (a `<Teleport>` to
   * `body`): coordinates are then relative to the **viewport**, so nothing between the control and
   * the page root — a scrolled column, a transformed card — can shift the panel off its trigger.
   * `autoUpdate` keeps it aligned either way: it observes every scrollable ancestor of the
   * reference (`ancestorScroll`), the window (`ancestorResize`), and both elements' own sizes,
   * so a panel fixed to the viewport still follows a trigger that scrolls under it.
   */
  strategy?: 'absolute' | 'fixed';
}

export interface UseFloatingReturn {
  /**
   * Inline styles for the panel: `position`, `top`, `left`, and — under `matchWidth` — `minWidth`,
   * plus `maxWidth` when it is `'exact'`.
   */
  styles: ComputedRef<Record<string, string>>;
  /** The placement actually used, after flipping. */
  placement: ComputedRef<string>;
  /** Reposition now. Positions are kept current automatically while both elements are mounted. */
  update(): void;
}

/** What each of the spec's two named placements means to `@floating-ui/dom`. */
const RESOLVED: Record<FloatingPlacement, { placement: Placement; flip: boolean }> = {
  auto: { placement: 'bottom-start', flip: true },
  above: { placement: 'top-start', flip: false },
  bottom: { placement: 'bottom', flip: true },
  'bottom-start': { placement: 'bottom-start', flip: true },
  'bottom-end': { placement: 'bottom-end', flip: true },
  top: { placement: 'top', flip: true },
  'top-start': { placement: 'top-start', flip: true },
  'top-end': { placement: 'top-end', flip: true },
  left: { placement: 'left', flip: true },
  'left-start': { placement: 'left-start', flip: true },
  'left-end': { placement: 'left-end', flip: true },
  right: { placement: 'right', flip: true },
  'right-start': { placement: 'right-start', flip: true },
  'right-end': { placement: 'right-end', flip: true },
};

/**
 * Positions a floating panel against the element that opened it — the one piece of every popup in
 * this package that has to measure the page.
 *
 * It is a thin wrap of `@floating-ui/vue`: `autoUpdate` keeps the position current while both
 * elements are mounted (scrolling, resizing, an ancestor moving), `offset` sets the gap, `flip`
 * turns the panel above the trigger when there is no room below, `shift` keeps it inside the
 * viewport, and `size` measures the trigger for `matchWidth` (a floor on the panel's width — the
 * spec lets a select's panel grow past its trigger up to its own `max-width` — or a floor and a
 * ceiling under `'exact'`). What the wrap adds is the design spec's vocabulary (`auto` / `above`)
 * and a plain style object rather than a transform, so a consumer writes `<div :style="styles">`
 * and nothing else.
 *
 * `top` and `left` are used instead of the default `transform`, because a panel positioned by
 * transform is blurry on fractional pixels and, more to the point, cannot then use `transform` for
 * the spec's own open animation (fade + 0.25rem slide + a vertical scale from the top edge).
 *
 * ```ts
 * const trigger = ref<HTMLElement | null>(null);
 * const panel = ref<HTMLElement | null>(null);
 * const { styles, placement } = useFloating(trigger, panel, { matchWidth: true });
 * ```
 *
 * The reference may be a Floating UI **virtual element** (`{ getBoundingClientRect() }`), for a
 * panel anchored to a caret or a pointer position rather than to a node; call `update()` after it
 * moves, since nothing observes a virtual element's geometry.
 */
export function useFloating(
  reference: Readonly<Ref<ReferenceElement | null>>,
  floating: Ref<HTMLElement | null>,
  options: UseFloatingOptions = {}
): UseFloatingReturn {
  const resolved = computed(() => RESOLVED[toValue(options.placement) ?? 'auto']);
  const exactWidth = options.matchWidth === 'exact';
  const matchWidth = options.matchWidth === true || exactWidth;

  // Written by `size`, which is the only place the reference's width is known at the moment the
  // position is computed — reading it back off the element would measure a different frame.
  const referenceWidth = ref(0);

  const middleware = computed<Middleware[]>(() => {
    const list: Middleware[] = [offset(toValue(options.offset) ?? 4)];
    if (options.flip ?? resolved.value.flip) list.push(flip());
    list.push(shift({ padding: toValue(options.padding) ?? 8 }));
    if (matchWidth) {
      list.push(
        size({
          apply({ rects }) {
            referenceWidth.value = rects.reference.width;
          },
        })
      );
    }
    return list;
  });

  const position = useFloatingUi(reference, floating, {
    placement: computed(() => resolved.value.placement),
    strategy: options.strategy ?? 'absolute',
    transform: false,
    middleware,
    whileElementsMounted: autoUpdate,
  });

  const styles = computed<Record<string, string>>(() => {
    const base: Record<string, string> = {
      position: position.strategy.value,
      left: `${position.x.value}px`,
      top: `${position.y.value}px`,
    };
    if (matchWidth) base.minWidth = `${referenceWidth.value}px`;
    if (exactWidth) base.maxWidth = `${referenceWidth.value}px`;
    return base;
  });

  return {
    styles,
    placement: computed<string>(() => position.placement.value),
    update: position.update,
  };
}
