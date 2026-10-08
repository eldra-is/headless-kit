/** A size the media host serves by path suffix; `original` is the uploaded file, untransformed. */
export type EldraImageVariant = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'original';

/** The variants the media host resizes, narrowest first. */
export type EldraSizedImageVariant = Exclude<EldraImageVariant, 'original'>;

/**
 * The maximum width in pixels of each resized variant. The host scales down only, so an original
 * narrower than a variant comes back at its own width.
 */
export const ELDRA_IMAGE_VARIANT_WIDTHS: Readonly<Record<EldraSizedImageVariant, number>> = {
  sm: 400,
  md: 800,
  lg: 1200,
  xl: 1920,
  full: 2560,
};

const SIZED_VARIANTS = Object.keys(ELDRA_IMAGE_VARIANT_WIDTHS) as EldraSizedImageVariant[];

/**
 * A media URL as the API returns it, or any object carrying one (`thumbnail`, `mediaLinks[]`, a
 * CMS media item). `contentType`, when present, keeps formats the host does not resize out of
 * `srcset`.
 */
export type EldraImageSource =
  | string
  | { url?: string | null; contentType?: string | null }
  | null
  | undefined;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// No whitespace or comma anywhere: either would split a srcset candidate.
const ELDRA_ASSET_URL = new RegExp(
  `^((?:(?:https?:)?//[^/\\s,?#]+)?(?:/[^\\s,?#]*)?/public/${UUID}/assets/${UUID})` +
    `(?:/(?:sm|md|lg|xl|full|original))?/?$`,
  'i'
);

// Mirrors TRANSFORMABLE_IMAGE_TYPES in eldra-is/studio-media-worker src/index.ts; anything else is served as uploaded.
const RESIZABLE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

function sourceUrl(source: EldraImageSource): string | undefined {
  const url = typeof source === 'string' ? source : source?.url;
  return url ? url : undefined;
}

function resizableAssetBase(source: EldraImageSource): string | undefined {
  const url = sourceUrl(source);
  if (!url) return undefined;
  const contentType = typeof source === 'object' ? source?.contentType : undefined;
  if (contentType && !RESIZABLE_CONTENT_TYPES.has(contentType.toLowerCase())) return undefined;
  return ELDRA_ASSET_URL.exec(url)?.[1];
}

/** Whether the source is an Eldra media asset the host can resize. */
export function isEldraImage(source: EldraImageSource): boolean {
  return resizableAssetBase(source) !== undefined;
}

/**
 * The URL of one variant of an Eldra media asset. A URL that already names a variant is switched
 * to the one asked for. Any other URL — an external image, an SVG, a GIF — comes back unchanged.
 */
export function imageUrl(source: string, variant: EldraImageVariant): string;
export function imageUrl(source: EldraImageSource, variant: EldraImageVariant): string | undefined;
export function imageUrl(source: EldraImageSource, variant: EldraImageVariant): string | undefined {
  const base = resizableAssetBase(source);
  return base ? `${base}/${variant}` : sourceUrl(source);
}

/**
 * The narrowest variant at least `width` CSS pixels wide at the given pixel density, or `full`
 * when nothing is that wide.
 */
export function imageVariantFor(width: number, density = 1): EldraSizedImageVariant {
  const needed = width * density;
  if (!Number.isFinite(needed) || needed <= 0) {
    throw new RangeError(`imageVariantFor needs a positive width, got ${width} at ${density}x`);
  }
  return SIZED_VARIANTS.find((variant) => ELDRA_IMAGE_VARIANT_WIDTHS[variant] >= needed) ?? 'full';
}

export interface EldraImageSrcsetOptions {
  /**
   * The original's width in pixels, when you know it. Variants wider than it would be the same
   * pixels at a new URL, so they are dropped, and the last one is described at its true width.
   */
  originalWidth?: number;
}

/**
 * A `srcset` over the resized variants of an Eldra media asset, each described by its width. Returns
 * `undefined` for anything else, so `<img :srcset>` simply drops the attribute.
 */
export function imageSrcset(
  source: EldraImageSource,
  options: EldraImageSrcsetOptions = {}
): string | undefined {
  const base = resizableAssetBase(source);
  if (!base) return undefined;
  const { originalWidth } = options;
  const candidates: string[] = [];
  for (const variant of SIZED_VARIANTS) {
    const width = ELDRA_IMAGE_VARIANT_WIDTHS[variant];
    if (originalWidth !== undefined && originalWidth > 0 && width >= originalWidth) {
      candidates.push(`${base}/${variant} ${Math.round(originalWidth)}w`);
      break;
    }
    candidates.push(`${base}/${variant} ${width}w`);
  }
  return candidates.join(', ');
}

export interface EldraResponsiveImageOptions extends EldraImageSrcsetOptions {
  /**
   * How wide the image is laid out, as an `<img sizes>` value: `100vw` for a full-bleed banner,
   * `(min-width: 1024px) 25vw, 50vw` for a four-up grid that is two-up on phones.
   */
  sizes: string;
  /** The variant in `src`, for a browser that ignores `srcset`. Defaults to `md`. */
  variant?: EldraSizedImageVariant;
  /**
   * The width-to-height ratio of the box the image fills, such as `4 / 5`. It becomes `width` and
   * `height` attributes, which reserve the space before the image loads.
   */
  aspectRatio?: number;
  /** Explicit `width` and `height` attributes; they take precedence over `aspectRatio`. */
  width?: number;
  height?: number;
}

/** Attributes for an `<img>`; spread them onto the tag. */
export interface EldraResponsiveImage {
  src: string;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

/**
 * The `src`, `srcset`, `sizes`, `width` and `height` for one image. An external image gets its URL
 * as `src` and no `srcset`. Returns `undefined` when there is no URL to render.
 */
export function responsiveImage(
  source: EldraImageSource,
  options: EldraResponsiveImageOptions
): EldraResponsiveImage | undefined {
  const variant = options.variant ?? 'md';
  const src = imageUrl(source, variant);
  if (!src) return undefined;
  const image: EldraResponsiveImage = { src };
  const srcset = imageSrcset(source, options);
  if (srcset) {
    image.srcset = srcset;
    image.sizes = options.sizes;
  }
  if (options.width !== undefined && options.height !== undefined) {
    image.width = options.width;
    image.height = options.height;
  } else if (options.aspectRatio !== undefined && options.aspectRatio > 0) {
    image.width = ELDRA_IMAGE_VARIANT_WIDTHS[variant];
    image.height = Math.round(image.width / options.aspectRatio);
  }
  return image;
}
