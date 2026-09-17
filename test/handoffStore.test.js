import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpstashRedis } from '../src/storage/upstashRedis.js';
import { MemoryHandoffStore, RedisHandoffStore } from '../src/handoff/handoffStore.js';
import { HandoffService } from '../src/handoff/handoffService.js';
import { MappingEngine } from '../src/catalog/mapping.js';
import { createApp } from '../server/app.js';
import { loadSeed, fakeUpstash, DATA_DIR } from './helpers.js';

const seed = loadSeed();
const mapping = new MappingEngine(seed);
const quiet = { error: () => {}, warn: () => {} };

test('upstash client: single command, pipeline, and auth errors', async () => {
  const up = fakeUpstash();
  const client = createUpstashRedis({ url: 'https://redis.test', token: 'tok', fetch: up.fetch });
  assert.equal(await client.command('SET', 'k', 'v', 'EX', 10), 'OK');
  assert.equal(await client.command('GET', 'k'), 'v');
  assert.equal(up.ttl.get('k'), 10);
  assert.deepEqual(await client.pipeline([['GET', 'k'], ['GET', 'missing']]), ['v', null]);
  await assert.rejects(() => client.command('BOGUS'), /upstash/);
  const bad = createUpstashRedis({ url: 'https://redis.test', token: 'wrong', fetch: up.fetch });
  await assert.rejects(() => bad.command('GET', 'k'), /401/);
  assert.throws(() => createUpstashRedis({ url: '', token: '' }), /required/);
});

test('RedisHandoffStore: set/get/list/delete, TTL on every write, index trimmed to the newest records', async () => {
  const up = fakeUpstash();
  const client = createUpstashRedis({ url: 'https://redis.test', token: 'tok', fetch: up.fetch });
  const store = new RedisHandoffStore({ client, ttlSeconds: 120, maxIndexed: 2 });
  const rec = (id, createdAt) => ({ id, createdAt, status: 'pending', items: [] });
  await store.set(rec('a', '2026-09-18T10:00:00Z'));
  await store.set(rec('b', '2026-09-18T10:01:00Z'));
  await store.set(rec('c', '2026-09-18T10:02:00Z'));
  assert.equal(up.ttl.get('handoff:a'), 120);
  assert.deepEqual((await store.get('a')), rec('a', '2026-09-18T10:00:00Z'));
  assert.deepEqual((await store.list()).map((h) => h.id), ['c', 'b'], 'newest first, capped');
  assert.equal(await store.delete('b'), true);
  assert.equal(await store.delete('b'), false);
  assert.deepEqual((await store.list()).map((h) => h.id), ['c']);
  up.kv.delete('handoff:c'); // expired in Redis
  assert.deepEqual(await store.list(), [], 'expired records fall out of the index');
  assert.equal(await store.get('nope'), null);
  assert.deepEqual(store.toJSON(), { handoffs: [] });
});

test('two service instances sharing Redis see the same status (what serverless needs)', async () => {
  const up = fakeUpstash();
  const client = createUpstashRedis({ url: 'https://redis.test', token: 'tok', fetch: up.fetch });
  const a = new HandoffService({ mapping, alerts: null, chains: seed.chains, store: new RedisHandoffStore({ client }) });
  const b = new HandoffService({ mapping, alerts: null, chains: seed.chains, store: new RedisHandoffStore({ client }) });
  const created = await a.create({ cart: { lines: [{ productId: 'milk-3', qty: 1 }] }, chainId: 'ramilevy' });
  assert.equal((await b.get(created.id)).status, 'pending');
  await b.recordResults(created.id, { results: [{ storeItemId: '7290000042220', ok: true }] });
  assert.equal((await a.get(created.id)).status, 'completed');
  assert.equal((await a.get(created.id)).result.okCount, 1);
  assert.deepEqual((await a.list()).map((h) => h.id), [created.id]);
  const memory = new HandoffService({ mapping, alerts: null, chains: seed.chains, store: new MemoryHandoffStore() });
  assert.equal((await memory.get(created.id)).status, 'pending', 'without the shared store only the token survives');
});

test('app: a report received by one instance is visible on another through the shared store', async () => {
  const up = fakeUpstash();
  const client = createUpstashRedis({ url: 'https://redis.test', token: 'tok', fetch: up.fetch });
  const one = createApp({ dataDir: DATA_DIR, persist: false, logger: quiet, redis: client });
  const two = createApp({ dataDir: DATA_DIR, persist: false, logger: quiet, redis: client });
  const p1 = await one.listen(0);
  const p2 = await two.listen(0);
  try {
    const health = await (await fetch(`http://127.0.0.1:${p1.port}/api/health`)).json();
    assert.equal(health.handoffStore, 'redis');
    const res = await fetch(`http://127.0.0.1:${p1.port}/api/handoffs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: [{ productId: 'milk-3', qty: 1 }], chainId: 'demo' }) });
    const { handoff } = await res.json();
    await fetch(`http://127.0.0.1:${p2.port}/api/handoffs/${encodeURIComponent(handoff.id)}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: [{ storeItemId: handoff.items[0].storeItemId, ok: true }] }) });
    const status = await (await fetch(`http://127.0.0.1:${p1.port}/api/handoffs/${encodeURIComponent(handoff.id)}/status`)).json();
    assert.equal(status.handoff.status, 'completed');
    const listed = await (await fetch(`http://127.0.0.1:${p2.port}/api/handoffs`)).json();
    assert.equal(listed.handoffs[0].id, handoff.id);
  } finally {
    await one.close();
    await two.close();
  }
  const noRedis = createApp({ dataDir: DATA_DIR, persist: false, logger: quiet, redis: null });
  assert.equal(noRedis.handoffs.store.kind, 'memory');
});
