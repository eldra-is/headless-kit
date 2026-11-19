/**
 * The Lightbox zoom's geometry, kept apart from the component so it can be tested with no layout.
 * Every rect is in the same coordinate space (`getBoundingClientRect()`'s, in practice).
 */
export interface ZoomRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Below this, the image is already shown near its real size and the Lightbox offers no zoom. */
export const MIN_ZOOM_SCALE = 1.25;

/**
 * The box an `object-fit: contain` image of `naturalWidth` × `naturalHeight` paints inside `frame`,
 * centred. The frame is only the image's own box on a stage wide enough for it; on a narrower one
 * the frame is taller than the picture, and the strips above and below are letterbox, not image.
 */
export function containedRect(
  frame: ZoomRect,
  naturalWidth: number,
  naturalHeight: number
): ZoomRect {
  const scale = Math.min(frame.width / naturalWidth, frame.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: frame.left + (frame.width - width) / 2,
    top: frame.top + (frame.height - height) / 2,
    width,
    height,
  };
}

/** How far the painted image may grow before it passes its real size. */
export function zoomScale(naturalWidth: number, paintedWidth: number): number {
  return paintedWidth > 0 ? naturalWidth / paintedWidth : 1;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** One axis of `zoomTransform`: the zoomed image's centre, less the painted one's. */
function axisOffset(
  paintedStart: number,
  paintedSize: number,
  stageStart: number,
  stageSize: number,
  scale: number,
  focus: number
): number {
  const zoomed = paintedSize * scale;
  const start =
    zoomed <= stageSize
      ? stageStart + (stageSize - zoomed) / 2
      : stageStart - clamp01(focus) * (zoomed - stageSize);
  return start + zoomed / 2 - (paintedStart + paintedSize / 2);
}

/**
 * The `translate` (px) that goes with `scale(scale)` about the painted box's centre. `focus` says
 * which part of a zoomed image larger than the stage shows, per axis: `0` its leading edge, `1` its
 * trailing edge, clamped. An axis the zoomed image still fits on is centred in the stage instead.
 */
export function zoomTransform(
  painted: ZoomRect,
  stage: ZoomRect,
  scale: number,
  focus: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: axisOffset(painted.left, painted.width, stage.left, stage.width, scale, focus.x),
    y: axisOffset(painted.top, painted.height, stage.top, stage.height, scale, focus.y),
  };
}
