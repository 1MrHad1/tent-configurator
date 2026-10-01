import { createContext, useContext } from 'react';
import { EmbeddedShopifyAdapter, PreviewAdapter, type CommerceAdapter } from '../core/commerce/adapters';
import type { PreviewRenderer } from '../core/commerce/checkout';
import { HostBridge, type EmbedParams } from '../core/embed/bridge';
import { HttpDesignStore, type DesignStore } from '../core/persistence/designsClient';
import { HttpPricingService, type PricingService } from '../core/pricing/client';

/** Everything with a side effect, injected so the UI never constructs its own clients. */
export interface Services {
  pricing: PricingService;
  designs: DesignStore;
  commerce: CommerceAdapter;
  bridge: HostBridge | null;
  embed: EmbedParams;
  /** Set by the 3D viewer once it is mounted. */
  previews: { current: PreviewRenderer | null };
}

export function createServices(embed: EmbedParams): Services {
  const bridge = embed.embedded && embed.parentOrigin ? new HostBridge(embed.parentOrigin) : null;
  return {
    pricing: new HttpPricingService('/api'),
    designs: new HttpDesignStore('/api'),
    commerce: bridge ? new EmbeddedShopifyAdapter(bridge) : new PreviewAdapter(),
    bridge,
    embed,
    previews: { current: null },
  };
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesContext missing');
  return services;
}
