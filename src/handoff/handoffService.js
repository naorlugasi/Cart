import { getAdapter, materializeAdapter } from './adapters/index.js';
import { encodeHandoffToken, decodeHandoffToken } from './handoffToken.js';
import { MemoryHandoffStore } from './handoffStore.js';

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const provider = (value) => (typeof value === 'function' ? value : () => value);

/**
 * Creates and tracks handoffs: a snapshot of the cart translated to one chain's
 * store item ids, addressable by a signed token embedded in the chain URL (#cart_id=...).
 *
 * The token is self-describing, so `get()` works on any server instance; the store only adds
 * status/result tracking. With a shared store (Redis) every instance sees the same status.
 *
 * `mapping` and `chains` may be functions: the catalog can be swapped underneath a running
 * service (server/dataSource.js) and tokens are always resolved against the current one.
 */
export class HandoffService {
  #mapping;
  #chains;

  constructor({ mapping, alerts, chains, onChange = () => {}, ttlMs = DEFAULT_TTL_MS, now = () => new Date(), secret, store = new MemoryHandoffStore() } = {}) {
    this.#mapping = provider(mapping);
    this.#chains = provider(chains ?? []);
    this.alerts = alerts;
    this.onChange = onChange;
    this.ttlMs = ttlMs;
    this.now = now;
    this.secret = secret;
    this.store = store;
  }

  get mapping() { return this.#mapping(); }
  get chains() { return this.#chains(); }

  #chain(chainId) {
    const adapter = getAdapter(chainId);
    if (!adapter) { const err = new Error(`unknown chain: ${chainId}`); err.status = 404; throw err; }
    return { adapter, chain: this.chains.find((c) => c.id === chainId) ?? { id: chainId, name: adapter.name } };
  }

  #resolveItem(productId, chainId, qty) {
    const mapping = this.mapping;
    const product = mapping.productsById.get(productId);
    const resolved = mapping.resolve(productId, chainId);
    if (!resolved) return null;
    return {
      productId,
      name: resolved.storeItem.name ?? product?.name ?? productId,
      gtin: product?.gtin ?? null,
      storeItemId: resolved.storeItem.storeItemId,
      qty,
      unitPrice: resolved.storeItem.price ?? null,
      inStock: resolved.storeItem.inStock !== false,
    };
  }

