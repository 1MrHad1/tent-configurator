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

export interface RequestPolicy {
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after a network error, timeout, 429 or 5xx. Only for idempotent calls. */
  retries?: number;
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * JSON over fetch with a timeout per attempt and bounded retries with backoff. A 4xx is
 * returned to the caller as an ApiRequestError at once; an abort from the caller is never retried.
 */
export async function requestJson<T>(url: string, init: RequestInit = {}, { timeoutMs = 12000, retries = 0 }: RequestPolicy = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const res = await fetch(url, { ...init, signal, headers: { 'content-type': 'application/json', ...init.headers } });
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.ok) return body as T;
      if (attempt < retries && RETRYABLE(res.status)) {
        await wait(300 * 2 ** attempt);
        continue;
      }
      throw new ApiRequestError(res.status, body as ApiError);
    } catch (error) {
      if (error instanceof ApiRequestError || init.signal?.aborted || attempt >= retries) {
        if (timeout.aborted && !init.signal?.aborted) throw new Error('The pricing service took too long to respond', { cause: error });
        throw error;
      }
      await wait(300 * 2 ** attempt);
    }
  }
}

export class HttpPricingService implements PricingService {
  constructor(private readonly baseUrl = '/api') {}

  quote(design: Design, signal?: AbortSignal) {
    return requestJson<Quote>(
      `${this.baseUrl}/quote`,
      {
        method: 'POST',
        body: JSON.stringify({ productId: design.productId, design: stripAssetData(design) }),
        signal,
      },
      // Pricing is a pure function of the design, so retrying is safe.
      { retries: 2 },
    );
  }

  catalog(productId: string, options: Record<string, string>, signal?: AbortSignal) {
    const query = new URLSearchParams({ options: JSON.stringify(options) });
    return requestJson<Catalog>(`${this.baseUrl}/catalog/${encodeURIComponent(productId)}?${query}`, { signal }, { retries: 2 });
  }
}

export const formatMoney = (minor: number, currency: string, locale = 'en-IN') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

/** PDF fonts have no ₹ glyph, so documents use the ISO code. */
export const formatMoneyPlain = (minor: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(minor / 100)}`;
