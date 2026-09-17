import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiskSource, createUrlSource, createCatalogStore, snapshotFingerprint } from '../server/dataSource.js';
import { createApp } from '../server/app.js';
import { DATA_DIR, loadJson } from './helpers.js';

const quiet = { error: () => {}, warn: () => {}, info: () => {} };
const CDN = 'https://cdn.test/public';

/** A fake CDN: files by name with ETags, 304 on If-None-Match, 404 for the rest, `error` to simulate an outage. */
function fakeCdn(files) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const name = String(url).slice(CDN.length + 1);
    const inm = init.headers?.['If-None-Match'] ?? null;
    calls.push({ name, inm });
    const file = files[name];
    if (!file) return new Response('not here', { status: 404 });
    if (file.error) throw new Error(file.error);
    if (inm && inm === file.etag) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(file.body), { status: 200, headers: { etag: file.etag, 'content-type': 'application/json' } });
  };
  return { fetch, calls, files };
}

function remoteShufersal(price, generatedAt) {
  const catalog = loadJson('test/fixtures/data/catalogs/shufersal.json');
  catalog.generatedAt = generatedAt;
  catalog.priceSource = 'file';
  catalog.source = { portal: 'publishedprices', store: '099', storeName: 'שופרסל אונליין', onlineStore: true };
  catalog.items.find((i) => i.gtin === '7290000042220').price = price;
  return catalog;
}

