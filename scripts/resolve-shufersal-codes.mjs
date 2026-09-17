#!/usr/bin/env node
/**
 * Shufersal identifies a product on its website by an internal code ("P_<n>"), not by barcode. The
 * handoff adds items to the cart with that code, so a wrong code means "הוספת הפריט נכשלה" for the
 * customer. The formula (P_<barcode>, and P_<the number after the prefix> for the chain's own 729000
 * barcodes) was verified 65/65 on 17.9.2026, but nothing guarantees it stays that way - so every day
 * we ask the site itself and keep the answer:
 *
 *   GET https://www.shufersal.co.il/online/he/search/results?q=<barcode>:relevance&limit=10
 *   -> JSON { results: [{ code: "P_...", ean: "<barcode>", name }] }      (plain HTTP, no browser)
 *
 * Output: data/prices/shufersal/codes.json = { fetchedAt, items: { <gtin>: { code, name, checkedAt } | { code: null, checkedAt } } }
 * build-products.mjs applies it to the Shufersal catalog: storeItemId from the site when known, the
 * formula as fallback, and "not sold online" (inStock: false) when the site does not know the barcode.
 *
 *   node scripts/resolve-shufersal-codes.mjs [--all] [--max-age-days 7] [--rate 5]
 *
 * Only the products of the unified catalog (data/products.json) are resolved, and only those not
 * checked within --max-age-days (default 7), so a daily run is ~1/7 of the ~3,000 GTINs.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shufersalCode } from './fetch-prices.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'prices', 'shufersal', 'codes.json');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i === -1 ? def : argv[i + 1]; };
const ALL = argv.includes('--all');
const MAX_AGE_MS = Number(opt('max-age-days', 7)) * 86400e3;
const RATE = Number(opt('rate', 5));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** The site finds the chain's own 729000 products by their short code, everything else by barcode. */
export const searchTerm = (gtin) => (/^729000\d{7}$/.test(gtin) ? shufersalCode(gtin).slice(2) : gtin);

/** Pick the site's product for a barcode out of the search results (ean match first, else the only hit). */
export function pickResult(gtin, results) {
  if (!Array.isArray(results) || !results.length) return null;
  const byEan = results.find((r) => String(r.ean ?? '') === gtin);
  if (byEan) return byEan;
  const formula = shufersalCode(gtin);
  const byCode = results.find((r) => r.code === formula);
  if (byCode) return byCode;
  return results.length === 1 ? results[0] : null;
}

async function search(gtin) {
  const url = `https://www.shufersal.co.il/online/he/search/results?q=${encodeURIComponent(searchTerm(gtin))}%3Arelevance&limit=10`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const json = await res.json();
      return { results: json.results ?? [] };
    } catch (err) {
      if (attempt === 2) return { error: err.message };
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return { error: 'unreachable' };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  const catalogPath = path.join(ROOT, 'data', 'prices', 'shufersal', 'catalog.full.json');
  const inFile = existsSync(catalogPath) ? new Set(JSON.parse(readFileSync(catalogPath, 'utf8')).items.map((i) => i.gtin)) : null;
  const gtins = products.map((p) => p.gtin).filter((g) => g && (!inFile || inFile.has(g)));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { items: {} };
  const now = Date.now();
  const todo = gtins.filter((g) => ALL || !prev.items[g] || now - Date.parse(prev.items[g].checkedAt) > MAX_AGE_MS);
  console.log(`shufersal codes: ${gtins.length} products in the catalog, ${Object.keys(prev.items).length} known, ${todo.length} to (re)check at ${RATE}/s`);
  let same = 0, differ = 0, missing = 0, errors = 0;
  const items = { ...prev.items };
  for (const [i, gtin] of todo.entries()) {
    const t0 = Date.now();
    const { results, error } = await search(gtin);
    if (error) { errors++; items[gtin] = { ...(items[gtin] ?? {}), error, checkedAt: new Date().toISOString() }; }
    else {
      const hit = pickResult(gtin, results);
      if (!hit) { missing++; items[gtin] = { code: null, checkedAt: new Date().toISOString() }; }
      else { hit.code === shufersalCode(gtin) ? same++ : differ++; items[gtin] = { code: hit.code, name: hit.name, checkedAt: new Date().toISOString() }; }
    }
    if ((i + 1) % 200 === 0) { writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), items })); console.log(`  ${i + 1}/${todo.length}  formula ok ${same}, differs ${differ}, not on site ${missing}, errors ${errors}`); }
    const wait = 1000 / RATE - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), items }));
  const known = Object.values(items);
  console.log(`done: formula ok ${same}, differs ${differ}, not on site ${missing}, errors ${errors} | cache: ${known.filter((x) => x.code).length} with site code, ${known.filter((x) => x.code === null).length} not sold online`);
  // An enrichment step must not block the daily publish: warn, keep yesterday's codes, exit 0.
  if (errors && errors === todo.length) console.log('warning: every request failed - the site search may be down; keeping the previous codes');
}
