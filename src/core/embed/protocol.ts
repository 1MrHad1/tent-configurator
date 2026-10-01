/**
 * postMessage protocol between the configurator (inside an iframe) and the host page
 * (a Shopify theme, or any website). Versioned and namespaced so it can coexist with other
 * messages on the page; both sides check `event.origin` before trusting anything.
 */
export const PROTOCOL = 'product-configurator/v1';

export interface CartLine {
  /** Shopify variant id the selections resolved to. */
  variantId: string;
  quantity: number;
  /** Shopify line item properties; keys starting with "_" are hidden from the customer. */
  properties: Record<string, string>;
}

export type ConfiguratorMessage =
  | { type: 'ready'; productId: string }
  | { type: 'resize'; height: number }
  | { type: 'price'; total: number; currency: string; formatted: string }
  | { type: 'add-to-cart'; requestId: string; line: CartLine }
  | { type: 'close' };

export type HostMessage =
  | { type: 'init'; options?: Record<string, string> }
  | { type: 'cart-result'; requestId: string; ok: boolean; error?: string; itemCount?: number };

export type Envelope<T> = T & { protocol: typeof PROTOCOL };

export function isEnvelope<T extends { type: string }>(data: unknown): data is Envelope<T> {
  return !!data && typeof data === 'object' && (data as { protocol?: unknown }).protocol === PROTOCOL;
}
