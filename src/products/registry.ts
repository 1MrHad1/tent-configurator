import type { ProductDefinition } from '../core/product/types';
import { canopyTent } from './canopy-tent/definition';
import { backdropBanner } from './backdrop-banner/definition';

/** Every product the engine can load, keyed by id (`?product=` in the embed URL). */
export const products: Record<string, ProductDefinition> = {
  [canopyTent.id]: canopyTent,
  [backdropBanner.id]: backdropBanner,
};

export const DEFAULT_PRODUCT = canopyTent.id;
