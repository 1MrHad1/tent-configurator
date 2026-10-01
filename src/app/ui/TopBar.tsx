import { useState } from 'react';
import { formatMoney } from '../../core/pricing/client';
import { useConfigurator } from '../../core/state/store';
import { useQuoteState } from '../hooks/usePricing';
import { Icon } from './Icon';
import { PriceBreakdown } from './PriceBreakdown';

export function TopBar({ onAddToCart, onDownloadPdf, onClose }: { onAddToCart: () => void; onDownloadPdf: () => void; onClose?: () => void }) {
  const mode = useConfigurator((s) => s.mode);
  const product = useConfigurator((s) => s.product);
  const options = useConfigurator((s) => s.design.options);
  const setMode = useConfigurator((s) => s.setMode);
  const { quote, loading, error } = useQuoteState();
  const [open, setOpen] = useState(false);
  const sizeLabel = product.options.find((o) => o.id === product.geometryOption)?.choices.find((c) => c.id === options[product.geometryOption])?.label;

  return (
    <header className="topbar">
      <div className="mode-toggle" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={mode === '2d'} className={mode === '2d' ? 'is-on' : ''} onClick={() => setMode('2d')}>
          <Icon name="square" size={15} /> 2D
        </button>
        <button type="button" role="tab" aria-selected={mode === '3d'} className={mode === '3d' ? 'is-on' : ''} onClick={() => setMode('3d')}>
          <Icon name="cube" size={15} /> 3D
        </button>
      </div>
      <div className="topbar-title">
        <strong>{product.name}</strong>
        <span>
          {sizeLabel} · Customise in 2D, preview in 3D
        </span>
      </div>
      <div className="topbar-actions">
        <div className="price-wrap">
          <button type="button" className={`price-pill${loading ? ' is-loading' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)} aria-label="Price breakdown">
            {error ? 'Price unavailable' : quote ? formatMoney(quote.total, quote.currency) : '…'}
            <span className="price-sub">{quote && quote.quantity > 1 ? `${quote.quantity} × ${formatMoney(quote.unitPrice, quote.currency)}` : 'incl. options'}</span>
          </button>
          {open && <PriceBreakdown onClose={() => setOpen(false)} />}
        </div>
        <button type="button" className="button button-ghost hide-sm" onClick={onDownloadPdf}>
          <Icon name="download" /> PDF
        </button>
        <button type="button" className="button button-primary" onClick={onAddToCart} disabled={!quote || !!error}>
          <Icon name="cart" /> <span className="hide-xs">Add to cart</span>
        </button>
        {onClose && (
          <button type="button" className="icon-button" aria-label="Close configurator" onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>
    </header>
  );
}
