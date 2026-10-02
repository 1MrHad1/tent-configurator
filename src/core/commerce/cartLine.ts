import { nearestPantone } from '../color/pantone';
import { isOptionVisible, surfacesFor } from '../design/factory';
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
  visible['Panel colours'] = describePanelColours(product, design);
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

/**
 * "Roof panels: #2647C8 (~PMS 286 C) · Valances: #161616 (~PMS Black C)". Panels sharing a
 * colour are grouped, and a complete surface group is named by the group, not panel by panel.
 */
export function describePanelColours(product: ProductDefinition, design: Design): string {
  const surfaces = surfacesFor(product, design);
  const byColour = new Map<string, string[]>();
  for (const surface of surfaces) {
    const fill = design.surfaces[surface.id].fill.toUpperCase();
    byColour.set(fill, [...(byColour.get(fill) ?? []), surface.id]);
  }
  return [...byColour]
    .map(([hex, ids]) => {
      let where: string[];
      if (ids.length === surfaces.length) where = ['All panels'];
      else {
        where = [];
        const remaining = new Set(ids);
        for (const group of product.surfaceGroups) {
          const members = surfaces.filter((s) => s.group === group.id).map((s) => s.id);
          if (members.length > 1 && members.every((id) => remaining.has(id))) {
            where.push(group.label);
            members.forEach((id) => remaining.delete(id));
          }
        }
        where.push(...[...remaining].map((id) => product.surfaceLabels[id] ?? id));
      }
      const pms = nearestPantone(hex);
      return `${where.join(', ')}: ${hex} (${pms.exact ? '' : '~'}PMS ${pms.code})`;
    })
    .join(' · ');
}
