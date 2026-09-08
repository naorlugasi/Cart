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

// ---------------------------------------------------------------------------------------------
// Features added for the live chain adapters (page vars, session capture, lookup, bulk, localStorage cart)

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), dump: () => Object.fromEntries(map) };
}

test('vars are read from the page (localStorage JSON paths, defaults) and a required one that is missing fails fast', async () => {
  const ls = memStorage({ frontend: JSON.stringify({ branchId: 42, serverCartId: 'c9' }), plain: 'v' });
  const ctx = { document: fakeDocument({ meta: { tok: 'm' } }), localStorage: ls };
  const spec = { a: { source: 'localStorage', name: 'frontend', path: 'branchId' }, b: { source: 'localStorage', name: 'plain' }, c: { source: 'localStorage', name: 'nope', default: 7 }, d: { source: 'meta', name: 'tok' }, e: { source: 'cookie', name: 'x' } };
  assert.deepEqual(injector.resolveVars({ vars: spec }, ctx), { values: { a: 42, b: 'v', c: 7, d: 'm' }, missing: [] });
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return fakeResponse({ json: { ok: true } }); };
  const summary = await injector.runHandoff(payload([{ storeItemId: 'a', qty: 1 }], { vars: { cartId: { source: 'localStorage', name: 'missing', required: true } } }), { ...ctx, fetch });
  assert.equal(calls.length, 0);
  assert.equal(summary.results[0].errorType, 'csrf_missing');
  assert.match(summary.results[0].error, /cartId/);
});

test('session warm-up can be skipped when a var exists and captures values into vars + localStorage', async () => {
  const ls = memStorage({ frontend: JSON.stringify({ branchId: 3003 }) });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (/\/carts\?appId=4$/.test(url)) return fakeResponse({ status: 201, json: { cart: { id: 555, lines: [] } } });
    const body = JSON.parse(init.body);
    return fakeResponse({ json: { cart: { lines: body.lines.map((l) => ({ retailerProductId: l.retailerProductId, quantity: l.quantity })) } } });
  };
  const carrefourish = {
    vars: { branchId: { source: 'localStorage', name: 'frontend', path: 'branchId', default: 1 }, cartId: { source: 'localStorage', name: 'frontend', path: 'serverCartId' } },
    session: { skipIfVar: 'cartId', method: 'POST', path: '/v2/b/{{branchId}}/carts', query: { appId: 4 }, format: 'json', body: { lines: [], source: 'Category' }, capture: [{ jsonPath: 'cart.id', var: 'cartId', localStorage: { key: 'frontend', path: 'serverCartId' } }] },
    add: { method: 'POST', path: '/v2/b/{{branchId}}/carts/{{cartId}}', query: { appId: 4 }, format: 'json', bulk: true, items: { as: 'list', template: { quantity: '{{qty}}', soldBy: null, retailerProductId: '{{resolvedId}}', type: 1 } }, body: { lines: '{{items}}', source: 'Category' }, headers: { 'X-HTTP-Method-Override': 'PATCH' }, success: { statusOk: true, itemsPath: 'cart.lines', itemIdField: 'retailerProductId' } },
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: '11', qty: 2 }, { storeItemId: '22', qty: 1 }], carrefourish), { fetch, document: fakeDocument(), localStorage: ls });
  assert.equal(calls[0].url, 'https://x.example/v2/b/3003/carts?appId=4');
  assert.equal(calls[1].url, 'https://x.example/v2/b/3003/carts/555?appId=4');
  assert.equal(calls[1].init.headers['X-HTTP-Method-Override'], 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].init.body), { lines: [{ quantity: 2, soldBy: null, retailerProductId: '11', type: 1 }, { quantity: 1, soldBy: null, retailerProductId: '22', type: 1 }], source: 'Category' });
  assert.equal(JSON.parse(ls.getItem('frontend')).serverCartId, 555);
  assert.equal(summary.okCount, 2);

  // second run: the cart id is now in localStorage, so the session step is skipped
  calls.length = 0;
  await injector.runHandoff(payload([{ storeItemId: '11', qty: 2 }], carrefourish), { fetch, document: fakeDocument(), localStorage: ls });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://x.example/v2/b/3003/carts/555?appId=4');
});

test('bulk add marks items missing from the response as rejected', async () => {
  const fetch = async () => fakeResponse({ json: { cart: { lines: [{ retailerProductId: 1, quantity: 1 }] } } });
  const bulk = { add: { method: 'POST', path: '/carts/1', format: 'json', bulk: true, items: { as: 'list', template: { retailerProductId: '{{resolvedId}}', quantity: '{{qty}}' } }, body: { lines: '{{items}}' }, success: { statusOk: true, itemsPath: 'cart.lines', itemIdField: 'retailerProductId' } } };
  const summary = await injector.runHandoff(payload([{ storeItemId: '1', qty: 1, name: 'A' }, { storeItemId: '2', qty: 1, name: 'B' }], bulk), { fetch, document: fakeDocument() });
  assert.deepEqual(summary.results.map((r) => [r.storeItemId, r.ok, r.errorType]), [['1', true, undefined], ['2', false, 'rejected']]);
});

