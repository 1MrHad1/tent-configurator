import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { customizationFacts } from '../../core/design/facts';
import { formatMoney } from '../../core/pricing/client';
import type { Catalog, Quote } from '../../core/pricing/types';
import { useConfigurator } from '../../core/state/store';
import { useServices } from '../services';

/**
 * Live quote for the current design. Only re-requested when something price-relevant changes
 * (options, quantity, which panels carry artwork), debounced, and with stale requests aborted.
 * Moving a logo around never triggers a request.
 */
export function useQuote() {
  const { pricing, bridge } = useServices();
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const facts = useMemo(() => customizationFacts(product, design), [product, design]);
  const key = JSON.stringify([facts.effectiveOptions, design.quantity, facts.printedSurfaces]);
  // Each result records the pricing key it answers, so "loading" is derived: the latest
  // result is for an older key. No state is set synchronously inside the effect.
  const [result, setResult] = useState<{ key: string; quote: Quote | null; error: string | null } | null>(null);
  const designRef = useRef(design);
  useLayoutEffect(() => {
    designRef.current = design;
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      pricing
        .quote(designRef.current, controller.signal)
        .then((quote) => {
          setResult({ key, quote, error: null });
          bridge?.send({ type: 'price', total: quote.total, currency: quote.currency, formatted: formatMoney(quote.total, quote.currency) });
        })
        .catch((error: Error) => {
          if (error.name !== 'AbortError') setResult((r) => ({ key, quote: r?.quote ?? null, error: error.message }));
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` is the trigger (price-relevant facts); the design itself is read from the ref.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [key, pricing, bridge]);

  return {
    quote: result?.quote ?? null,
    error: result?.key === key ? result.error : null,
    loading: result?.key !== key,
    facts,
  };
}

/** Price hints for option buttons, relative to the current selection. */
export function useCatalog() {
  const { pricing } = useServices();
  const product = useConfigurator((s) => s.product);
  const options = useConfigurator((s) => s.design.options);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const key = JSON.stringify(options);

  useEffect(() => {
    const controller = new AbortController();
    pricing
      .catalog(product.id, JSON.parse(key), controller.signal)
      .then(setCatalog)
      .catch(() => undefined);
    return () => controller.abort();
  }, [key, pricing, product.id]);

  return catalog;
}

export type QuoteState = ReturnType<typeof useQuote>;
export const QuoteContext = createContext<QuoteState | null>(null);
export function useQuoteState(): QuoteState {
  const value = useContext(QuoteContext);
  if (!value) throw new Error('QuoteContext missing');
  return value;
}
