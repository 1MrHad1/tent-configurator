import { PROTOCOL, isEnvelope, type ConfiguratorMessage, type HostMessage } from './protocol';

export interface EmbedParams {
  productId?: string;
  options: Record<string, string>;
  /** Origin of the page embedding us. Messages go only there and are accepted only from there. */
  parentOrigin: string | null;
  embedded: boolean;
  designId?: string;
}

/**
 * Reads the embed URL, e.g. `/?product=canopy-tent&size=8x8&variant_id=…&parent_origin=https://shop.example`.
 * Any query parameter matching an option id preselects that option.
 */
export function readEmbedParams(search = window.location.search): EmbedParams {
  const params = new URLSearchParams(search);
  const reserved = new Set(['product', 'parent_origin', 'variant_id', 'design', 'embed']);
  const options: Record<string, string> = {};
  params.forEach((value, key) => {
    if (!reserved.has(key)) options[key] = value;
  });
  let parentOrigin: string | null = null;
  try {
    const raw = params.get('parent_origin');
    if (raw) parentOrigin = new URL(raw).origin;
  } catch {
    parentOrigin = null;
  }
  return {
    productId: params.get('product') ?? undefined,
    options,
    parentOrigin,
    embedded: window.parent !== window && !!parentOrigin,
    designId: params.get('design') ?? undefined,
  };
}

export class HostBridge {
  private handlers = new Set<(message: HostMessage) => void>();

  constructor(private readonly parentOrigin: string) {
    window.addEventListener('message', (event) => {
      if (event.origin !== this.parentOrigin || event.source !== window.parent) return;
      if (isEnvelope<HostMessage>(event.data)) this.handlers.forEach((h) => h(event.data));
    });
  }

  send(message: ConfiguratorMessage) {
    window.parent.postMessage({ protocol: PROTOCOL, ...message }, this.parentOrigin);
  }

  on(handler: (message: HostMessage) => void) {
    this.handlers.add(handler);
    return () => void this.handlers.delete(handler);
  }

  /** Sends a message and waits for the matching reply. */
  request<T extends HostMessage>(message: ConfiguratorMessage & { requestId: string }, match: (m: HostMessage) => m is T, timeoutMs = 20000) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('The store did not respond'));
      }, timeoutMs);
      const off = this.on((m) => {
        if (match(m)) {
          clearTimeout(timer);
          off();
          resolve(m);
        }
      });
      this.send(message);
    });
  }
}
