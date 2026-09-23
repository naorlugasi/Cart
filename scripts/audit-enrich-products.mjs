#!/usr/bin/env node
/**
 * MANUAL AUDIT TOOL - never part of the pipeline, never imported by scripts/build-products.mjs or
 * scripts/daily-refresh.sh. docs/PIPELINE-CONTRACT.md #1: "כל מחיר ומוצר מגיעים אך ורק מקובצי המחירים
 * שהרשתות מפרסמות... הצינור לא פונה לאתרי הרשתות." This script is the one place that IS allowed to ask
 * a chain's storefront something, because it only writes to ops/enrichment/ (gitignored, never read by
 * the server or the build) for a human to review later - docs/PLAN-PRODUCT-TRUTH.md "שלב ב".
 *
 * For every barcoded product in data/products.json (id "g<gtin>", kind !== "concept"), asks each chain's
 * storefront what it knows by barcode and records {name, path, brand, image} or a miss. Read-only against
 * data/; writes only under ops/enrichment/.
 *
 * Field names used per storefront (verified live 23.9.2026, see docs/PLAN-PRODUCT-TRUTH.md שלב ב):
 *  - Shufersal  GET /online/he/search/results?q=<gtin>&limit=3 (Accept: application/json). Match the
 *    result whose `code` contains the gtin ("P_<gtin>" or "P_<gtin>_NN"). name; path from
 *    secondLevelCategory + commercialCategoryGroup + commercialCategorySubGroup (categories/
 *    firstCategoryNameList were null on every live sample - kept as a fallback); brand from
 *    brand.name (brandName duplicates it); image from images[] entry with format "product", else [0].url.
 *  - Rami Levy  POST /api/catalog? (headers from src/handoff/adapters/ramilevy.js `add.headers`,
 *    +content-type), batch of 40 barcodes. Match p.barcode (numeric) by value, not string, since the
 *    API echoes it as a JSON number. name; path from department.name > group.name > subGroup.name
 *    (capital G - subgroup does not exist); brand from gs.BrandName (top-level `brand` is a numeric id,
 *    not a name); image from images.original, a path relative to the CDN https://img.rami-levy.co.il
 *    (confirmed 200, distinct from the www host which 404s).
 *  - Yochananof  POST https://api.yochananof.co.il/graphql, batch of 50 sku. `image { url }` did not
 *    error on any live batch, so it is always requested first and only dropped and retried on
 *    `data.errors`. categories come back as several trees at once (e.g. a Passover promo tree next to
 *    the real department tree); the path kept is the ancestry of the single deepest (highest `level`)
 *    category, reconstructed by matching cumulative `path` id-prefixes against the other returned rows.
 *    Rows matching /מבצע|מותג הפרטי|חדש|מומלצ/ are dropped first, per the brief.
 *  - Hazi Hinam  GET /proxy/init for a guest cookie jar, then POST /proxy/api/item/getItemsBySearch per
 *    barcode. Match Items[].BarKod == gtin. name from Name; path from CategoryName > SubCategoryName;
 *    brand from ManufacturerName; image from ImgBig (falls back to the smaller Img).
 *  - Carrefour / Tiv Taam (Self Point)  GET /v2/retailers/<id>/branches/<branch>/products?appId=4&
 *    filters=...&from=0&size=1, one barcode per call (the platform has no bulk lookup). name from
 *    names["1"].long (falls back to .short, then localName); path from the default entry of
 *    family.categoriesPaths (family.mainCategoryPathIndex), each node's names["1"]; brand from
 *    brand.names["1"]; image from image.url with its "{{size}}"/"{{extension||'jpg'}}" template
 *    placeholders filled in (300 / jpg). Carrefour's own domain (www.carrefour.co.il) answered every
 *    request with a Cloudflare "Just a moment..." 403 from this machine even before any barcode ran
 *    (recon/carrefour*.json already noted Cloudflare blocks automated Chromium) - the adapter is wired
 *    up per the brief, but the runner backs off after 20 straight failures with nothing found instead of
 *    spending its hour retrying a wall. Tiv Taam, same platform, answers normally.
 *
 * Usage: node scripts/audit-enrich-products.mjs [--chain <id>] [--limit N] [--only g1,g2,...] [--refresh]
 *   --chain   run one chain only (shufersal|ramilevy|yochananof|hazihinam|carrefour|tivtaam)
 *   --limit   stop after N barcodes per chain (quick smoke test)
 *   --only    restrict to this comma-separated list of gtins/ids (either bare or "g"-prefixed)
 *   --refresh ignore ops/enrichment/<chain>.json and re-ask every target instead of resuming
 *
 * Output: ops/enrichment/<chain>.json {fetchedAt, chain, items: {gtin: {name,path,brand,image}}, misses:
 * [gtin,...]}, written atomically (tmp+rename) and checkpointed every 500 barcodes so a killed run loses
 * at most one batch. ops/enrichment/summary.json aggregates {asked,found,misses,paths} per chain (paths =
 * distinct category-path strings with counts, the raw input for a future chain-category -> our-department
 * table - building that table is out of scope here).
 */
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS_FILE = path.join(ROOT, 'data/products.json');
const OPS_DIR = path.join(ROOT, 'ops/enrichment');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MIN_INTERVAL_MS = 340; // <= 3 req/s per chain
const CHAIN_IDS = ['shufersal', 'ramilevy', 'yochananof', 'hazihinam', 'carrefour', 'tivtaam'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pace(rate) {
  const wait = rate.last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  rate.last = Date.now();
}
function tick(ctx) {
  ctx.asked++;
  if (ctx.asked - ctx.lastPrinted >= 500 || ctx.asked === ctx.total) {
    ctx.lastPrinted = ctx.asked;
    console.log(`[${ctx.chainId}] ${ctx.asked}/${ctx.total} asked, ${Object.keys(ctx.store.items).length} found, ${ctx.store.misses.size} miss (${ctx.errors} errors)`);
    checkpoint(ctx);
  }
}
function checkpoint(ctx) {
  const data = { fetchedAt: new Date().toISOString(), chain: ctx.chainId, items: ctx.store.items, misses: [...ctx.store.misses].sort() };
  const tmp = `${ctx.file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1));
  renameSync(tmp, ctx.file);
  return data;
}

// --- Shufersal ---
async function processShufersal(targets, ctx) {
  for (const gtin of targets) {
    await pace(ctx.rate);
    try {
      const r = await fetch(`https://www.shufersal.co.il/online/he/search/results?q=${gtin}&limit=3`, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      const hit = (j.results ?? []).find((x) => typeof x.code === 'string' && x.code.includes(gtin));
      if (hit) {
        const cats = Array.isArray(hit.categories) ? hit.categories.map((c) => c?.name ?? c) : [];
        const path = [hit.secondLevelCategory, hit.commercialCategoryGroup, hit.commercialCategorySubGroup, ...cats].filter(Boolean);
        const img = (hit.images ?? []).find((i) => i.format === 'product') ?? (hit.images ?? [])[0];
        ctx.store.items[gtin] = { name: hit.name ?? null, path, brand: hit.brand?.name ?? hit.brandName ?? null, image: img?.url ?? null };
      } else ctx.store.misses.add(gtin);
    } catch { ctx.errors++; }
    tick(ctx);
  }
}

