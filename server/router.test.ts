import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/factory';
import type { Quote } from '../src/core/pricing/types';
import { canopyTent } from '../src/products/canopy-tent/definition';
import { handleApi } from './router';

const call = (path: string, init?: RequestInit) => handleApi(new Request(`http://test.local${path}`, init));
const post = (path: string, body: unknown) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('API (same handler as the Netlify Function)', () => {
  it('serves a catalog and a signed quote', async () => {
    const catalog = await call(`/api/catalog/canopy-tent?options=${encodeURIComponent('{"size":"5x5"}')}`);
    expect(catalog.status).toBe(200);
    expect((await catalog.json()).hints.size['5x5']).toBe('Selected');

    const res = await post('/api/quote', { productId: 'canopy-tent', design: createDesign(canopyTent) });
    expect(res.status).toBe(200);
    const quote = (await res.json()) as Quote;
    expect(quote.variant.id).toBe('48270445412005');
    expect(quote.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns 400 with issues for invalid designs and 404 for unknown products', async () => {
    const bad = await post('/api/quote', { productId: 'canopy-tent', design: { nope: true } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues.length).toBeGreaterThan(0);
    expect((await post('/api/quote', { productId: 'kayak', design: {} })).status).toBe(404);
  });

  it('saves a design only with a matching, untampered quote, then serves its files', async () => {
    const design = createDesign(canopyTent, { size: '6.5x6.5' });
    const quote = (await (await post('/api/quote', { productId: 'canopy-tent', design })).json()) as Quote;

    expect((await post('/api/designs', { productId: 'canopy-tent', design, quote: { ...quote, total: 1 } })).status).toBe(409);
    expect((await post('/api/designs', { productId: 'canopy-tent', design: { ...design, quantity: 3 }, quote })).status).toBe(409);

    const saved = await post('/api/designs', { productId: 'canopy-tent', design, quote });
    expect(saved.status).toBe(201);
    const { designId } = await saved.json();

    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const put = await call(`/api/designs/${designId}/pdf`, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: pdf });
    expect(put.status).toBe(204);
    const wrongType = await call(`/api/designs/${designId}/pdf`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(wrongType.status).toBe(415);

    const file = await call(`/api/designs/${designId}/pdf`);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
    expect((await (await call(`/api/designs/${designId}`)).json()).design.options.size).toBe('6.5x6.5');
  });

  it('verifies quotes for the store side', async () => {
    const quote = (await (await post('/api/quote', { productId: 'canopy-tent', design: createDesign(canopyTent) })).json()) as Quote;
    expect(await (await post('/api/quote/verify', quote)).json()).toEqual({ valid: true });
    expect((await (await post('/api/quote/verify', { ...quote, total: quote.total / 2 })).json()).valid).toBe(false);
  });
});
