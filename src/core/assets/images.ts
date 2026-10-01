/**
 * Decoded images for design assets, shared by every renderer. Loading is async; listeners are
 * told when an image becomes available so the 2D stage and 3D texture can redraw.
 */
import type { Asset } from '../design/schema';
import type { ImageLookup, ImageSource } from '../render/drawLayer';

const SVG_RASTER_EDGE = 2048;

const decoded = new Map<string, ImageSource>();
const pending = new Map<string, Promise<ImageSource>>();
const listeners = new Set<() => void>();

export const onImageLoaded = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

async function decode(asset: Asset): Promise<ImageSource> {
  const img = new Image();
  img.decoding = 'async';
  img.crossOrigin = 'anonymous';
  img.src = asset.src!;
  await img.decode();
  if (asset.mime !== 'image/svg+xml') return img;
  // SVGs are rasterised once so per-frame texture composition stays cheap.
  const scale = SVG_RASTER_EDGE / Math.max(asset.width, asset.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(asset.width * scale);
  canvas.height = Math.round(asset.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function requestImage(asset: Asset): Promise<ImageSource> {
  const ready = decoded.get(asset.id);
  if (ready) return Promise.resolve(ready);
  let job = pending.get(asset.id);
  if (!job) {
    job = decode(asset).then((source) => {
      decoded.set(asset.id, source);
      pending.delete(asset.id);
      listeners.forEach((l) => l());
      return source;
    });
    pending.set(asset.id, job);
  }
  return job;
}

/** Synchronous lookup for renderers; kicks off loading for anything not decoded yet. */
export function imageLookup(assets: Record<string, Asset>): ImageLookup {
  return (assetId) => {
    const hit = decoded.get(assetId);
    if (hit) return hit;
    const asset = assets[assetId];
    if (asset?.src) void requestImage(asset).catch(() => undefined);
    return undefined;
  };
}

/** Resolves once every asset in the design is decoded (used before exporting). */
export async function ensureImages(assets: Record<string, Asset>) {
  await Promise.all(Object.values(assets).filter((a) => a.src).map((a) => requestImage(a)));
}
