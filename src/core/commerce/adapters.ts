/**
 * How a finished configuration reaches a cart. The checkout flow only knows `CommerceAdapter`;
 * which implementation runs depends on where the configurator is hosted.
 */
import { newId } from '../design/factory';
import type { HostBridge } from '../embed/bridge';
import type { CartLine, HostMessage } from '../embed/protocol';

export interface CartResult {
  ok: boolean;
  message: string;
}

export interface CommerceAdapter {
  readonly kind: 'shopify-embed' | 'shopify-ajax' | 'preview';
  addToCart(line: CartLine): Promise<CartResult>;
}

/** Inside a Shopify theme iframe: the theme script (shopify/theme) performs `/cart/add.js`. */
export class EmbeddedShopifyAdapter implements CommerceAdapter {
  readonly kind = 'shopify-embed';
  constructor(private readonly bridge: HostBridge) {}

  async addToCart(line: CartLine): Promise<CartResult> {
    const requestId = newId('cart');
    const reply = await this.bridge.request(
      { type: 'add-to-cart', requestId, line },
      (m): m is Extract<HostMessage, { type: 'cart-result' }> => m.type === 'cart-result' && m.requestId === requestId,
    );
    if (!reply.ok) throw new Error(reply.error ?? 'The store could not add this item');
    return { ok: true, message: `Added to cart${reply.itemCount ? ` (${reply.itemCount} items)` : ''}` };
  }
}

/**
 * Served from the shop's own domain (app proxy or theme app extension): call the
 * Ajax Cart API directly. Same payload as the embed path.
 */
export class ShopifyAjaxAdapter implements CommerceAdapter {
  readonly kind = 'shopify-ajax';
  constructor(private readonly root = '/') {}

  async addToCart(line: CartLine): Promise<CartResult> {
    const res = await fetch(`${this.root}cart/add.js`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(line.variantId), quantity: line.quantity, properties: line.properties }] }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.description ?? `Cart error ${res.status}`);
    return { ok: true, message: 'Added to cart' };
  }
}

/** Standalone demo: nothing to add to, so the UI shows the exact payload that would be sent. */
export class PreviewAdapter implements CommerceAdapter {
  readonly kind = 'preview';
  async addToCart(): Promise<CartResult> {
    return { ok: true, message: 'Cart payload ready (standalone preview, no store attached)' };
  }
}
