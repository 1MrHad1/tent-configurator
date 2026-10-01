import type { Design } from '../design/schema';
import type { CartLine } from '../embed/protocol';
import type { DesignStore, SavedDesign } from '../persistence/designsClient';
import type { PricingService } from '../pricing/client';
import type { Quote } from '../pricing/types';
import type { ProductDefinition } from '../product/types';
import { buildProductionPdf } from '../pdf/productionPdf';
import type { CommerceAdapter, CartResult } from './adapters';
import { buildCartLine } from './cartLine';

export type CheckoutStep = 'pricing' | 'rendering' | 'saving' | 'pdf' | 'cart' | 'done';

export interface PreviewRenderer {
  capture(viewIds: string[]): Promise<{ id: string; label: string; dataUrl: string }[]>;
}

export interface CheckoutResult {
  quote: Quote;
  saved: SavedDesign | null;
  line: CartLine;
  pdf: Blob;
  cart: CartResult;
  warnings: string[];
}

/**
 * Add-to-cart, end to end. Each dependency is an interface, so the same flow runs against
 * the mock API and a preview cart in the demo, or a real pricing service and Shopify in
 * production.
 *
 *   1. fresh quote from the pricing service (never a price computed in the UI)
 *   2. 3D previews from the viewer
 *   3. save the design: the API verifies the quote's signature and that it matches the design
 *   4. production PDF (includes the design id), attached to the saved design with a preview
 *   5. cart line with the variant, visible properties and the signed quote
 */
export async function runCheckout(deps: {
  product: ProductDefinition;
  design: Design;
  pricing: PricingService;
  designs: DesignStore;
  commerce: CommerceAdapter;
  previews: PreviewRenderer;
  onStep?: (step: CheckoutStep) => void;
}): Promise<CheckoutResult> {
  const { product, design, onStep } = deps;
  const warnings: string[] = [];

  onStep?.('pricing');
  const quote = await deps.pricing.quote(design);

  onStep?.('rendering');
  const previews = await deps.previews.capture(product.views.slice(0, 3).map((v) => v.id));

  onStep?.('saving');
  let saved: SavedDesign | null = null;
  try {
    saved = await deps.designs.save(design, quote);
  } catch (error) {
    warnings.push(`Design not saved to the server: ${(error as Error).message}. The PDF is still available to download.`);
  }

  onStep?.('pdf');
  const pdf = await buildProductionPdf({
    product,
    design,
    quote,
    previews,
    designId: saved?.designId,
    designUrl: saved?.links.design,
  });
  if (saved) {
    const preview = await (await fetch(previews[0].dataUrl)).blob();
    await Promise.all([deps.designs.attachFile(saved.designId, 'pdf', pdf), deps.designs.attachFile(saved.designId, 'preview', preview)]).catch(
      (error: Error) => warnings.push(`Files not attached: ${error.message}`),
    );
  }

  onStep?.('cart');
  const line = buildCartLine(product, design, quote, saved);
  const cart = await deps.commerce.addToCart(line);

  onStep?.('done');
  return { quote, saved, line, pdf, cart, warnings };
}
