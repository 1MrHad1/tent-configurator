import { normalizeDesign } from '../../src/core/design/factory';
import { customizationFacts } from '../../src/core/design/facts';
import { designSchema, stripAssetData, type Design } from '../../src/core/design/schema';
import type { ProductDefinition } from '../../src/core/product/types';
import type { Quote, QuoteLine } from '../../src/core/pricing/types';
import { canonicalJson, hmacSha256, safeEqual, sha256 } from './crypto';
import type { PriceBook } from './priceBook';

export class PricingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Validates an untrusted design and makes it consistent with the product. */
export function parseDesign(product: ProductDefinition, input: unknown): Design {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) {
    throw new PricingError(
      'Invalid design',
      400,
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  if (parsed.data.productId !== product.id) throw new PricingError('Design is for a different product');
  return normalizeDesign(product, parsed.data);
}

const percentOf = (amount: number, percent: number) => Math.round((amount * percent) / 100 / 100) * 100;

/**
 * Prices one unit of a design. Pure and synchronous: easy to unit test, and the same code
 * computes option price hints for the catalog endpoint.
 */
export function priceUnit(product: ProductDefinition, book: PriceBook, design: Design) {
  const facts = customizationFacts(product, design);
  const options = facts.effectiveOptions;

  const variant = book.variants.find((v) => Object.entries(v.match).every(([k, val]) => options[k] === val));
  if (!variant) throw new PricingError(`No variant for ${JSON.stringify(options)}`, 422);

  const lines: QuoteLine[] = [{ code: 'variant', label: variant.title, kind: 'base', unitAmount: variant.price }];

  for (const op of book.optionPrices) {
    if (options[op.option] === op.choice) {
      lines.push({ code: `option.${op.option}.${op.choice}`, label: op.label, kind: 'option', unitAmount: op.amount });
    }
  }

  for (const rule of book.printing) {
    const printed = facts.printedByGroup[rule.group] ?? 0;
    const charged = Math.max(0, printed - rule.included);
    if (charged > 0 && rule.perSurface > 0) {
      lines.push({
        code: `print.${rule.group}`,
        label: `${rule.label} × ${charged}`,
        kind: 'customization',
        unitAmount: charged * rule.perSurface,
        detail: rule.included > 0 ? `${printed} printed, first ${rule.included} included` : `${printed} printed`,
      });
    }
  }

  const configured = lines.reduce((sum, l) => sum + l.unitAmount, 0);
  for (const s of book.surcharges) {
    if (options[s.option] === s.choice) {
      lines.push({
        code: `surcharge.${s.option}.${s.choice}`,
        label: s.label,
        kind: 'surcharge',
        unitAmount: percentOf(configured, s.percent),
        detail: `+${s.percent}%`,
      });
    }
  }

  const beforeDiscount = lines.reduce((sum, l) => sum + l.unitAmount, 0);
  const tier = book.quantityTiers.find((t) => design.quantity >= t.minQuantity);
  if (tier) {
    lines.push({
      code: 'discount.quantity',
      label: `Quantity discount (${tier.percentOff}%)`,
      kind: 'discount',
      unitAmount: -percentOf(beforeDiscount, tier.percentOff),
      detail: `${design.quantity}+ units`,
    });
  }

  const unitPrice = lines.reduce((sum, l) => sum + l.unitAmount, 0);
  return { variant, lines, unitPrice, facts };
}

const quoteSigningPayload = (q: Pick<Quote, 'quoteId' | 'configHash' | 'variant' | 'quantity' | 'total' | 'currency' | 'expiresAt'>) =>
  [q.quoteId, q.configHash, q.variant.id, q.quantity, q.total, q.currency, q.expiresAt].join('|');

export async function configHash(design: Design): Promise<string> {
  return sha256(canonicalJson(stripAssetData(design)));
}

export async function createQuote(
  product: ProductDefinition,
  book: PriceBook,
  input: unknown,
  { secret, now = new Date() }: { secret: string; now?: Date },
): Promise<Quote> {
  const design = parseDesign(product, input);
  const { variant, lines, unitPrice } = priceUnit(product, book, design);
  const hash = await configHash(design);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + book.quoteTtlMinutes * 60_000).toISOString();
  const unsigned = {
    quoteId: `q_${hash.slice(0, 10)}_${now.getTime().toString(36)}`,
    productId: product.id,
    currency: book.currency,
    variant: { id: variant.id, sku: variant.sku, title: variant.title, price: variant.price },
    lines,
    unitPrice,
    quantity: design.quantity,
    total: unitPrice * design.quantity,
    configHash: hash,
    issuedAt,
    expiresAt,
  };
  return { ...unsigned, signature: await hmacSha256(secret, quoteSigningPayload(unsigned)) };
}

/**
 * What the store side (a Shopify Function, order webhook or app proxy) calls to make sure a
 * price it received with a cart line was issued by this service and has not been edited.
 */
export async function verifyQuote(quote: Quote, secret: string, now = new Date()) {
  const expected = await hmacSha256(secret, quoteSigningPayload(quote));
  if (!safeEqual(expected, quote.signature)) return { valid: false, reason: 'bad-signature' as const };
  if (new Date(quote.expiresAt) < now) return { valid: false, reason: 'expired' as const };
  return { valid: true as const };
}