  /**
   * The chain URL carries the handoff id and, when the platform origin is known, the complete
   * injector payload (`p=` base64url JSON). The page can then load the cart without calling
   * back into the platform, which some chains' Content-Security-Policy forbids.
   */
  #buildUrl(adapter, handoff, origin) {
    const materialized = materializeAdapter(adapter, { origin });
    const url = new URL(materialized.baseUrl);
    let hash = `${adapter.hashParam}=${handoff.id}`;
    if (origin) hash += `&p=${Buffer.from(JSON.stringify(this.#payloadOf(handoff, origin)), 'utf8').toString('base64url')}`;
    url.hash = hash;
    return url.toString();
  }

  #payloadOf(handoff, origin) {
    const adapter = materializeAdapter(getAdapter(handoff.chainId), { origin });
    const base = origin.replace(/\/$/, '');
    return {
      id: handoff.id,
      chainId: handoff.chainId,
      chainName: handoff.chainName,
      storeId: handoff.storeId,
      items: handoff.items.map(({ productId, name, storeItemId, qty }) => ({ productId, name, storeItemId, qty })),
      adapter,
      reportUrl: `${base}/api/handoffs/${encodeURIComponent(handoff.id)}/results`,
      platformOrigin: base,
      expiresAt: handoff.expiresAt,
    };
  }

  /**
   * @param {object} args
   * @param {object} args.cart  { id?, lines: [{ productId, qty, substituteProductId? }] }
   * @param {string} args.chainId
   * @param {object} [args.comparisonRow] row from compareCart for this chain (substitutes / branch)
   * @param {string} args.origin server origin, used to build absolute report / demo URLs
   */
  async create({ cart, chainId, comparisonRow = null, origin = '' }) {
    const { adapter, chain } = this.#chain(chainId);
    const mapping = this.mapping;
    const items = [];
    const skipped = [];
    const encodedLines = [];

    for (const line of cart.lines ?? []) {
      const product = mapping.productsById.get(line.productId);
      // A product that dropped out of the unified catalog (docs/PIPELINE-CONTRACT.md §2.1): the
      // customer's cart may still hold it, it is simply reported and left out.
      if (!product) { skipped.push({ productId: line.productId, name: line.productId, reason: 'unknown_product' }); continue; }
      const rowLine = comparisonRow?.lines?.find((l) => l.productId === line.productId);
      const name = product.name;
      if (rowLine && (rowLine.status === 'missing' || rowLine.status === 'out_of_stock')) {
        skipped.push({ productId: line.productId, name, reason: rowLine.status });
        continue;
      }
      // Normally the comparison row decides which product actually goes in (it already applied the
      // customer's explicit substitute and any automatic one). Without a row, honour the cart line's
      // own substituteProductId when that chain sells it, so a handoff created without a comparison
      // never silently transfers the original the customer replaced.
      let usedProductId = rowLine?.usedProductId ?? line.productId;
      if (!rowLine && line.substituteProductId && line.substituteProductId !== line.productId) {
        const sub = this.#resolveItem(line.substituteProductId, chainId, line.qty);
        if (sub?.inStock) usedProductId = line.substituteProductId;
      }
      const item = this.#resolveItem(usedProductId, chainId, line.qty);
      if (!item) { skipped.push({ productId: line.productId, name, reason: 'missing' }); continue; }
      if (!item.inStock) { skipped.push({ productId: line.productId, name, reason: 'out_of_stock' }); continue; }
      items.push({ ...item, productId: line.productId, substituted: usedProductId !== line.productId });
      encodedLines.push(usedProductId === line.productId ? [line.productId, line.qty] : [line.productId, line.qty, usedProductId]);
    }

    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.ttlMs);
    const branchId = comparisonRow?.branch?.id ?? null;
    const id = encodeHandoffToken({ v: 1, c: chainId, b: branchId, i: encodedLines, t: Math.floor(createdAt.getTime() / 1000), e: Math.floor(expiresAt.getTime() / 1000) }, this.secret ? { secret: this.secret } : {});

    const handoff = {
      id,
      chainId,
      chainName: chain.name,
      branchId,
      storeId: branchId,
      cartId: cart.id ?? null,
      items: items.map(({ inStock, ...rest }) => rest),
      skipped,
      url: null,
      status: 'pending',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      result: null,
    };
    handoff.url = this.#buildUrl(adapter, handoff, origin);
    await this.store.set(handoff);
    this.onChange();
    return handoff;
  }

  /** Rebuild a handoff record from its token (no storage needed). Null when the token is invalid or its chain is gone. */
  fromToken(id, { origin = '' } = {}) {
    const data = decodeHandoffToken(id, this.secret ? { secret: this.secret } : {});
    if (!data || data.v !== 1 || !Array.isArray(data.i)) return null;
    let chainInfo;
    try { chainInfo = this.#chain(data.c); } catch { return null; }
    const items = [];
    for (const [productId, qty, usedProductId] of data.i) {
      const item = this.#resolveItem(usedProductId ?? productId, data.c, qty);
      if (!item) continue;
      items.push({ ...item, productId, substituted: !!usedProductId, inStock: undefined });
    }
    const handoff = {
      id,
      chainId: data.c,
      chainName: chainInfo.chain.name,
      branchId: data.b ?? null,
      storeId: data.b ?? null,
      cartId: null,
      items: items.map(({ inStock, ...rest }) => rest),
      skipped: [],
      url: null,
      status: 'pending',
      createdAt: new Date(data.t * 1000).toISOString(),
      expiresAt: new Date(data.e * 1000).toISOString(),
      result: null,
    };
    handoff.url = this.#buildUrl(chainInfo.adapter, handoff, origin);
    return handoff;
  }

  async get(id, { origin = '' } = {}) {
    let handoff = await this.store.get(id);
    if (!handoff) {
      handoff = this.fromToken(id, { origin });
      if (!handoff) return null;
    }
    if (new Date(handoff.expiresAt).getTime() < this.now().getTime()) return { ...handoff, expired: true };
    return handoff;
  }

  /** What the injector needs: items + adapter + where to report. */
  async payloadFor(id, { origin = '' } = {}) {
    const handoff = await this.get(id, { origin });
    if (!handoff || handoff.expired) return null;
    return this.#payloadOf(handoff, origin);
  }

  /** Store the injector's per-item results and feed the alert monitor. */
  async recordResults(id, summary) {
    const found = await this.get(id);
    if (!found) { const err = new Error('handoff not found'); err.status = 404; throw err; }
    const { expired, ...handoff } = found;
    const results = Array.isArray(summary?.results) ? summary.results : [];
    const okCount = Number.isFinite(summary?.okCount) ? summary.okCount : results.filter((r) => r.ok).length;
    const failCount = Number.isFinite(summary?.failCount) ? summary.failCount : results.length - okCount;
    handoff.result = {
      okCount,
      failCount,
      total: Number.isFinite(summary?.total) ? summary.total : results.length,
      results,
      warnings: summary?.warnings ?? [],
      durationMs: summary?.durationMs ?? null,
      userAgent: summary?.userAgent ?? null,
      reportedAt: this.now().toISOString(),
    };
    handoff.status = failCount === 0 ? 'completed' : okCount > 0 ? 'partial' : 'failed';
    handoff.failedItems = results.filter((r) => !r.ok).map((r) => ({ storeItemId: r.storeItemId, name: r.name, error: r.error, errorType: r.errorType }));
    await this.store.set(handoff);
    const raised = this.alerts ? this.alerts.record({ ...summary, chainId: handoff.chainId, handoffId: id, results, okCount, failCount, total: handoff.result.total }) : [];
    this.onChange();
    return { handoff, alerts: raised };
  }

  async list({ cartId } = {}) {
    const all = await this.store.list();
    return all.filter((h) => !cartId || h.cartId === cartId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async purgeExpired() {
    const now = this.now().getTime();
    let removed = 0;
    for (const h of await this.store.list()) {
      if (new Date(h.expiresAt).getTime() + this.ttlMs < now && (await this.store.delete(h.id))) removed++;
    }
    if (removed) this.onChange();
    return removed;
  }

  toJSON() {
    return this.store.toJSON?.() ?? { handoffs: [] };
  }

  /** A service over an in-memory store seeded from a state.json snapshot (unless `options.store` is given). */
  static fromJSON(data, options = {}) {
    return new HandoffService({ ...options, store: options.store ?? new MemoryHandoffStore(data?.handoffs) });
  }
}
