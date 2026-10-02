import { afterEach, describe, expect, it, vi } from 'vitest';
import { canopyTent } from '../products/canopy-tent/definition';
import { nearestPantone, parseColor } from './color/pantone';
import { buildCartLine, describePanelColours } from './commerce/cartLine';
import { createDesign } from './design/factory';
import { ApiRequestError, requestJson } from './pricing/client';
import type { Quote } from './pricing/types';

describe('requestJson retry policy', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('retries 5xx responses for idempotent calls, then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(503, { error: 'busy' })).mockResolvedValueOnce(respond(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestJson('/x', {}, { retries: 2 })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a 4xx: the request itself is wrong', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(400, { error: 'Invalid design' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestJson('/x', {}, { retries: 2 })).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-idempotent calls by default', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestJson('/x', { method: 'POST' })).rejects.toThrow('network down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Pantone', () => {
  it('parses hex and Pantone codes', () => {
    expect(parseColor('#ABC')).toBe('#aabbcc');
    expect(parseColor('Pantone 185 C')).toBe('#e4002b');
    expect(parseColor('pms 286')).toBe('#0033a0');
    expect(parseColor('not a colour')).toBeNull();
  });

  it('finds the perceptually nearest code', () => {
    expect(nearestPantone('#e4002b')).toEqual({ code: '185 C', exact: true });
    expect(nearestPantone('#0035a3').code).toBe('286 C');
    expect(nearestPantone('#0035a3').exact).toBe(false);
  });
});

describe('buildCartLine', () => {
  const quote = {
    quoteId: 'q_1',
    currency: 'INR',
    variant: { id: '48270445412005', sku: 'S', title: 'T', price: 1 },
    unitPrice: 6200000,
    total: 12400000,
    quantity: 2,
    configHash: 'h',
    expiresAt: '2026-10-02T00:00:00Z',
    signature: 'sig',
  } as Quote;

  it('maps the quote to the Shopify variant and hides machine fields', () => {
    const design = { ...createDesign(canopyTent, { frameFinish: 'black' }), quantity: 2 };
    const line = buildCartLine(canopyTent, design, quote, { designId: 'd_1', quote, links: { design: 'u/d', pdf: 'u/pdf', preview: 'u/p' } });
    expect(line.variantId).toBe('48270445412005');
    expect(line.quantity).toBe(2);
    expect(line.properties['Frame finish']).toBe('Black powder coat');
    expect(line.properties['Panel colours']).toMatch(/^All panels: #E9B44C \(~PMS/);
    expect(line.properties['Production PDF']).toBe('u/pdf');
    expect(line.properties._quote_signature).toBe('sig');
    expect(line.properties._design_id).toBe('d_1');
  });

  it('names whole surface groups when describing colours', () => {
    const design = createDesign(canopyTent);
    for (const id of Object.keys(design.surfaces)) {
      design.surfaces[id] = { ...design.surfaces[id], fill: id.startsWith('roof') ? '#2647c8' : id === 'valance-front' ? '#c8322b' : '#161616' };
    }
    expect(describePanelColours(canopyTent, design)).toBe(
      'Front valance: #C8322B (~PMS 186 C) · Right valance, Back valance, Left valance: #161616 (~PMS Black C) · Roof panels: #2647C8 (~PMS 286 C)',
    );
  });

  it('omits options that do not apply', () => {
    const line = buildCartLine(canopyTent, createDesign(canopyTent, { package: 'canopy-only', frameFinish: 'black' }), quote, null);
    expect(line.properties['Frame finish']).toBeUndefined();
  });
});
