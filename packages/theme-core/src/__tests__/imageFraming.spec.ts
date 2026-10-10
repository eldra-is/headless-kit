import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_FRAMING,
  clampFocal,
  focalBand,
  framingDrag,
  framingZoom,
  imageFramingAttrs,
  imageFramingStyle,
  normalizeImageFraming,
  parseImageFramingValueAttr,
  unscaledFrameRect,
} from '../imageFraming';

describe('image framing maths', () => {
  it('normalizes and clamps values, rejecting malformed input', () => {
    expect(normalizeImageFraming(undefined)).toBeNull();
    expect(normalizeImageFraming({ x: '0.5', y: 0.5, zoom: 1 })).toBeNull();
    expect(normalizeImageFraming({ x: 0.5, y: 0.5 })).toBeNull();
    expect(normalizeImageFraming({ x: 0.5, y: 0.5, zoom: Number.NaN })).toBeNull();
    expect(normalizeImageFraming({ x: 2, y: -1, zoom: 9 })).toEqual({ x: 1, y: 0, zoom: 4 });
    expect(normalizeImageFraming({ x: 0.5, y: 0.5, zoom: 2, extra: 1 })).toEqual({
      x: 0.5,
      y: 0.5,
      zoom: 2,
    });
  });

  it('computes the focal band per zoom', () => {
    expect(focalBand(1)).toEqual([0, 1]);
    expect(focalBand(2)).toEqual([0.25, 0.75]);
    expect(focalBand(4)).toEqual([0.375, 0.625]);
    expect(clampFocal(0.1, 2)).toBe(0.25);
    expect(clampFocal(0.9, 2)).toBe(0.75);
    expect(clampFocal(0.5, 4)).toBe(0.5);
  });

  it('drags against the pointer direction, scaled by zoom, and clamps to the band', () => {
    const start = { x: 0.5, y: 0.5, zoom: 2 };
    expect(framingDrag(start, 100, 0, 1000, 500)).toEqual({ x: 0.45, y: 0.5, zoom: 2 });
    expect(framingDrag(start, 0, -50, 1000, 500)).toEqual({ x: 0.5, y: 0.55, zoom: 2 });
    expect(framingDrag(start, 10_000, 10_000, 1000, 500)).toEqual({ x: 0.25, y: 0.25, zoom: 2 });
    expect(framingDrag(start, 10, 10, 0, 0)).toEqual(start);
  });

  it('zooms exponentially with wheel delta and re-clamps the focal point', () => {
    const zoomedIn = framingZoom({ x: 0.5, y: 0.5, zoom: 1 }, -500);
    expect(zoomedIn.zoom).toBeCloseTo(Math.exp(1), 6);
    expect(framingZoom({ x: 0.5, y: 0.5, zoom: 1 }, 500).zoom).toBe(1);
    expect(framingZoom({ x: 0.5, y: 0.5, zoom: 3.9 }, -5000).zoom).toBe(4);
    const reclamped = framingZoom({ x: 0.1, y: 0.9, zoom: 1 }, -Math.log(2) / 0.002);
    expect(reclamped.zoom).toBeCloseTo(2, 6);
    expect(reclamped.x).toBeCloseTo(0.25, 6);
    expect(reclamped.y).toBeCloseTo(0.75, 6);
  });

  it('renders cover styles, scaling only when zoomed', () => {
    expect(imageFramingStyle(null)).toEqual({
      'object-fit': 'cover',
      'object-position': '50% 50%',
    });
    expect(imageFramingStyle({ x: 0.25, y: 0.75, zoom: 1 })).toEqual({
      'object-fit': 'cover',
      'object-position': '25% 75%',
    });
    expect(imageFramingStyle({ x: 0.1, y: 0.5, zoom: 2 })).toEqual({
      'object-fit': 'cover',
      'object-position': '10% 50%',
      transform: 'scale(2)',
      'transform-origin': '25% 50%',
    });
  });

  it('marks framed images with the contract attributes', () => {
    expect(imageFramingAttrs('entry-1', 'image', { x: 0.2, y: 0.4, zoom: 1.5 })).toEqual({
      style: {
        'object-fit': 'cover',
        'object-position': '20% 40%',
        transform: 'scale(1.5)',
        'transform-origin': '20% 40%',
      },
      'data-eldra-framing': 'image',
      'data-eldra-framing-entry': 'entry-1',
      'data-eldra-framing-value': '0.2,0.4,1.5',
    });
    expect(imageFramingAttrs('entry-1', 'image', null)['data-eldra-framing-value']).toBe(
      '0.5,0.5,1'
    );
    expect(parseImageFramingValueAttr('0.2,0.4,1.5')).toEqual({ x: 0.2, y: 0.4, zoom: 1.5 });
    expect(parseImageFramingValueAttr('garbage')).toEqual(DEFAULT_IMAGE_FRAMING);
    expect(parseImageFramingValueAttr(null)).toEqual(DEFAULT_IMAGE_FRAMING);
  });

  it('recovers the unscaled frame from a scaled bounding rect', () => {
    const framing = { x: 0.5, y: 0.5, zoom: 2 };
    // 200x100 frame scaled 2x from origin (50%, 50%) → 400x200 centred on the frame
    expect(unscaledFrameRect({ x: -100, y: -50, width: 400, height: 200 }, framing)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(
      unscaledFrameRect({ x: 10, y: 20, width: 200, height: 100 }, { x: 0.5, y: 0.5, zoom: 1 })
    ).toEqual({ x: 10, y: 20, width: 200, height: 100 });
  });
});