test('disk source loads the repo copy and reports where it came from', () => {
  const snapshot = createDiskSource({ dataDir: DATA_DIR, logger: quiet }).load();
  assert.equal(snapshot.products.length, 45);
  assert.equal(Object.keys(snapshot.catalogs).length, 14);
  assert.equal(snapshot.origin.kind, 'disk');
  assert.match(snapshotFingerprint(snapshot), /^45\|carrefour@2026-09-07T00:00:00.000Z#\d+/);
});

test('url source: conditional fetch by ETag, per-file fallback to the repo, stale copy on outage', async () => {
  const cdn = fakeCdn({
    'products.json': { etag: '"p1"', body: loadJson('test/fixtures/data/products.json') },
    'catalogs/shufersal.json': { etag: '"s1"', body: remoteShufersal(5.55, '2026-09-18T06:00:00.000Z') },
  });
  const disk = createDiskSource({ dataDir: DATA_DIR, logger: quiet });
  const source = createUrlSource({ baseUrl: CDN + '/', fallback: disk, fetch: cdn.fetch, logger: quiet });

  const first = await source.load(disk.load());
  assert.equal(first.origin.kind, 'url');
  assert.equal(first.origin.files['products.json'], 'fetched');
  assert.equal(first.origin.files['catalogs/shufersal.json'], 'fetched');
  assert.equal(first.origin.files['catalogs/ramilevy.json'], 'fallback', 'not on the CDN yet: the repo copy is used');
  assert.equal(first.catalogs.shufersal.items.find((i) => i.gtin === '7290000042220').price, 5.55);
  assert.equal(first.catalogs.ramilevy.generatedAt, '2026-09-07T00:00:00.000Z');
  assert.equal(first.catalogs.demo.chainId, 'demo', 'the demo catalog stays local');
  assert.deepEqual(first.origin.etags, { 'products.json': '"p1"', 'catalogs/shufersal.json': '"s1"' });
  assert.equal(first.chains.length, 14, 'chains.json is always the repo copy');

  const second = await source.load(first);
  assert.equal(second.origin.files['products.json'], 'unchanged');
  assert.equal(second.origin.files['catalogs/shufersal.json'], 'unchanged');
  assert.equal(second.catalogs.shufersal, first.catalogs.shufersal, 'a 304 reuses the previous object');
  assert.ok(cdn.calls.filter((c) => c.name === 'products.json')[1].inm === '"p1"', 'second fetch is conditional');
  assert.equal(snapshotFingerprint(second), snapshotFingerprint(first));

  cdn.files['catalogs/shufersal.json'].error = 'ECONNRESET';
  const third = await source.load(second);
  assert.equal(third.origin.files['catalogs/shufersal.json'], 'stale');
  assert.equal(third.origin.errors['catalogs/shufersal.json'], 'ECONNRESET');
  assert.equal(third.catalogs.shufersal.items.find((i) => i.gtin === '7290000042220').price, 5.55, 'outage keeps the last good copy');
  assert.equal(third.origin.etags['catalogs/shufersal.json'], '"s1"', 'and its ETag, so the next check is still conditional');
});

test('catalog store: disk first, then the remote snapshot; refresh only when the interval elapsed; listeners on change only', async () => {
  const cdn = fakeCdn({
    'products.json': { etag: '"p1"', body: loadJson('test/fixtures/data/products.json') },
    'catalogs/shufersal.json': { etag: '"s1"', body: remoteShufersal(5.55, '2026-09-18T06:00:00.000Z') },
  });
  let clock = Date.parse('2026-09-18T08:00:00Z');
  const store = createCatalogStore({ dataDir: DATA_DIR, catalogsUrl: CDN, fetch: cdn.fetch, logger: quiet, refreshIntervalMs: 60 * 60 * 1000, now: () => clock });
  const changes = [];
  store.onChange((s) => changes.push(s.origin.kind));
  assert.equal(store.current.origin.kind, 'disk', 'served from disk until the first remote load lands');
  await store.ready;
  assert.equal(store.current.origin.kind, 'url');
  assert.deepEqual(changes, ['url']);
  assert.equal(store.status().source, 'url');
  assert.equal(store.status().lastRefreshAt, '2026-09-18T08:00:00.000Z');

  assert.equal(store.maybeRefresh(), null, 'too early');
  clock += 30 * 60 * 1000;
  assert.equal(store.maybeRefresh(), null, 'still too early');
  clock += 31 * 60 * 1000;
  await store.maybeRefresh();
  assert.deepEqual(changes, ['url'], 'nothing changed (304): no rebuild');

  cdn.files['catalogs/shufersal.json'] = { etag: '"s2"', body: remoteShufersal(4.44, '2026-09-19T06:00:00.000Z') };
  clock += 61 * 60 * 1000;
  await store.maybeRefresh();
  assert.deepEqual(changes, ['url', 'url']);
  assert.equal(store.current.catalogs.shufersal.generatedAt, '2026-09-19T06:00:00.000Z');

  cdn.files['products.json'].error = 'boom';
  clock += 61 * 60 * 1000;
  await store.maybeRefresh();
  assert.equal(store.current.products.length, 45, 'outage: previous products kept');
  assert.equal(store.status().errors['products.json'], 'boom');
});

test('app: remote catalogs flow into /api/compare, /api/chains and /api/health; handoff tokens survive a data swap', async () => {
  const cdn = fakeCdn({
    'products.json': { etag: '"p1"', body: loadJson('test/fixtures/data/products.json') },
    'catalogs/shufersal.json': { etag: '"s1"', body: remoteShufersal(5.55, '2026-09-18T06:00:00.000Z') },
  });
  let clock = Date.parse('2026-09-18T08:00:00Z');
  const app = createApp({ dataDir: DATA_DIR, persist: false, logger: quiet, catalogsUrl: CDN, fetch: cdn.fetch, refreshIntervalMs: 1000, now: () => clock });
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const api = async (p, body) => (await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
  try {
    await app.ready;
    const health = await api('/api/health');
    assert.equal(health.data.source, 'url');
    assert.equal(health.data.loadedFrom, 'url');
    assert.deepEqual(health.data.priceLists.find((p) => p.chainId === 'shufersal'), { chainId: 'shufersal', generatedAt: '2026-09-18T06:00:00.000Z', store: '099', storeName: 'שופרסל אונליין', onlineStore: true, priceSource: 'file', portal: 'publishedprices' });

    const chains = await api('/api/chains');
    assert.equal(chains.chains.find((c) => c.id === 'shufersal').priceList.store, '099');
    assert.equal(chains.chains.find((c) => c.id === 'ramilevy').priceList.generatedAt, '2026-09-07T00:00:00.000Z');

    const lines = [{ productId: 'milk-3', qty: 1 }];
    const compare = await api('/api/compare', { lines });
    const row = compare.rows.find((r) => r.chainId === 'shufersal');
    assert.equal(row.lines[0].unitPrice, 5.55);
    assert.equal(row.priceList.generatedAt, '2026-09-18T06:00:00.000Z');
    assert.equal(row.priceList.store, '099');

    const { handoff } = await api('/api/handoffs', { lines, chainId: 'shufersal', address: 'תל אביב' });
    assert.equal(handoff.items[0].unitPrice, 5.55);

    // Next day's price list lands on the CDN; the next request past the interval swaps the data in.
    cdn.files['catalogs/shufersal.json'] = { etag: '"s2"', body: remoteShufersal(4.44, '2026-09-19T06:00:00.000Z') };
    clock += 2000;
    await api('/api/health');
    await app.store.inFlight;
    const after = await api('/api/compare', { lines });
    assert.equal(after.rows.find((r) => r.chainId === 'shufersal').lines[0].unitPrice, 4.44);
    assert.equal((await api('/api/products?q=' + encodeURIComponent('חלב'))).products.find((p) => p.id === 'milk-3').priceRange.min, 4.44, 'price ranges are recomputed for the new snapshot');
    const status = await api(`/api/handoffs/${encodeURIComponent(handoff.id)}/status`);
    assert.equal(status.handoff.items[0].unitPrice, 5.55, 'the stored record keeps the prices the customer saw');
    assert.equal(app.handoffs.fromToken(handoff.id).items[0].unitPrice, 4.44, 'on an instance without the record, the token resolves against the current catalog');

    const refreshed = await api('/api/data/refresh', {});
    assert.equal(refreshed.changed, false);
    assert.equal(refreshed.data.source, 'url');
  } finally {
    await app.close();
  }
});

test('app in disk mode: health says so and a refresh re-reads the disk', async () => {
  const app = createApp({ dataDir: DATA_DIR, persist: false, logger: quiet, catalogsUrl: null });
  const address = await app.listen(0);
  try {
    const health = await (await fetch(`http://127.0.0.1:${address.port}/api/health`)).json();
    assert.equal(health.data.source, 'disk');
    assert.equal(health.handoffStore, 'memory');
    const refreshed = await (await fetch(`http://127.0.0.1:${address.port}/api/data/refresh`, { method: 'POST' })).json();
    assert.equal(refreshed.changed, false);
  } finally {
    await app.close();
  }
});
