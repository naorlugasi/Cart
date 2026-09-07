import test from 'node:test';
import assert from 'node:assert/strict';
import { AlertMonitor, probeAdapter } from '../src/handoff/alerts.js';

const summary = (chainId, results) => ({ chainId, handoffId: 'h', total: results.length, okCount: results.filter((r) => r.ok).length, failCount: results.filter((r) => !r.ok).length, results });

test('structural errors raise a critical api_shape_changed alert immediately, deduped within cooldown', () => {
  let t = 1000;
  const monitor = new AlertMonitor({ now: () => t, minSamples: 100 });
  const raised = monitor.record(summary('shufersal', [{ ok: false, errorType: 'endpoint_missing', storeItemId: 'a' }]));
  assert.equal(raised.length, 1);
  assert.equal(raised[0].type, 'api_shape_changed');
  assert.equal(raised[0].severity, 'critical');
  t += 1000;
  assert.equal(monitor.record(summary('shufersal', [{ ok: false, errorType: 'unexpected_response' }])).length, 0, 'deduped');
  assert.equal(monitor.list({ chainId: 'shufersal' })[0].count, 2);
  t += 16 * 60 * 1000;
  assert.equal(monitor.record(summary('shufersal', [{ ok: false, errorType: 'endpoint_missing' }])).length, 1, 'new alert after cooldown');
});

test('rejected items (out of stock) never trigger a shape alert, but a high failure rate does', () => {
  const monitor = new AlertMonitor({ minSamples: 3, failureRateThreshold: 0.5 });
  const bad = [{ ok: false, errorType: 'rejected' }, { ok: false, errorType: 'rejected' }, { ok: true }];
  assert.equal(monitor.record(summary('ramilevy', bad)).length, 0);
  assert.equal(monitor.record(summary('ramilevy', bad)).length, 0, 'below minSamples');
  const raised = monitor.record(summary('ramilevy', bad));
  assert.equal(raised.length, 1);
  assert.equal(raised[0].type, 'high_failure_rate');
  const healthy = new AlertMonitor({ minSamples: 1 });
  assert.equal(healthy.record(summary('demo', [{ ok: true }, { ok: false, errorType: 'rejected' }, { ok: true }, { ok: true }])).length, 0);
});

test('resolve, list filters, listeners and JSON round-trip', () => {
  const monitor = new AlertMonitor();
  const seen = [];
  monitor.onAlert((a) => seen.push(a.type));
  const [alert] = monitor.record(summary('x', [{ ok: false, errorType: 'csrf_missing' }]));
  assert.deepEqual(seen, ['api_shape_changed']);
  assert.equal(monitor.list({ unresolved: true }).length, 1);
  monitor.resolve(alert.id);
  assert.equal(monitor.list({ unresolved: true }).length, 0);
  const restored = AlertMonitor.fromJSON(JSON.parse(JSON.stringify(monitor.toJSON())));
  assert.equal(restored.list().length, 1);
});

test('probeAdapter flags a missing cart endpoint', async () => {
  const adapter = { chainId: 'x', baseUrl: 'https://x.example/', add: { path: '/api/cart/add' } };
  const okFetch = async (url, init) => ({ ok: true, status: init.method === 'OPTIONS' ? 204 : 200 });
  assert.equal((await probeAdapter(adapter, { fetch: okFetch })).ok, true);
  const goneFetch = async (url, init) => ({ ok: init.method !== 'OPTIONS', status: init.method === 'OPTIONS' ? 404 : 200 });
  const result = await probeAdapter(adapter, { fetch: goneFetch });
  assert.equal(result.ok, false);
  assert.equal(result.checks[1].status, 404);
  const down = await probeAdapter(adapter, { fetch: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(down.ok, false);
  assert.equal(down.checks[0].error, 'ECONNREFUSED');
});
