import { randomBytes } from 'node:crypto';

/** Error types that indicate a chain changed the structure of its cart API (not a mere stock problem). */
export const SHAPE_ERROR_TYPES = new Set(['endpoint_missing', 'unexpected_response', 'csrf_missing']);

/**
 * Resilience monitor: watches handoff results per chain and raises alerts when a chain
 * looks broken (API structure change or a spike in failures).
 */
export class AlertMonitor {
  constructor({ windowSize = 10, minSamples = 3, failureRateThreshold = 0.5, cooldownMs = 15 * 60 * 1000, now = () => Date.now(), logger = null } = {}) {
    this.windowSize = windowSize;
    this.minSamples = minSamples;
    this.failureRateThreshold = failureRateThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.logger = logger;
    this.alerts = [];
    this.history = new Map();
    this.listeners = new Set();
  }

  onAlert(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Feed a handoff summary (as reported by the injector). Returns alerts raised by this sample. */
  record(summary) {
    const chainId = summary.chainId;
    const raised = [];
    const results = summary.results ?? [];

    const shapeErrors = results.filter((r) => !r.ok && SHAPE_ERROR_TYPES.has(r.errorType));
    if (shapeErrors.length) {
      const types = [...new Set(shapeErrors.map((r) => r.errorType))];
      const alert = this.raise({
        type: 'api_shape_changed',
        chainId,
        severity: 'critical',
        message: `נראה ששרשרת ${chainId} שינתה את מבנה ה-API של העגלה (${types.join(', ')})`,
        details: { errorTypes: types, sample: shapeErrors.slice(0, 3), handoffId: summary.handoffId },
      });
      if (alert) raised.push(alert);
    }

    const list = this.history.get(chainId) ?? [];
    list.push({ at: this.now(), total: summary.total ?? results.length, failCount: summary.failCount ?? results.filter((r) => !r.ok).length, handoffId: summary.handoffId });
    while (list.length > this.windowSize) list.shift();
    this.history.set(chainId, list);

    if (list.length >= this.minSamples) {
      const total = list.reduce((s, h) => s + h.total, 0);
      const failed = list.reduce((s, h) => s + h.failCount, 0);
      const rate = total ? failed / total : 0;
      if (rate >= this.failureRateThreshold) {
        const alert = this.raise({
          type: 'high_failure_rate',
          chainId,
          severity: 'warning',
          message: `שיעור כשלונות גבוה בהזרקת עגלה ל-${chainId}: ${Math.round(rate * 100)}% מהפריטים ב-${list.length} ההעברות האחרונות`,
          details: { failureRate: rate, handoffs: list.length, failedItems: failed, totalItems: total },
        });
        if (alert) raised.push(alert);
      }
    }
    return raised;
  }

  raise({ type, chainId, severity = 'warning', message, details = {} }) {
    const key = `${type}:${chainId}`;
    const now = this.now();
    const existing = this.alerts.find((a) => a.key === key && !a.resolvedAt);
    if (existing && now - new Date(existing.lastSeenAt).getTime() < this.cooldownMs) {
      existing.count += 1;
      existing.lastSeenAt = new Date(now).toISOString();
      existing.details = details;
      return null;
    }
    const alert = {
      id: `alert_${randomBytes(5).toString('base64url')}`,
      key,
      type,
      chainId,
      severity,
      message,
      details,
      count: 1,
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      resolvedAt: null,
    };
    this.alerts.unshift(alert);
    if (this.logger) this.logger.warn?.(`[alert] ${severity} ${chainId}: ${message}`);
    for (const listener of this.listeners) {
      try { listener(alert); } catch { /* listeners must not break recording */ }
    }
    return alert;
  }

  list({ chainId, unresolved = false } = {}) {
    return this.alerts.filter((a) => (!chainId || a.chainId === chainId) && (!unresolved || !a.resolvedAt));
  }

  resolve(id) {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return null;
    alert.resolvedAt = new Date(this.now()).toISOString();
    return alert;
  }

  toJSON() {
    return { alerts: this.alerts, history: [...this.history.entries()] };
  }

  static fromJSON(data, options) {
    const monitor = new AlertMonitor(options);
    monitor.alerts = data?.alerts ?? [];
    monitor.history = new Map(data?.history ?? []);
    return monitor;
  }
}

/**
 * Active probe: check that an adapter's endpoints still exist (404/405 on the cart-add
 * endpoint is the earliest signal of a storefront change). Network access is optional;
 * failures are reported, never thrown.
 */
export async function probeAdapter(adapter, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const checks = [];
  const targets = [
    { name: 'home', method: 'GET', url: adapter.baseUrl },
    { name: 'cart-add', method: 'OPTIONS', url: new URL(adapter.add.path, adapter.baseUrl).toString() },
  ];
  for (const target of targets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(target.url, { method: target.method, redirect: 'follow', signal: controller.signal });
      const ok = target.name === 'cart-add' ? ![404, 410].includes(res.status) : res.ok;
      checks.push({ ...target, status: res.status, ok });
    } catch (err) {
      checks.push({ ...target, status: null, ok: false, error: err.message });
    } finally {
      clearTimeout(timer);
    }
  }
  return { chainId: adapter.chainId, ok: checks.every((c) => c.ok), checkedAt: new Date().toISOString(), checks };
}
