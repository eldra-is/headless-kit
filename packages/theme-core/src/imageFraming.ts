/**
 * §17 image framing: pure maths and style helpers shared by the preview
 * overlay, the static output and Studio (which mirrors this module).
 */
export interface ImageFraming {
  x: number;
  y: number;
  zoom: number;
}

export const IMAGE_FRAMING_MIN_ZOOM = 1;
export const IMAGE_FRAMING_MAX_ZOOM = 4;
export const DEFAULT_IMAGE_FRAMING: Readonly<ImageFraming> = Object.freeze({
  x: 0.5,
  y: 0.5,
  zoom: 1,
});

const WHEEL_ZOOM_RATE = 0.002;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Focal band for a zoom: the origin range that keeps the scaled image covering the frame. */
export function focalBand(zoom: number): [number, number] {
  const z = clamp(finite(zoom) ? zoom : 1, IMAGE_FRAMING_MIN_ZOOM, IMAGE_FRAMING_MAX_ZOOM);
  const inset = (1 - 1 / z) / 2;
  return [inset, 1 - inset];
}

export function clampFocal(value: number, zoom: number): number {
  const [low, high] = focalBand(zoom);
  return clamp(finite(value) ? value : 0.5, low, high);
}

export function clampImageFraming(framing: ImageFraming): ImageFraming {
  const zoom = clamp(
    finite(framing.zoom) ? framing.zoom : 1,
    IMAGE_FRAMING_MIN_ZOOM,
    IMAGE_FRAMING_MAX_ZOOM
  );
  return { x: clampFocal(framing.x, zoom), y: clampFocal(framing.y, zoom), zoom };
}

/** Accepts unknown input; returns a clamped value or null when the shape is wrong. */
export function normalizeImageFraming(value: unknown): ImageFraming | null {
  if (value === null || typeof value !== 'object') return null;
  const { x, y, zoom } = value as Record<string, unknown>;
  if (!finite(x) || !finite(y) || !finite(zoom)) return null;
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    zoom: clamp(zoom, IMAGE_FRAMING_MIN_ZOOM, IMAGE_FRAMING_MAX_ZOOM),
  };
}

/** Pointer drag: moving the picture right reveals more of its left side. */
export function framingDrag(
  framing: ImageFraming,
  dx: number,
  dy: number,
  frameWidth: number,
  frameHeight: number
): ImageFraming {
  if (!(frameWidth > 0) || !(frameHeight > 0)) return framing;
  return clampImageFraming({
    x: framing.x - dx / frameWidth / framing.zoom,
    y: framing.y - dy / frameHeight / framing.zoom,
    zoom: framing.zoom,
  });
}

/** Wheel / trackpad pinch: exponential zoom, focal point re-clamped to the new band. */
export function framingZoom(framing: ImageFraming, deltaY: number): ImageFraming {
  const delta = finite(deltaY) ? deltaY : 0;
  return clampImageFraming({
    x: framing.x,
    y: framing.y,
    zoom: framing.zoom * Math.exp(-delta * WHEEL_ZOOM_RATE),
  });
}

const percent = (value: number): string => `${Number((value * 100).toFixed(4))}%`;

export function imageFramingStyle(framing?: ImageFraming | null): Record<string, string> {
  const value = framing ? normalizeImageFraming(framing) : null;
  if (value === null) return { 'object-fit': 'cover', 'object-position': '50% 50%' };
  const style: Record<string, string> = {
    'object-fit': 'cover',
    'object-position': `${percent(value.x)} ${percent(value.y)}`,
  };
  if (value.zoom > 1) {
    style.transform = `scale(${Number(value.zoom.toFixed(4))})`;
    style['transform-origin'] =
      `${percent(clampFocal(value.x, value.zoom))} ${percent(clampFocal(value.y, value.zoom))}`;
  }
  return style;
}

export function imageFramingAttrs(
  entryId: string,
  fieldPath: string,
  framing?: ImageFraming | null
): {
  style: Record<string, string>;
  'data-eldra-framing': string;
  'data-eldra-framing-entry': string;
  'data-eldra-framing-value': string;
} {
  const value = (framing ? normalizeImageFraming(framing) : null) ?? DEFAULT_IMAGE_FRAMING;
  return {
    style: imageFramingStyle(value),
    'data-eldra-framing': fieldPath,
    'data-eldra-framing-entry': entryId,
    'data-eldra-framing-value': `${value.x},${value.y},${value.zoom}`,
  };
}

export function parseImageFramingValueAttr(value: string | null | undefined): ImageFraming {
  if (typeof value !== 'string') return { ...DEFAULT_IMAGE_FRAMING };
  const [x, y, zoom] = value.split(',').map(Number);
  return normalizeImageFraming({ x, y, zoom }) ?? { ...DEFAULT_IMAGE_FRAMING };
}

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A scaled <img> reports its transformed box; recover the layout frame. */
export function unscaledFrameRect(
  rect: { x: number; y: number; width: number; height: number },
  framing: ImageFraming
): { x: number; y: number; width: number; height: number } {
  const zoom = clamp(
    finite(framing.zoom) ? framing.zoom : 1,
    IMAGE_FRAMING_MIN_ZOOM,
    IMAGE_FRAMING_MAX_ZOOM
  );
  if (zoom === 1) return { ...rect };
  const width = rect.width / zoom;
  const height = rect.height / zoom;
  const ox = clampFocal(framing.x, zoom);
  const oy = clampFocal(framing.y, zoom);
  return {
    x: rect.x + ox * (rect.width - width),
    y: rect.y + oy * (rect.height - height),
    width,
    height,
  };
}
