import type { ProductDefinition } from '../product/types';
import { isOptionVisible, surfacesFor } from './factory';
import type { Design } from './schema';

/**
 * The pricing-relevant facts of a design. The pricing service computes these itself from the
 * submitted design (it never trusts counts sent by the browser); the UI uses the same function
 * to explain what is being charged.
 */
export interface CustomizationFacts {
  /** Surfaces carrying at least one artwork layer (a plain background colour is free). */
  printedSurfaces: string[];
  printedByGroup: Record<string, number>;
  imageLayers: number;
  textLayers: number;
  /** Options that apply, with hidden ones (e.g. frame finish on "canopy only") removed. */
  effectiveOptions: Record<string, string>;
}

export function customizationFacts(product: ProductDefinition, design: Design): CustomizationFacts {
  const printedByGroup: Record<string, number> = Object.fromEntries(product.surfaceGroups.map((g) => [g.id, 0]));
  const printedSurfaces: string[] = [];
  let imageLayers = 0;
  let textLayers = 0;
  for (const surface of surfacesFor(product, design)) {
    const layers = (design.surfaces[surface.id]?.layers ?? []).filter(
      (l) => l.type === 'image' || l.text.trim().length > 0,
    );
    if (layers.length === 0) continue;
    printedSurfaces.push(surface.id);
    printedByGroup[surface.group] = (printedByGroup[surface.group] ?? 0) + 1;
    for (const layer of layers) {
      if (layer.type === 'image') imageLayers++;
      else textLayers++;
    }
  }
  const effectiveOptions = Object.fromEntries(
    Object.entries(design.options).filter(([key]) => isOptionVisible(product, key, design.options)),
  );
  return { printedSurfaces, printedByGroup, imageLayers, textLayers, effectiveOptions };
}
