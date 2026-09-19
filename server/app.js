import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRouter, HttpError } from './router.js';
import { StateFile } from './state.js';
import { registerDemoStore } from './demoStore.js';
import { createCatalogStore, createDiskSource } from './dataSource.js';
import { MappingEngine } from '../src/catalog/mapping.js';
import { searchProducts } from '../src/catalog/matching.js';
import { priceListMeta } from '../src/catalog/priceList.js';
import { compareCart, DEFAULT_SUBSTITUTES } from '../src/pricing/compare.js';
import { CartStore } from '../src/cart/cart.js';
import { parseAddress, CITIES } from '../src/geo/branches.js';
import { HandoffService } from '../src/handoff/handoffService.js';
import { MemoryHandoffStore, RedisHandoffStore } from '../src/handoff/handoffStore.js';
import { AlertMonitor, probeAdapter } from '../src/handoff/alerts.js';
import { listAdapters, getAdapter, materializeAdapter } from '../src/handoff/adapters/index.js';
import { upstashFromEnv } from '../src/storage/upstashRedis.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const INJECTOR_PATH = path.join(ROOT, 'src', 'handoff', 'injector.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** One-shot load from disk (scripts / tests). The app itself goes through `createCatalogStore`. */
export function loadData(dataDir) {
  return createDiskSource({ dataDir }).load();
}

/**
 * Build the application. Tests call this with a temporary data/state location.
 *
 * Data: `dataDir` is always read at startup. With `catalogsUrl` (env CATALOGS_URL) products and
 * catalogs are then fetched from that base URL and re-checked (ETag) once per `refreshIntervalMs`;
 * the repo copy stays the fallback. Handoff records live in memory (persisted to `stateFile` on a
 * long-running server) or, when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, in Redis
 * shared by all instances.
 */
