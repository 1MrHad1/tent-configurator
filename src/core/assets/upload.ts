import { newId } from '../design/factory';
import type { Asset } from '../design/schema';
import type { ProductDefinition } from '../product/types';

export class UploadError extends Error {}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SVGs without width/height have no intrinsic size in some browsers; derive it from viewBox. */
function sizedSvg(text: string): { svg: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) throw new UploadError('That SVG could not be read.');
  // Uploaded SVGs are only ever drawn through <img>, where scripts never run, but strip them anyway.
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  const viewBox = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  let width = parseFloat(root.getAttribute('width') ?? '');
  let height = parseFloat(root.getAttribute('height') ?? '');
  if (!(width > 0 && height > 0) && viewBox?.length === 4) [width, height] = [viewBox[2], viewBox[3]];
  if (!(width > 0 && height > 0)) [width, height] = [1000, 1000];
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

/**
 * Validates an upload and turns it into a design asset. Raster images are downscaled to the
 * product's maximum edge (keeps the design payload small); the original's size and SHA-256
 * are recorded so production can match it to the customer's file.
 */
export async function createAsset(file: File, product: ProductDefinition): Promise<Asset> {
  const { acceptedTypes, maxUploadBytes, maxImageEdge } = product.limits;
  if (!acceptedTypes.includes(file.type)) throw new UploadError(`${file.name}: use JPG, PNG, WebP or SVG.`);
  if (file.size > maxUploadBytes) throw new UploadError(`${file.name} is over ${Math.round(maxUploadBytes / 1048576)} MB.`);
  const buffer = await file.arrayBuffer();
  const base = { id: newId('asset'), name: file.name, mime: file.type, bytes: file.size, sha256: await sha256Hex(buffer) };

  if (file.type === 'image/svg+xml') {
    const { svg, width, height } = sizedSvg(new TextDecoder().decode(buffer));
    return { ...base, width: Math.round(width), height: Math.round(height), src: await readAsDataUrl(new Blob([svg], { type: file.type })) };
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new UploadError(`${file.name} could not be decoded.`);
  });
  const scale = Math.min(1, maxImageEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    const result = { ...base, width: bitmap.width, height: bitmap.height, src: await readAsDataUrl(file) };
    bitmap.close();
    return result;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const keepAlpha = file.type !== 'image/jpeg';
  const src = canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.92);
  return { ...base, mime: keepAlpha ? 'image/png' : 'image/jpeg', width: canvas.width, height: canvas.height, src };
}
