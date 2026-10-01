/**
 * Price books, one per product. This is the data a real pricing/CRM API would own; here it
 * is a module the mock API reads. All amounts are in minor units (paise).
 *
 * PLACEHOLDER VALUES. Prices, SKUs and variant IDs are illustrative, not a real catalogue.
 */

export interface PriceBook {
  productId: string;
  currency: string;
  /** Shopify variants: one per combination of the `match` options. */
  variants: { match: Record<string, string>; id: string; sku: string; title: string; price: number }[];
  /** Flat per-unit add-ons for an option choice. */
  optionPrices: { option: string; choice: string; amount: number; label: string }[];
  /** Printing charges per surface group: the first `included` printed surfaces are free. */
  printing: { group: string; included: number; perSurface: number; label: string }[];
  /** Percentage surcharges for an option choice, applied to the configured unit price. */
  surcharges: { option: string; choice: string; percent: number; label: string }[];
  quantityTiers: { minQuantity: number; percentOff: number }[];
  quoteTtlMinutes: number;
}

const INR = (rupees: number) => Math.round(rupees * 100);

const tentVariant = (size: string, pkg: string, id: string, price: number) => ({
  match: { size, package: pkg },
  id,
  sku: `DEMO-TENT-${size.replace('.', '')}-${pkg === 'canopy-frame' ? 'KIT' : 'TOP'}`,
  title: `${size.replace('x', "' × ")}' / ${pkg === 'canopy-frame' ? 'Canopy + frame' : 'Canopy only'}`,
  price: INR(price),
});

export const priceBooks: Record<string, PriceBook> = {
  'canopy-tent': {
    productId: 'canopy-tent',
    currency: 'INR',
    variants: [
      tentVariant('5x5', 'canopy-frame', '48270445412001', 38500),
      tentVariant('5x5', 'canopy-only', '48270445412002', 21500),
      tentVariant('6.5x6.5', 'canopy-frame', '48270445412003', 49500),
      tentVariant('6.5x6.5', 'canopy-only', '48270445412004', 27900),
      tentVariant('8x8', 'canopy-frame', '48270445412005', 62000),
      tentVariant('8x8', 'canopy-only', '48270445412006', 34500),
    ],
    optionPrices: [{ option: 'frameFinish', choice: 'black', amount: INR(4500), label: 'Black powder-coat frame' }],
    printing: [
      { group: 'roof', included: 1, perSurface: INR(2000), label: 'Printed roof panel' },
      { group: 'valance', included: 0, perSurface: INR(1200), label: 'Printed valance' },
    ],
    surcharges: [{ option: 'production', choice: 'rush', percent: 15, label: 'Rush production (2 days)' }],
    quantityTiers: [
      { minQuantity: 10, percentOff: 15 },
      { minQuantity: 5, percentOff: 10 },
      { minQuantity: 2, percentOff: 5 },
    ],
    quoteTtlMinutes: 60,
  },
  'backdrop-banner': {
    productId: 'backdrop-banner',
    currency: 'INR',
    variants: [
      { match: { size: '8x8' }, id: '48270445413001', sku: 'DEMO-BACKDROP-8X8', title: "8' × 8'", price: INR(18500) },
      { match: { size: '10x8' }, id: '48270445413002', sku: 'DEMO-BACKDROP-10X8', title: "10' × 8'", price: INR(22900) },
    ],
    optionPrices: [{ option: 'sides', choice: 'double', amount: INR(6500), label: 'Double-sided print' }],
    printing: [{ group: 'face', included: 1, perSurface: 0, label: 'Printed face' }],
    surcharges: [{ option: 'production', choice: 'rush', percent: 15, label: 'Rush production (2 days)' }],
    quantityTiers: [
      { minQuantity: 5, percentOff: 10 },
      { minQuantity: 2, percentOff: 5 },
    ],
    quoteTtlMinutes: 60,
  },
};
