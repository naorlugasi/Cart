#!/usr/bin/env node
/**
 * End-to-end proof of a chain adapter against the live site.
 *
 *   node scripts/e2e-handoff.mjs <chain> [--channel bookmarklet|extension] [--port 3177] [--manual] [--keep-open]
 *
 * What it does:
 *   1. starts the platform (default port 3177, bound to 127.0.0.1) with a scratch copy of test/fixtures/data in
 *      which two catalog items carry REAL identifiers of the chain (see REAL_ITEMS);
 *   2. creates a handoff for those two products (POST /api/handoffs);
 *   3. bookmarklet channel (default, what customers use): opens a platform page in Chromium, lets it
 *      window.open the handoff URL (so the chain tab has an opener), runs the bookmarklet code in the
 *      chain tab and waits for the result - the chain tab posts it to the platform tab, which records
 *      it in the API (chains whose CSP blocks the platform origin can only report that way);
 *      extension channel (dev tool): loads the unpacked extension instead;
 *   4. reads the chain's cart independently (its own API / storage), compares it with the handoff,
 *      writes recon/e2e-<chain>.json and exits non-zero unless every item is in the chain cart.
 *
 * --manual: no automated browser; print the handoff URL and wait for a report from any browser.
 *           Needed for chains whose bot protection rejects automated browsers (Carrefour / Cloudflare).
 *
 * Requires playwright (npm install --no-save playwright) unless --manual is used.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const argv = process.argv.slice(2);
const chainId = argv.find((a) => !a.startsWith('--'));
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const flag = (name) => argv.includes(`--${name}`);
const port = Number(opt('port', 3177));
const manual = flag('manual');
const keepOpen = flag('keep-open');
const channel = opt('channel', 'bookmarklet');

/**
 * Two real products per chain (identifiers captured during the recon, September 2026). The scratch
 * catalog maps the unified products "milk-3" and "cottage" to them; the product names differ from
 * the unified names on purpose - only the identifier matters for the cart.
 */
const REAL_ITEMS = {
  shufersal: [
    { productId: 'milk-3', gtin: '7290107932080', storeItemId: 'P_7290107932080', name: 'חלב מועשר 3% בבקבוק' },
    { productId: 'cottage', gtin: '7290110563462', storeItemId: 'P_7290110563462', name: 'חלב נטול לקטוז 2%' },
  ],
  ramilevy: [
    { productId: 'milk-3', gtin: '7290119672066', storeItemId: '7290119672066', name: 'חליטה בטעם קרמל מלוח רמי לוי' },
    { productId: 'cottage', gtin: '7290120125537', storeItemId: '7290120125537', name: 'צלחות חד פעמי רמי לוי' },
  ],
  carrefour: [
    { productId: 'milk-3', gtin: '4014400923711', storeItemId: '4014400923711', name: 'טופיפי 125 גרם' },
    { productId: 'cottage', gtin: '8003340091280', storeItemId: '8003340091280', name: 'לינדור בונבוניירה 60%' },
  ],
  hazihinam: [
    { productId: 'milk-3', gtin: '8076800195057', storeItemId: '8076800195057', name: "ספגטי מס' 5 ברילה" },
    { productId: 'cottage', gtin: '7290117263716', storeItemId: '7290117263716', name: 'פיצה מרגריטה 38*26' },
  ],
  yochananof: [
    { productId: 'milk-3', gtin: '7290117765951', storeItemId: '7290117765951', name: 'פתיבר יוחננוף 500 גרם' },
    { productId: 'cottage', gtin: '7290103705640', storeItemId: '7290103705640', name: 'מגבות נייר דו שכבתי 6 גלילים' },
  ],
};
const LINES = [{ productId: 'milk-3', qty: 2 }, { productId: 'cottage', qty: 1 }];

