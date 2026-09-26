import type { UiMessages } from '../../composables/useMessages';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them
 *  (spec "Lightbox" → Anatomy) plus the task brief's own `thumbnails`/`thumbnail` pair, which the
 *  spec describes ("With thumbnails" variant) but does not number. */
export type LightboxPart =
  | 'root'
  | 'panel'
  | 'close'
  | 'track'
  | 'slide'
  | 'image'
  | 'caption'
  | 'prev'
  | 'next'
  | 'counter'
  | 'thumbnails'
  | 'thumbnail';

/**
 * One image in the gallery (spec "Lightbox" → Properties, `images` row). `width`/`height` are the
 * asset's real intrinsic pixel size — passed straight through to `Image` as `ratio="auto"`'s own
 * `media.width`/`.height`, so the viewer reserves each photo's own aspect ratio rather than a fixed
 * grid preset (spec "Sizes": "Image: fits the stage height and width, keeps its aspect ratio").
 */
export interface LightboxImage {
  /** The full-resolution asset URL — never a thumbnail crop (spec "Do": "load full-resolution
   *  images only when the viewer opens"). */
  src: string;
  /** Required: describes what matters about the photo (spec "Properties": "`alt` is required and
   *  describes the image"). */
  alt: string;
  /** Shown as the slide's own `<figcaption>`, centred below the image. Omit for no caption. */
  caption?: string;
  /** Intrinsic width in pixels. */
  width: number;
  /** Intrinsic height in pixels. */
  height: number;
}

export interface LightboxProps {
  /** Shows the viewer with `showModal()` when `true`, closes it when `false` (two-way). */
  modelValue?: boolean;
  /** The image shown when the viewer opens — set it to the thumbnail/photo that was activated
   *  (spec "Properties": "set it to the thumbnail that was activated before opening"). Two-way:
   *  updates as the shopper moves between images. Default `0`. */
  index?: number;
  /** The images, in gallery order. At least one is expected; a single image hides the arrows and
   *  counter (spec "Variants" → "Single image"). */
  images: LightboxImage[];
  /** The viewer's accessible name (spec "Properties", `label` row — package convention: an
   *  accessible-name-only prop is `ariaLabel`, never the bare noun). E.g. "Merino crew sweater,
   *  images". */
  ariaLabel: string;
  /** Shows the thumbnail strip under the caption (spec "Variants" → "With thumbnails"). Default
   *  `false`. Ignored for a single image, which has nothing to pick between. */
  thumbnails?: boolean;
  /** Message overrides. See `useMessages`. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<LightboxPart, string>>;
}
