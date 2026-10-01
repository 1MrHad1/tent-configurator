import type { Design } from '../../src/core/design/schema';
import type { Quote } from '../../src/core/pricing/types';

export interface DesignRecord {
  designId: string;
  createdAt: string;
  design: Design;
  quote: Quote;
}

/**
 * Storage for saved designs and their production files. Netlify Blobs in production,
 * memory in local dev; swapping in S3 or a database means one more implementation.
 */
export interface DesignRepository {
  save(record: DesignRecord): Promise<void>;
  putFile(designId: string, kind: 'pdf' | 'preview', bytes: Uint8Array): Promise<void>;
  get(designId: string): Promise<DesignRecord | null>;
  getFile(designId: string, kind: 'pdf' | 'preview'): Promise<Uint8Array | null>;
}

class MemoryRepository implements DesignRepository {
  private records = new Map<string, DesignRecord>();
  private files = new Map<string, Uint8Array>();
  async save(record: DesignRecord) {
    this.records.set(record.designId, record);
  }
  async putFile(id: string, kind: 'pdf' | 'preview', bytes: Uint8Array) {
    this.files.set(`${id}/${kind}`, bytes);
  }
  async get(id: string) {
    return this.records.get(id) ?? null;
  }
  async getFile(id: string, kind: 'pdf' | 'preview') {
    return this.files.get(`${id}/${kind}`) ?? null;
  }
}

class BlobsRepository implements DesignRepository {
  constructor(private store: import('@netlify/blobs').Store) {}
  async save(record: DesignRecord) {
    await this.store.setJSON(`${record.designId}/record.json`, record);
  }
  async putFile(id: string, kind: 'pdf' | 'preview', bytes: Uint8Array) {
    await this.store.set(`${id}/${kind === 'pdf' ? 'production.pdf' : 'preview.jpg'}`, bytes.slice().buffer);
  }
  async get(id: string) {
    return ((await this.store.get(`${id}/record.json`, { type: 'json' })) as DesignRecord | null) ?? null;
  }
  async getFile(id: string, kind: 'pdf' | 'preview') {
    const data = await this.store.get(`${id}/${kind === 'pdf' ? 'production.pdf' : 'preview.jpg'}`, { type: 'arrayBuffer' });
    return data ? new Uint8Array(data) : null;
  }
}

let repository: DesignRepository | undefined;

export async function getRepository(): Promise<DesignRepository> {
  if (repository) return repository;
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'designs', consistency: 'strong' });
    // getStore throws lazily outside Netlify; a cheap read surfaces that here.
    await store.get('__probe__');
    repository = new BlobsRepository(store);
  } catch {
    repository = new MemoryRepository();
  }
  return repository;
}
