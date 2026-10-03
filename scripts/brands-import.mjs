#!/usr/bin/env node
/**
 * Merges brands collected from public product pages (data/local/brands-web*.json, written by a read-only lookup by
 * barcode - docs/ALIASES.md) into config/products/brands.json, the reviewed brand file the build reads.
 *
 *   node scripts/brands-import.mjs data/local/brands-web-run2.json [--replace]
 *
 * Only entries with found:true and a non-empty brand are taken; a barcode already in the file keeps its brand unless
 * --replace. A brand that is a filler or looks like a company (בע"מ, Ltd, an address) is skipped and listed, so a site's
 * manufacturer line never becomes "the brand" by accident. Prints what it added and what it skipped. Never touches data/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'config', 'products', 'brands.json');
const NOT_A_BRAND = /^(,|-|לא ידוע|כללי|unknown|n\/a|none)$|בע"?מ|בעמ|\bltd\b|\binc\b|\bco\.|s\.a\.|תעשיות|שיווק|יבוא|הפצה|\d{4,}|רח'|רחוב/i;

const [src, ...flags] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/brands-import.mjs <brands-web.json> [--replace]'); process.exit(1); }
const replace = flags.includes('--replace');
const web = JSON.parse(readFileSync(path.resolve(src), 'utf8'));
const file = JSON.parse(readFileSync(FILE, 'utf8'));
file.brands ??= {};
const since = new Date().toISOString().slice(0, 10);
let added = 0, kept = 0, replaced = 0;
const skipped = [];
for (const b of web.brands ?? []) {
  const gtin = String(b.gtin ?? '');
  const brand = String(b.brand ?? '').trim();
  if (!b.found || !brand || !/^\d{8,14}$/.test(gtin)) continue;
  if (NOT_A_BRAND.test(brand) || brand.length > 30) { skipped.push(`${gtin} "${brand}"`); continue; }
  if (file.brands[gtin] && !replace) { kept++; continue; }
  if (file.brands[gtin]) replaced++; else added++;
  file.brands[gtin] = { brand, source: b.url ?? 'web', since };
}
file.brands = Object.fromEntries(Object.entries(file.brands).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(FILE, JSON.stringify(file, null, 1) + '\n');
console.log(`brands: +${added} added, ${replaced} replaced, ${kept} already there, ${skipped.length} skipped (not a brand) -> ${Object.keys(file.brands).length} total`);
for (const s of skipped.slice(0, 40)) console.log('  skipped', s);
