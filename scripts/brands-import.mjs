#!/usr/bin/env node
/**
 * Merges brands collected from public product pages (data/local/brands-web*.json, written by a read-only
 * lookup by barcode - docs/ALIASES.md) into config/products/brands.json, the reviewed brand file the build
 * reads.
 *
 *   node scripts/brands-import.mjs data/local/brands-web-run2.json [--replace]
 *
 * Only entries with found:true and a non-empty brand are taken; a barcode already in the file keeps its
 * brand unless --replace. A brand that is a filler or looks like a company (בע"מ, Ltd, an address) is
 * skipped and listed, so a site's manufacturer line never becomes "the brand" by accident. Prints what it
 * added and what it skipped. Never touches data/.
 *
 * mergeBrand() below is the one-gtin decision, factored out of the CLI loop (10.10.2026) so
 * scripts/sizes-import.mjs can forward a web lookup's `brand` field through the exact same rule
 * (NOT_A_BRAND / length / never-overwrite-without---replace) without duplicating it. The CLI's own
 * behaviour here is unchanged - run() still does exactly what the old inline loop did.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'config', 'products', 'brands.json');
export const NOT_A_BRAND = /^(,|-|לא ידוע|כללי|unknown|n\/a|none)$|בע"?מ|בעמ|\bltd\b|\binc\b|\bco\.|s\.a\.|תעשיות|שיווק|יבוא|הפצה|\d{4,}|רח'|רחוב/i;

/**
 * One gtin's merge into a `brands` map (config/products/brands.json's `brands` object - mutated in
 * place, same as the old inline loop mutated `file.brands`). Validates the gtin shape and the brand
 * (NOT_A_BRAND / length), then adds, replaces (only with `replace: true`) or leaves it. Pure given the
 * map (test/sizesImport.test.js exercises it through sizes-import; brands-import's own run() below is
 * the only caller of its CLI).
 *
 * Returns `{ status }`: 'invalid' (empty brand or not a barcode-looking gtin - never counted, same as
 * the old loop's silent `continue`), 'not-a-brand' (skipped and listed), 'kept' (gtin already there,
 * no --replace), 'added' or 'replaced'.
 */
export function mergeBrand(brands, gtin, brand, source, since, { replace = false } = {}) {
  const g = String(gtin ?? '');
  const b = String(brand ?? '').trim();
  if (!b || !/^\d{8,14}$/.test(g)) return { status: 'invalid' };
  if (NOT_A_BRAND.test(b) || b.length > 30) return { status: 'not-a-brand' };
  if (brands[g] && !replace) return { status: 'kept' };
  const status = brands[g] ? 'replaced' : 'added';
  brands[g] = { brand: b, source, since };
  return { status };
}

function run() {
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
    if (!b.found) continue;
    const gtin = String(b.gtin ?? '');
    const brand = String(b.brand ?? '').trim();
    const result = mergeBrand(file.brands, gtin, brand, b.url ?? 'web', since, { replace });
    if (result.status === 'invalid') continue;
    if (result.status === 'not-a-brand') { skipped.push(`${gtin} "${brand}"`); continue; }
    if (result.status === 'added') added++;
    else if (result.status === 'replaced') replaced++;
    else kept++;
  }
  file.brands = Object.fromEntries(Object.entries(file.brands).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(FILE, JSON.stringify(file, null, 1) + '\n');
  console.log(`brands: +${added} added, ${replaced} replaced, ${kept} already there, ${skipped.length} skipped (not a brand) -> ${Object.keys(file.brands).length} total`);
  for (const s of skipped.slice(0, 40)) console.log('  skipped', s);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