if (!REAL_ITEMS[chainId]) {
  console.error(`usage: node scripts/e2e-handoff.mjs <${Object.keys(REAL_ITEMS).join('|')}> [--channel bookmarklet|extension] [--port 3177] [--manual] [--keep-open]`);
  process.exit(2);
}

// ---- 1. scratch data dir with real identifiers -------------------------------------------
function scratchDataDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cart-e2e-'));
  // Start from the frozen demo data (small, deterministic) rather than the live catalogs in data/.
  cpSync(path.join(ROOT, 'test', 'fixtures', 'data'), dir, { recursive: true });
  const productsFile = path.join(dir, 'products.json');
  const catalogFile = path.join(dir, 'catalogs', `${chainId}.json`);
  const products = JSON.parse(readFileSync(productsFile, 'utf8'));
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  for (const real of REAL_ITEMS[chainId]) {
    const product = products.find((p) => p.id === real.productId);
    const item = catalog.items.find((i) => String(i.gtin) === String(product.gtin));
    if (!product || !item) throw new Error(`cannot patch ${real.productId} for ${chainId}`);
    product.gtin = real.gtin;
    Object.assign(item, { gtin: real.gtin, storeItemId: real.storeItemId, name: real.name, inStock: true, promotions: [] });
  }
  writeFileSync(productsFile, JSON.stringify(products, null, 2));
  writeFileSync(catalogFile, JSON.stringify(catalog, null, 2));
  return dir;
}

