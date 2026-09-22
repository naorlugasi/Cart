// MANUAL AUDIT TOOL - never part of the pipeline (docs/PIPELINE-CONTRACT.md: no request to chain websites in the build).
// Asks three chains' storefronts which department THEY file a barcode under, for products whose department we are
// unsure of. Default set: everything labelled כללי in config/categories/labels.json; or pass a JSON file of ids.
// Usage: node scripts/audit-chain-placement.mjs [ids.json] > out.json   (23.9.2026, docs/CATEGORIES.md)
// barcode under, for the products whose department we are unsure of. Reads config/categories/labels.json.
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = process.argv[3] ?? 'chain-placement.json';
const ROOT = new URL('..', import.meta.url).pathname;
const labels = JSON.parse(readFileSync(`${ROOT}/config/categories/labels.json`, 'utf8')).labels;
const { default: rl } = await import(`${ROOT}/src/handoff/adapters/ramilevy.js`);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Which products: a JSON file of ids ("g7290..." or bare barcodes) when given, else everything labelled כללי.
const idsFile = process.argv[2];
const targets = idsFile
  ? JSON.parse(readFileSync(idsFile, 'utf8')).map((x) => { const id = String(typeof x === 'object' ? x.id : x); return { id: id.startsWith('g') ? id : `g${id}`, name: labels[id]?.[1] ?? x.name ?? '', ours: labels[id]?.[0] ?? null }; })
  : Object.entries(labels).filter(([, [c]]) => c === 'כללי').map(([id, [c, name]]) => ({ id, name, ours: c }));
const byId = new Map(); for (const t of targets) if (!byId.has(t.id)) byId.set(t.id, { ...t, gtin: t.id.slice(1), chains: {} });
const items = [...byId.values()].filter((t) => /^\d{8,14}$/.test(t.gtin));
console.log('targets:', items.length);

// Rami Levy: department / group, 40 barcodes per call
for (let i = 0; i < items.length; i += 40) {
  const batch = items.slice(i, i + 40);
  try {
    const r = await fetch('https://www.rami-levy.co.il/api/catalog?', { method: 'POST', headers: { ...rl.add.headers, 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ store: 331, items: batch.map((b) => b.gtin).join(','), size: 60, itemsBy: 'barcode' }), signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    for (const p of j.data ?? []) { const t = byId.get('g' + String(p.barcode)); if (t) t.chains.ramilevy = [p.department?.name, p.group?.name, p.subgroup?.name].filter(Boolean).join(' > '); }
  } catch (e) { console.log('ramilevy batch failed', e.message); }
  await sleep(400);
}
// Yochananof: category tree by sku, 50 per call
for (let i = 0; i < items.length; i += 50) {
  const batch = items.slice(i, i + 50);
  try {
    const q = `{ products(filter:{sku:{in:[${batch.map((b) => `"${b.gtin}"`).join(',')}]}}, pageSize: 60) { items { sku categories { name level path } } } }`;
    const r = await fetch('https://api.yochananof.co.il/graphql', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ query: q }), signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    for (const p of j.data?.products?.items ?? []) {
      const t = byId.get('g' + p.sku); if (!t) continue;
      const cats = (p.categories ?? []).filter((c) => !/מבצע|מותג הפרטי|חדש|מומלצ/.test(c.name)).sort((a, b) => a.level - b.level);
      t.chains.yochananof = cats.map((c) => c.name).join(' > ');
    }
  } catch (e) { console.log('yochananof batch failed', e.message); }
  await sleep(400);
}
// Hazi Hinam: search by barcode, one call each (guest session first)
const jar = {};
const init = await fetch('https://shop.hazi-hinam.co.il/proxy/init', { headers: { 'user-agent': UA, accept: 'application/json' } });
for (const c of init.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim(); }
const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
let hh = 0;
for (const t of items) {
  try {
    const r = await fetch('https://shop.hazi-hinam.co.il/proxy/api/item/getItemsBySearch', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', cookie, 'user-agent': UA }, body: JSON.stringify({ Paging: { Page: 1, PageSize: 5 }, Object: { SearchPhrase: t.gtin, SearchPhrases: null, ItemGroupping: null } }), signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const hit = (j.Results?.Items ?? []).find((i) => String(i.BarKod) === t.gtin);
    if (hit) { t.chains.hazihinam = [hit.CategoryName, hit.SubCategoryName].filter(Boolean).join(' > '); hh++; }
  } catch (e) { /* skip */ }
  await sleep(120);
}
console.log('hazihinam hits:', hh);
writeFileSync(`${OUT}`, JSON.stringify(items, null, 1));
const found = items.filter((t) => Object.keys(t.chains).length);
console.log('with at least one chain category:', found.length, 'of', items.length, '->', OUT);
