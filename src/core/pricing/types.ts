/** Wire contract of the pricing service. Shared by the browser client and the API. */
import type { Design } from '../design/schema';

export interface QuoteRequest {
  productId: string;
  /** The design without embedded image data. */
  design: Design;
}

export type QuoteLineKind = 'base' | 'option' | 'customization' | 'surcharge' | 'discount';

export interface QuoteLine {
  code: string;
  label: string;
  kind: QuoteLineKind;
  /** Per-unit amount in minor units (paise / cents). Discounts are negative. */
  unitAmount: number;
  detail?: string;
}

export interface Quote {
  quoteId: string;
  productId: string;
  currency: string;
  /** The Shopify variant the selections resolve to. */
  variant: { id: string; sku: string; title: string; price: number };
  lines: QuoteLine[];
  unitPrice: number;
  quantity: number;
  total: number;
  /** SHA-256 of the canonical design JSON this quote was computed for. */
  configHash: string;
  issuedAt: string;
  expiresAt: string;
  /** HMAC over the quote's key fields so the store can verify the price server-side. */
  signature: string;
}

/** Display hints for option buttons. Informational only: the quote is authoritative. */
export interface Catalog {
  productId: string;
  currency: string;
  /** optionId -> choiceId -> human readable price hint, e.g. "+₹4,500" or "from ₹38,500". */
  hints: Record<string, Record<string, string>>;
  /** Plain-language fee rules shown next to the price breakdown. */
  rules: string[];
}

export interface ApiError {
  error: string;
  issues?: { path: string; message: string }[];
}
