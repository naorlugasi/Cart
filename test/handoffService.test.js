import test from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart } from '../src/pricing/compare.js';
import { HandoffService } from '../src/handoff/handoffService.js';
import { AlertMonitor } from '../src/handoff/alerts.js';
import { loadSeed } from './helpers.js';

const seed = loadSeed();
const mapping = new MappingEngine(seed);

test('create translates the cart to store item ids, skips unavailable items, builds the chain URL', async () => {
  const alerts = new AlertMonitor();
  const service = new HandoffService({ mapping, alerts, chains: seed.chains });
  const cart = { id: 'cart_1', lines: [{ productId: 'milk-3', qty: 2 }, { productId: 'cucumber', qty: 1 }, { productId: 'tahini', qty: 1 }, { productId: 'beer', qty: 1, substituteProductId: 'cola' }] };
  const comparison = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  const row = comparison.rows.find((r) => r.chainId === 'shufersal');
  const handoff = await service.create({ cart, chainId: 'shufersal', comparisonRow: row, origin: 'http://localhost:3000' });
  assert.equal(handoff.status, 'pending');
  assert.match(handoff.url, /^https:\/\/www\.shufersal\.co\.il\/online\/he\/#cart_id=.+/);
  assert.deepEqual(handoff.items.map((i) => i.storeItemId), ['P_7290000042220', 'P_W0008', 'P_7290000053516']);
  assert.equal(handoff.items[2].substituted, true);
  assert.deepEqual(handoff.skipped, [{ productId: 'tahini', name: 'טחינה גולמית אל ארז 500 גרם', reason: 'missing' }]);
  const payload = await service.payloadFor(handoff.id, { origin: 'http://localhost:3000' });
  assert.equal(payload.adapter.chainId, 'shufersal');
  assert.equal(payload.reportUrl, `http://localhost:3000/api/handoffs/${handoff.id}/results`);
  assert.equal(payload.items.length, 3);
  assert.equal((await service.list({ cartId: 'cart_1' })).length, 1);
});

test('a product that left the catalog is skipped as unknown_product, not treated as missing at the chain', async () => {
  const service = new HandoffService({ mapping, alerts: null, chains: seed.chains });
  const cart = { lines: [{ productId: 'milk-3', qty: 1 }, { productId: 'vanished-product', qty: 2 }] };
  const row = compareCart({ cart, chains: seed.chains, mapping }).rows.find((r) => r.chainId === 'ramilevy');
  const handoff = await service.create({ cart, chainId: 'ramilevy', comparisonRow: row });
  assert.equal(handoff.items.length, 1);
  assert.deepEqual(handoff.skipped, [{ productId: 'vanished-product', name: 'vanished-product', reason: 'unknown_product' }]);
});

test('demo adapter resolves {{origin}} against the server origin', async () => {
  const service = new HandoffService({ mapping, alerts: null, chains: seed.chains });
  const handoff = await service.create({ cart: { lines: [{ productId: 'bamba', qty: 3 }] }, chainId: 'demo', origin: 'http://127.0.0.1:4321' });
  assert.ok(handoff.url.startsWith(`http://127.0.0.1:4321/demo-store/#cart_id=${handoff.id}&p=`), handoff.url);
  assert.equal((await service.payloadFor(handoff.id, { origin: 'http://127.0.0.1:4321' })).adapter.baseUrl, 'http://127.0.0.1:4321/demo-store/');
});

test('recordResults updates status and feeds alerts; expiry hides payloads', async () => {
  let now = new Date('2026-09-07T10:00:00Z');
  const alerts = new AlertMonitor();
  const service = new HandoffService({ mapping, alerts, chains: seed.chains, ttlMs: 60_000, now: () => now });
  const handoff = await service.create({ cart: { lines: [{ productId: 'milk-3', qty: 1 }, { productId: 'bread', qty: 1 }] }, chainId: 'ramilevy' });
  const { handoff: updated, alerts: raised } = await service.recordResults(handoff.id, { results: [{ storeItemId: '100000', ok: true }, { storeItemId: 'x', ok: false, errorType: 'endpoint_missing', error: 'HTTP 404', name: 'לחם' }] });
  assert.equal(updated.status, 'partial');
  assert.equal(updated.failedItems[0].name, 'לחם');
  assert.equal(raised.length, 1);
  assert.equal(raised[0].type, 'api_shape_changed');
  now = new Date(now.getTime() + 61_000);
  assert.equal((await service.get(handoff.id)).expired, true);
  assert.equal(await service.payloadFor(handoff.id), null);
  await assert.rejects(() => service.recordResults('nope', {}), /handoff not found/);
  await assert.rejects(() => service.create({ cart: { lines: [] }, chainId: 'nope' }), /unknown chain/);
  now = new Date(now.getTime() + 61_000);
  assert.equal(await service.purgeExpired(), 1);
  assert.equal((await service.list()).length, 0);
});

test('handoff ids are self-contained: a fresh service instance rebuilds the payload from the token', async () => {
  const a = new HandoffService({ mapping, alerts: null, chains: seed.chains });
  const cart = { lines: [{ productId: 'milk-3', qty: 2 }, { productId: 'beer', qty: 1, substituteProductId: 'cola' }, { productId: 'tahini', qty: 1 }] };
  const row = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } }).rows.find((r) => r.chainId === 'shufersal');
  const created = await a.create({ cart, chainId: 'shufersal', comparisonRow: row, origin: 'https://cart.example' });

  const b = new HandoffService({ mapping, alerts: new AlertMonitor(), chains: seed.chains });
  const payload = await b.payloadFor(created.id, { origin: 'https://cart.example' });
  assert.ok(payload, 'payload rebuilt without shared storage');
  assert.deepEqual(payload.items.map((i) => [i.storeItemId, i.qty]), [['P_7290000042220', 2], ['P_7290000053516', 1]]);
  assert.equal(payload.reportUrl, `https://cart.example/api/handoffs/${encodeURIComponent(created.id)}/results`);
  assert.equal((await b.get(created.id)).branchId, 'shufersal-online-center');
  assert.equal((await b.get(created.id)).items[1].substituted, true);
  const { handoff } = await b.recordResults(created.id, { results: [{ storeItemId: 'P_7290000042220', ok: true }, { storeItemId: 'P_7290000053516', ok: true }] });
  assert.equal(handoff.status, 'completed');

  assert.equal(await b.get(created.id.slice(0, -2) + 'zz'), null, 'tampered token is rejected');
  assert.equal(await new HandoffService({ mapping, alerts: null, chains: seed.chains, secret: 'other' }).get(created.id), null, 'different secret rejects');
});

