import { ref, type Ref } from 'vue';

/**
 * Shared scroll-snap carousel state for `testimonials` (`variant: 'carousel'`)
 * and `gallery` (`variant: 'carousel'`) — both blocks need the same current-
 * slide index, previous/next stepping, `ArrowLeft`/`ArrowRight` keyboard
 * handling on the track, and a best-effort scroll to the active slide. Kept
 * as a block-facing composable (like `useBlockData`/`useT`), not a `Ui*`
 * primitive: the spec's primitive table has no carousel entry, and the
 * markup around the track (region role, live-region counter, button labels)
 * differs enough per block that a shared primitive would need as many slots
 * as it saves lines.
 *
 * `trackRef.value.scrollTo` is guarded rather than called unconditionally:
 * jsdom (the block specs' environment) does not implement `Element.scrollTo`,
 * and this composable's index/keyboard behaviour must stay testable without
 * a real layout engine.
 */
export function useCarousel(total: Ref<number>): {
  index: Ref<number>;
  trackRef: Ref<HTMLElement | null>;
  next: () => void;
  previous: () => void;
  goTo: (target: number) => void;
  onTrackKeydown: (event: KeyboardEvent) => void;
} {
  const index = ref(0);
  const trackRef = ref<HTMLElement | null>(null);

  function clamp(target: number): number {
    const count = total.value;
    if (count <= 0) return 0;
    return ((target % count) + count) % count;
  }

  function scrollToIndex(target: number): void {
    const track = trackRef.value;
    const slide = track?.children.item(target);
    if (track && slide instanceof HTMLElement && typeof track.scrollTo === 'function') {
      track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    }
  }

  function goTo(target: number): void {
    index.value = clamp(target);
    scrollToIndex(index.value);
  }

  function next(): void {
    goTo(index.value + 1);
  }

  function previous(): void {
    goTo(index.value - 1);
  }

  function onTrackKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      previous();
    }
  }

  return { index, trackRef, next, previous, goTo, onTrackKeydown };
}
