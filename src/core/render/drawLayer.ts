/**
 * The one place layers are drawn. The 2D editor (inside a Konva custom shape), the 3D texture
 * compositor and the PDF exporter all call these functions with a canvas context that is
 * already positioned at the layer's centre, so the three outputs cannot drift apart.
 *
 * Units are atlas units; `frame.width` converts the design's relative sizes.
 */
import type { SurfaceFrame } from '../geometry';
import type { Asset, ImageLayer, Layer, TextLayer } from '../design/schema';

export type ImageSource = CanvasImageSource & { width: number; height: number };
export type ImageLookup = (assetId: string) => ImageSource | undefined;

export interface LayerBox {
  width: number;
  height: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measureContext(): CanvasRenderingContext2D {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export interface TextLayout extends LayerBox {
  font: string;
  lines: string[];
  lineHeight: number;
  fontPx: number;
  letterSpacingPx: number;
}

export function layoutText(layer: TextLayer, frame: SurfaceFrame): TextLayout {
  const fontPx = layer.fontSize * frame.width;
  const font = `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${fontPx}px "${layer.fontFamily}", sans-serif`;
  const letterSpacingPx = layer.letterSpacing * fontPx;
  const ctx = measureContext();
  ctx.font = font;
  ctx.letterSpacing = `${letterSpacingPx}px`;
  const lines = (layer.text || ' ').split('\n');
  const width = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
  const lineHeight = fontPx * 1.15;
  return { font, lines, lineHeight, fontPx, letterSpacingPx, width, height: lineHeight * lines.length };
}

export function imageBox(layer: ImageLayer, frame: SurfaceFrame, asset: Pick<Asset, 'width' | 'height'> | undefined): LayerBox {
  const width = layer.width * frame.width;
  const aspect = asset ? asset.height / asset.width : 1;
  return { width, height: width * aspect };
}

export function layerBox(layer: Layer, frame: SurfaceFrame, assets: Record<string, Asset>): LayerBox {
  return layer.type === 'text' ? layoutText(layer, frame) : imageBox(layer, frame, assets[layer.assetId]);
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer, frame: SurfaceFrame) {
  const t = layoutText(layer, frame);
  ctx.font = t.font;
  ctx.letterSpacing = `${t.letterSpacingPx}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;
  const x = layer.align === 'left' ? -t.width / 2 : layer.align === 'right' ? t.width / 2 : 0;
  t.lines.forEach((line, i) => {
    const y = -t.height / 2 + t.lineHeight * (i + 0.5);
    if (layer.stroke && layer.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = layer.strokeWidth * t.fontPx * 2; // half of it sits under the fill
      ctx.strokeStyle = layer.stroke;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = layer.fill;
    ctx.fillText(line, x, y);
  });
}

function drawImage(ctx: CanvasRenderingContext2D, layer: ImageLayer, frame: SurfaceFrame, assets: Record<string, Asset>, images: ImageLookup) {
  const { width, height } = imageBox(layer, frame, assets[layer.assetId]);
  const source = images(layer.assetId);
  if (layer.flipX) ctx.scale(-1, 1);
  if (source) {
    ctx.drawImage(source, -width / 2, -height / 2, width, height);
  } else {
    // Still loading: keep the layout stable with a neutral placeholder.
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(-width / 2, -height / 2, width, height);
  }
}

/** Draws a layer centred on the current origin, in the layer's own rotated frame. */
export function drawLayerContent(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  frame: SurfaceFrame,
  assets: Record<string, Asset>,
  images: ImageLookup,
) {
  ctx.save();
  ctx.globalAlpha *= layer.opacity;
  if (layer.type === 'text') drawText(ctx, layer, frame);
  else drawImage(ctx, layer, frame, assets, images);
  ctx.restore();
}

/** Positions a layer in its surface frame (frame-local origin) and draws it. */
export function drawPlacedLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  frame: SurfaceFrame,
  assets: Record<string, Asset>,
  images: ImageLookup,
) {
  ctx.save();
  ctx.translate(layer.x * frame.width, layer.y * frame.height);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  drawLayerContent(ctx, layer, frame, assets, images);
  ctx.restore();
}