test('per-item lookup resolves barcodes to chain ids; unknown barcodes are reported as not_in_catalog', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/products')) {
      const filters = JSON.parse(new URL(url).searchParams.get('filters'));
      const barcode = filters.must.term.barcode;
      return fakeResponse({ json: { total: barcode === '111' ? 1 : 0, products: barcode === '111' ? [{ id: 9001 }] : [] } });
    }
    return fakeResponse({ json: JSON.parse(init.body) });
  };
  const withLookup = {
    lookup: { method: 'GET', path: '/products', query: { filters: '{"must":{"term":{"barcode":"{{barcode}}"}}}', size: 1 }, bulk: false, itemsPath: 'products', idField: 'id' },
    add: { method: 'POST', path: '/add', format: 'json', body: { id: '{{resolvedId}}', barcode: '{{barcode}}', qty: '{{qty}}' }, success: { statusOk: true } },
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: '111', qty: 1, name: 'A' }, { storeItemId: '222', qty: 1, name: 'B' }], withLookup), { fetch, document: fakeDocument() });
  assert.equal(calls.filter((c) => c.url.includes('/add')).length, 1);
  assert.deepEqual(JSON.parse(calls.find((c) => c.url.includes('/add')).init.body), { id: 9001, barcode: '111', qty: 1 });
  assert.deepEqual(summary.results.map((r) => [r.storeItemId, r.ok, r.resolvedId, r.errorType]), [['111', true, 9001, undefined], ['222', false, '222', 'not_in_catalog']]);
});

test('localStorageCart strategy: bulk lookup, price check, merge into the persisted store', async () => {
  const ls = memStorage({ ramilevy: JSON.stringify({ authuser: { user: null }, cart: { items: [{ id: 5, barcode: 555, name: 'old', amount: 1 }], price: 1 } }) });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/catalog?')) return fakeResponse({ json: { data: [{ id: 425127, barcode: 7290119672066, name: 'halita' }, { id: 5, barcode: 555, name: 'old' }] } });
    const body = JSON.parse(init.body);
    return fakeResponse({ json: { items: Object.keys(body.items).map((id) => ({ id: Number(id), quantity: body.items[id] })), price: 10 } });
  };
  const rl = {
    strategy: 'localStorageCart',
    vars: { storeCode: { source: 'localStorage', name: 'ramilevy', path: 'cart.storeId', default: 331 } },
    lookup: { method: 'POST', path: '/api/catalog?', format: 'json', body: { store: '{{storeCode}}', items: '{{barcodes}}', size: '{{count}}', itemsBy: 'barcode' }, bulk: true, itemsPath: 'data', matchField: 'barcode', idField: 'id' },
    add: { method: 'POST', path: '/api/v2/cart', format: 'json', bulk: true, items: { as: 'map', key: '{{resolvedId}}', value: '{{qtyFixed2}}' }, body: { store: '{{storeCode}}', isClub: 0, supplyAt: '{{nowIso}}', items: '{{items}}', meta: null }, success: { statusOk: true, itemsPath: 'items', itemIdField: 'id' } },
    localStorageCart: { key: 'ramilevy', itemsPath: 'cart.items', idField: 'id', qtyField: 'amount' },
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: '7290119672066', qty: 3, name: 'A' }, { storeItemId: '555', qty: 2, name: 'Old' }, { storeItemId: '999', qty: 1, name: 'Nope' }], rl), { fetch, document: fakeDocument(), localStorage: ls });
  const lookupBody = JSON.parse(calls[0].init.body);
  assert.deepEqual(lookupBody, { store: 331, items: '7290119672066,555,999', size: 3, itemsBy: 'barcode' });
  const priceBody = JSON.parse(calls[1].init.body);
  assert.deepEqual(priceBody.items, { 425127: '3.00', 5: '2.00' });
  assert.equal(priceBody.store, 331);
  assert.match(priceBody.supplyAt, /^\d{4}-\d{2}-\d{2}T/);
  const stored = JSON.parse(ls.getItem('ramilevy'));
  assert.deepEqual(stored.cart.items.map((i) => [i.id, i.amount, i.name]), [[5, 2, 'old'], [425127, 3, 'halita']]);
  assert.equal(stored.authuser.user, null, 'other state is preserved');
  assert.deepEqual(summary.results.map((r) => [r.storeItemId, r.ok, r.errorType]), [['7290119672066', true, undefined], ['555', true, undefined], ['999', false, 'not_in_catalog']]);
});

