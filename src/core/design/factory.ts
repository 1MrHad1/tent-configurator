import type { ProductDefinition, SurfaceDef } from '../product/types';
import { SCHEMA_VERSION, type Design } from './schema';

/** Surfaces the customer can print on with the current options. */
export function surfacesFor(product: ProductDefinition, design: Pick<Design, 'options'>): SurfaceDef[] {
  return geometryFor(product, design).surfaces.filter((s) => isSurfaceAvailable(product, s.id, design.options));
}

export function isSurfaceAvailable(product: ProductDefinition, surfaceId: string, options: Record<string, string>) {
  const rule = product.surfaceAvailability?.find((r) => r.surface === surfaceId);
  return !rule || rule.availableFor.includes(options[rule.option]);
}

export function geometryFor(product: ProductDefinition, design: Pick<Design, 'options'>) {
  const key = design.options[product.geometryOption];
  return product.geometry[key] ?? Object.values(product.geometry)[0];
}

export function defaultOptions(product: ProductDefinition): Record<string, string> {
  return Object.fromEntries(product.options.map((o) => [o.id, o.defaultChoice]));
}

export function createDesign(product: ProductDefinition, options: Record<string, string> = {}): Design {
  const design: Design = {
    schemaVersion: SCHEMA_VERSION,
    productId: product.id,
    options: { ...defaultOptions(product), ...options },
    quantity: 1,
    surfaces: {},
    assets: {},
    notes: '',
  };
  return normalizeDesign(product, design);
}

/**
 * Makes any (possibly older or hand-edited) design consistent with the product: unknown
 * option values fall back to defaults and every surface of the product has an entry.
 */
export function normalizeDesign(product: ProductDefinition, design: Design): Design {
  const options = { ...defaultOptions(product) };
  for (const option of product.options) {
    const value = design.options[option.id];
    if (option.choices.some((c) => c.id === value)) options[option.id] = value;
  }
  const surfaces = { ...design.surfaces };
  const ids = new Set(Object.values(product.geometry).flatMap((g) => g.surfaces.map((s) => s.id)));
  for (const surfaceId of ids) {
    surfaces[surfaceId] ??= { fill: product.defaultFill, layers: [] };
  }
  return { ...design, productId: product.id, options, surfaces };
}

export function isOptionVisible(product: ProductDefinition, optionId: string, options: Record<string, string>) {
  const option = product.options.find((o) => o.id === optionId);
  if (!option?.visibleWhen) return true;
  return option.visibleWhen.oneOf.includes(options[option.visibleWhen.option]);
}

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
