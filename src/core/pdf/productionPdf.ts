/**
 * Production summary PDF, generated in the browser from the same design object and renderers
 * as the editor and the 3D view. Structured for production and for attaching to the order:
 *
 *   1. Summary     3D previews, selections, price breakdown, design / quote references
 *   2. Print layout  every panel with size and background colour
 *   3. Artwork     each printed panel upright at true proportions, with per-layer specs
 *                  (physical position and size, fonts, colours, effective image DPI)
 *   4. Data        the machine-readable configuration (same JSON the API stores)
 *
 * jsPDF is loaded on demand so it never weighs on the configurator's first load.
 */
import { geometryFor, isOptionVisible, isSurfaceAvailable } from '../design/factory';
import { stripAssetData, type Design, type Layer } from '../design/schema';
import { UNITS_PER_INCH } from '../geometry';
import type { ProductDefinition } from '../product/types';
import { formatMoneyPlain } from '../pricing/client';
import type { Quote } from '../pricing/types';
import { ensureImages, imageLookup } from '../assets/images';
import { frameOf, renderSurfaceUpright, surfaceFill } from '../render/composeAtlas';
import { imageBox, layoutText } from '../render/drawLayer';

export interface PdfInput {
  product: ProductDefinition;
  design: Design;
  quote: Quote;
  designId?: string;
  designUrl?: string;
  /** JPEG data URLs of 3D renders, keyed by camera view id. */
  previews: { id: string; label: string; dataUrl: string }[];
}

const PAGE = { w: 297, h: 210, m: 12 };
const INK = '#16171a';
const MUTED = '#6b6f76';
const RULE = '#dcdde0';
const LOW_DPI = 100;

const inches = (v: number) => `${v.toFixed(1)}"`;

export function describeLayer(layer: Layer, product: ProductDefinition, design: Design, surfaceId: string): string[] {
  const surface = geometryFor(product, design).surfaces.find((s) => s.id === surfaceId)!;
  const frame = frameOf(surface);
  const inch = (units: number) => units / UNITS_PER_INCH;
  const left = inch((layer.x + 0.5) * frame.width);
  const top = inch((layer.y + 0.5) * frame.height);
  const where = `centre ${inches(left)} from left, ${inches(top)} from top, rotated ${Math.round(layer.rotation)}°`;
  if (layer.type === 'text') {
    const t = layoutText(layer, frame);
    return [
      `Text "${layer.text.replace(/\n/g, ' / ')}"`,
      `${layer.fontFamily} ${layer.fontWeight}${layer.italic ? ' italic' : ''}, colour ${layer.fill.toUpperCase()}` +
        (layer.stroke && layer.strokeWidth > 0 ? `, outline ${layer.stroke.toUpperCase()}` : ''),
      `${inches(inch(t.width))} × ${inches(inch(t.height))} (cap height ~${inches(inch(t.fontPx) * 0.7)}), ${where}`,
    ];
  }
  const asset = design.assets[layer.assetId];
  const box = imageBox(layer, frame, asset);
  const widthIn = inch(box.width);
  const size = asset ? (asset.bytes >= 1048576 ? `${(asset.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(asset.bytes / 1024))} KB`) : '';
  const hash = asset?.sha256 ? ` · sha256 ${asset.sha256.slice(0, 16)}…` : '';
  const vector = asset?.mime === 'image/svg+xml';
  const dpi = asset && !vector ? Math.round(asset.width / widthIn) : 0;
  return [
    `Image ${asset?.name ?? layer.assetId} (${vector ? 'vector SVG' : `${asset?.width}×${asset?.height} px`}${asset ? `, ${size} original` : ''})`,
    `${inches(widthIn)} × ${inches(inch(box.height))}${layer.flipX ? ', mirrored' : ''}${layer.opacity < 1 ? `, ${Math.round(layer.opacity * 100)}% opacity` : ''}, ${where}`,
    vector
      ? `Vector artwork: prints sharp at any size${hash}`
      : `Effective resolution ${dpi} DPI${dpi < LOW_DPI ? '  ⚠ below 100 DPI: request a higher resolution file' : ''}${hash}`,
  ];
}

