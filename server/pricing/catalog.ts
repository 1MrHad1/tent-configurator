import { createDesign } from '../../src/core/design/factory';
import type { ProductDefinition } from '../../src/core/product/types';
import type { Catalog } from '../../src/core/pricing/types';
import type { PriceBook } from './priceBook';
import { priceUnit } from './quote';

export function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
}

/**
 * Price hints for every option choice, relative to the customer's current selection.
 * Each hint is the difference between two runs of the real pricing function, so a hint can
 * never disagree with the quote.
 */
export function buildCatalog(product: ProductDefinition, book: PriceBook, current: Record<string, string>): Catalog {
  const base = createDesign(product, current);
  const baseline = priceUnit(product, book, base).unitPrice;
  const hints: Catalog['hints'] = {};

  for (const option of product.options) {
    hints[option.id] = {};
    for (const choice of option.choices) {
      let delta: number;
      try {
        delta = priceUnit(product, book, createDesign(product, { ...base.options, [option.id]: choice.id })).unitPrice - baseline;
      } catch {
        continue;
      }
      hints[option.id][choice.id] =
        base.options[option.id] === choice.id
          ? 'Selected'
          : delta === 0
            ? 'No change'
            : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta), book.currency)}`;
    }
  }

  const rules = [
    'Background colours are free: unlimited colours, no setup fees.',
    ...book.printing
      .filter((r) => r.perSurface > 0)
      .map((r) =>
        r.included > 0
          ? `${r.label}: first ${r.included} included, then ${formatMoney(r.perSurface, book.currency)} each.`
          : `${r.label}: ${formatMoney(r.perSurface, book.currency)} each.`,
      ),
    ...book.surcharges.map((s) => `${s.label}: +${s.percent}%.`),
    `Quantity: ${[...book.quantityTiers]
      .reverse()
      .map((t) => `${t.percentOff}% off ${t.minQuantity}+`)
      .join(', ')}.`,
  ];

  return { productId: product.id, currency: book.currency, hints, rules };
}