test('mapping and chains can be providers: tokens resolve against the catalog that is current now', async () => {
  let current = mapping;
  const service = new HandoffService({ mapping: () => current, alerts: null, chains: () => seed.chains });
  const created = await service.create({ cart: { lines: [{ productId: 'milk-3', qty: 1 }] }, chainId: 'ramilevy' });
  const repriced = JSON.parse(JSON.stringify(seed.catalogs.ramilevy));
  repriced.items.find((i) => i.gtin === '7290000042220').price = 1.23;
  current = new MappingEngine({ ...seed, catalogs: { ...seed.catalogs, ramilevy: repriced } });
  const fresh = new HandoffService({ mapping: () => current, alerts: null, chains: () => seed.chains });
  assert.equal((await fresh.get(created.id)).items[0].unitPrice, 1.23);
});

test('a report the version gate refused reaches the platform as a real failure with a reason on every line, and never as a completed transfer', async () => {
  const alerts = new AlertMonitor();
  const service = new HandoffService({ mapping, alerts, chains: seed.chains });
  const cart = { id: 'cart_stale', lines: [{ productId: 'milk-3', qty: 2 }, { productId: 'cucumber', qty: 1 }] };
  const comparison = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  const row = comparison.rows.find((r) => r.chainId === 'shufersal');
  const handoff = await service.create({ cart, chainId: 'shufersal', comparisonRow: row, origin: 'http://localhost:3000' });

  // Exactly what src/handoff/injector.cjs sends when the gate refuses (docs/HANDOFF.md).
  const { handoff: after, alerts: raised } = await service.recordResults(handoff.id, {
    handoffId: handoff.id, chainId: 'shufersal', stale: true, injectorVersion: '1.0.0',
    requiredInjectorVersion: '1.1.0', staleReason: 'below_minimum', version: 'deadbeef',
    total: 2, okCount: 0, failCount: 2, warnings: ['stale_injector'],
    results: handoff.items.map((i) => ({ storeItemId: i.storeItemId, name: i.name, qty: i.qty, ok: false, errorType: 'stale_injector', error: 'הסימנייה ישנה - הפריט לא נוסף' })),
  });

  // The status name is the backend session's to choose; what must never happen is "completed", which
  // is what a zero-item refusal used to look like.
  assert.notEqual(after.status, 'completed');
  assert.equal(after.result.okCount, 0);
  assert.equal(after.result.total, 2);
  // The per-line reason is what a shopper actually reads next to the product that is missing.
  assert.equal(after.failedItems.length, 2);
  for (const item of after.failedItems) {
    assert.equal(item.errorType, 'stale_injector');
    assert.equal(item.error, 'הסימנייה ישנה - הפריט לא נוסף');
    assert.ok(item.name, 'and it is attached to a named product, not an anonymous row');
  }
  assert.deepEqual(raised, [], 'the chain answered nothing, so it is not blamed for the refusal');
});
