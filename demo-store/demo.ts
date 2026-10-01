/**
 * Demo store glue. Stands in for a Shopify theme: provides a mock `/cart/add.js` through the
 * embed script's `window.ProductConfiguratorCart` hook, renders the cart, and verifies every
 * configured line's signed price with the pricing API (what an orders/create webhook does).
 */
import './demo.css';

interface CartLine {
  variantId: string;
  quantity: number;
  properties: Record<string, string>;
}

const STORAGE_KEY = 'demo-store-cart';
const host = document.querySelector<HTMLElement>('[data-product-configurator]')!;
host.dataset.configuratorUrl = window.location.origin;

const load = (): CartLine[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
};
let cart: CartLine[] = load();
const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    /* private mode: keep the cart in memory */
  }
};

const money = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function verify(line: CartLine): Promise<'valid' | 'invalid' | 'unknown'> {
  const p = line.properties;
  if (!p._quote_signature) return 'unknown';
  const res = await fetch('/api/quote/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteId: p._quote_id,
      configHash: p._config_hash,
      variant: { id: line.variantId },
      quantity: line.quantity,
      total: Number(p._quote_total),
      currency: p._quote_currency,
      expiresAt: p._quote_expires,
      signature: p._quote_signature,
    }),
  }).catch(() => null);
  if (!res?.ok) return 'unknown';
  return (await res.json()).valid ? 'valid' : 'invalid';
}

function render() {
  document.querySelectorAll('[data-cart-count]').forEach((el) => (el.textContent = String(cart.reduce((n, l) => n + l.quantity, 0))));
  const total = cart.reduce((sum, l) => sum + Number(l.properties._quote_total ?? 0), 0);
  document.querySelector('[data-cart-total]')!.textContent = money(total);
  const container = document.querySelector('[data-cart-items]')!;
  container.innerHTML = cart.length
    ? ''
    : '<p class="empty">Your cart is empty. Open the designer and click “Add to cart”.</p>';
  cart.forEach((line, index) => {
    const visible = Object.entries(line.properties).filter(([k]) => !k.startsWith('_'));
    const hidden = Object.entries(line.properties).filter(([k]) => k.startsWith('_'));
    const item = document.createElement('article');
    item.className = 'cart-item';
    item.innerHTML = `
      ${line.properties._preview_url ? `<img src="${escapeHtml(line.properties._preview_url)}" alt="Design preview" />` : ''}
      <div>
        <h3>Custom Logo Canopy Tent <small>× ${line.quantity}</small></h3>
        <p class="line-price">${money(Number(line.properties._quote_total), line.properties._quote_currency)}
          <span class="verify" data-verify>checking price…</span></p>
        <dl>${visible
          .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${/^https?:/.test(v) ? `<a href="${escapeHtml(v)}" target="_blank" rel="noreferrer">open</a>` : escapeHtml(v)}</dd>`)
          .join('')}</dl>
        <details><summary>Hidden properties (${hidden.length})</summary><pre>${escapeHtml(JSON.stringify(Object.fromEntries(hidden), null, 1))}</pre></details>
        <div class="item-actions">
          <button type="button" class="link-button" data-tamper>Tamper with price</button>
          <button type="button" class="link-button" data-remove>Remove</button>
        </div>
      </div>`;
    item.querySelector('[data-remove]')!.addEventListener('click', () => {
      cart.splice(index, 1);
      save();
      render();
    });
    item.querySelector('[data-tamper]')!.addEventListener('click', () => {
      // Simulates a customer editing the hidden price property: verification must fail.
      line.properties._quote_total = String(Math.round(Number(line.properties._quote_total) * 0.5));
      save();
      render();
    });
    container.appendChild(item);
    const badge = item.querySelector<HTMLElement>('[data-verify]')!;
    void verify(line).then((state) => {
      badge.dataset.state = state;
      badge.textContent = state === 'valid' ? '✓ price verified' : state === 'invalid' ? '✗ signature rejected' : 'not verifiable';
    });
  });
}

function openCart(open: boolean) {
  document.querySelector<HTMLElement>('[data-cart]')!.hidden = !open;
}

(window as unknown as { ProductConfiguratorCart: unknown }).ProductConfiguratorCart = {
  async add(line: CartLine) {
    if (!line.variantId || line.quantity < 1) throw new Error('Invalid line');
    cart.push(line);
    save();
    render();
    setTimeout(() => openCart(true), 1500);
    return { item_count: cart.reduce((n, l) => n + l.quantity, 0) };
  },
};

document.querySelectorAll<HTMLInputElement>('input[name="size"]').forEach((input) =>
  input.addEventListener('change', () => {
    host.dataset.options = JSON.stringify({ size: input.value });
    host.dataset.variantId = input.dataset.variant ?? '';
  }),
);
document.querySelectorAll('[data-cart-toggle]').forEach((b) =>
  b.addEventListener('click', () => openCart(Boolean(document.querySelector<HTMLElement>('[data-cart]')!.hidden))),
);
document.querySelector('[data-cart-clear]')!.addEventListener('click', () => {
  cart = [];
  save();
  render();
});

render();