test('GraphQL style adapters: templated text success, errorPath messages, empty headers dropped, credentials honoured', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    const sku = body.variables.cartItems[0].sku;
    if (sku === 'bad') return fakeResponse({ json: { data: { addProductsToCart: { user_errors: [{ code: 'PRODUCT_NOT_FOUND', message: 'Could not find a product with SKU "bad"' }], cart: { total_quantity: 1 } } } } });
    return fakeResponse({ json: { data: { addProductsToCart: { user_errors: [], cart: { total_quantity: 1 } } } } });
  };
  const ls = memStorage({ cartId: 'C1' });
  const gql = {
    vars: { cartId: { source: 'localStorage', name: 'cartId' }, cacheId: { source: 'localStorage', name: 'cache-id', default: '' } },
    add: { method: 'POST', path: 'https://api.x.example/graphql', format: 'json', credentials: 'omit', body: { variables: { cartId: '{{cartId}}', cartItems: [{ sku: '{{storeItemId}}', quantity: '{{qty}}' }] } }, headers: { 'x-magento-cache-id': '{{cacheId}}' }, success: { statusOk: true, jsonPath: 'data.addProductsToCart.user_errors.length', equals: 0, errorPath: 'data.addProductsToCart.user_errors.0.message' } },
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: 'good', qty: 2 }, { storeItemId: 'bad', qty: 1 }], gql), { fetch, document: fakeDocument(), localStorage: ls });
  assert.equal(calls[0].url, 'https://api.x.example/graphql');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal('x-magento-cache-id' in calls[0].init.headers, false, 'empty header values are not sent');
  assert.deepEqual(JSON.parse(calls[0].init.body).variables, { cartId: 'C1', cartItems: [{ sku: 'good', quantity: 2 }] });
  assert.equal(summary.results[0].ok, true);
  assert.equal(summary.results[1].errorType, 'rejected');
  assert.equal(summary.results[1].error, 'Could not find a product with SKU "bad"');

  // Hybris style: HTML fragment success test with the item id filled in, error text extracted
  const html = { add: { method: 'POST', path: '/cart/add', query: { 'cartContext[openFrom]': 'CATALOG' }, format: 'json', body: { productCodePost: '{{storeItemId}}', qty: '{{qty}}' }, csrf: { source: 'meta', name: '_csrf', header: 'CSRFToken', required: true }, success: { statusOk: true, textIncludes: 'data-product-code="{{storeItemId}}"', errorText: 'הוספת הפריט נכשלה' } } };
  const hfetch = async (url, init) => {
    calls.push({ url, init });
    const code = JSON.parse(init.body).productCodePost;
    return fakeResponse({ text: code === 'P_1' ? '<article data-product-code="P_1" data-entry-qty="2.0">' : '<span>הוספת הפריט נכשלה</span>' });
  };
  calls.length = 0;
  const hs = await injector.runHandoff(payload([{ storeItemId: 'P_1', qty: 2 }, { storeItemId: 'P_2', qty: 1 }], html), { fetch: hfetch, document: fakeDocument({ meta: { _csrf: 'tok' } }) });
  assert.equal(calls[0].url, 'https://x.example/cart/add?cartContext%5BopenFrom%5D=CATALOG');
  assert.equal(calls[0].init.headers.CSRFToken, 'tok');
  assert.deepEqual(hs.results.map((r) => [r.ok, r.error]), [[true, undefined], [false, 'הוספת הפריט נכשלה']]);
});

