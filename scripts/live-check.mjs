#!/usr/bin/env node
/**
 * Live end-to-end check against a deployed instance.
 *
 *   node scripts/live-check.mjs https://cart-transfer-redirect.vercel.app
 *
 * Runs the whole user flow without a browser: catalog search -> comparison -> handoff creation ->
 * the real injector against the demo store (cookies carried like a browser) -> result reporting ->
 * status. Exits non-zero on the first failure and prints a compact report.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const injector = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'handoff', 'injector.cjs'));

const base = (process.argv[2] || process.env.LIVE_URL || '').replace(/\/$/, '');
if (!base) { console.error('usage: live-check.mjs <base-url>'); process.exit(2); }

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
  if (!ok) { console.log('\nStopping at first failure.'); process.exit(1); }
}

function cookieFetch() {
  const jar = new Map();
  return async (url, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    if (jar.size) headers.set('cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return res;
  };
}

async function api(p, { method = 'GET', body } = {}) {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data, res };
}

const t0 = Date.now();

const health = await api('/api/health');
check('GET /api/health', health.status === 200 && health.data?.ok === true, `products=${health.data?.products} chains=${health.data?.chains?.join(',')}`);

const ui = await fetch(base + '/');
check('GET / (UI)', ui.status === 200 && (await ui.text()).includes('השוואת סלים'));

const search = await api('/api/products?q=' + encodeURIComponent('מלפפון'));
check('search "מלפפון"', search.data?.products?.[0]?.id === 'cucumber', search.data?.products?.map((p) => p.id).slice(0, 3).join(','));

const lines = [{ productId: 'milk-3', qty: 2 }, { productId: 'cucumber', qty: 1.5 }, { productId: 'bamba', qty: 3 }, { productId: 'lemon', qty: 1, substituteProductId: 'avocado' }, { productId: 'beer', qty: 1 }];
const tc = Date.now();
const compare = await api('/api/compare', { method: 'POST', body: { lines, address: 'הרצל 12, תל אביב' } });
const demoRow = compare.data?.rows?.find((r) => r.chainId === 'demo');
check('POST /api/compare', compare.status === 200 && compare.data.itemCount === 5 && compare.data.address?.city === 'תל אביב', `${Date.now() - tc}ms, best=${compare.data?.bestChainId}, rows=${compare.data?.rows?.length}`);
check('comparison details', demoRow?.missing?.map((m) => m.productId).join() === 'beer' && demoRow.lines.find((l) => l.productId === 'lemon')?.status === 'substituted' && demoRow.lines.find((l) => l.productId === 'bamba')?.promo === '3 ב-10 ₪', `demo subtotal=${demoRow?.subtotal} promo=${demoRow?.lines?.find((l) => l.productId === 'bamba')?.promo}`);

const handoffRes = await api('/api/handoffs', { method: 'POST', body: { lines, chainId: 'demo', address: 'תל אביב' } });
const handoff = handoffRes.data?.handoff;
check('POST /api/handoffs (demo)', handoffRes.status === 201 && handoff?.items?.length === 4 && handoff.url.startsWith(base + '/demo-store/#cart_id='), `${handoff?.items?.length} items, skipped=${handoff?.skipped?.map((s) => s.productId).join()}`);

const payloadRes = await fetch(base + '/api/handoffs/' + encodeURIComponent(handoff.id));
const payload = await payloadRes.json();
check('GET /api/handoffs/:id (stateless payload)', payloadRes.status === 200 && payload.items?.length === 4 && payload.adapter?.chainId === 'demo');

const jarFetch = cookieFetch();
const page = await (await jarFetch(base + '/demo-store/')).text();
const csrf = page.match(/<meta name="demo-csrf" content="([^"]+)">/)?.[1];
check('GET /demo-store/ (CSRF meta + handoff.js)', !!csrf && page.includes('/handoff.js'));

const doc = { body: { appendChild() {} }, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {} }), querySelector: (sel) => (sel.includes('demo-csrf') ? { getAttribute: () => csrf } : null) };
const loc = { href: handoff.url, hash: `#cart_id=${handoff.id}`, search: '' };
const ti = Date.now();
const summary = await injector.bootstrap({ apiBase: base, fetch: jarFetch, document: doc, location: loc, redirect: false });
check('injector: add 4 items to the demo cart', summary?.total === 4 && summary.failCount === 0, `${Date.now() - ti}ms, ${JSON.stringify(summary?.results?.filter((r) => !r.ok) ?? [])}`);

const demoCart = await (await jarFetch(base + '/demo-store/api/cart')).json();
check('demo cart holds the items (cookie)', demoCart.cart?.lines?.length === 4, `total=${demoCart.cart?.total}`);

const checkout = await (await jarFetch(base + '/demo-store/cart')).text();
check('demo checkout page renders the cart', (checkout.match(/<tr><td>/g) || []).length === 4);

const status = await api('/api/handoffs/' + encodeURIComponent(handoff.id) + '/status');
check('handoff status after report', ['completed', 'pending'].includes(status.data?.handoff?.status), `status=${status.data?.handoff?.status} (pending is expected on serverless hosts without shared state; the UI receives the result via postMessage)`);

const script = await (await fetch(base + '/api/handoffs/' + encodeURIComponent(handoff.id) + '/script')).text();
check('GET /api/handoffs/:id/script (WebView)', script.includes('CartHandoffInjector.bootstrap'));

const preflight = await fetch(base + '/api/handoffs/x', { method: 'OPTIONS' });
check('CORS preflight', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === '*');

console.log(`\nAll ${results.length} checks passed against ${base} in ${Date.now() - t0}ms`);
