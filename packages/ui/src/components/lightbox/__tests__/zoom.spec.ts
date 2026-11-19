import { describe, expect, it } from 'vitest';
import { containedRect, MIN_ZOOM_SCALE, zoomScale, zoomTransform } from '../zoom';

/**
 * The Lightbox zoom's geometry, with no DOM: where a `contain`-fitted image actually paints inside
 * its frame, how far it may zoom, and where the zoomed image sits for a given pan focus.
 */

describe('containedRect', () => {
  it('letterboxes a landscape image top and bottom inside a tall frame', () => {
    const rect = containedRect({ left: 10, top: 20, width: 472, height: 715 }, 1600, 1067);
    expect(rect.left).toBeCloseTo(10, 1);
    expect(rect.width).toBeCloseTo(472, 1);
    expect(rect.height).toBeCloseTo(314.8, 1);
    expect(rect.top).toBeCloseTo(20 + (715 - 314.77) / 2, 1);
  });

  it('pillarboxes a portrait image left and right inside a wide frame', () => {
    const rect = containedRect({ left: 0, top: 0, width: 934, height: 623 }, 1200, 1600);
    expect(rect.width).toBeCloseTo(467.25, 1);
    expect(rect.height).toBeCloseTo(623, 1);
    expect(rect.left).toBeCloseTo(233.4, 1);
    expect(rect.top).toBeCloseTo(0, 1);
  });
});

describe('zoomScale', () => {
  it('is the real width over the painted width', () => {
    expect(zoomScale(1600, 800)).toBe(2);
  });

  it('is 1 when nothing is painted', () => {
    expect(zoomScale(1600, 0)).toBe(1);
  });

  it('only offers zoom from 1.25x', () => {
    expect(MIN_ZOOM_SCALE).toBe(1.25);
  });
});

describe('zoomTransform', () => {
  const painted = { left: 0, top: 0, width: 800, height: 600 };
  const stage = { left: 0, top: 0, width: 800, height: 600 };

  it("puts the zoomed image's top-left at the stage's top-left for focus 0", () => {
    expect(zoomTransform(painted, stage, 2, { x: 0, y: 0 })).toEqual({ x: 400, y: 300 });
  });

  it("puts the zoomed image's bottom-right at the stage's bottom-right for focus 1", () => {
    expect(zoomTransform(painted, stage, 2, { x: 1, y: 1 })).toEqual({ x: -400, y: -300 });
  });

  it('centres the zoomed image for focus 0.5', () => {
    const t = zoomTransform(painted, stage, 2, { x: 0.5, y: 0.5 });
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0);
  });

  it('centres an axis the zoomed image still fits on, whatever the focus', () => {
    const small = { left: 100, top: 0, width: 200, height: 100 };
    const big = { left: 0, top: 0, width: 1000, height: 800 };
    expect(zoomTransform(small, big, 2, { x: 0.5, y: 0 }).y).toBe(350);
    expect(zoomTransform(small, big, 2, { x: 0.5, y: 1 }).y).toBe(350);
  });

  it('clamps a focus outside [0, 1]', () => {
    expect(zoomTransform(painted, stage, 2, { x: -1, y: 2 })).toEqual(
      zoomTransform(painted, stage, 2, { x: 0, y: 1 })
    );
  });
});
