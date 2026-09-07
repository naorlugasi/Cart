import { randomBytes } from 'node:crypto';
import { getAdapter, materializeAdapter } from './adapters/index.js';

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Creates and tracks handoffs: a snapshot of the cart translated to one chain's
 * store item ids, addressable by a short id embedded in the chain URL (#cart_id=...).
 */
export class HandoffService {
  constructor({ mapping, alerts, chains, onChange = () => {}, ttlMs = DEFAULT_TTL_MS, now = () => new Date() }) {
    this.mapping = mapping;
    this.alerts = alerts;
    this.chains = chains;
    this.onChange = onChange;
    this.ttlMs = ttlMs;
    this.now = now;
    this.handoffs = new Map();
  }

  /**
   * @param {object} args
   * @param {object} args.cart
   * @param {string} args.chainId
   * @param {object} [args.comparisonRow] row from compareCart for this chain (used for substitutes / branch)
   * @param {string} args.origin server origin, used to build absolute report / demo URLs
   */
  create({ cart, chainId, comparisonRow = null, origin = '' }) {
    const adapter = getAdapter(chainId);
    if (!adapter) { const err = new Error(`unknown chain: ${chainId}`); err.status = 404; throw err; }
    const chain = this.chains.find((c) => c.id === chainId) ?? { id: chainId, name: adapter.name };

    const items = [];
    const skipped = [];
    for (const line of cart.lines ?? []) {
      const rowLine = comparisonRow?.lines?.find((l) => l.productId === line.productId);
      const product = this.mapping.productsById.get(line.productId);
      const name = product?.name ?? line.productId;
      if (rowLine && (rowLine.status === 'missing' || rowLine.status === 'out_of_stock')) {
        skipped.push({ productId: line.productId, name, reason: rowLine.status });
        continue;
      }
      let storeItemId = rowLine?.storeItemId;
      let storeItemName = rowLine?.storeItemName;
      if (!storeItemId) {
        const resolved = this.mapping.resolve(line.productId, chainId);
        if (!resolved) { skipped.push({ productId: line.productId, name, reason: 'missing' }); continue; }
        if (!resolved.storeItem.inStock) { skipped.push({ productId: line.productId, name, reason: 'out_of_stock' }); continue; }
        storeItemId = resolved.storeItem.storeItemId;
        storeItemName = resolved.storeItem.name;
      }
      items.push({
        productId: line.productId,
        name: storeItemName ?? name,
        gtin: product?.gtin ?? null,
        storeItemId,
        qty: line.qty,
        unitPrice: rowLine?.unitPrice ?? null,
        substituted: rowLine?.status === 'substituted',
      });
    }

    const createdAt = this.now();
    const id = randomBytes(6).toString('base64url');
    const materialized = materializeAdapter(adapter, { origin });
    const url = new URL(materialized.baseUrl);
    url.hash = `${adapter.hashParam}=${id}`;
    const handoff = {
      id,
      chainId,
      chainName: chain.name,
      branchId: comparisonRow?.branch?.id ?? null,
      storeId: comparisonRow?.branch?.id ?? null,
      cartId: cart.id ?? null,
      items,
      skipped,
      url: url.toString(),
      status: 'pending',
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlMs).toISOString(),
      result: null,
    };
    this.handoffs.set(id, handoff);
    this.onChange();
    return handoff;
  }

  get(id) {
    const handoff = this.handoffs.get(id) ?? null;
    if (!handoff) return null;
    if (new Date(handoff.expiresAt).getTime() < this.now().getTime()) return { ...handoff, expired: true };
    return handoff;
  }

  /** What the injector needs: items + adapter + where to report. */
  payloadFor(id, { origin = '' } = {}) {
    const handoff = this.get(id);
    if (!handoff || handoff.expired) return null;
    const adapter = materializeAdapter(getAdapter(handoff.chainId), { origin });
    return {
      id: handoff.id,
      chainId: handoff.chainId,
      chainName: handoff.chainName,
      storeId: handoff.storeId,
      items: handoff.items.map(({ productId, name, storeItemId, qty }) => ({ productId, name, storeItemId, qty })),
      adapter,
      reportUrl: `${origin.replace(/\/$/, '')}/api/handoffs/${handoff.id}/results`,
      expiresAt: handoff.expiresAt,
    };
  }

  /** Store the injector's per-item results and feed the alert monitor. */
  recordResults(id, summary) {
    const handoff = this.handoffs.get(id);
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
