/**
 * The configuration ("design") is the single source of truth. The 2D editor, the 3D texture,
 * the price quote, the PDF and the cart line are all derived from this one object.
 *
 * Coordinates are relative to each surface's *upright frame* (how the panel is seen on the
 * real product), not to screen pixels or texture pixels:
 *   x, y  -0.5..0.5 across the panel's width / height (0,0 = centre, y down)
 *   width / fontSize  as a fraction of the panel's width
 *   rotation  degrees relative to upright (0 = reads correctly on the product)
 * That keeps a design valid when the customer switches size (each size has its own UV layout)
 * and makes the PDF's physical measurements a multiplication, not a conversion.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a #rrggbb colour');
const id = z.string().min(1).max(64);

const layerBase = {
  id,
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1).default(1),
};

export const imageLayerSchema = z.object({
  ...layerBase,
  type: z.literal('image'),
  assetId: id,
  width: z.number().positive().max(4),
  flipX: z.boolean().default(false),
});

export const textLayerSchema = z.object({
  ...layerBase,
  type: z.literal('text'),
  text: z.string().max(200),
  fontFamily: z.string().min(1).max(64),
  fontWeight: z.union([z.literal(400), z.literal(700)]),
  italic: z.boolean().default(false),
  fontSize: z.number().positive().max(2),
  fill: hex,
  align: z.enum(['left', 'center', 'right']).default('center'),
  stroke: hex.nullable().default(null),
  strokeWidth: z.number().min(0).max(0.2).default(0),
  letterSpacing: z.number().min(-0.2).max(1).default(0),
});

export const layerSchema = z.discriminatedUnion('type', [imageLayerSchema, textLayerSchema]);

export const surfaceDesignSchema = z.object({
  fill: hex,
  layers: z.array(layerSchema).max(50),
});

export const assetSchema = z.object({
  id,
  name: z.string().max(200),
  mime: z.string().max(64),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Original upload size, before any client-side downscale. */
  bytes: z.number().int().nonnegative(),
  /** data: URL in the browser, an https URL once stored by the design service. Omitted for pricing. */
  src: z.string().optional(),
  sha256: z.string().optional(),
});

export const designSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  productId: id,
  options: z.record(z.string(), z.string()),
  quantity: z.number().int().min(1).max(500),
  surfaces: z.record(z.string(), surfaceDesignSchema),
  assets: z.record(z.string(), assetSchema),
  notes: z.string().max(2000).default(''),
});

export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type SurfaceDesign = z.infer<typeof surfaceDesignSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Design = z.infer<typeof designSchema>;

/** The design without embedded image data: what pricing and the cart need. */
export function stripAssetData(design: Design): Design {
  const assets = Object.fromEntries(
    Object.entries(design.assets).map(([key, { src: _src, ...rest }]) => [key, rest]),
  );
  return { ...design, assets };
}
