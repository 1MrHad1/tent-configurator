import type { Asset, Layer } from '../design/schema';
import { rotate, type SurfaceFrame } from '../geometry';
import type { Vec2 } from '../product/types';
import { layerBox } from './drawLayer';

/** Topmost layer under a point given in frame units (used for picking on the 3D model). */
export function layerAtPoint(frame: SurfaceFrame, layers: Layer[], assets: Record<string, Asset>, point: Vec2): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const box = layerBox(layer, frame, assets);
    const [lx, ly] = rotate([point[0] - layer.x * frame.width, point[1] - layer.y * frame.height], -layer.rotation);
    if (Math.abs(lx) <= box.width / 2 && Math.abs(ly) <= box.height / 2) return layer;
  }
  return null;
}