test('execute accepts any listed domain of the chain and honours the adapter redirect delay', async () => {
  const fetch = async () => fakeResponse({ json: { ok: true } });
  const loc = { href: 'https://alt.x.example/page', hash: '#cart_id=h1', search: '' };
  const summary = await injector.execute(payload([{ storeItemId: 'a', qty: 1 }], { domains: ['alt.x.example'], redirectDelayMs: 0 }), { fetch, document: fakeDocument(), location: loc });
  assert.equal(summary.okCount, 1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(loc.href, 'https://x.example/cart');
});

test('vars with waitMs are polled until the page produces them, so the session step is skipped', async () => {
  const ls = memStorage();
  setTimeout(() => ls.setItem('cartId', 'site-cart'), 30);
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return fakeResponse({ json: { data: { createEmptyCart: 'ours', addProductsToCart: { user_errors: [] } } } }); };
  const adapterSpec = {
    vars: { cartId: { source: 'localStorage', name: 'cartId', waitMs: 2000 } },
    session: { skipIfVar: 'cartId', method: 'POST', path: '/graphql', format: 'json', body: { op: 'create' }, capture: [{ jsonPath: 'data.createEmptyCart', var: 'cartId', localStorage: { key: 'cartId' } }] },
    add: { method: 'POST', path: '/graphql', format: 'json', body: { cartId: '{{cartId}}', sku: '{{storeItemId}}' }, success: { jsonPath: 'data.addProductsToCart.user_errors.length', equals: 0 } },
  };
  const summary = await injector.runHandoff(payload([{ storeItemId: 's1', qty: 1 }], adapterSpec), { fetch, document: fakeDocument(), localStorage: ls, pollMs: 5 });
  assert.equal(summary.okCount, 1);
  assert.deepEqual(calls.map((c) => c.body), [{ cartId: 'site-cart', sku: 's1' }], 'no cart was created by us');
  // without a cart on the page the session step creates one and stores it
  const empty = memStorage();
  calls.length = 0;
  await injector.runHandoff(payload([{ storeItemId: 's1', qty: 1 }], { ...adapterSpec, vars: { cartId: { source: 'localStorage', name: 'cartId', waitMs: 20 } } }), { fetch, document: fakeDocument(), localStorage: empty, pollMs: 5 });
  assert.deepEqual(calls.map((c) => c.body), [{ op: 'create' }, { cartId: 'ours', sku: 's1' }]);
  assert.equal(empty.getItem('cartId'), 'ours');
});

test('bootstrap runs from the payload embedded in the URL hash without calling the platform API', async () => {
  const inline = payload([{ storeItemId: 'a', qty: 1, name: 'A' }]);
  const hash = '#cart_id=h1&p=' + Buffer.from(JSON.stringify(inline)).toString('base64url');
  assert.equal(injector.readInlinePayload({ hash }).id, 'h1');
  assert.equal(injector.readInlinePayload({ hash: '#cart_id=h1' }), null);
  assert.equal(injector.readInlinePayload({ hash: '#cart_id=h1&p=%%%' }), null);
  const calls = [];
  const posted = [];
  const fetch = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://api.example/')) { posted.push(JSON.parse(init.body)); return fakeResponse({ json: { ok: true } }); }
    return fakeResponse({ json: { ok: true } });
  };
  const messages = [];
  const opener = { postMessage: (msg, target) => messages.push({ msg, target }) };
  const loc = { href: 'https://x.example/' + hash, hash, search: '' };
  const summary = await injector.bootstrap({ apiBase: 'https://api.example', fetch, document: fakeDocument(), location: loc, sessionStorage: { getItem: () => null, setItem() {} }, opener, redirect: false });
  assert.equal(summary.okCount, 1);
  assert.ok(!calls.some((u) => u.includes('/api/handoffs/h1') && !u.endsWith('/results')), 'payload was not fetched');
  assert.equal(posted[0].handoffId, 'h1');
  assert.equal(messages[0].target, 'https://api.example');
  assert.equal(messages[0].msg.type, 'cart-handoff-result');
  assert.equal(messages[0].msg.summary.okCount, 1);
});

test('when the report POST is blocked the result goes out as an image beacon', async () => {
  const beacons = [];
  const fetch = async (url) => { if (url.startsWith('https://api.example/')) throw new TypeError('Failed to fetch'); return fakeResponse({ json: { ok: true } }); };
  const summary = await injector.execute(payload([{ storeItemId: 'a', qty: 1 }]), { fetch, document: fakeDocument(), location: { href: 'https://x.example/#cart_id=h1', hash: '#cart_id=h1', search: '' }, redirect: false, beacon: (url) => { beacons.push(url); return true; } });
  assert.equal(summary.okCount, 1);
  assert.equal(beacons.length, 1);
  const url = new URL(beacons[0]);
  assert.equal(url.origin + url.pathname, 'https://api.example/api/handoffs/h1/results');
  assert.equal(JSON.parse(Buffer.from(url.searchParams.get('s'), 'base64url').toString()).okCount, 1);
});

test('relative adapter paths are resolved against the current page origin on an allowed domain', async () => {
  const calls = [];
  const fetch = async (url) => { calls.push(url); return fakeResponse({ json: { ok: true } }); };
  const loc = { href: 'https://www.x.example/he/page#cart_id=h1', hash: '#cart_id=h1', search: '' };
  await injector.runHandoff(payload([{ storeItemId: 'a', qty: 1 }], { baseUrl: 'https://x.example/', domains: ['www.x.example'] }), { fetch, document: fakeDocument(), location: loc });
  assert.equal(calls[0], 'https://www.x.example/api/cart/add');
  calls.length = 0;
  await injector.runHandoff(payload([{ storeItemId: 'a', qty: 1 }]), { fetch, document: fakeDocument(), location: { href: 'https://other.example/', hash: '', search: '' } });
  assert.equal(calls[0], 'https://x.example/api/cart/add', 'outside the chain domains the configured baseUrl is used');
});
