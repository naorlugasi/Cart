import { rankMatches } from './matching.js';

/**
 * Catalog & Mapping Engine.
 *
 * Resolves a product from the unified catalog to the concrete item of a specific chain:
 *   1. manual override (curated mapping table)            -> method "manual"
 *   2. exact GTIN / EAN match for packaged goods            -> method "gtin"
 *   3. fuzzy name match for weighted / unpackaged products  -> method "fuzzy"
 *
 * Each chain catalog item carries `storeItemId`, the identifier the chain's online
 * cart API expects (not necessarily the barcode).
 */
export class MappingEngine {
  /**
   * @param {object} options
   * @param {Array} options.products unified catalog products
   * @param {Record<string, {chainId:string, items:Array}>} options.catalogs per-chain catalogs
   * @param {Record<string,string>} [options.overrides] "<chainId>:<productId>" -> storeItemId
   * @param {number} [options.fuzzyThreshold]
   */
  constructor({ products, catalogs, overrides = {}, fuzzyThreshold = 0.55, strictGtin = false }) {
    this.products = products;
    this.strictGtin = strictGtin;
    this.productsById = new Map(products.map((p) => [p.id, p]));
    this.catalogs = catalogs;
    this.overrides = { ...overrides };
    this.fuzzyThreshold = fuzzyThreshold;
    this.cache = new Map();
    this.indexes = new Map();
    for (const [chainId, catalog] of Object.entries(catalogs)) this.indexChain(chainId, catalog);
  }

  indexChain(chainId, catalog) {
    const byGtin = new Map();
    const byStoreItemId = new Map();
    for (const item of catalog.items) {
      if (item.gtin) byGtin.set(String(item.gtin), item);
      byStoreItemId.set(String(item.storeItemId), item);
    }
    this.indexes.set(chainId, { byGtin, byStoreItemId });
    for (const key of [...this.cache.keys()]) if (key.startsWith(`${chainId}:`)) this.cache.delete(key);
  }

  setCatalog(chainId, catalog) {
    this.catalogs[chainId] = catalog;
    this.indexChain(chainId, catalog);
  }

  setOverride(chainId, productId, storeItemId) {
    this.overrides[`${chainId}:${productId}`] = storeItemId;
    this.cache.delete(`${chainId}:${productId}`);
  }

  /**
   * @returns {{storeItem:object, method:'manual'|'gtin'|'fuzzy', score:number}|null}
   */
  resolve(productId, chainId) {
    const key = `${chainId}:${productId}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const result = this.#resolveUncached(productId, chainId);
    this.cache.set(key, result);
    return result;
  }

  #resolveUncached(productId, chainId) {
    const product = this.productsById.get(productId);
    const catalog = this.catalogs[chainId];
    const index = this.indexes.get(chainId);
    if (!product || !catalog || !index) return null;

    const override = this.overrides[`${chainId}:${productId}`];
    if (override) {
      const storeItem = index.byStoreItemId.get(String(override));
      if (storeItem) return { storeItem, method: 'manual', score: 1 };
    }

    if (product.gtin) {
      const storeItem = index.byGtin.get(String(product.gtin));
      if (storeItem) return { storeItem, method: 'gtin', score: 1 };
    }

    // Fuzzy matching: for weighted products only consider weighted / non-GTIN store items,
    // for packaged products without a GTIN hit consider everything but demand a higher score.
    // With real (GTIN-complete) catalogs a packaged product that has a GTIN and no GTIN hit is simply
    // not sold by the chain - a fuzzy name match would put a different product in the customer's cart.
    if (!product.isWeighted && product.gtin && this.strictGtin) return null;
    const candidates = product.isWeighted
      ? catalog.items.filter((i) => i.isWeighted || !i.gtin)
      : catalog.items;
    const threshold = product.isWeighted ? this.fuzzyThreshold : Math.max(this.fuzzyThreshold, 0.75);
    const query = product.name;
    let best = rankMatches(query, candidates, { threshold, limit: 1 })[0] ?? null;
    for (const alias of product.aliases ?? []) {
      const alt = rankMatches(alias, candidates, { threshold, limit: 1 })[0];
      if (alt && (!best || alt.score > best.score)) best = alt;
    }
    if (!best) return null;
    return { storeItem: best.candidate, method: 'fuzzy', score: best.score };
  }

  resolveAll(productId) {
    const out = {};
    for (const chainId of Object.keys(this.catalogs)) out[chainId] = this.resolve(productId, chainId);
    return out;
  }

  /** Diagnostics: how many products map per chain and by which method. */
  stats() {
    const stats = {};
    for (const chainId of Object.keys(this.catalogs)) {
      const s = { chainId, total: this.products.length, mapped: 0, manual: 0, gtin: 0, fuzzy: 0, unmapped: [] };
      for (const product of this.products) {
        const r = this.resolve(product.id, chainId);
        if (!r) s.unmapped.push(product.id);
        else { s.mapped++; s[r.method]++; }
      }
      stats[chainId] = s;
    }
    return stats;
  }
}
