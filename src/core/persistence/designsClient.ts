import type { Design } from '../design/schema';
import { requestJson } from '../pricing/client';
import type { Quote } from '../pricing/types';

export interface SavedDesign {
  designId: string;
  quote: Quote;
  links: { design: string; pdf: string; preview: string };
}

/** Saved designs and their production files (Netlify Blobs behind the mock API). */
export interface DesignStore {
  save(design: Design, quote: Quote): Promise<SavedDesign>;
  attachFile(designId: string, kind: 'pdf' | 'preview', file: Blob): Promise<void>;
  load(designId: string): Promise<{ design: Design; quote: Quote }>;
}

export class HttpDesignStore implements DesignStore {
  constructor(private readonly baseUrl = '/api') {}

  save(design: Design, quote: Quote) {
    // Not retried: a timed-out save may still have succeeded, and a retry would duplicate it.
    return requestJson<SavedDesign>(
      `${this.baseUrl}/designs`,
      { method: 'POST', body: JSON.stringify({ productId: design.productId, design, quote }) },
      { timeoutMs: 30000 },
    );
  }

  async attachFile(designId: string, kind: 'pdf' | 'preview', file: Blob) {
    const res = await fetch(`${this.baseUrl}/designs/${encodeURIComponent(designId)}/${kind}`, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Could not store the ${kind} (HTTP ${res.status})`);
  }

  load(designId: string) {
    return requestJson<{ design: Design; quote: Quote }>(`${this.baseUrl}/designs/${encodeURIComponent(designId)}`, {}, { retries: 2 });
  }
}
