/**
 * The frame's fixed aspect presets (spec "Image" → Properties, `ratio` row; → Sizes). `auto` uses
 * the media's own intrinsic ratio when it has one, or 4:3 when there is no media at all — see
 * `src/utils/ratio.ts#frameAspectRatio`.
 */
export type ImageRatio = 'auto' | '1x1' | '4x3' | '3x2' | '16x9' | '3x4' | '4x5';

/**
 * The image or video the frame renders (spec "Image" → Anatomy, part 3). `alt`/`width`/`height`
 * here are metadata a CMS field carries alongside the asset; the component's own `alt` prop is
 * what actually renders on the `<img>`/`<video>` (falling back to `media.alt` when the prop is not
 * given), so a consumer can override the stored description per instance without editing the
 * asset.
 */
export interface ImageMedia {
  /** The asset URL. */
  src: string;
  /** A responsive `srcset`, e.g. `"a.jpg 480w, b.jpg 960w"`. */
  srcset?: string;
  /** Per-media `sizes`; `ImageProps.sizes` overrides this when both are given. */
  sizes?: string;
  /** The asset's own stored description, used when `ImageProps.alt` is not given. */
  alt?: string;
  /** Intrinsic width in pixels. With `height`, reserves the frame's space under `ratio="auto"`. */
  width?: number;
  /** Intrinsic height in pixels. See `width`. */
  height?: number;
  /** Renders a `<video>` instead of an `<img>`. Defaults to `'image'`. */
  type?: 'image' | 'video';
}

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type ImagePart = 'root' | 'frame' | 'media' | 'placeholder' | 'caption' | 'skeleton';

export interface ImageProps {
  /** The image or video. `null`/omitted renders the live "No image" placeholder. */
  media?: ImageMedia | null;
  /**
   * Required whenever `media` is set, unless `decorative` is on: a dev warning fires otherwise
   * (spec "Image" → Accessibility, 1.1.1). Falls back to `media.alt`, then to `""`.
   */
  alt?: string;
  /** Renders `alt=""` (and hides the live placeholder from assistive technology) regardless of
   * `alt`/`media.alt`. */
  decorative?: boolean;
  /** The frame's aspect preset. See `ImageRatio`. Defaults to `'4x3'` — a product-card caller
   * passes `'4x5'` itself, per the spec's own per-context default. */
  ratio?: ImageRatio;
  /**
   * Crop anchor, in percent (0–100 on each axis): sets the media's `object-position` and, when
   * `zoom` is above 1, the scale's `transform-origin`. Defaults to centred (`{ x: 50, y: 50 }`).
   */
  focal?: { x: number; y: number };
  /** Static crop scale (1–2) around `focal`, applied as `transform: scale(zoom)`. Never animated —
   * a static crop, not a hover effect (spec "Image" → Behaviour & motion). Defaults to `1`. */
  zoom?: number;
  /** Frame corner radius: `none` (default), `lg` (`radius-lg`) or `xl` (`radius-xl`). */
  rounded?: 'none' | 'lg' | 'xl';
  /** Renders a `<figcaption>` under the frame and makes the root a `<figure>`. `null`/omitted
   * renders neither. */
  caption?: string | null;
  /** Responsive `sizes` for the `srcset`. Overrides `media.sizes` when both are given. */
  sizes?: string;
  /** The first hero image: `loading="eager"` + `fetchpriority="high"`. Every other image is
   * `loading="lazy"` (the default). */
  priority?: boolean;
  /** Renders a skeleton at the frame's own ratio instead of `media`/the placeholder. */
  loading?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ImagePart, string>>;
}