// --- Rami Levy ---
async function processRamiLevy(targets, ctx, rl) {
  for (let i = 0; i < targets.length; i += 40) {
    const batch = targets.slice(i, i + 40);
    await pace(ctx.rate);
    try {
      const r = await fetch('https://www.rami-levy.co.il/api/catalog?', { method: 'POST', headers: { ...rl.add.headers, 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ store: 331, items: batch.join(','), size: 60, itemsBy: 'barcode' }), signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      const byNum = new Map(batch.map((g) => [Number(g), g]));
      const found = new Set();
      for (const p of j.data ?? []) {
        const gtin = byNum.get(Number(p.barcode));
        if (!gtin) continue;
        found.add(gtin);
        const path = [p.department?.name, p.group?.name, p.subGroup?.name].filter(Boolean);
        const image = p.images?.original ? `https://img.rami-levy.co.il${p.images.original}` : null;
        ctx.store.items[gtin] = { name: p.name ?? null, path, brand: p.gs?.BrandName ?? null, image };
      }
      for (const gtin of batch) if (!found.has(gtin)) ctx.store.misses.add(gtin);
    } catch { ctx.errors += batch.length; }
    for (const _ of batch) tick(ctx);
  }
}

// --- Yochananof ---
function deepestPath(cats) {
  if (!cats.length) return [];
  const byPath = new Map(cats.map((c) => [c.path, c]));
  const deepest = cats.reduce((a, b) => (b.level > a.level ? b : a));
  const out = [];
  let cum = '';
  for (const id of deepest.path.split('/')) {
    cum = cum ? `${cum}/${id}` : id;
    const c = byPath.get(cum);
    if (c) out.push(c.name);
  }
  return out;
}
async function processYochananof(targets, ctx) {
  const url = 'https://api.yochananof.co.il/graphql';
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA };
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const skus = batch.map((b) => `"${b}"`).join(',');
    const withImage = `{ products(filter:{sku:{in:[${skus}]}}, pageSize: 60) { items { sku name categories { name level path } image { url } } } }`;
    await pace(ctx.rate);
    let j;
    try {
      j = await (await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: withImage }), signal: AbortSignal.timeout(25000) })).json();
      if (j.errors) {
        await pace(ctx.rate);
        const noImage = `{ products(filter:{sku:{in:[${skus}]}}, pageSize: 60) { items { sku name categories { name level path } } } }`;
        j = await (await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: noImage }), signal: AbortSignal.timeout(25000) })).json();
      }
    } catch { ctx.errors += batch.length; for (const _ of batch) tick(ctx); continue; }
    const found = new Set();
    for (const p of j.data?.products?.items ?? []) {
      if (!batch.includes(p.sku)) continue;
      found.add(p.sku);
      const cats = (p.categories ?? []).filter((c) => !/מבצע|מותג הפרטי|חדש|מומלצ/.test(c.name));
      ctx.store.items[p.sku] = { name: p.name ?? null, path: deepestPath(cats), brand: null, image: p.image?.url ?? null };
    }
    for (const gtin of batch) if (!found.has(gtin)) ctx.store.misses.add(gtin);
    for (const _ of batch) tick(ctx);
  }
}

