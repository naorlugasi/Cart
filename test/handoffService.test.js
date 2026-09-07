import test from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart } from '../src/pricing/compare.js';
import { HandoffService } from '../src/handoff/handoffService.js';
import { AlertMonitor } from '../src/handoff/alerts.js';
import { loadSeed } from './helpers.js';

const seed = loadSeed();
const mapping = new MappingEngine(seed);

test('create translates the cart to store item ids, skips unavailable items, builds the chain URL', () => {
  const alerts = new AlertMonitor();
  const service = new HandoffService({ mapping, alerts, chains: seed.chains });
  const cart = { id: 'cart_1', lines: [{ productId: 'milk-3', qty: 2 }, { productId: 'cucumber', qty: 1 }, { productId: 'tahini', qty: 1 }, { productId: 'beer', qty: 1, substituteProductId: 'cola' }] };
  const comparison = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  const row = comparison.rows.find((r) => r.chainId === 'shufersal');
  const handoff = service.create({ cart, chainId: 'shufersal', comparisonRow: row, origin: 'http://localhost:3000' });
  assert.equal(handoff.status, 'pending');
  assert.match(handoff.url, /^https:\/\/www\.shufersal\.co\.il\/online\/he\/#cart_id=.+/);
  assert.deepEqual(handoff.items.map((i) => i.storeItemId), ['P_7290000042220', 'P_W0008', 'P_7290000053516']);
  assert.equal(handoff.items[2].substituted, true);
  assert.deepEqual(handoff.skipped, [{ productId: 'tahini', name: 'טחינה גולמית אל ארז 500 גרם', reason: 'missing' }]);
  const payload = service.payloadFor(handoff.id, { origin: 'http://localhost:3000' });
  assert.equal(payload.adapter.chainId, 'shufersal');
  assert.equal(payload.reportUrl, `http://localhost:3000/api/handoffs/${handoff.id}/results`);
  assert.equal(payload.items.length, 3);
});

test('demo adapter resolves {{origin}} against the server origin', () => {
  const service = new HandoffService({ mapping, alerts: null, chains: seed.chains });
  const handoff = service.create({ cart: { lines: [{ productId: 'bamba', qty: 3 }] }, chainId: 'demo', origin: 'http://127.0.0.1:4321' });
  assert.equal(handoff.url, `http://127.0.0.1:4321/demo-store/#cart_id=${handoff.id}`);
  assert.equal(service.payloadFor(handoff.id, { origin: 'http://127.0.0.1:4321' }).adapter.baseUrl, 'http://127.0.0.1:4321/demo-store/');
});

test('recordResults updates status and feeds alerts; expiry hides payloads', () => {
  let now = new Date('2026-09-07T10:00:00Z');
  const alerts = new AlertMonitor();
  const service = new HandoffService({ mapping, alerts, chains: seed.chains, ttlMs: 60_000, now: () => now });
  const handoff = service.create({ cart: { lines: [{ productId: 'milk-3', qty: 1 }, { productId: 'bread', qty: 1 }] }, chainId: 'ramilevy' });
  const { handoff: updated, alerts: raised } = service.recordResults(handoff.id, { results: [{ storeItemId: '100000', ok: true }, { storeItemId: 'x', ok: false, errorType: 'endpoint_missing', error: 'HTTP 404', name: 'לחם' }] });
  assert.equal(updated.status, 'partial');
  assert.equal(updated.failedItems[0].name, 'לחם');
  assert.equal(raised.length, 1);
  assert.equal(raised[0].type, 'api_shape_changed');
  now = new Date(now.getTime() + 61_000);
  assert.equal(service.get(handoff.id).expired, true);
  assert.equal(service.payloadFor(handoff.id), null);
  assert.throws(() => service.recordResults('nope', {}), /handoff not found/);
  assert.throws(() => service.create({ cart: { lines: [] }, chainId: 'nope' }), /unknown chain/);
});

test('handoff ids are self-contained: a fresh service instance rebuilds the payload from the token', () => {
  const a = new HandoffService({ mapping, alerts: null, chains: seed.chains });
  const cart = { lines: [{ productId: 'milk-3', qty: 2 }, { productId: 'beer', qty: 1, substituteProductId: 'cola' }, { productId: 'tahini', qty: 1 }] };
  const row = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } }).rows.find((r) => r.chainId === 'shufersal');
  const created = a.create({ cart, chainId: 'shufersal', comparisonRow: row, origin: 'https://cart.example' });

  const b = new HandoffService({ mapping, alerts: new AlertMonitor(), chains: seed.chains });
  const payload = b.payloadFor(created.id, { origin: 'https://cart.example' });
  assert.ok(payload, 'payload rebuilt without shared storage');
  assert.deepEqual(payload.items.map((i) => [i.storeItemId, i.qty]), [['P_7290000042220', 2], ['P_7290000053516', 1]]);
  assert.equal(payload.reportUrl, `https://cart.example/api/handoffs/${encodeURIComponent(created.id)}/results`);
  assert.equal(b.get(created.id).branchId, 'shufersal-online-center');
  assert.equal(b.get(created.id).items[1].substituted, true);
  const { handoff } = b.recordResults(created.id, { results: [{ storeItemId: 'P_7290000042220', ok: true }, { storeItemId: 'P_7290000053516', ok: true }] });
  assert.equal(handoff.status, 'completed');

  assert.equal(b.get(created.id.slice(0, -2) + 'zz'), null, 'tampered token is rejected');
  assert.equal(new HandoffService({ mapping, alerts: null, chains: seed.chains, secret: 'other' }).get(created.id), null, 'different secret rejects');
});
