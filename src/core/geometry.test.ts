import { describe, expect, it } from 'vitest';
import { canopyTent } from '../products/canopy-tent/definition';
import { atlasToFrame, frameToAtlas, offsetConvexPolygon, pointInPolygon, rotate, surfaceFrame, UNITS_PER_INCH } from './geometry';

const allSurfaces = Object.entries(canopyTent.geometry).flatMap(([variant, g]) => g.surfaces.map((s) => ({ variant, s })));

describe('surface frames (extracted from the supplied GLBs)', () => {
  it('finds all 8 panels in every size', () => {
    for (const geometry of Object.values(canopyTent.geometry)) {
      expect(geometry.surfaces.map((s) => s.id).sort()).toEqual(
        ['roof-back', 'roof-front', 'roof-left', 'roof-right', 'valance-back', 'valance-front', 'valance-left', 'valance-right'],
      );
    }
  });

  it('has upright rotations that point every panel towards the peak', () => {
    const expected: Record<string, number> = { front: 0, right: -90, back: 180, left: 90 };
    for (const { s } of allSurfaces) expect(s.uprightRotation).toBe(expected[s.side]);
  });

  it('matches the nominal tent sizes (the 6.5 model is footprint-corrected)', () => {
    const width = (variant: string) => canopyTent.geometry[variant].surfaces.find((s) => s.id === 'valance-front')!.physical.widthIn;
    expect(width('5x5')).toBeCloseTo(60, -0.5);
    expect(width('6.5x6.5')).toBeCloseTo(78, -0.5);
    expect(width('8x8')).toBeCloseTo(96, -0.5);
  });

  it('round-trips frame <-> atlas coordinates', () => {
    for (const { s } of allSurfaces) {
      const frame = surfaceFrame(s);
      const p: [number, number] = [frame.width * 0.2, -frame.height * 0.3];
      const back = atlasToFrame(frame, frameToAtlas(frame, p));
      expect(back[0]).toBeCloseTo(p[0], 6);
      expect(back[1]).toBeCloseTo(p[1], 6);
    }
  });

  it('maps the frame onto exactly the UV island bounds', () => {
    for (const { s } of allSurfaces) {
      const frame = surfaceFrame(s);
      expect(frame.width).toBeCloseTo(s.physical.widthIn * UNITS_PER_INCH, 6);
      const corners = frame.localPolygon.map((p) => frameToAtlas(frame, p));
      corners.forEach((c, i) => {
        expect(c[0]).toBeCloseTo(s.polygon[i][0], 6);
        expect(c[1]).toBeCloseTo(s.polygon[i][1], 6);
      });
    }
  });
});

describe('polygon helpers', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('point in polygon', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([15, 5], square)).toBe(false);
  });

  it('offsets convex polygons outward regardless of winding', () => {
    for (const poly of [square, [...square].reverse()]) {
      const grown = offsetConvexPolygon(poly, 2);
      const xs = grown.map((p) => p[0]);
      expect(Math.min(...xs)).toBeCloseTo(-2);
      expect(Math.max(...xs)).toBeCloseTo(12);
    }
  });

  it('rotates clockwise in screen space', () => {
    const [x, y] = rotate([1, 0], 90);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });
});
