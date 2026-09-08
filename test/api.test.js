import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { cookieFetch, require } from './helpers.js';

const injector = require('../src/handoff/injector.cjs');

let app;
let base;

test.before(async () => {
  app = createApp({ persist: false, logger: { error: () => {}, warn: () => {} } });
  const address = await app.listen(0);
  base = `http://127.0.0.1:${address.port}`;
});
test.after(async () => { await app.close(); });

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('health, products, categories, chains', async () => {
  assert.equal((await api('/api/health')).data.ok, true);
  const preflight = await fetch(base + '/api/handoffs/x/results', { method: 'OPTIONS', headers: { Origin: 'https://www.shufersal.co.il', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  const search = await api('/api/products?q=' + encodeURIComponent('מלפפון'));
  assert.equal(search.data.products[0].id, 'cucumber');
  const byCategory = await api('/api/products?category=' + encodeURIComponent('משקאות'));
  assert.ok(byCategory.data.products.every((p) => p.category === 'משקאות'));
  assert.ok((await api('/api/categories')).data.categories.length >= 8);
  assert.equal((await api('/api/chains')).data.chains.length, 5);
  assert.equal((await api('/api/products/nope')).status, 404);
});

test('cart lifecycle -> comparison -> handoff -> injection into the demo store -> result reporting', async () => {
  const { data: created } = await api('/api/carts', { method: 'POST' });
  const cartId = created.cart.id;

  await api(`/api/carts/${cartId}/lines`, { method: 'PUT', body: { productId: 'milk-3', qty: 2 } });
  await api(`/api/carts/${cartId}/lines/bamba/add`, { method: 'POST', body: { delta: 3 } });
  await api(`/api/carts/${cartId}/lines`, { method: 'PUT', body: { productId: 'cucumber', qty: 1.5 } });
  await api(`/api/carts/${cartId}/lines`, { method: 'PUT', body: { productId: 'lemon', qty: 1, substituteProductId: 'avocado' } });
  await api(`/api/carts/${cartId}/lines`, { method: 'PUT', body: { productId: 'beer', qty: 1 } });
  assert.equal((await api(`/api/carts/${cartId}/lines`, { method: 'PUT', body: { productId: 'nope', qty: 1 } })).status, 404);

  const { data: withAddress } = await api(`/api/carts/${cartId}/address`, { method: 'PUT', body: { address: 'הרצל 12, תל אביב' } });
  assert.equal(withAddress.address.city, 'תל אביב');

  const { data: comparison } = await api(`/api/carts/${cartId}/compare`);
  assert.equal(comparison.itemCount, 5);
  const demoRow = comparison.rows.find((r) => r.chainId === 'demo');
  assert.equal(demoRow.deliverable, true);
  assert.deepEqual(demoRow.missing.map((m) => m.productId), ['beer']);
  assert.equal(demoRow.lines.find((l) => l.productId === 'lemon').status, 'substituted');
  assert.equal(demoRow.lines.find((l) => l.productId === 'bamba').promo, '3 ב-10 ₪');
  assert.ok(comparison.rows.some((r) => r.isBestValue));

  // Create the handoff: URL to the demo store with the cart id in the hash.
  const { status, data: handoffRes } = await api('/api/handoffs', { method: 'POST', body: { cartId, chainId: 'demo' } });
  assert.equal(status, 201);
  const handoff = handoffRes.handoff;
  assert.equal(handoff.url, `${base}/demo-store/#cart_id=${handoff.id}`);
  assert.equal(handoff.items.length, 4);
  assert.deepEqual(handoff.skipped.map((s) => s.productId), ['beer']);

  // The demo store page carries the CSRF meta tag the adapter needs.
  const page = await (await fetch(handoff.url)).text();
  const csrf = page.match(/<meta name="demo-csrf" content="([^"]+)">/)[1];
  assert.ok(page.includes('/handoff.js'), 'demo store loads the injector like the extension would');

  // Simulate the extension: bootstrap with the page URL, a cookie-carrying fetch and a fake DOM.
  const jarFetch = cookieFetch();
  const doc = { body: { appendChild() {} }, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {} }), querySelector: (sel) => (sel.includes('demo-csrf') ? { getAttribute: () => csrf } : null) };
  const loc = { href: handoff.url, hash: `#cart_id=${handoff.id}`, search: '' };
  const summary = await injector.bootstrap({ apiBase: base, fetch: jarFetch, document: doc, location: loc, redirect: false });
  assert.equal(summary.total, 4);
  assert.equal(summary.failCount, 0, JSON.stringify(summary.results));

  // The demo store's cart really contains the items now (same cookie jar).
  const demoCart = await (await jarFetch(`${base}/demo-store/api/cart`)).json();
  assert.equal(demoCart.cart.lines.length, 4);
  assert.equal(demoCart.cart.lines.find((l) => l.itemId === handoff.items[0].storeItemId).qty, 2);

  // The injector reported back; the platform shows the handoff as completed.
  const { data: statusRes } = await api(`/api/handoffs/${handoff.id}/status`);
  assert.equal(statusRes.handoff.status, 'completed');
  assert.equal(statusRes.handoff.result.okCount, 4);

  // WebView script endpoint returns injector + bootstrap for this handoff.
  const script = await (await fetch(`${base}/api/handoffs/${handoff.id}/script`)).text();
  assert.ok(script.includes('CartHandoffInjector.bootstrap'));
  assert.ok(script.includes(`"handoffId":"${handoff.id}"`));
});

