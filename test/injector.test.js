import test from 'node:test';
import assert from 'node:assert/strict';
import { require, fakeDocument, fakeResponse } from './helpers.js';

const injector = require('../src/handoff/injector.cjs');

const adapter = {
  chainId: 'x',
  name: 'X',
  baseUrl: 'https://x.example/',
  session: null,
  add: { method: 'POST', path: '/api/cart/add', format: 'json', body: { id: '{{storeItemId}}', qty: '{{qty}}' }, headers: {}, csrf: null, success: { jsonPath: 'ok', equals: true } },
  delayMs: 0,
  checkoutPath: '/cart',
};

function payload(items, overrides = {}) {
  return { id: 'h1', chainId: 'x', items, adapter: { ...adapter, ...overrides }, reportUrl: 'https://api.example/api/handoffs/h1/results' };
}

test('fill / fillDeep / buildBody keep numeric types for JSON and encode forms', () => {
  assert.equal(injector.fill('/p/{{storeItemId}}?q={{qty}}', { storeItemId: 'A B', qty: 2 }), '/p/A B?q=2');
  assert.deepEqual(injector.fillDeep({ items: [{ id: '{{storeItemId}}', quantity: '{{qty}}' }] }, { storeItemId: '7', qty: 3 }), { items: [{ id: '7', quantity: 3 }] });
  const json = injector.buildBody({ format: 'json', body: { id: '{{storeItemId}}', qty: '{{qty}}' } }, { storeItemId: '7', qty: 3 });
  assert.equal(json.body, '{"id":"7","qty":3}');
  const form = injector.buildBody({ format: 'form', body: { productCodePost: '{{storeItemId}}', qty: '{{qty}}' } }, { storeItemId: 'P_1', qty: 2 });
  assert.equal(form.body, 'productCodePost=P_1&qty=2');
});

test('readHandoffId reads the id from the hash or query string', () => {
  assert.equal(injector.readHandoffId({ hash: '#cart_id=abc123', search: '' }), 'abc123');
  assert.equal(injector.readHandoffId({ hash: '#foo=1&cart_id=zzz', search: '' }), 'zzz');
  assert.equal(injector.readHandoffId({ hash: '', search: '?cart_id=q1' }), 'q1');
  assert.equal(injector.readHandoffId({ hash: '', search: '' }), null);
  assert.equal(injector.readHandoffId({ hash: '#h=1' }, 'h'), '1');
});

test('runHandoff replays cart-add requests with cookies and continues after failures', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    if (body.id === 'bad') return fakeResponse({ json: { ok: false, message: 'אזל מהמלאי' } });
    return fakeResponse({ json: { ok: true } });
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: 'a', qty: 1, name: 'A' }, { storeItemId: 'bad', qty: 2, name: 'Bad' }, { storeItemId: 'c', qty: 3, name: 'C' }]), { fetch, document: fakeDocument() });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://x.example/api/cart/add');
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(summary.okCount, 2);
  assert.equal(summary.failCount, 1);
  assert.equal(summary.results[1].errorType, 'rejected');
  assert.equal(summary.results[1].error, 'אזל מהמלאי');
  assert.equal(injector.summaryText(summary), 'העגלה נטענה חלקית: 2 מתוך 3 מוצרים נוספו. לא נוספו: Bad.');
});

test('runHandoff classifies structural failures (404, unexpected shape, network)', async () => {
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.id === 'gone') return fakeResponse({ status: 404, text: 'Not Found' });
    if (body.id === 'html') return fakeResponse({ status: 200, text: '<html>login</html>' });
    if (body.id === 'net') throw new Error('Failed to fetch');
    if (body.id === 'auth') return fakeResponse({ status: 403, json: { error: 'forbidden' } });
    return fakeResponse({ json: { ok: true } });
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: 'gone', qty: 1 }, { storeItemId: 'html', qty: 1 }, { storeItemId: 'net', qty: 1 }, { storeItemId: 'auth', qty: 1 }]), { fetch, document: fakeDocument() });
  assert.deepEqual(summary.results.map((r) => r.errorType), ['endpoint_missing', 'unexpected_response', 'network', 'auth']);
});