// --- Hazi Hinam ---
async function processHaziHinam(targets, ctx) {
  const init = await fetch('https://shop.hazi-hinam.co.il/proxy/init', { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const jar = {};
  for (const c of init.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim(); }
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  for (const gtin of targets) {
    await pace(ctx.rate);
    try {
      const r = await fetch('https://shop.hazi-hinam.co.il/proxy/api/item/getItemsBySearch', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', cookie, 'user-agent': UA }, body: JSON.stringify({ Paging: { Page: 1, PageSize: 5 }, Object: { SearchPhrase: gtin, SearchPhrases: null, ItemGroupping: null } }), signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      const hit = (j.Results?.Items ?? []).find((it) => String(it.BarKod) === gtin);
      if (hit) ctx.store.items[gtin] = { name: hit.Name ?? null, path: [hit.CategoryName, hit.SubCategoryName].filter(Boolean), brand: hit.ManufacturerName ?? null, image: hit.ImgBig ?? hit.Img ?? null };
      else ctx.store.misses.add(gtin);
    } catch { ctx.errors++; }
    tick(ctx);
  }
}

// --- Self Point (Carrefour, Tiv Taam) ---
async function processSelfPoint(targets, ctx, { base, retailerId, branchId }) {
  let consecutiveFail = 0;
  for (const gtin of targets) {
    await pace(ctx.rate);
    const filters = JSON.stringify({ must: { term: { 'branch.isActive': true, 'branch.isVisible': true } }, should: { term: { barcode: gtin, localBarcode: gtin } } });
    const url = `${base}/v2/retailers/${retailerId}/branches/${branchId}/products?appId=4&filters=${encodeURIComponent(filters)}&from=0&size=1`;
    try {
      const r = await fetch(url, { headers: { accept: 'application/json, text/plain, */*', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`http ${r.status}`);
      const j = await r.json();
      consecutiveFail = 0;
      const p = j.products?.[0];
      if (p) {
        const names = p.names?.['1'] ?? {};
        const catsPath = p.family?.categoriesPaths?.[p.family.mainCategoryPathIndex ?? 0] ?? [];
        const path = catsPath.map((c) => c.names?.['1']).filter(Boolean);
        const image = p.image?.url ? p.image.url.replace('{{size}}', '300').replace(/\{\{extension.*?\}\}/, 'jpg') : null;
        ctx.store.items[gtin] = { name: names.long ?? names.short ?? p.localName ?? null, path, brand: p.brand?.names?.['1'] ?? null, image };
      } else ctx.store.misses.add(gtin);
    } catch (e) {
      ctx.errors++;
      consecutiveFail++;
      if (consecutiveFail >= 20 && Object.keys(ctx.store.items).length === 0) {
        console.log(`[${ctx.chainId}] aborting after ${consecutiveFail} straight failures (${e.message}) - looks blocked, not asking the rest`);
        tick(ctx);
        break;
      }
    }
    tick(ctx);
  }
}

function summarize(ctx) {
  const counts = {};
  for (const it of Object.values(ctx.store.items)) {
    const key = (it.path ?? []).join(' > ') || '(none)';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const paths = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, count]) => ({ path: p, count }));
  return { chain: ctx.chainId, asked: Object.keys(ctx.store.items).length + ctx.store.misses.size, found: Object.keys(ctx.store.items).length, misses: ctx.store.misses.size, paths };
}

async function runChain(chainId, allGtins, opts) {
  const file = path.join(OPS_DIR, `${chainId}.json`);
  let items = {}, misses = new Set();
  if (!opts.refresh && existsSync(file)) {
    try { const prev = JSON.parse(readFileSync(file, 'utf8')); items = prev.items ?? {}; misses = new Set(prev.misses ?? []); } catch { /* start fresh */ }
  }
  let targets = allGtins.filter((g) => opts.refresh || !(g in items || misses.has(g)));
  if (opts.only) targets = targets.filter((g) => opts.only.has(g));
  if (opts.limit) targets = targets.slice(0, opts.limit);
  const ctx = { chainId, file, store: { items, misses }, rate: { last: 0 }, asked: 0, lastPrinted: 0, total: targets.length, errors: 0 };
  console.log(`[${chainId}] starting: ${targets.length} to ask (${allGtins.length} total, ${Object.keys(items).length} already found, ${misses.size} already miss)`);
  if (targets.length) {
    if (chainId === 'shufersal') await processShufersal(targets, ctx);
    else if (chainId === 'ramilevy') { const { default: rl } = await import('../src/handoff/adapters/ramilevy.js'); await processRamiLevy(targets, ctx, rl); }
    else if (chainId === 'yochananof') await processYochananof(targets, ctx);
    else if (chainId === 'hazihinam') await processHaziHinam(targets, ctx);
    else if (chainId === 'carrefour') await processSelfPoint(targets, ctx, { base: 'https://www.carrefour.co.il', retailerId: 1540, branchId: 3003 });
    else if (chainId === 'tivtaam') await processSelfPoint(targets, ctx, { base: 'https://www.tivtaam.co.il', retailerId: 1062, branchId: 924 });
    else throw new Error(`unknown chain ${chainId}`);
  }
  const data = checkpoint(ctx);
  console.log(`[${chainId}] done: ${Object.keys(data.items).length} found, ${data.misses.length} miss, ${ctx.errors} errors -> ${file}`);
  return summarize(ctx);
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { chain: null, limit: null, only: null, refresh: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chain') opts.chain = args[++i];
    else if (args[i] === '--limit') opts.limit = Number(args[++i]);
    else if (args[i] === '--only') opts.only = new Set(args[++i].split(',').map((s) => s.trim().replace(/^g/, '')));
    else if (args[i] === '--refresh') opts.refresh = true;
  }
  if (opts.chain && !CHAIN_IDS.includes(opts.chain)) throw new Error(`--chain must be one of ${CHAIN_IDS.join(', ')}`);
  mkdirSync(OPS_DIR, { recursive: true });
  const products = JSON.parse(readFileSync(PRODUCTS_FILE, 'utf8'));
  const allGtins = [...new Set(products.filter((p) => p.kind !== 'concept' && p.gtin).map((p) => String(p.gtin)))];
  console.log(`product-truth audit: ${allGtins.length} barcoded products, chains: ${(opts.chain ? [opts.chain] : CHAIN_IDS).join(', ')}`);
  const selected = opts.chain ? [opts.chain] : CHAIN_IDS;
  const results = await Promise.all(selected.map((id) => runChain(id, allGtins, opts)));
  const summaryFile = path.join(OPS_DIR, 'summary.json');
  let summary = {};
  if (existsSync(summaryFile)) { try { summary = JSON.parse(readFileSync(summaryFile, 'utf8')).chains ?? {}; } catch { /* start fresh */ } }
  for (const r of results) summary[r.chain] = { asked: r.asked, found: r.found, misses: r.misses, paths: r.paths };
  const tmp = `${summaryFile}.tmp`;
  writeFileSync(tmp, JSON.stringify({ generatedAt: new Date().toISOString(), chains: summary }, null, 1));
  renameSync(tmp, summaryFile);
  console.log('summary ->', summaryFile);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
