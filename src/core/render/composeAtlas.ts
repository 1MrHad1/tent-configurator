/**
 * Renders a design into the product's UV atlas (the texture the 3D model samples) and into
 * upright per-panel proofs (the PDF). Resolution independent: pass any pixel size.
 */
import { geometryFor, isSurfaceAvailable } from '../design/factory';
import type { Design } from '../design/schema';
import { atlasToFrame, offsetConvexPolygon, surfaceFrame, UNITS_PER_INCH, type SurfaceFrame } from '../geometry';
import type { ProductDefinition, SurfaceDef, Vec2 } from '../product/types';
import { drawPlacedLayer, type ImageLookup, type ImageSource } from './drawLayer';

export interface ComposeOptions {
  /** Output size in pixels (the atlas is square). */
  size: number;
  /** Extra paint around each panel, in atlas units, so texture filtering never shows seams. */
  bleed?: number;
  /** Greyscale fold/seam map multiplied on top (3D only). */
  shade?: ImageSource | null;
  /** Fill for the area outside every panel. */
  background?: string;
  /**
   * 'texture' maps each panel onto its UV island (per-axis scale, for the 3D model).
   * 'editor' uses the 2D editor's uniform scale, so artwork keeps true proportions.
   */
  layout?: 'texture' | 'editor';
  /** Overlay a 1-foot grid, panel names and an "up" arrow: proves the UV mapping visually. */
  debugGrid?: boolean;
}

const frameCache = new WeakMap<SurfaceDef, SurfaceFrame>();
export function frameOf(surface: SurfaceDef): SurfaceFrame {
  let frame = frameCache.get(surface);
  if (!frame) frameCache.set(surface, (frame = surfaceFrame(surface)));
  return frame;
}

export const tracePolygon = (ctx: CanvasRenderingContext2D, polygon: Vec2[]) => {
  ctx.beginPath();
  polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

export function surfaceFill(product: ProductDefinition, design: Design, surfaceId: string) {
  return isSurfaceAvailable(product, surfaceId, design.options)
    ? (design.surfaces[surfaceId]?.fill ?? product.defaultFill)
    : (product.unprintedFill ?? '#ffffff');
}

/**
 * Draws one surface (fill + clipped layers) in its frame. The caller sets up the transform
 * from frame units to the target (atlas, editor or proof).
 */
export function drawSurfaceInFrame(
  ctx: CanvasRenderingContext2D,
  product: ProductDefinition,
  design: Design,
  surface: SurfaceDef,
  images: ImageLookup,
  outline: Vec2[] = frameOf(surface).localPolygon,
) {
  const frame = frameOf(surface);
  ctx.save();
  tracePolygon(ctx, outline);
  ctx.fillStyle = surfaceFill(product, design, surface.id);
  ctx.fill();
  const layers = isSurfaceAvailable(product, surface.id, design.options) ? design.surfaces[surface.id]?.layers : undefined;
  if (layers?.length) {
    ctx.clip();
    for (const layer of layers) drawPlacedLayer(ctx, layer, frame, design.assets, images);
  }
  ctx.restore();
}

export function composeAtlas(
  ctx: CanvasRenderingContext2D,
  product: ProductDefinition,
  design: Design,
  images: ImageLookup,
  { size, bleed = 0, shade, background, layout = 'texture', debugGrid = false }: ComposeOptions,
) {
  const k = size / product.atlasSize;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, product.atlasSize, product.atlasSize);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, product.atlasSize, product.atlasSize);
  }
  for (const surface of geometryFor(product, design).surfaces) {
    const frame = frameOf(surface);
    const texture = layout === 'texture';
    const outline = texture && bleed > 0 ? offsetConvexPolygon(surface.polygon, bleed).map((p) => atlasToFrame(frame, p)) : undefined;
    ctx.save();
    ctx.translate(frame.center[0], frame.center[1]);
    ctx.rotate((frame.rotation * Math.PI) / 180);
    if (texture) ctx.scale(frame.atlasScale[0], frame.atlasScale[1]);
    else ctx.scale(frame.editorScale, frame.editorScale);
    drawSurfaceInFrame(ctx, product, design, surface, images, outline);
    if (debugGrid) drawDebugGrid(ctx, product, frame);
    ctx.restore();
  }
  if (shade) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(shade, 0, 0, product.atlasSize, product.atlasSize);
  }
  ctx.restore();
}

/** Grid every foot, the panel's name and an arrow pointing to its "up" edge, in frame units. */
function drawDebugGrid(ctx: CanvasRenderingContext2D, product: ProductDefinition, frame: SurfaceFrame) {
  const foot = 12 * UNITS_PER_INCH;
  const [w, h] = [frame.width / 2, frame.height / 2];
  ctx.save();
  tracePolygon(ctx, frame.localPolygon);
  ctx.clip();
  ctx.lineWidth = frame.width / 400;
  for (let x = 0; x <= w; x += foot) {
    for (const sx of x === 0 ? [0] : [x, -x]) {
      ctx.strokeStyle = sx === 0 ? 'rgba(220,30,60,0.9)' : 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(sx, -h);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
  }
  for (let y = 0; y <= h; y += foot) {
    for (const sy of y === 0 ? [0] : [y, -y]) {
      ctx.strokeStyle = sy === 0 ? 'rgba(30,90,220,0.9)' : 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(-w, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
  }
  const fontPx = Math.min(frame.height * 0.14, frame.width * 0.05);
  ctx.fillStyle = '#000';
  ctx.font = `700 ${fontPx}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = product.surfaceLabels[frame.surface.id] ?? frame.surface.id;
  ctx.fillText(`${label} · ${frame.surface.physical.widthIn.toFixed(0)}″ × ${frame.surface.physical.heightIn.toFixed(0)}″`, 0, -fontPx * 0.8);
  ctx.fillText('↑ UP', 0, fontPx * 0.8);
  ctx.restore();
}

/** One surface as it reads on the product, at true proportions (PDF artwork proofs). */
export function renderSurfaceUpright(
  product: ProductDefinition,
  design: Design,
  surface: SurfaceDef,
  images: ImageLookup,
  pixelWidth: number,
  background = '#ffffff',
): HTMLCanvasElement {
  const frame = frameOf(surface);
  const k = pixelWidth / frame.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(frame.width * k);
  canvas.height = Math.round(frame.height * k);
  const ctx = canvas.getContext('2d')!;
  // Triangular panels leave corners outside the outline; JPEG would turn them black.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, canvas.width / 2, canvas.height / 2);
  drawSurfaceInFrame(ctx, product, design, surface, images);
  return canvas;
}