export async function buildProductionPdf(input: PdfInput): Promise<Blob> {
  const { product, design, quote, previews, designId } = input;
  const { jsPDF } = await import('jspdf');
  await ensureImages(design.assets);
  const images = imageLookup(design.assets);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const surfaces = geometryFor(product, design).surfaces;
  const label = (id: string) => product.surfaceLabels[id] ?? id;
  const created = new Date();

  doc.setProperties({
    title: `${product.name} production summary${designId ? ` ${designId}` : ''}`,
    subject: designId ?? quote.quoteId,
    keywords: [product.id, designId, quote.quoteId, quote.configHash].filter(Boolean).join(' '),
    creator: 'Product Configurator',
  });

  let pageNo = 0;
  const header = (title: string) => {
    if (pageNo++ > 0) doc.addPage();
    doc.setFillColor(INK);
    doc.rect(0, 0, PAGE.w, 16, 'F');
    doc.setTextColor('#ffffff');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${product.name} · ${title}`, PAGE.m, 10.4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${designId ? `Design ${designId} · ` : ''}Quote ${quote.quoteId} · ${created.toLocaleString('en-IN')}`, PAGE.w - PAGE.m, 10.4, { align: 'right' });
    doc.setTextColor(MUTED);
    doc.setFontSize(7);
    doc.text(`Config hash ${quote.configHash.slice(0, 24)}… · schema v${design.schemaVersion}`, PAGE.m, PAGE.h - 6);
    doc.text(`Page ${pageNo}`, PAGE.w - PAGE.m, PAGE.h - 6, { align: 'right' });
    doc.setTextColor(INK);
  };
  const heading = (text: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(INK);
    doc.text(text.toUpperCase(), x, y);
    doc.setDrawColor(RULE);
    doc.line(x, y + 1.8, x + 95, y + 1.8);
  };
  const row = (left: string, right: string, x: number, y: number, w: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(bold ? INK : '#33363b');
    doc.text(left, x, y, { maxWidth: w - 34 });
    doc.text(right, x + w, y, { align: 'right' });
  };

  // 1. Summary ---------------------------------------------------------------------------
  header('Production summary');
  const [hero, ...rest] = previews;
  if (hero) doc.addImage(hero.dataUrl, 'JPEG', PAGE.m, 22, 170, 112);
  rest.slice(0, 2).forEach((p, i) => {
    doc.addImage(p.dataUrl, 'JPEG', PAGE.m + i * 86, 138, 84, 55);
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text(p.label, PAGE.m + i * 86 + 2, 191);
  });

  const cx = 196;
  const cw = PAGE.w - PAGE.m - cx;
  let y = 26;
  heading('Selections', cx, y);
  y += 8;
  for (const option of product.options) {
    if (!isOptionVisible(product, option.id, design.options)) continue;
    const choice = option.choices.find((c) => c.id === design.options[option.id]);
    row(option.label, choice?.label ?? '-', cx, y, cw);
    y += 5.4;
  }
  row('Quantity', String(design.quantity), cx, y, cw);
  y += 5.4;
  row('Shopify variant', `${quote.variant.sku} (#${quote.variant.id})`, cx, y, cw);
  y += 5.4;
  const printed = surfaces.filter((s) => design.surfaces[s.id]?.layers.length && isSurfaceAvailable(product, s.id, design.options));
  doc.setFontSize(8.5);
  doc.setTextColor('#33363b');
  doc.text(`Printed panels: ${printed.length ? printed.map((s) => label(s.id)).join(', ') : 'none (colour only)'}`, cx, y + 1, { maxWidth: cw });
  y += 12;

  heading('Price (per unit)', cx, y);
  y += 8;
  for (const line of quote.lines) {
    row(line.label, formatMoneyPlain(line.unitAmount, quote.currency), cx, y, cw);
    y += 5.4;
  }
  doc.setDrawColor(RULE);
  doc.line(cx, y - 2.6, cx + cw, y - 2.6);
  row('Unit price', formatMoneyPlain(quote.unitPrice, quote.currency), cx, y + 1, cw, true);
  y += 6;
  row(`Total × ${quote.quantity}`, formatMoneyPlain(quote.total, quote.currency), cx, y + 1, cw, true);
  y += 9;
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text(
    `Quote valid until ${new Date(quote.expiresAt).toLocaleString('en-IN')}. Signature ${quote.signature.slice(0, 20)}…`,
    cx,
    y,
    { maxWidth: cw },
  );
  if (design.notes.trim()) {
    y += 9;
    heading('Customer notes', cx, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#33363b');
    doc.text(design.notes.trim().slice(0, 600), cx, y + 7, { maxWidth: cw });
  }
  if (input.designUrl) {
    doc.setFontSize(7.5);
    doc.setTextColor('#2647c8');
    doc.textWithLink('Open saved design (JSON)', cx, PAGE.h - 12, { url: input.designUrl });
  }

  // 2. Print layout --------------------------------------------------------------------------
  header('Print layout');
  heading('Panels', PAGE.m, 26);
  const tableTop = 34;
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  ['Panel', 'Finished size (W × H)', 'Background', 'Layers', 'Status'].forEach((h, i) => doc.text(h, PAGE.m + [0, 52, 104, 140, 160][i], tableTop));
  surfaces.forEach((s, i) => {
    const ry = tableTop + 7 + i * 7;
    const available = isSurfaceAvailable(product, s.id, design.options);
    const fill = surfaceFill(product, design, s.id);
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text(label(s.id), PAGE.m, ry);
    doc.text(`${inches(s.physical.widthIn)} × ${inches(s.physical.heightIn)}`, PAGE.m + 52, ry);
    doc.setFillColor(fill);
    doc.setDrawColor(RULE);
    doc.rect(PAGE.m + 104, ry - 3.2, 4, 4, 'FD');
    doc.text(fill.toUpperCase(), PAGE.m + 110, ry);
    doc.text(String(available ? (design.surfaces[s.id]?.layers.length ?? 0) : 0), PAGE.m + 140, ry);
    doc.setTextColor(available ? INK : MUTED);
    doc.text(available ? (design.surfaces[s.id]?.layers.length ? 'Printed artwork' : 'Colour only') : 'Not printed', PAGE.m + 160, ry);
  });
  // Upright thumbnails of every panel, so the layout page reads at a glance.
  const thumbs = surfaces.filter((s) => isSurfaceAvailable(product, s.id, design.options));
  const tw = (PAGE.w - PAGE.m * 2 - (Math.min(thumbs.length, 4) - 1) * 6) / Math.min(thumbs.length, 4);
  let ty = tableTop + 12 + surfaces.length * 7;
  thumbs.forEach((s, i) => {
    const col = i % 4;
    if (i > 0 && col === 0) ty += 40;
    const canvas = renderSurfaceUpright(product, design, s, images, 600);
    const h = Math.min(30, (tw * canvas.height) / canvas.width);
    const w = (h * canvas.width) / canvas.height;
    const x = PAGE.m + col * (tw + 6);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', x, ty, w, h);
    doc.setDrawColor(RULE);
    doc.rect(x, ty, w, h);
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text(label(s.id), x, ty + h + 3.5);
  });

  // 3. Artwork -------------------------------------------------------------------------------
  const artwork = surfaces.filter((s) => isSurfaceAvailable(product, s.id, design.options) && design.surfaces[s.id]?.layers.length);
  artwork.forEach((s, i) => {
    if (i % 2 === 0) header('Artwork');
    const top = 22 + (i % 2) * 92;
    const canvas = renderSurfaceUpright(product, design, s, images, 1400);
    const maxW = 150;
    const maxH = 80;
    const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * scale;
    const h = canvas.height * scale;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', PAGE.m, top + 6, w, h);
    doc.setDrawColor(RULE);
    doc.rect(PAGE.m, top + 6, w, h);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(INK);
    doc.text(`${label(s.id)} · ${inches(s.physical.widthIn)} × ${inches(s.physical.heightIn)} · background ${surfaceFill(product, design, s.id).toUpperCase()}`, PAGE.m, top + 3);
    let ly = top + 9;
    const lx = PAGE.m + maxW + 8;
    const lw = PAGE.w - PAGE.m - lx;
    design.surfaces[s.id].layers.forEach((layer, n) => {
      const lines = describeLayer(layer, product, design, s.id);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(INK);
      doc.text(`${n + 1}. ${lines[0]}`, lx, ly, { maxWidth: lw });
      ly += 4.4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(lines.some((l) => l.includes('⚠')) ? '#b4401b' : '#45484e');
      for (const detail of lines.slice(1)) {
        const wrapped = doc.splitTextToSize(detail.replace('⚠', '!'), lw);
        doc.text(wrapped, lx + 3, ly);
        ly += 3.7 * wrapped.length;
      }
      ly += 2;
    });
  });

  // 4. Data ----------------------------------------------------------------------------------
  const json = JSON.stringify({ designId, quoteId: quote.quoteId, configHash: quote.configHash, design: stripAssetData(design) }, null, 1);
  const lines = doc.setFont('courier', 'normal').setFontSize(6).splitTextToSize(json, PAGE.w - PAGE.m * 2) as string[];
  const perPage = 70;
  for (let i = 0; i < lines.length; i += perPage) {
    header('Configuration data');
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.setTextColor('#33363b');
    doc.text(lines.slice(i, i + perPage), PAGE.m, 23);
  }

  return doc.output('blob');
}
