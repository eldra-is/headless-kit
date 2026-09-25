import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating as useFloatingUi,
  type Middleware,
  type Placement,
} from '@floating-ui/vue';
import { computed, ref, type ComputedRef, type Ref } from 'vue';

/**
 * Where the panel goes.
 *
 * `auto` and `above` are the design spec's own words (Select and Multi-select take
 * `placement: "auto" | "above"`): `auto` opens below and flips above when there is no room, and
 * `above` always opens above — the footer's selectors, where below is off-screen by definition. The
 * four concrete values are `@floating-ui/dom` placements for anything that wants to be explicit.
 */
export type FloatingPlacement = 'auto' | 'above' | 'bottom' | 'bottom-start' | 'top' | 'top-start';

export interface UseFloatingOptions {
  /** Default `'auto'` — below, flipping above when it does not fit. */
  placement?: FloatingPlacement;
  /** Gap between the reference and the panel, in pixels. Default `4` (the spec's 0.25rem). */
  offset?: number;
  /** Add a `width` equal to the reference's, so a select panel lines up with its trigger. */
  matchWidth?: boolean;
  /** Override the flipping that the placement implies: on for `auto`, off for `above`. */
  flip?: boolean;
}

export interface UseFloatingReturn {
  /** Inline styles for the panel: `position`, `top`, `left`, and `width` when `matchWidth`. */
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
  top: { placement: 'top', flip: true },
  'top-start': { placement: 'top-start', flip: true },
};

/**
 * Positions a floating panel against the element that opened it — the one piece of every popup in
 * this package that has to measure the page.
 *
 * It is a thin wrap of `@floating-ui/vue`: `autoUpdate` keeps the position current while both
 * elements are mounted (scrolling, resizing, an ancestor moving), `offset` sets the gap, `flip`
 * turns the panel above the trigger when there is no room below, `shift` keeps it inside the
 * viewport, and `size` measures the trigger for `matchWidth`. What the wrap adds is the design
 * spec's vocabulary (`auto` / `above`) and a plain style object rather than a transform, so a
 * consumer writes `<div :style="styles">` and nothing else.
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
 */
export function useFloating(
  reference: Ref<HTMLElement | null>,
  floating: Ref<HTMLElement | null>,
  options: UseFloatingOptions = {}
): UseFloatingReturn {
  const resolved = RESOLVED[options.placement ?? 'auto'];
  const shouldFlip = options.flip ?? resolved.flip;
  const matchWidth = options.matchWidth === true;

  // Written by `size`, which is the only place the reference's width is known at the moment the
  // position is computed — reading it back off the element would measure a different frame.
  const referenceWidth = ref(0);

  const middleware: Middleware[] = [offset(options.offset ?? 4)];
  if (shouldFlip) middleware.push(flip());
  middleware.push(shift({ padding: 8 }));
  if (matchWidth) {
    middleware.push(
      size({
        apply({ rects }) {
          referenceWidth.value = rects.reference.width;
        },
      })
    );
  }

  const position = useFloatingUi(reference, floating, {
    placement: resolved.placement,
    strategy: 'absolute',
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
    if (matchWidth) base.width = `${referenceWidth.value}px`;
    return base;
  });

  return {
    styles,
    placement: computed<string>(() => position.placement.value),
    update: position.update,
  };
}
