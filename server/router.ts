/**
 * The mock commerce API. Every route is a plain `(Request) => Response`, so the same code runs
 * as a Netlify Function in production and as Vite middleware in development.
 *
 *   GET  /api/health
 *   GET  /api/catalog/:productId?options={...}   option price hints for the current selection
 *   POST /api/quote                              authoritative, signed price for a design
 *   POST /api/quote/verify                       what the store calls to trust a cart price
 *   POST /api/designs                            save a design with its (verified) quote
 *   PUT  /api/designs/:id/pdf|preview            attach the production PDF / preview image
 *   GET  /api/designs/:id[/pdf|/preview]         reload a design / fetch its files
 */
import { products } from '../src/products/registry';
import type { Quote, QuoteRequest } from '../src/core/pricing/types';
import { buildCatalog } from './pricing/catalog';
import { priceBooks } from './pricing/priceBook';
import { PricingError, configHash, createQuote, parseDesign, verifyQuote } from './pricing/quote';
import { getRepository } from './designs/repository';

const MAX_BODY_BYTES = 5.5 * 1024 * 1024; // Netlify's synchronous function limit is 6 MB

const secret = () => {
  const value = globalThis.process?.env?.QUOTE_SIGNING_SECRET;
  return value && value.length >= 16 ? value : 'dev-only-quote-signing-secret';
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const fail = (status: number, error: string, issues?: { path: string; message: string }[]) =>
  json({ error, ...(issues ? { issues } : {}) }, status);

async function readJson<T>(req: Request): Promise<T> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) throw new PricingError('Payload too large', 413);
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new PricingError('Payload too large', 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PricingError('Body is not valid JSON');
  }
}

function productAndBook(productId: string) {
  const product = products[productId];
  const book = priceBooks[productId];
  if (!product || !book) throw new PricingError(`Unknown product "${productId}"`, 404);
  return { product, book };
}

const FILE_TYPES = { pdf: 'application/pdf', preview: 'image/jpeg' } as const;

const randomId = (prefix: string) => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}_${[...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)}`;
};

export async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource, id, sub] = parts;

  try {
    if (resource === 'health') return json({ ok: true });

    if (resource === 'catalog' && req.method === 'GET' && id) {
      const { product, book } = productAndBook(id);
      let options: Record<string, string> = {};
      try {
        options = JSON.parse(url.searchParams.get('options') ?? '{}');
      } catch {
        throw new PricingError('options must be JSON');
      }
      return json(buildCatalog(product, book, options), 200, { 'cache-control': 'public, max-age=60' });
    }

    if (resource === 'quote' && req.method === 'POST' && !id) {
      const body = await readJson<QuoteRequest>(req);
      const { product, book } = productAndBook(body.productId);
      return json(await createQuote(product, book, body.design, { secret: secret() }));
    }

    if (resource === 'quote' && id === 'verify' && req.method === 'POST') {
      const quote = await readJson<Quote>(req);
      return json(await verifyQuote(quote, secret()));
    }

    if (resource === 'designs' && req.method === 'POST' && !id) {
      const body = await readJson<QuoteRequest & { quote: Quote }>(req);
      const { product } = productAndBook(body.productId);
      const design = parseDesign(product, body.design);
      // The quote must be one we issued, unexpired, and for exactly this design.
      const check = await verifyQuote(body.quote, secret());
      if (!check.valid) throw new PricingError(`Quote rejected: ${check.reason}`, 409);
      if (body.quote.configHash !== (await configHash(design))) throw new PricingError('Quote does not match the design', 409);
      const designId = randomId('d');
      const repo = await getRepository();
      await repo.save({ designId, createdAt: new Date().toISOString(), design, quote: body.quote });
      const base = `${url.origin}/api/designs/${designId}`;
      return json({ designId, quote: body.quote, links: { design: base, pdf: `${base}/pdf`, preview: `${base}/preview` } }, 201);
    }

    if (resource === 'designs' && req.method === 'PUT' && id && (sub === 'pdf' || sub === 'preview')) {
      if (req.headers.get('content-type') !== FILE_TYPES[sub]) throw new PricingError(`Expected ${FILE_TYPES[sub]}`, 415);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) throw new PricingError('File missing or too large', 413);
      const repo = await getRepository();
      if (!(await repo.get(id))) return fail(404, 'Design not found');
      await repo.putFile(id, sub, bytes);
      return new Response(null, { status: 204 });
    }

    if (resource === 'designs' && req.method === 'GET' && id) {
      const repo = await getRepository();
      if (!sub) {
        const record = await repo.get(id);
        return record ? json(record) : fail(404, 'Design not found');
      }
      if (sub === 'pdf' || sub === 'preview') {
        const file = await repo.getFile(id, sub);
        if (!file) return fail(404, 'File not found');
        return new Response(file.slice().buffer, {
          headers: {
            'content-type': FILE_TYPES[sub],
            'content-disposition': sub === 'pdf' ? `inline; filename="${id}-production.pdf"` : 'inline',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        });
      }
    }

    return fail(404, 'Not found');
  } catch (error) {
    if (error instanceof PricingError) return fail(error.status, error.message, error.issues);
    console.error(error);
    return fail(500, 'Internal error');
  }
}
