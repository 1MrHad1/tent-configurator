import { describe, expect, it } from 'vitest';
import { createDesign } from '../../src/core/design/factory';
import type { Design } from '../../src/core/design/schema';
import { backdropBanner } from '../../src/products/backdrop-banner/definition';
import { canopyTent } from '../../src/products/canopy-tent/definition';
import { buildCatalog } from './catalog';
import { priceBooks } from './priceBook';
import { PricingError, configHash, createQuote, priceUnit, verifyQuote } from './quote';

const book = priceBooks['canopy-tent'];
const SECRET = 'test-secret-test-secret';
const rupees = (minor: number) => minor / 100;

function withArtwork(design: Design, surfaceIds: string[]): Design {
  const surfaces = { ...design.surfaces };
  for (const id of surfaceIds) {
    surfaces[id] = {
      ...surfaces[id],
      layers: [
        { id: `t_${id}`, type: 'text', text: 'ACME', fontFamily: 'Inter', fontWeight: 700, italic: false, fontSize: 0.1, fill: '#000000', align: 'center', stroke: null, strokeWidth: 0, letterSpacing: 0, x: 0, y: 0, rotation: 0, opacity: 1 },
      ],
    };
  }
  return { ...design, surfaces };
}

describe('priceUnit', () => {
  it('prices each size and package as its own Shopify variant', () => {
    const prices = ['5x5', '6.5x6.5', '8x8'].flatMap((size) =>
      ['canopy-frame', 'canopy-only'].map((pkg) => priceUnit(canopyTent, book, createDesign(canopyTent, { size, package: pkg }))),
    );
    expect(new Set(prices.map((p) => p.variant.id)).size).toBe(6);
    expect(rupees(prices[0].unitPrice)).toBe(38500);
    expect(rupees(prices[5].unitPrice)).toBe(34500);
  });

  it('charges the frame finish only when a frame is included', () => {
    const withFrame = priceUnit(canopyTent, book, createDesign(canopyTent, { frameFinish: 'black' }));
    const topOnly = priceUnit(canopyTent, book, createDesign(canopyTent, { frameFinish: 'black', package: 'canopy-only' }));
    expect(withFrame.lines.some((l) => l.code === 'option.frameFinish.black')).toBe(true);
    expect(topOnly.lines.some((l) => l.code.startsWith('option.frameFinish'))).toBe(false);
  });

  it('adds printing charges per panel group, with the included allowance', () => {
    const base = createDesign(canopyTent);
    const oneRoof = priceUnit(canopyTent, book, withArtwork(base, ['roof-front']));
    expect(oneRoof.unitPrice).toBe(priceUnit(canopyTent, book, base).unitPrice); // first roof panel included

    const busy = priceUnit(canopyTent, book, withArtwork(base, ['roof-front', 'roof-back', 'valance-front', 'valance-left']));
    expect(busy.lines.find((l) => l.code === 'print.roof')?.unitAmount).toBe(2000_00);
    expect(busy.lines.find((l) => l.code === 'print.valance')?.unitAmount).toBe(2 * 1200_00);
  });

  it('ignores empty text layers when deciding what is printed', () => {
    const design = withArtwork(createDesign(canopyTent), ['valance-front']);
    const layer = design.surfaces['valance-front'].layers[0];
    if (layer.type === 'text') layer.text = '   ';
    expect(priceUnit(canopyTent, book, design).lines.some((l) => l.kind === 'customization')).toBe(false);
  });

  it('applies rush as a percentage of the configured price, then quantity tiers', () => {
    const design = { ...withArtwork(createDesign(canopyTent, { production: 'rush' }), ['valance-front']), quantity: 5 };
    const { lines, unitPrice } = priceUnit(canopyTent, book, design);
    const configured = 62000_00 + 1200_00;
    expect(lines.find((l) => l.kind === 'surcharge')?.unitAmount).toBe(Math.round(configured * 0.15));
    expect(lines.find((l) => l.kind === 'discount')?.unitAmount).toBe(-Math.round(configured * 1.15 * 0.1));
    expect(unitPrice).toBe(lines.reduce((sum, l) => sum + l.unitAmount, 0));
  });

  it('works unchanged for a second product', () => {
    const banner = priceBooks['backdrop-banner'];
    const single = priceUnit(backdropBanner, banner, createDesign(backdropBanner));
    const double = priceUnit(backdropBanner, banner, createDesign(backdropBanner, { sides: 'double' }));
    expect(rupees(double.unitPrice - single.unitPrice)).toBe(6500);
  });
});

describe('createQuote / verifyQuote', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('signs quotes so the store can verify them', async () => {
    const quote = await createQuote(canopyTent, book, createDesign(canopyTent), { secret: SECRET, now });
    expect(await verifyQuote(quote, SECRET, now)).toEqual({ valid: true });
    expect(await verifyQuote({ ...quote, total: quote.total - 100 }, SECRET, now)).toEqual({ valid: false, reason: 'bad-signature' });
    expect(await verifyQuote(quote, 'another-secret-entirely', now)).toEqual({ valid: false, reason: 'bad-signature' });
    expect(await verifyQuote(quote, SECRET, new Date('2026-10-01T12:00:00Z'))).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects malformed designs with field-level issues', async () => {
    const bad = { ...createDesign(canopyTent), quantity: 0 };
    await expect(createQuote(canopyTent, book, bad, { secret: SECRET })).rejects.toBeInstanceOf(PricingError);
    try {
      await createQuote(canopyTent, book, bad, { secret: SECRET });
    } catch (error) {
      expect((error as PricingError).issues?.[0].path).toBe('quantity');
    }
  });

  it('hashes designs canonically: key order and embedded image data do not matter', async () => {
    const design = createDesign(canopyTent);
    const asset = { id: 'a1', name: 'logo.png', mime: 'image/png', width: 10, height: 10, bytes: 100 };
    const a = { ...design, assets: { a1: { ...asset, src: 'data:image/png;base64,AAAA' } } };
    const b = { ...design, assets: { a1: asset } };
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as Design;
    expect(await configHash(a)).toBe(await configHash(b));
    expect(await configHash(reordered)).toBe(await configHash(a));
    expect(await configHash({ ...a, quantity: 2 })).not.toBe(await configHash(a));
  });
});

describe('buildCatalog', () => {
  it('derives option hints from the pricing function', () => {
    const catalog = buildCatalog(canopyTent, book, { size: '8x8' });
    expect(catalog.hints.size['8x8']).toBe('Selected');
    expect(catalog.hints.size['5x5']).toBe('−₹23,500');
    expect(catalog.hints.frameFinish.black).toBe('+₹4,500');
    expect(catalog.rules.some((r) => r.includes('Rush'))).toBe(true);
  });
});