test('CSRF token is read from the page and sent as a header; missing required token skips requests', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push(init); return fakeResponse({ json: { ok: true } }); };
  const csrfAdapter = { add: { ...adapter.add, csrf: { source: 'meta', name: 'CSRFToken', header: 'X-CSRF', required: true } } };
  const ok = await injector.runHandoff(payload([{ storeItemId: 'a', qty: 1 }], csrfAdapter), { fetch, document: fakeDocument({ meta: { CSRFToken: 'tok123' } }) });
  assert.equal(ok.okCount, 1);
  assert.equal(calls[0].headers['X-CSRF'], 'tok123');
  const missing = await injector.runHandoff(payload([{ storeItemId: 'a', qty: 1 }, { storeItemId: 'b', qty: 1 }], csrfAdapter), { fetch, document: fakeDocument() });
  assert.equal(missing.failCount, 2);
  assert.equal(missing.results[0].errorType, 'csrf_missing');
  assert.equal(calls.length, 1, 'no requests are sent without the token');
});

test('form-encoded adapters (Hybris style) append the CSRF field and honour session warm-up', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return fakeResponse({ status: 200, text: 'ok' }); };
  const hybris = { session: { method: 'GET', path: '/cart' }, add: { method: 'POST', path: '/cart/add', format: 'form', body: { productCodePost: '{{storeItemId}}', qty: '{{qty}}' }, csrf: { source: 'input', name: 'CSRFToken', field: 'CSRFToken', header: 'CSRFToken' }, success: { statusOk: true } } };
  const summary = await injector.runHandoff(payload([{ storeItemId: 'P_1', qty: 2 }], hybris), { fetch, document: fakeDocument({ inputs: { CSRFToken: 'abc' } }) });
  assert.equal(calls[0].url, 'https://x.example/cart');
  assert.equal(calls[1].init.body, 'productCodePost=P_1&qty=2&CSRFToken=abc');
  assert.equal(calls[1].init.headers.CSRFToken, 'abc');
  assert.equal(summary.okCount, 1);
});

test('execute reports results, shows a banner and redirects to checkout; refuses foreign origins', async () => {
  const posted = [];
  const fetch = async (url, init) => {
    if (url.startsWith('https://api.example/')) { posted.push(JSON.parse(init.body)); return fakeResponse({ json: { ok: true } }); }
    return fakeResponse({ json: { ok: true } });
  };
  const doc = fakeDocument();
  const loc = { href: 'https://x.example/#cart_id=h1', hash: '#cart_id=h1', search: '' };
  const summary = await injector.execute(payload([{ storeItemId: 'a', qty: 1, name: 'A' }]), { fetch, document: doc, location: loc, redirectDelayMs: 0 });
  assert.equal(summary.okCount, 1);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].handoffId, 'h1');
  assert.equal(doc.banner.textContent, 'העגלה נטענה בהצלחה, כעת בחר מועד משלוח ובצע תשלום.');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(loc.href, 'https://x.example/cart');

  const foreign = { href: 'https://evil.example/', hash: '#cart_id=h1', search: '' };
  const refused = await injector.execute(payload([{ storeItemId: 'a', qty: 1 }]), { fetch, document: fakeDocument(), location: foreign });
  assert.deepEqual(refused.warnings, ['origin_mismatch']);
  assert.equal(refused.okCount, 0);
});

test('bootstrap fetches the payload by id and runs once per tab', async () => {
  const storage = new Map();
  const sessionStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  let payloadFetches = 0;
  const fetch = async (url, init) => {
    if (url === 'https://api.example/api/handoffs/h1') { payloadFetches++; return fakeResponse({ json: payload([{ storeItemId: 'a', qty: 1 }]) }); }
    return fakeResponse({ json: { ok: true } });
  };
  const loc = { href: 'https://x.example/#cart_id=h1', hash: '#cart_id=h1', search: '' };
  const first = await injector.bootstrap({ apiBase: 'https://api.example/', fetch, document: fakeDocument(), location: loc, sessionStorage, redirect: false });
  assert.equal(first.okCount, 1);
  const second = await injector.bootstrap({ apiBase: 'https://api.example/', fetch, document: fakeDocument(), location: loc, sessionStorage, redirect: false });
  assert.equal(second, null);
  assert.equal(payloadFetches, 1);
  assert.equal(await injector.bootstrap({ apiBase: 'x', fetch, location: { hash: '', search: '' } }), null);
});
