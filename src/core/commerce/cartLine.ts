import { isOptionVisible } from '../design/factory';
import { customizationFacts } from '../design/facts';
import type { Design } from '../design/schema';
import type { CartLine } from '../embed/protocol';
import { formatMoney } from '../pricing/client';
import type { Quote } from '../pricing/types';
import type { ProductDefinition } from '../product/types';
import type { SavedDesign } from '../persistence/designsClient';

/**
 * Maps a priced, saved design onto a Shopify cart line.
 *
 * Visible properties are what the customer and merchant read in cart, checkout and order
 * admin. Underscore properties are hidden from the customer and carry what the backend needs:
 * the design id, the signed quote (so a Cart Transform Function or an order webhook can
 * verify the configured price) and the production PDF link.
 */
export function buildCartLine(product: ProductDefinition, design: Design, quote: Quote, saved: SavedDesign | null): CartLine {
  const facts = customizationFacts(product, design);
  const visible: Record<string, string> = {};
  for (const option of product.options) {
    if (!isOptionVisible(product, option.id, design.options)) continue;
    visible[option.label] = option.choices.find((c) => c.id === design.options[option.id])?.label ?? design.options[option.id];
  }
  visible['Printed panels'] = facts.printedSurfaces.length
    ? facts.printedSurfaces.map((id) => product.surfaceLabels[id] ?? id).join(', ')
    : 'Colour only';
  visible['Configured price'] = `${formatMoney(quote.unitPrice, quote.currency)} each`;
  if (saved) {
    visible['Design ID'] = saved.designId;
    visible['Production PDF'] = saved.links.pdf;
  }
  if (design.notes.trim()) visible['Design notes'] = design.notes.trim().slice(0, 250);

  const hidden: Record<string, string> = {
    _product: product.id,
    _quote_id: quote.quoteId,
    _quote_unit_price: String(quote.unitPrice),
    _quote_total: String(quote.total),
    _quote_currency: quote.currency,
    _quote_expires: quote.expiresAt,
    _quote_signature: quote.signature,
    _config_hash: quote.configHash,
  };
  if (saved) {
    hidden._design_id = saved.designId;
    hidden._design_url = saved.links.design;
    hidden._preview_url = saved.links.preview;
  }
  return { variantId: quote.variant.id, quantity: quote.quantity, properties: { ...visible, ...hidden } };
}
