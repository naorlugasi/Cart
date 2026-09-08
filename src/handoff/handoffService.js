import { getAdapter, materializeAdapter } from './adapters/index.js';
import { encodeHandoffToken, decodeHandoffToken } from './handoffToken.js';

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Creates and tracks handoffs: a snapshot of the cart translated to one chain's
 * store item ids, addressable by a signed token embedded in the chain URL (#cart_id=...).
 *
 * The token is self-describing, so `get()` works on any server instance; in-memory
 * records only add status/result tracking for the instance that received the report.
 */
export class HandoffService {
  constructor({ mapping, alerts, chains, onChange = () => {}, ttlMs = DEFAULT_TTL_MS, now = () => new Date(), secret } = {}) {
    this.mapping = mapping;
    this.alerts = alerts;
    this.chains = chains;
    this.onChange = onChange;
    this.ttlMs = ttlMs;
    this.now = now;
    this.secret = secret;
    this.handoffs = new Map();
  }

  #chain(chainId) {
    const adapter = getAdapter(chainId);
    if (!adapter) { const err = new Error(`unknown chain: ${chainId}`); err.status = 404; throw err; }
    return { adapter, chain: this.chains.find((c) => c.id === chainId) ?? { id: chainId, name: adapter.name } };
  }

  #resolveItem(productId, chainId, qty) {
    const product = this.mapping.productsById.get(productId);
    const resolved = this.mapping.resolve(productId, chainId);
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
  create({ cart, chainId, comparisonRow = null, origin = '' }) {
    const { adapter, chain } = this.#chain(chainId);
    const items = [];
    const skipped = [];
    const encodedLines = [];

    for (const line of cart.lines ?? []) {
      const rowLine = comparisonRow?.lines?.find((l) => l.productId === line.productId);
      const product = this.mapping.productsById.get(line.productId);
      const name = product?.name ?? line.productId;
      if (rowLine && (rowLine.status === 'missing' || rowLine.status === 'out_of_stock')) {
        skipped.push({ productId: line.productId, name, reason: rowLine.status });
        continue;
      }
      const usedProductId = rowLine?.usedProductId ?? line.productId;
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
    this.handoffs.set(id, handoff);
    this.onChange();
    return handoff;
  }

  /** Rebuild a handoff record from its token (no storage needed). */
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

  get(id, { origin = '' } = {}) {
    let handoff = this.handoffs.get(id) ?? null;
    if (!handoff) {
      handoff = this.fromToken(id, { origin });
      if (!handoff) return null;
      this.handoffs.set(id, handoff);
    }
    if (new Date(handoff.expiresAt).getTime() < this.now().getTime()) return { ...handoff, expired: true };
    return handoff;
  }

  /** What the injector needs: items + adapter + where to report. */
  payloadFor(id, { origin = '' } = {}) {
    const handoff = this.get(id, { origin });
    if (!handoff || handoff.expired) return null;
    return this.#payloadOf(handoff, origin);
  }

  /** Store the injector's per-item results and feed the alert monitor. */
  recordResults(id, summary) {
    const handoff = this.get(id);
    if (!handoff) { const err = new Error('handoff not found'); err.status = 404; throw err; }
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
    this.handoffs.set(id, handoff);
    const raised = this.alerts ? this.alerts.record({ ...summary, chainId: handoff.chainId, handoffId: id, results, okCount, failCount, total: handoff.result.total }) : [];
    this.onChange();
    return { handoff, alerts: raised };
  }

  list({ cartId } = {}) {
    return [...this.handoffs.values()].filter((h) => !cartId || h.cartId === cartId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  purgeExpired() {
    const now = this.now().getTime();
    let removed = 0;
    for (const [id, h] of this.handoffs) {
      if (new Date(h.expiresAt).getTime() + this.ttlMs < now) { this.handoffs.delete(id); removed++; }
    }
    if (removed) this.onChange();
    return removed;
  }

  toJSON() {
    return { handoffs: [...this.handoffs.values()] };
  }

  static fromJSON(data, options) {
    const service = new HandoffService(options);
    for (const h of data?.handoffs ?? []) service.handoffs.set(h.id, h);
    return service;
  }
}
