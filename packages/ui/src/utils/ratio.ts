import type { ImageMedia, ImageRatio } from '../components/image/types';

/**
 * The CSS `aspect-ratio` value for every fixed preset (spec "Image" → Sizes). Written as
 * `"<w> / <h>"` rather than a decimal so the frame's own ratio reads the same in the DOM as it
 * does in the spec's table; `auto` has no entry here because it is never a fixed number — see
 * `frameAspectRatio` below.
 */
const RATIO_VALUES: Record<Exclude<ImageRatio, 'auto'>, string> = {
  '1x1': '1 / 1',
  '4x3': '4 / 3',
  '3x2': '3 / 2',
  '16x9': '16 / 9',
  '3x4': '3 / 4',
  '4x5': '4 / 5',
};

/**
 * The frame's `aspect-ratio` CSS value (spec "Image" → Properties, `ratio` row: "`auto` uses the
 * image's own ratio, or 4:3 when empty").
 *
 * - A fixed preset always wins outright — its own literal `w / h` ratio, whatever `media` is.
 * - `auto` with a `media.width`/`height` pair uses the image's own intrinsic ratio, computed here
 *   rather than left to the browser's native `aspect-ratio: auto` resolution: that keyword only
 *   sizes a *replaced* element (the `<img>` itself) from its intrinsic size, but the frame that
 *   needs the ratio is the wrapping `<div>` the `<img>` is stretched to fill (`object-fit: cover`
 *   needs a sized box to crop into), so the ratio has to be computed and handed to the frame
 *   directly — this is also what reserves the frame's space before the image has loaded (spec
 *   "Behaviour & motion": "Reserve space with `width`/`height` attributes or the ratio").
 * - `auto` with a `media` that carries no width/height falls back to the CSS keyword `auto`: there
 *   is nothing to precompute, so the frame's height tracks its content the way a plain image would.
 * - `auto` with no `media` at all falls back to 4:3 (the spec's own fallback for an empty frame).
 */
export function frameAspectRatio(
  ratio: ImageRatio,
  media: Pick<ImageMedia, 'width' | 'height'> | null | undefined
): string {
  if (ratio !== 'auto') return RATIO_VALUES[ratio];
  if (media?.width && media?.height) return `${media.width} / ${media.height}`;
  if (!media) return RATIO_VALUES['4x3'];
  return 'auto';
}