test('demo store rejects requests without CSRF and out-of-stock items, and the injector records them', async () => {
  const { data: created } = await api('/api/carts', { method: 'POST' });
  await api(`/api/carts/${created.cart.id}/lines`, { method: 'PUT', body: { productId: 'lemon', qty: 1 } }); // out of stock in demo, no substitute
  const compare = await api(`/api/carts/${created.cart.id}/compare`);
  assert.equal(compare.data.rows.find((r) => r.chainId === 'demo').lines[0].status, 'out_of_stock');
  const { data } = await api('/api/handoffs', { method: 'POST', body: { cartId: created.cart.id, chainId: 'demo' } });
  assert.equal(data.handoff.items.length, 0);
  assert.equal(data.handoff.skipped[0].reason, 'out_of_stock');

  const noCsrf = await fetch(`${base}/demo-store/api/cart/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'D001', qty: 1 }) });
  assert.equal(noCsrf.status, 403);
});

test('handoff results with structural errors raise resilience alerts', async () => {
  const { data: created } = await api('/api/carts', { method: 'POST' });
  await api(`/api/carts/${created.cart.id}/lines`, { method: 'PUT', body: { productId: 'milk-3', qty: 1 } });
  const { data } = await api('/api/handoffs', { method: 'POST', body: { cartId: created.cart.id, chainId: 'shufersal' } });
  const res = await api(`/api/handoffs/${data.handoff.id}/results`, { method: 'POST', body: { results: [{ storeItemId: 'P_7290000042220', ok: false, errorType: 'endpoint_missing', error: 'HTTP 404', name: 'חלב' }] } });
  assert.equal(res.data.status, 'failed');
  assert.equal(res.data.alerts.length, 1);
  const alerts = await api('/api/alerts?unresolved=1&chainId=shufersal');
  assert.equal(alerts.data.alerts[0].type, 'api_shape_changed');
  const resolved = await api(`/api/alerts/${alerts.data.alerts[0].id}/resolve`, { method: 'POST' });
  assert.ok(resolved.data.alert.resolvedAt);
});

test('stateless mode: compare and handoff from posted lines, status by token on any instance', async () => {
  const lines = [{ productId: 'milk-3', qty: 1 }, { productId: 'bamba', qty: 3 }, { productId: 'nope', qty: 1 }, { productId: 'cola', qty: 0 }];
  const { data: comparison } = await api('/api/compare', { method: 'POST', body: { lines, address: 'תל אביב' } });
  assert.equal(comparison.itemCount, 2, 'unknown products and zero quantities are dropped');
  assert.equal(comparison.address.city, 'תל אביב');
  const { status, data } = await api('/api/handoffs', { method: 'POST', body: { lines, chainId: 'demo', address: 'תל אביב' } });
  assert.equal(status, 201);
  assert.equal(data.handoff.items.length, 2);
  // Another app instance (no shared memory) can serve the same handoff.
  const other = createApp({ persist: false, logger: { error: () => {}, warn: () => {} } });
  const addr = await other.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/handoffs/${encodeURIComponent(data.handoff.id)}`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.deepEqual(payload.items.map((i) => i.qty), [1, 3]);
    assert.equal(payload.adapter.baseUrl, `http://127.0.0.1:${addr.port}/demo-store/`);
    const st = await fetch(`http://127.0.0.1:${addr.port}/api/handoffs/${encodeURIComponent(data.handoff.id)}/status`);
    assert.equal((await st.json()).handoff.status, 'pending');
  } finally {
    await other.close();
  }
});

test('saved lists API', async () => {
  const { data: created } = await api('/api/carts', { method: 'POST' });
  const cartId = created.cart.id;
  await api(`/api/carts/${cartId}/lines`, { method: 'PUT', body: { productId: 'rice', qty: 2 } });
  const { data: saved } = await api('/api/lists', { method: 'POST', body: { name: 'קניות שבועיות', cartId } });
  assert.equal(saved.list.lines[0].product.name, 'אורז פרסי סוגת 1 ק"ג');
  await api(`/api/carts/${cartId}/lines`, { method: 'DELETE' });
  const { data: loaded } = await api(`/api/lists/${saved.list.id}/load`, { method: 'POST', body: { cartId } });
  assert.equal(loaded.cart.lines[0].qty, 2);
  assert.equal((await api('/api/lists')).data.lists.length >= 1, true);
  assert.equal((await api(`/api/lists/${saved.list.id}`, { method: 'DELETE' })).data.deleted, true);
});

test('errors: empty cart handoff, undeliverable chain, unknown routes, CORS preflight', async () => {
  const { data: created } = await api('/api/carts', { method: 'POST' });
  assert.equal((await api('/api/handoffs', { method: 'POST', body: { cartId: created.cart.id, chainId: 'demo' } })).status, 400);
  await api(`/api/carts/${created.cart.id}/lines`, { method: 'PUT', body: { productId: 'milk-3', qty: 1 } });
  await api(`/api/carts/${created.cart.id}/address`, { method: 'PUT', body: { address: 'אילת' } });
  const undeliverable = await api('/api/handoffs', { method: 'POST', body: { cartId: created.cart.id, chainId: 'shufersal' } });
  assert.equal(undeliverable.status, 400);
  assert.equal((await api('/api/handoffs/nope')).status, 404);
  assert.equal((await api('/nope')).status, 404);
  const preflight = await fetch(`${base}/api/handoffs/x`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  const ui = await fetch(`${base}/`);
  assert.equal(ui.status, 200);
  assert.ok((await ui.text()).includes('השוואת סלים'));
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});
