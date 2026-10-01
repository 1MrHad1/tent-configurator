import { useEffect, useRef } from 'react';
import { formatMoney } from '../../core/pricing/client';
import { useQuoteState } from '../hooks/usePricing';

export function PriceBreakdown({ onClose }: { onClose: () => void }) {
  const { quote, loading, error, facts } = useQuoteState();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="popover price-breakdown" role="dialog" aria-label="Price breakdown">
      {error && <p className="field-error">{error}</p>}
      {quote && (
        <>
          <table>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.code} className={`line-${line.kind}`}>
                  <td>
                    {line.label}
                    {line.detail && <small>{line.detail}</small>}
                  </td>
                  <td>{formatMoney(line.unitAmount, quote.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Unit price</td>
                <td>{formatMoney(quote.unitPrice, quote.currency)}</td>
              </tr>
              <tr className="total">
                <td>Total × {quote.quantity}</td>
                <td>{formatMoney(quote.total, quote.currency)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="popover-note">
            {facts.printedSurfaces.length} printed panel{facts.printedSurfaces.length === 1 ? '' : 's'} · variant {quote.variant.sku}
            <br />
            Priced by the pricing API {loading ? '(updating…)' : `· quote ${quote.quoteId}`}. Demo prices.
          </p>
        </>
      )}
    </div>
  );
}
