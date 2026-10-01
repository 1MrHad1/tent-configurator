import { stripAssetData, type Design } from '../design/schema';
import type { ApiError, Catalog, Quote } from './types';

/**
 * The UI depends on this interface, never on an endpoint. Pointing the configurator at a
 * real pricing/CRM service means another implementation (or just another `baseUrl`).
 */
export interface PricingService {
  quote(design: Design, signal?: AbortSignal): Promise<Quote>;
  catalog(productId: string, options: Record<string, string>, signal?: AbortSignal): Promise<Catalog>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.error);
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError);
  return body as T;
}

export class HttpPricingService implements PricingService {
  constructor(private readonly baseUrl = '/api') {}

  quote(design: Design, signal?: AbortSignal) {
    return requestJson<Quote>(`${this.baseUrl}/quote`, {
      method: 'POST',
      body: JSON.stringify({ productId: design.productId, design: stripAssetData(design) }),
      signal,
    });
  }

  catalog(productId: string, options: Record<string, string>, signal?: AbortSignal) {
    const query = new URLSearchParams({ options: JSON.stringify(options) });
    return requestJson<Catalog>(`${this.baseUrl}/catalog/${encodeURIComponent(productId)}?${query}`, { signal });
  }
}

export const formatMoney = (minor: number, currency: string, locale = 'en-IN') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

/** PDF fonts have no ₹ glyph, so documents use the ISO code. */
export const formatMoneyPlain = (minor: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(minor / 100)}`;