export function createApp({
  dataDir = path.join(ROOT, 'data'),
  stateFile = path.join(dataDir, 'runtime', 'state.json'),
  persist = !process.env.VERCEL,
  logger = console,
  catalogsUrl = process.env.CATALOGS_URL || null,
  refreshIntervalMs = Number(process.env.CATALOGS_REFRESH_MS) || undefined,
  fetch: fetchImpl = globalThis.fetch,
  now,
  handoffStore = null,
  redis = undefined,
} = {}) {
  const store = createCatalogStore({ dataDir, catalogsUrl, fetch: fetchImpl, logger, refreshIntervalMs, now });
  const state = new StateFile(persist ? stateFile : null);
  const saved = state.load() ?? {};
  const onChange = () => state.schedule();

  const adapterByChain = Object.fromEntries(listAdapters().map((a) => [a.chainId, a]));

  /** Everything derived from a data snapshot. Rebuilt whenever the store delivers a new one. */
  function buildRuntime(data) {
    // Real catalogs are GTIN-complete: never substitute a packaged product by name (opt out with LOOSE_MAPPING=1 for demo data).
    const mapping = new MappingEngine({ products: data.products, catalogs: data.catalogs, overrides: data.overrides, strictGtin: !process.env.LOOSE_MAPPING && !data.products.some((p) => p.id === 'milk-3') });
    // A chain takes part in the comparison only when the pipeline published a catalog for it (docs/PIPELINE-CONTRACT.md §2.3);
    // chains added or removed between deployments appear / disappear here and nowhere else.
    const chainsForCompare = data.chains.filter((c) => data.catalogs[c.id]).map((c) => ({ ...c, verified: adapterByChain[c.id]?.verified ?? false }));
    return { data, mapping, chainsForCompare, priceRangeCache: new Map() };
  }
  let rt = buildRuntime(store.current);
  store.onChange((snapshot) => { rt = buildRuntime(snapshot); });

  const carts = CartStore.fromJSON(saved.carts, { onChange });
  const alerts = AlertMonitor.fromJSON(saved.alerts, { logger });
  alerts.onAlert(onChange);
  const redisClient = redis === undefined ? upstashFromEnv() : redis;
  const handoffRecords = handoffStore ?? (redisClient ? new RedisHandoffStore({ client: redisClient }) : new MemoryHandoffStore(saved.handoffs?.handoffs));
  const handoffs = new HandoffService({ mapping: () => rt.mapping, alerts, chains: () => rt.data.chains, onChange, store: handoffRecords });
  state.bind(() => ({ carts: carts.toJSON(), alerts: alerts.toJSON(), handoffs: handoffs.toJSON() }));

  const router = createRouter();

  // ---- catalog ------------------------------------------------------------
  router.get('/api/health', () => ({
    ok: true,
    products: rt.data.products.length,
    chains: rt.chainsForCompare.map((c) => c.id),
    data: { ...store.status(), priceLists: rt.chainsForCompare.map((c) => ({ chainId: c.id, ...priceListMeta(rt.data.catalogs[c.id]) })) },
    handoffStore: handoffRecords.kind,
  }));

  /** Force a data refresh (remote when configured, otherwise re-read the disk). */
  router.post('/api/data/refresh', async () => {
    const { changed } = await store.refresh();
    return { changed, data: store.status(), chains: rt.chainsForCompare.map((c) => c.id) };
  });

  router.get('/api/products', (ctx) => {
    let products = rt.data.products;
    if (ctx.query.category) products = products.filter((p) => p.category === ctx.query.category);
    const results = ctx.query.q ? searchProducts(ctx.query.q, products, { limit: Number(ctx.query.limit) || 30 }) : products.slice(0, Number(ctx.query.limit) || 200);
    return { products: results.map(publicProduct) };
  });

  router.get('/api/products/:id', (ctx) => {
    const product = rt.mapping.productsById.get(ctx.params.id);
    if (!product) throw new HttpError(404, 'product not found');
    return { product: publicProduct(product), mapping: rt.mapping.resolveAll(product.id) };
  });

  router.get('/api/categories', () => {
    const counts = new Map();
    for (const p of rt.data.products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return { categories: [...counts.entries()].map(([name, count]) => ({ name, count })) };
  });

  router.get('/api/chains', () => ({
    chains: rt.chainsForCompare.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      website: c.website,
      verified: c.verified,
      inStoreOnly: !!c.inStoreOnly,
      pickupOnly: !!c.pickupOnly,
      parent: c.parent ?? null,
      note: c.note ?? null,
      priceList: priceListMeta(rt.data.catalogs[c.id]),
      branches: c.branches,
    })),
  }));

  router.get('/api/mapping/stats', () => ({ stats: rt.mapping.stats() }));

  router.get('/api/cities', () => ({ cities: Object.keys(CITIES) }));

  // ---- carts --------------------------------------------------------------
  router.post('/api/carts', () => ({ cart: carts.createCart() }));
  router.get('/api/carts/:id', (ctx) => ({ cart: hydrateCart(carts.requireCart(ctx.params.id)) }));

  router.put('/api/carts/:id/lines', (ctx) => {
    const body = ctx.body ?? {};
    if (!rt.mapping.productsById.has(body.productId)) throw new HttpError(404, 'product not found');
    if (body.substituteProductId && !rt.mapping.productsById.has(body.substituteProductId)) throw new HttpError(404, 'substitute product not found');
    return { cart: hydrateCart(carts.setLine(ctx.params.id, body)) };
  });

  router.post('/api/carts/:id/lines/:productId/add', (ctx) => {
    if (!rt.mapping.productsById.has(ctx.params.productId)) throw new HttpError(404, 'product not found');
    return { cart: hydrateCart(carts.addToLine(ctx.params.id, ctx.params.productId, Number(ctx.body?.delta ?? 1))) };
  });

  router.delete('/api/carts/:id/lines/:productId', (ctx) => ({ cart: hydrateCart(carts.removeLine(ctx.params.id, ctx.params.productId)) }));
  router.delete('/api/carts/:id/lines', (ctx) => ({ cart: hydrateCart(carts.clearCart(ctx.params.id)) }));

  router.put('/api/carts/:id/address', (ctx) => {
    const address = parseAddress(ctx.body?.address ?? ctx.body ?? '');
    return { cart: hydrateCart(carts.setAddress(ctx.params.id, address)), address };
  });

  router.get('/api/carts/:id/compare', (ctx) => {
    const cart = carts.requireCart(ctx.params.id);
    return compareForCart(cart, ctx.query.address);
  });

  router.post('/api/compare', (ctx) => {
    const body = ctx.body ?? {};
    const cart = body.cartId ? carts.requireCart(body.cartId) : { lines: sanitizeLines(body.lines) };
    return compareForCart(cart, body.address, sanitizeSubstitutes(body.substitutes));
  });

  // ---- saved lists --------------------------------------------------------
  router.get('/api/lists', () => ({ lists: carts.listLists().map(hydrateList) }));
  router.post('/api/lists', (ctx) => ({ list: hydrateList(carts.saveList(ctx.body ?? {})) }));
  router.get('/api/lists/:id', (ctx) => {
    const list = carts.getList(ctx.params.id);
    if (!list) throw new HttpError(404, 'list not found');
    return { list: hydrateList(list) };
  });
  router.put('/api/lists/:id', (ctx) => ({ list: hydrateList(carts.updateList(ctx.params.id, ctx.body ?? {})) }));
  router.delete('/api/lists/:id', (ctx) => ({ deleted: carts.deleteList(ctx.params.id) }));
  router.post('/api/lists/:id/load', (ctx) => ({ cart: hydrateCart(carts.loadList(ctx.params.id, ctx.body?.cartId, { merge: !!ctx.body?.merge })) }));

  // ---- handoffs -----------------------------------------------------------
  router.post('/api/handoffs', async (ctx) => {
    const { cartId, chainId, address, lines } = ctx.body ?? {};
    const cart = cartId ? carts.requireCart(cartId) : { lines: sanitizeLines(lines) };
    if (!cart.lines.length) throw new HttpError(400, 'cart is empty');
    const comparison = compareForCart(cart, address);
    const row = comparison.rows.find((r) => r.chainId === chainId);
    if (!row) throw new HttpError(404, 'unknown chain');
    if (!row.deliverable) throw new HttpError(400, row.reason ?? 'chain does not deliver to this address');
    const handoff = await handoffs.create({ cart, chainId, comparisonRow: row, origin: ctx.origin });
    return ctx.json({ handoff: publicHandoff(handoff, ctx.origin) }, 201);
  });

  router.get('/api/handoffs', async (ctx) => ({ handoffs: (await handoffs.list({ cartId: ctx.query.cartId })).map((h) => publicHandoff(h, ctx.origin)) }));

  router.get('/api/handoffs/:id', async (ctx) => {
    const payload = await handoffs.payloadFor(ctx.params.id, { origin: ctx.origin });
    if (!payload) throw new HttpError(404, 'handoff not found or expired');
    return payload;
  });

  router.get('/api/handoffs/:id/status', async (ctx) => {
    const handoff = await handoffs.get(ctx.params.id, { origin: ctx.origin });
    if (!handoff) throw new HttpError(404, 'handoff not found');
    return { handoff: publicHandoff(handoff, ctx.origin) };
  });

  router.post('/api/handoffs/:id/results', async (ctx) => {
    const { handoff, alerts: raised } = await handoffs.recordResults(ctx.params.id, ctx.body ?? {});
    return { ok: true, status: handoff.status, alerts: raised.map((a) => a.id) };
  });

  /** Image-beacon variant of the report, for chain pages whose CSP blocks fetch() to the platform (summary in ?s=base64url). */
  const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  router.get('/api/handoffs/:id/results', async (ctx) => {
    let summary = null;
    try { summary = JSON.parse(Buffer.from(String(ctx.query.s ?? ''), 'base64url').toString('utf8')); } catch { summary = null; }
    if (!summary || typeof summary !== 'object') throw new HttpError(400, 'missing summary');
    const existing = await handoffs.get(ctx.params.id);
    if (existing && !existing.expired && existing.status === 'pending') await handoffs.recordResults(ctx.params.id, summary);
    ctx.headers['Content-Type'] = 'image/gif';
    ctx.headers['Cache-Control'] = 'no-store';
    return PIXEL;
  });

  /** Self-contained script for a mobile WebView (evaluateJavascript) - injector + bootstrap for one handoff. */
  router.get('/api/handoffs/:id/script', async (ctx) => {
    const payload = await handoffs.payloadFor(ctx.params.id, { origin: ctx.origin });
    if (!payload) throw new HttpError(404, 'handoff not found or expired');
    return ctx.text(buildLoaderScript({ apiBase: ctx.origin, handoffId: payload.id, payload, redirect: true }), 200, 'application/javascript; charset=utf-8');
  });

  /** The self-contained bookmarklet (injector inlined): works without an extension and without calling back into the platform. */
  router.get('/api/bookmarklet', (ctx) => { const b = bookmarkletBuild(ctx.origin); return { code: b.code, bytes: b.code.length, version: b.version }; });

  // ---- adapters & resilience ---------------------------------------------
  router.get('/api/adapters', (ctx) => ({ adapters: listAdapters().map((a) => materializeAdapter(a, { origin: ctx.origin })) }));
  router.get('/api/adapters/:chainId', (ctx) => {
    const adapter = getAdapter(ctx.params.chainId);
    if (!adapter) throw new HttpError(404, 'unknown chain');
    return { adapter: materializeAdapter(adapter, { origin: ctx.origin }) };
  });

  router.get('/api/alerts', (ctx) => ({ alerts: alerts.list({ chainId: ctx.query.chainId, unresolved: ctx.query.unresolved === '1' }) }));
  router.post('/api/alerts/:id/resolve', (ctx) => {
    const alert = alerts.resolve(ctx.params.id);
    if (!alert) throw new HttpError(404, 'alert not found');
    onChange();
    return { alert };
  });
  router.post('/api/alerts/probe', async (ctx) => {
    const ids = ctx.body?.chainIds ?? listAdapters().map((a) => a.chainId);
    const results = [];
    for (const chainId of ids) {
      const adapter = getAdapter(chainId);
      if (!adapter) continue;
      const result = await probeAdapter(materializeAdapter(adapter, { origin: ctx.origin }));
      if (!result.ok) {
        alerts.raise({ type: 'probe_failed', chainId, severity: 'warning', message: `בדיקת זמינות ל-${adapter.name} נכשלה`, details: result });
      }
      results.push(result);
    }
    return { results };
  });

  // ---- handoff loader script ---------------------------------------------
  router.get('/handoff.js', (ctx) => ctx.text(buildLoaderScript({ apiBase: '' }), 200, 'application/javascript; charset=utf-8'));
  router.get('/injector.js', (ctx) => ctx.text(readFileSync(INJECTOR_PATH, 'utf8'), 200, 'application/javascript; charset=utf-8'));
  router.get('/bookmarklet', (ctx) => ctx.html(bookmarkletPage(ctx.origin)));

  registerDemoStore(router, { catalog: rt.data.catalogs.demo ?? { items: [] }, escapeHtml });

  // ---- helpers ------------------------------------------------------------
  /**
   * Lines posted by the client (stateless mode): keep positive quantities. Unknown products are kept so
   * the comparison can report them (`unknownProducts`) and the handoff can skip them (`unknown_product`).
   */
  function sanitizeLines(lines) {
    if (!Array.isArray(lines)) return [];
    const out = [];
    for (const line of lines) {
      if (!line || typeof line.productId !== 'string' || !line.productId) continue;
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const substituteProductId = line.substituteProductId && rt.mapping.productsById.has(line.substituteProductId) ? line.substituteProductId : null;
      out.push({ productId: line.productId, qty, substituteProductId });
    }
    return out;
  }

  /** Min/max in-stock price across chains, for the catalog cards. Cached per data snapshot. */
  function priceRange(productId) {
    const { priceRangeCache, chainsForCompare, mapping } = rt;
    if (priceRangeCache.has(productId)) return priceRangeCache.get(productId);
    let min = Infinity; let max = -Infinity; let chains = 0;
    for (const chain of chainsForCompare) {
      const r = mapping.resolve(productId, chain.id);
      if (!r || !r.storeItem.inStock || r.storeItem.price == null) continue;
      chains++;
      min = Math.min(min, r.storeItem.price);
      max = Math.max(max, r.storeItem.price);
    }
    const range = chains ? { min, max, chains } : null;
    priceRangeCache.set(productId, range);
    return range;
  }

  function publicProduct(p) {
    return { id: p.id, name: p.name, category: p.category, brand: p.brand, unit: p.unit, size: p.size ?? null, icon: p.icon ?? '🛒', isWeighted: p.isWeighted, gtin: p.gtin, basePrice: p.basePrice, priceRange: priceRange(p.id) };
  }

  /** A cart line whose product left the catalog still renders (name = id, `unknown: true`) instead of breaking the cart. */
  function lineProduct(productId) {
    const product = rt.mapping.productsById.get(productId);
    return product ? publicProduct(product) : { ...publicProduct({ id: productId, name: productId }), unknown: true };
  }

  function hydrateCart(cart) {
    return {
      ...cart,
      lines: cart.lines.map((line) => ({
        ...line,
        product: lineProduct(line.productId),
        substitute: line.substituteProductId ? lineProduct(line.substituteProductId) : null,
      })),
    };
  }

  function hydrateList(list) {
    return { ...list, lines: list.lines.map((line) => ({ ...line, product: lineProduct(line.productId) })) };
  }

  function compareForCart(cart, addressInput, substitutes = DEFAULT_SUBSTITUTES) {
    const address = addressInput ? parseAddress(addressInput) : cart.address ?? null;
    return compareCart({ cart, chains: rt.chainsForCompare, mapping: rt.mapping, address, substitutes });
  }

  const SUBSTITUTES_POLICIES = new Set(['none', 'privateLabel', 'cheapest']);
  const SUBSTITUTES_APPLY = new Set(['ask', 'auto']);

  /** Validates an optional `{ policy, apply }` body field (docs/CONCEPTS.md §4); 400 on an unknown value. */
  function sanitizeSubstitutes(input) {
    if (input == null) return DEFAULT_SUBSTITUTES;
    if (typeof input !== 'object') throw new HttpError(400, 'substitutes must be an object');
    const policy = input.policy ?? DEFAULT_SUBSTITUTES.policy;
    const apply = input.apply ?? DEFAULT_SUBSTITUTES.apply;
    if (!SUBSTITUTES_POLICIES.has(policy)) throw new HttpError(400, `invalid substitutes.policy: ${policy}`);
    if (!SUBSTITUTES_APPLY.has(apply)) throw new HttpError(400, `invalid substitutes.apply: ${apply}`);
    return { policy, apply };
  }

  function publicHandoff(handoff, origin) {
    const { result, ...rest } = handoff;
    return { ...rest, result: result ? { ...result, results: undefined } : null, scriptUrl: `${origin}/api/handoffs/${encodeURIComponent(handoff.id)}/script` };
  }

  function buildLoaderScript({ apiBase, handoffId = null, payload = null, redirect = true }) {
    const injector = readFileSync(INJECTOR_PATH, 'utf8');
    const opts = { apiBase, handoffId, payload, redirect };
    return `${injector}\n;(function () {\n  var opts = ${JSON.stringify(opts)};\n  if (!opts.apiBase) {\n    var script = typeof document !== 'undefined' && document.currentScript;\n    var attr = script && script.getAttribute('data-api');\n    opts.apiBase = attr && attr !== '/' ? attr : (script && script.src ? new URL(script.src).origin : '');\n  }\n  if (!opts.handoffId) opts.handoffId = null;\n  var run = function () { CartHandoffInjector.bootstrap(opts); };\n  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();\n})();\n`;
  }

  /**
   * javascript: URL that contains the whole injector. The chain page reads the payload from the
   * URL hash (#cart_id=..&p=..) and reports to the platform tab with postMessage, so neither an
   * extension nor a connection from the chain page to the platform is needed. The bookmark stays
   * valid when adapters change (they travel in the handoff URL); it only needs re-dragging when
   * the injector itself changes.
   */
  let bookmarkletCache = null;
  function bookmarkletCode(origin) { return bookmarkletBuild(origin).code; }

  // The bookmark holds a copy of the injector, so every injector change makes existing bookmarks
  // stale. The build is versioned by the hash of its code: the injector reports the version it ran
  // with, and the UI compares it (and the version the visitor dragged) with the current one.
  function bookmarkletBuild(origin) {
    if (!bookmarkletCache) {
      const injector = readFileSync(INJECTOR_PATH, 'utf8')
        .replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s+/gm, '')
        .replace(/\n{2,}/g, '\n');
      bookmarkletCache = injector;
    }
    // The wrapper below is part of the build too (e.g. the self-check ping), so it is hashed as well.
    const WRAPPER_FORMAT = 'ping-v1';
    const version = createHash('sha1').update(bookmarkletCache).update(origin).update(WRAPPER_FORMAT).digest('hex').slice(0, 8);
    const opts = JSON.stringify({ apiBase: origin, redirect: true, version });
    // Clicked on the platform itself (no cart in the URL) the bookmark announces itself to the page,
    // which is how the dialog verifies that the bookmark exists and is the current build.
    const body = `(function(){${bookmarkletCache}\nCartHandoffInjector.bootstrap(${opts}).then(function(r){if(r!==null)return;if(location.origin===${JSON.stringify(origin)}){window.postMessage({type:'cart-bookmarklet-ping',version:${JSON.stringify(version)}},location.origin);return;}alert('לא נמצא סל בכתובת הדף. לחצו על הסימנייה בטאב של הרשת שנפתח מהפלטפורמה.');});})();`;
    // A bookmark is a URL: browsers strip newlines from it, which would turn every trailing "//"
    // comment into a comment that swallows the rest of the script. Percent-encode the body; the
    // browser decodes a javascript: URL before running it.
    return { code: `javascript:${encodeURIComponent(body)}`, version };
  }

  function bookmarkletPage(origin) {
    const { code, version } = bookmarkletBuild(origin);
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>סימניית "טען עגלה"</title><link rel="stylesheet" href="/styles.css"></head><body class="page-narrow">
<h1>סימניית "טען עגלה"</h1>
<p>הסימנייה היא מה שממלא את העגלה באתר הרשת. גוררים אותה פעם אחת לשורת הסימניות. מחקתם אותה בטעות, או שהאתר התעדכן? זה המקום לגרור אותה שוב.</p>
<div class="ho-drag" style="margin:16px 0">
  <div class="lbl">גררו את הכפתור הזה אל שורת הסימניות<small>לוחצים עליו, גוררים למעלה אל השורה שמתחת לכתובת, ומשחררים</small></div>
  <a class="btn-bm" href="${escapeHtml(code)}" draggable="true" onclick="return false" title="גררו אותי לשורת הסימניות">🛒 טען עגלה</a>
  <div class="hint">לא רואים שורת סימניות? <span class="kbd">⌘ Cmd</span>+<span class="kbd">Shift</span>+<span class="kbd">B</span> במק, <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">B</span> בווינדוס</div>
</div>
<div id="check" class="ho-check"><span class="pulse"></span><div><div class="t">בדיקה: לחצו עכשיו על "🛒 טען עגלה" שבשורת הסימניות, כאן בדף הזה</div><div class="d">אם הסימנייה במקום, יופיע כאן ✓. אם לא קורה כלום, הגרירה לא הצליחה, נסו שוב.</div></div></div>
<p style="margin-top:16px">בכל הזמנה: אחרי "הזמן ברשת X" נפתח אתר הרשת עם הסל בכתובת. לוחצים שם על הסימנייה, והעגלה מתמלאת.</p>
<p class="muted">הסימנייה מכילה את כל הקוד (${Math.round(code.length / 1024)}KB, גרסה ${version}) ולא תלויה בתוסף או במדיניות האבטחה של אתרי הרשתות. אם יש בשורה עותק ישן, מחקו אותו (לחיצה ימנית → מחיקה) לפני שגוררים את החדש.</p>
<p><a href="/">חזרה לסל</a></p>
<script>
window.addEventListener('message', function (e) {
  var d = e.data; if (!d || d.type !== 'cart-bookmarklet-ping' || e.origin !== location.origin || e.source !== window) return;
  var ok = d.version === ${JSON.stringify(version)};
  try { if (ok) localStorage.setItem('cart-bookmarklet-installed', ${JSON.stringify(version)}); } catch (err) {}
  document.getElementById('check').outerHTML = ok
    ? '<div class="ho-result ok"><span class="big">✅</span><div><div class="t">הסימנייה מותקנת ועובדת</div><div class="d">גרסה ${version}. אפשר לחזור לסל ולהזמין.</div></div></div>'
    : '<div class="ho-result warn"><span class="big">⚠️</span><div><div class="t">הסימנייה שבשורה ישנה (גרסה ' + (d.version || '?') + ')</div><div class="d">מחקו אותה משורת הסימניות, גררו את הכפתור שלמעלה מחדש, ולחצו עליו שוב כאן.</div></div></div>';
});
</script>
</body></html>`;
  }

  async function serveStatic(ctx) {
    let pathname = decodeURIComponent(ctx.url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(403, 'forbidden');
    if (!existsSync(file) || !statSync(file).isFile()) return false;
    ctx.res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    await new Promise((resolve, reject) => createReadStream(file).on('error', reject).on('end', resolve).pipe(ctx.res));
    return true;
  }

  const requestListener = async (req, res) => {
    const started = Date.now();
    // Remote catalogs are re-checked (ETag) in the background at most once per interval; the request is served from the current snapshot.
    store.maybeRefresh();
    try {
      // CORS: the injector runs on the chains' domains and calls back into this API.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      // Chrome's Private Network Access: a public https page (chain site) may only call a loopback
      // platform (local dev / bookmarklet channel) when the preflight allows it explicitly.
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      const handled = await router.handle(req, res);
      if (!handled) {
        const url = new URL(req.url, 'http://localhost');
        const served = req.method === 'GET' ? await serveStatic({ url, res }) : false;
        if (!served) { res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not found' })); }
      }
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) logger.error?.(err);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message, details: err.details }));
    } finally {
      if (logger.debug && process.env.LOG_REQUESTS) logger.debug(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
  const server = http.createServer(requestListener);

  return {
    server,
    requestListener,
    store,
    /** Resolves once the first remote data load finished (immediately in disk mode). */
    ready: store.ready,
    get data() { return rt.data; },
    get mapping() { return rt.mapping; },
    get chainsForCompare() { return rt.chainsForCompare; },
    carts,
    alerts,
    handoffs,
    state,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address())));
    },
    close() {
      state.flush();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
