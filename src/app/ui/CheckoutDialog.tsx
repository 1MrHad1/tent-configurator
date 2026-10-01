import { useEffect, useRef, useState } from 'react';
import { runCheckout, type CheckoutResult, type CheckoutStep, type PreviewRenderer } from '../../core/commerce/checkout';
import { buildProductionPdf } from '../../core/pdf/productionPdf';
import { formatMoney } from '../../core/pricing/client';
import { useConfigurator } from '../../core/state/store';
import { useServices } from '../services';
import { Icon } from './Icon';

const CART_STEPS: { id: CheckoutStep; label: string }[] = [
  { id: 'pricing', label: 'Getting a signed quote from the pricing API' },
  { id: 'rendering', label: 'Rendering 3D previews' },
  { id: 'saving', label: 'Saving the design (quote verified server-side)' },
  { id: 'pdf', label: 'Building and attaching the production PDF' },
  { id: 'cart', label: 'Adding the configured variant to the cart' },
];
const PDF_STEPS = CART_STEPS.filter((s) => s.id === 'pricing' || s.id === 'rendering' || s.id === 'pdf');

/** The 3D viewer registers its renderer once the model has loaded; wait for it rather than fail. */
async function waitForPreviews(ref: { current: PreviewRenderer | null }, timeoutMs = 15000): Promise<PreviewRenderer> {
  const started = Date.now();
  while (!ref.current) {
    if (Date.now() - started > timeoutMs) throw new Error('The 3D preview did not finish loading. Check your connection and try again.');
    await new Promise((r) => setTimeout(r, 100));
  }
  return ref.current;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function CheckoutDialog({ intent, onClose }: { intent: 'cart' | 'pdf'; onClose: () => void }) {
  const services = useServices();
  const [step, setStep] = useState<CheckoutStep>('pricing');
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const steps = intent === 'cart' ? CART_STEPS : PDF_STEPS;

  useEffect(() => {
    dialog.current?.showModal();
    if (started.current) return;
    started.current = true;
    const { product, design } = useConfigurator.getState();
    (async () => {
      const previews = await waitForPreviews(services.previews);
      if (intent === 'pdf') {
        setStep('pricing');
        const quote = await services.pricing.quote(design);
        setStep('rendering');
        const shots = await previews.capture(product.views.slice(0, 3).map((v) => v.id));
        setStep('pdf');
        const pdf = await buildProductionPdf({ product, design, quote, previews: shots });
        downloadBlob(pdf, `${product.id}-production-summary.pdf`);
        setStep('done');
        setResult({ quote, saved: null, line: { variantId: quote.variant.id, quantity: quote.quantity, properties: {} }, pdf, cart: { ok: true, message: 'PDF downloaded' }, warnings: [] });
        return;
      }
      const outcome = await runCheckout({ product, design, pricing: services.pricing, designs: services.designs, commerce: services.commerce, previews, onStep: setStep });
      setResult(outcome);
    })().catch((e: Error) => setError(e.message));
  }, [intent, services]);

  const activeIndex = step === 'done' ? steps.length : steps.findIndex((s) => s.id === step);

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="checkout-title">
      <header className="dialog-header">
        <h2 id="checkout-title">{intent === 'cart' ? 'Add to cart' : 'Production PDF'}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => dialog.current?.close()}>
          <Icon name="close" />
        </button>
      </header>

      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.id} className={i < activeIndex ? 'is-done' : i === activeIndex && !error ? 'is-active' : error && i === activeIndex ? 'is-error' : ''}>
            <span className="step-dot">{i < activeIndex ? <Icon name="check" size={13} /> : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {result && intent === 'cart' && (
        <div className="checkout-result">
          <p className="result-headline">
            <Icon name="check" /> {result.cart.message}
          </p>
          <dl className="result-facts">
            <dt>Variant</dt>
            <dd>
              {result.quote.variant.title} <code>#{result.quote.variant.id}</code>
            </dd>
            <dt>Total</dt>
            <dd>
              {formatMoney(result.quote.total, result.quote.currency)} ({result.quote.quantity} × {formatMoney(result.quote.unitPrice, result.quote.currency)})
            </dd>
            {result.saved && (
              <>
                <dt>Design</dt>
                <dd>
                  <code>{result.saved.designId}</code> ·{' '}
                  <a href={result.saved.links.pdf} target="_blank" rel="noreferrer">
                    production PDF
                  </a>{' '}
                  ·{' '}
                  <a href={`/?design=${result.saved.designId}`} target="_blank" rel="noreferrer">
                    reopen design
                  </a>
                </dd>
              </>
            )}
          </dl>
          {result.warnings.map((w) => (
            <p key={w} className="field-error">
              {w}
            </p>
          ))}
          <details open={services.commerce.kind === 'preview'}>
            <summary>Shopify cart payload (POST /cart/add.js)</summary>
            <pre>{JSON.stringify({ items: [{ id: Number(result.line.variantId), quantity: result.line.quantity, properties: result.line.properties }] }, null, 2)}</pre>
          </details>
          {services.commerce.kind === 'preview' && (
            <p className="panel-note">
              This is the standalone configurator, so no store is attached. Open the{' '}
              <a href="/demo-store/" target="_blank" rel="noreferrer">
                demo store
              </a>{' '}
              to see the same payload go through the iframe bridge into a Shopify-style cart.
            </p>
          )}
        </div>
      )}

      <footer className="dialog-footer">
        {result && (
          <button type="button" className="button button-ghost" onClick={() => downloadBlob(result.pdf, `${result.saved?.designId ?? 'design'}-production-summary.pdf`)}>
            <Icon name="download" /> Download PDF
          </button>
        )}
        <button type="button" className="button button-primary" onClick={() => dialog.current?.close()}>
          {result || error ? 'Done' : 'Cancel'}
        </button>
      </footer>
    </dialog>
  );
}