async function main() {
  if (channel === 'extension') {
    const { execSync } = await import('node:child_process');
    execSync('node scripts/build-extension.js', { cwd: ROOT, stdio: 'inherit' });
  }

  const dataDir = scratchDataDir();
  const app = createApp({ dataDir, persist: false, logger: { ...console, debug: () => {} } });
  const address = await app.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`; // not "localhost": on dev machines other servers may answer on ::1
  console.log(`platform listening on ${base} (scratch data in ${dataDir})`);

  const api = async (p, init = {}) => {
    const res = await fetch(base + p, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${p} -> ${res.status} ${JSON.stringify(data)}`);
    return data;
  };

  // ---- 2. handoff -------------------------------------------------------------------------
  const { handoff } = await api('/api/handoffs', { method: 'POST', body: { lines: LINES, chainId } });
  const expected = handoff.items.map((i) => ({ storeItemId: i.storeItemId, qty: i.qty, name: i.name }));
  if (channel === 'extension') handoff.url += `&api=${encodeURIComponent(base)}`; // tells the extension which platform instance to talk to
  console.log(`handoff ${handoff.id}\n  url: ${handoff.url}\n  items: ${JSON.stringify(expected)}`);
  if (handoff.items.length !== LINES.length) throw new Error(`expected ${LINES.length} items, got ${JSON.stringify(handoff)}`);

  const record = { chainId, startedAt: new Date().toISOString(), mode: manual ? 'manual' : channel, handoffId: handoff.id, url: handoff.url, expected, chainRequests: [], report: null, verification: null, ok: false };
  const outFile = path.join(ROOT, 'recon', `e2e-${chainId}.json`);
  mkdirSync(path.dirname(outFile), { recursive: true });
  const save = () => writeFileSync(outFile, JSON.stringify(record, null, 2));

  const waitForReport = async (timeoutMs) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { handoff: h } = await api(`/api/handoffs/${encodeURIComponent(handoff.id)}/status`);
      if (h.status !== 'pending') return h;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  };

  if (manual) {
    console.log('\nOpen the URL above in a real browser and click the "טען עגלה" bookmarklet there (get it from ' + base + '/bookmarklet), or use a browser with the extension.');
    console.log('Waiting up to 15 minutes for the extension to report back...');
    const reported = await waitForReport(15 * 60 * 1000);
    record.report = reported;
    record.ok = !!reported && reported.status === 'completed';
    save();
    console.log(reported ? `reported: ${reported.status} ${JSON.stringify(reported.result)}` : 'no report received');
    await app.close();
    process.exit(record.ok ? 0 : 1);
  }

  // ---- 3. browser: bookmarklet (default) or unpacked extension ----------------------------
  const { chromium } = await import('playwright');
  const extDir = path.join(ROOT, 'extension');
  const profileDir = path.join(ROOT, 'recon', 'e2e-profile', chainId);
  rmSync(profileDir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    viewport: { width: 1366, height: 900 },
    args: [...(channel === 'extension' ? [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`] : []), '--disable-blink-features=AutomationControlled', '--lang=he-IL'],
  });
  let page = context.pages()[0] ?? await context.newPage();
  let platformPage = null;
  if (channel === 'bookmarklet') {
    // A platform tab opens the chain tab (window.open) and receives the result by postMessage,
    // exactly like public/app.js does; here the tab is a minimal stand-in that records the result.
    platformPage = page;
    await platformPage.goto(`${base}/bookmarklet`, { waitUntil: 'domcontentloaded' });
    await platformPage.evaluate((handoffId) => {
      window.__results = [];
      window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || d.type !== 'cart-handoff-result' || d.handoffId !== handoffId) return;
        window.__results.push(d.summary);
        fetch('/api/handoffs/' + encodeURIComponent(handoffId) + '/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d.summary) });
      });
    }, handoff.id);
    const popupPromise = context.waitForEvent('page');
    await platformPage.evaluate((url) => { window.open(url, '_blank'); }, handoff.url);
    page = await popupPromise;
  }
  const SKIP = /google|facebook|doubleclick|analytics|gtm|hotjar|clarity|sentry|segment|appsflyer|taboola|outbrain|dynamicyield|optimizely|cdn-cgi|creativecdn|nr-data|linkedin|tiktok|bing\.com|glassix|datadog|nixale|mpc-prod|localhost/i;
  page.on('requestfinished', async (req) => {
    try {
      const url = req.url();
      if (!['xhr', 'fetch'].includes(req.resourceType()) || SKIP.test(url)) return;
      if (!/cart|catalog|graphql|products|api\//i.test(url)) return;
      const res = await req.response();
      const ct = res?.headers()['content-type'] ?? '';
      const headers = {};
      for (const [k, v] of Object.entries(req.headers())) if (!/^(cookie|user-agent|accept-encoding|accept-language|sec-|priority|referer|newrelic|traceparent|tracestate)/i.test(k)) headers[k] = v.length > 200 ? v.slice(0, 200) + '…' : v;
      record.chainRequests.push({ at: new Date().toISOString(), method: req.method(), url, headers, body: req.postData()?.slice(0, 1500) ?? null, status: res?.status() ?? null, response: /json|text|html/.test(ct) ? (await res.text().catch(() => '')).slice(0, 1200) : null });
    } catch { /* ignore */ }
  });
  page.on('console', (msg) => { if (/handoff|CartHandoff/i.test(msg.text())) console.log('  [page]', msg.text()); });

  if (channel === 'extension') {
    console.log('opening the handoff URL in Chromium with the extension...');
    await page.goto(handoff.url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((err) => console.log('goto:', err.message));
  } else {
    console.log('chain tab opened from the platform tab; running the bookmarklet there...');
    await page.waitForLoadState('domcontentloaded', { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(6000); // let the SPA settle (Rami Levy / Yochananof create their guest state after load)
    const { code } = await api('/api/bookmarklet');
    // Exactly what clicking a bookmark does: navigate the page to the javascript: URL (the browser
    // strips whitespace from the URL and percent-decodes the body before running it).
    await page.evaluate((href) => { location.href = href; }, code).catch((err) => console.log('bookmarklet error:', err.message));
    record.bookmarkletBytes = code.length;
  }
  const reported = await waitForReport(120000);
  record.report = reported;
  if (platformPage) record.openerMessages = await platformPage.evaluate(() => window.__results).catch(() => null);
  console.log(reported ? `${channel} reported: ${reported.status} ok=${reported.result?.okCount}/${reported.result?.total} failed=${JSON.stringify(reported.failedItems ?? [])}` : `${channel} did not report within 120s`);
  await page.waitForTimeout(8000); // let the redirect to checkoutPath happen and the site re-read its cart
  await page.screenshot({ path: path.join(ROOT, 'recon', `e2e-${chainId}.png`) }).catch(() => {});

  // ---- 4. independent verification of the chain cart --------------------------------------
  record.verification = await verifyChainCart(page, chainId, expected).catch((err) => ({ error: err.message }));
  record.ok = !!reported && reported.status === 'completed' && record.verification?.allPresent === true;
  record.finishedAt = new Date().toISOString();
  save();
  console.log('verification:', JSON.stringify(record.verification));
  console.log(record.ok ? `\nPASS - ${chainId}: the chain cart contains every handoff item (${outFile})` : `\nFAIL - ${chainId} (${outFile})`);

  if (keepOpen) { console.log('browser left open (--keep-open); press Ctrl+C to exit'); await new Promise(() => {}); }
  await context.close();
  await app.close();
  process.exit(record.ok ? 0 : 1);
}

/** Read the chain cart through the chain's own API / storage and compare with the handoff items. */
async function verifyChainCart(page, chain, expected) {
  let found = [];
  if (chain === 'shufersal') {
    found = await page.evaluate(async () => {
      const r = await fetch('/online/he/cart/load?restoreCart=true', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const html = (await r.text()).replace(/\s+/g, ' ');
      return [...html.matchAll(/data-product-code="([^"]+)"[^>]*data-entry-number="[^"]*"[^>]*data-entry-qty="([^"]*)"/g)].map((m) => ({ storeItemId: m[1], qty: Number(m[2]) }));
    });
  } else if (chain === 'ramilevy') {
    found = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('ramilevy') || '{}');
      const ui = (document.body.innerText.match(/רכיבי סל קניות\s*(\d+)/) || [])[1] ?? null;
      return (state.cart?.items ?? []).filter((i) => !i.is_delivery).map((i) => ({ storeItemId: String(i.barcode), id: i.id, qty: Number(i.amount), uiCount: ui, price: state.cart?.price }));
    });
  } else if (chain === 'yochananof') {
    found = await page.evaluate(async () => {
      const cartId = localStorage.getItem('cartId');
      const query = 'query Cart($cartId: String!) { cart(cart_id: $cartId) { id total_quantity items { quantity product { sku name } } } }';
      const r = await fetch('https://api.yochananof.co.il/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { cartId } }) });
      const j = await r.json();
      return (j.data?.cart?.items ?? []).map((i) => ({ storeItemId: i.product.sku, qty: Number(i.quantity), name: i.product.name, cartId }));
    });
  } else if (chain === 'hazihinam') {
    found = await page.evaluate(async () => {
      const r = await fetch('/proxy/api/item/getItemsInCart?SortBy=-1&IsDescending=false', { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } });
      const j = await r.json();
      return (j.Results?.CartItems?.Items ?? []).map((i) => ({ storeItemId: String(i.BarKod), id: i.Id, qty: Number(i.Cart?.Quantity ?? 0), name: i.Name }));
    });
  } else if (chain === 'carrefour') {
    found = await page.evaluate(() => {
      const f = JSON.parse(localStorage.getItem('frontend') || '{}');
      const count = (document.body.innerText.match(/(\d+)\s*מוצרים בעגלה/) || [])[1];
      return [{ uiCount: count, serverCartId: f.serverCartId }];
    });
  }
  const present = expected.map((e) => ({ ...e, inCart: found.find((f) => String(f.storeItemId) === String(e.storeItemId)) ?? null }));
  return { found, present, allPresent: present.every((p) => p.inCart && Number(p.inCart.qty) === Number(p.qty)) };
}

main().catch((err) => { console.error(err); process.exit(1); });
