import type { SurfaceDef, Vec2 } from './product/types';

const DEG = Math.PI / 180;

export function rotate([x, y]: Vec2, degrees: number): Vec2 {
  const c = Math.cos(degrees * DEG);
  const s = Math.sin(degrees * DEG);
  // Canvas convention (y down): positive angles turn clockwise on screen.
  return [x * c - y * s, x * s + y * c];
}

/** Design space resolution: frame units per physical inch. */
export const UNITS_PER_INCH = 10;

/**
 * A surface's upright frame, in *physical* units (UNITS_PER_INCH per inch), centred on the
 * panel with x across and y down as the panel is seen on the product. Layers live here.
 *
 * The supplied UV islands are not uniformly scaled (valances are squashed 10-18%), so the
 * frame maps into the texture atlas with a per-axis scale: a round logo stays round on the
 * model. The 2D editor uses one uniform scale instead, so artwork also looks right there.
 */
export interface SurfaceFrame {
  surface: SurfaceDef;
  /** Panel centre in atlas units. */
  center: Vec2;
  rotation: number;
  /** Physical size in frame units. */
  width: number;
  height: number;
  /** Frame units -> atlas units, per axis (texture). */
  atlasScale: Vec2;
  /** Frame units -> atlas units, uniform (2D editor). Fits the panel inside its UV island bounds. */
  editorScale: number;
  /** The panel outline in frame units. */
  localPolygon: Vec2[];
}

export function surfaceFrame(surface: SurfaceDef): SurfaceFrame {
  const xs = surface.polygon.map((p) => p[0]);
  const ys = surface.polygon.map((p) => p[1]);
  const center: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const localAtlas = surface.polygon.map((p) => rotate([p[0] - center[0], p[1] - center[1]], -surface.uprightRotation));
  const lx = localAtlas.map((p) => p[0]);
  const ly = localAtlas.map((p) => p[1]);
  const width = surface.physical.widthIn * UNITS_PER_INCH;
  const height = surface.physical.heightIn * UNITS_PER_INCH;
  const atlasScale: Vec2 = [(Math.max(...lx) - Math.min(...lx)) / width, (Math.max(...ly) - Math.min(...ly)) / height];
  return {
    surface,
    center,
    rotation: surface.uprightRotation,
    width,
    height,
    atlasScale,
    editorScale: Math.min(...atlasScale),
    localPolygon: localAtlas.map(([x, y]) => [x / atlasScale[0], y / atlasScale[1]]),
  };
}

/** Frame units -> atlas units (texture mapping). */
export function frameToAtlas(frame: SurfaceFrame, [x, y]: Vec2): Vec2 {
  const [ax, ay] = rotate([x * frame.atlasScale[0], y * frame.atlasScale[1]], frame.rotation);
  return [ax + frame.center[0], ay + frame.center[1]];
}

/** Atlas units -> frame units (e.g. a UV hit on the 3D model). */
export function atlasToFrame(frame: SurfaceFrame, p: Vec2): Vec2 {
  const [x, y] = rotate([p[0] - frame.center[0], p[1] - frame.center[1]], -frame.rotation);
  return [x / frame.atlasScale[0], y / frame.atlasScale[1]];
}

export function pointInPolygon([x, y]: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Grows a convex polygon outward by `distance`. The compositor paints this bleed so texture
 * filtering at UV-island edges never samples the empty space between panels (no seams in 3D).
 */
export function offsetConvexPolygon(polygon: Vec2[], distance: number): Vec2[] {
  const n = polygon.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const outward = area > 0 ? 1 : -1;
  const lines = polygon.map((a, i) => {
    const b = polygon[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (dy / len) * outward;
    const ny = (-dx / len) * outward;
    return { p: [a[0] + nx * distance, a[1] + ny * distance] as Vec2, d: [dx, dy] as Vec2 };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i - 1 + n) % n];
    const det = prev.d[0] * cur.d[1] - prev.d[1] * cur.d[0];
    if (Math.abs(det) < 1e-9) return cur.p;
    const t = ((cur.p[0] - prev.p[0]) * cur.d[1] - (cur.p[1] - prev.p[1]) * cur.d[0]) / det;
    return [prev.p[0] + prev.d[0] * t, prev.p[1] + prev.d[1] * t];
  });
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
