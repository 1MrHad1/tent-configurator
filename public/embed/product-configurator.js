/**
 * Product configurator embed for Shopify themes (or any site). Framework-free, ~3 KB.
 *
 * Markup (see shopify/snippets/product-configurator.liquid):
 *   <div data-product-configurator
 *        data-configurator-url="https://<configurator-host>"
 *        data-product="canopy-tent"
 *        data-variant-id="{{ product.selected_or_first_available_variant.id }}"
 *        data-options='{"size":"8x8"}'>
 *     <button data-configurator-open>Customize</button>
 *     <span data-configurator-price></span>
 *   </div>
 *   <script src="https://<configurator-host>/embed/product-configurator.js" defer></script>
 *
 * Opens the configurator in a full-screen iframe, and handles its messages:
 *   price        -> shows the live configured price next to the button
 *   add-to-cart  -> POST /cart/add.js with the variant + line item properties, replies with the result
 *   close        -> closes the overlay
 * Messages are accepted only from the configurator's origin and the iframe we created.
 *
 * Override the cart call (e.g. to refresh a theme's cart drawer) by defining
 * window.ProductConfiguratorCart = { add: async (line) => ({ item_count }) } before this script.
 */
(function () {
  'use strict';
  var PROTOCOL = 'product-configurator/v1';

  function shopifyAddToCart(line) {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    return fetch(root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(line.variantId), quantity: line.quantity, properties: line.properties }] }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.description || body.message || 'Could not add to cart');
          return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } });
        });
      })
      .then(function (res) {
        return res.json();
      });
  }

  function mount(host) {
    var base = host.getAttribute('data-configurator-url').replace(/\/$/, '');
    var origin = new URL(base, window.location.href).origin;
    var overlay = null;
    var frame = null;

    function url() {
      var params = new URLSearchParams();
      params.set('product', host.getAttribute('data-product') || '');
      params.set('variant_id', host.getAttribute('data-variant-id') || '');
      params.set('parent_origin', window.location.origin);
      var options = {};
      try {
        options = JSON.parse(host.getAttribute('data-options') || '{}');
      } catch (e) {}
      Object.keys(options).forEach(function (key) {
        params.set(key, options[key]);
      });
      return base + '/?' + params.toString();
    }

    function open() {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Product designer');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(16,17,20,.55);display:flex;';
      frame = document.createElement('iframe');
      frame.src = url();
      frame.title = 'Product designer';
      frame.allow = 'clipboard-write';
      frame.style.cssText = 'flex:1;border:0;background:#f4f4f6;';
      overlay.appendChild(frame);
      document.body.appendChild(overlay);
      document.documentElement.style.overflow = 'hidden';
      frame.focus();
    }

    function close() {
      if (!overlay) return;
      overlay.remove();
      overlay = frame = null;
      document.documentElement.style.overflow = '';
    }

    function reply(message) {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage(Object.assign({ protocol: PROTOCOL }, message), origin);
    }

    window.addEventListener('message', function (event) {
      if (event.origin !== origin || !frame || event.source !== frame.contentWindow) return;
      var msg = event.data;
      if (!msg || msg.protocol !== PROTOCOL) return;

      if (msg.type === 'price') {
        host.querySelectorAll('[data-configurator-price]').forEach(function (el) {
          el.textContent = msg.formatted;
        });
      } else if (msg.type === 'close') {
        close();
      } else if (msg.type === 'add-to-cart') {
        var add = (window.ProductConfiguratorCart && window.ProductConfiguratorCart.add) || shopifyAddToCart;
        Promise.resolve(add(msg.line))
          .then(function (cart) {
            reply({ type: 'cart-result', requestId: msg.requestId, ok: true, itemCount: cart && cart.item_count });
            host.dispatchEvent(new CustomEvent('configurator:added', { bubbles: true, detail: { line: msg.line, cart: cart } }));
            setTimeout(close, 1400);
          })
          .catch(function (error) {
            reply({ type: 'cart-result', requestId: msg.requestId, ok: false, error: String((error && error.message) || error) });
          });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    host.querySelectorAll('[data-configurator-open]').forEach(function (button) {
      button.addEventListener('click', open);
    });
  }

  function init() {
    document.querySelectorAll('[data-product-configurator]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
