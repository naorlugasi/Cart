#!/usr/bin/env node
/**
 * Merges sizes collected from public product pages (data/local/sizes-web*.json - chp.co.il /
 * cheapersal.co.il read-only lookups by barcode, same source and scope as scripts/brands-import.mjs) into
 * config/products/sizes.json, the reviewed-size file scripts/build-products.mjs reads as the THIRD size
 * tier: only after a chain NAME (pickSize) and the chains' own price-file fields
 * (pickSizeFromChainFields, config/size-units.json) both come up empty for a barcode, and only ever for a
 * product whose FINAL isWeighted is false (projectProduct's job - this script knows nothing about
 * isWeighted and never needs to).
 *
 *   node scripts/sizes-import.mjs data/local/sizes-web-run1a.json
 *
 * Run-file shape (written by the web-lookup workers): { generatedAt, queue, startIndex, done, items: [
 * { gtin, size: {value, unit, count} | null, brand: string|null, webName, url, found: boolean, note? }
 * ], tally }. Only found:true items are read at all.
 *
 * A size is taken when it is well-formed (normalizeSize): value > 0, unit g/ml/unit after a defensive
 * kg->g*1000 / l->ml*1000 fold (the worker should already normalize; this re-checks rather than trusts
 * blindly), count an integer >= 1, and the total no more than 20000 g/ml - the same ceiling
 * src/catalog/size.js's sizeFromChainFields already enforces for the chain-field tier, so no grocery
 * package the customer would laugh at enters either tier. An item whose `note` contains "CONFLICT" (the
 * worker saw disagreeing sizes across sources and flagged it instead of guessing) is skipped and listed,
 * whatever its `size` looks like. A gtin already in config/products/sizes.json keeps its size - this
 * tier never overwrites; unlike brands-import there is no --replace, since a page-read size has no
 * review step yet the way a human "same brand" correction does.
 *
 * The same item's `brand` (when non-null) is forwarded into config/products/brands.json too, through
 * brands-import.mjs's own mergeBrand() - the exact NOT_A_BRAND / length / never-overwrite-without-
 * -replace rule brands-import's own run uses, so a brand noticed while looking up a size is reviewed
 * exactly like one brands-import would have taken, without duplicating the rule. brands-import's own CLI
 * is untouched.
 *
 * Prints added / already-there / skipped (with reasons) and totals for both files. Never touches data/.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeBrand } from './brands-import.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES_FILE = path.join(ROOT, 'config', 'products', 'sizes.json');
const BRANDS_FILE = path.join(ROOT, 'config', 'products', 'brands.json');
const SIZES_DOC = "Reviewed sizes per barcode, from read-only lookups of public product pages (chp.co.il, cheapersal.co.il - same source and same Naor-cleared scope as config/products/brands.json): the THIRD size tier scripts/build-products.mjs's projectProduct reads (sizeSource 'web'), consulted only after a chain NAME (pickSize) and the chains' own price-file fields (pickSizeFromChainFields, config/size-units.json) both come up empty for a barcode, and only ever for a product whose FINAL isWeighted is false (never for a weighed product, whatever this file says). It never overrides a size either of those two earlier tiers already produced. Written by a reviewed import (scripts/sizes-import.mjs), never by the build. A barcode not listed here simply has no size from this tier.";

// No grocery package the customer would laugh at - same ceiling as src/catalog/size.js's sizeFromChainFields.
const MAX_SIZE = 20000;

/** Defensive normalization + well-formedness check (pure; test/sizesImport.test.js). kg/l fold into g/ml
 *  the same way src/catalog/size.js does (x1000) in case a worker ever slips one through unnormalized.
 *  Returns the normalized {value, unit, count} or null - never throws, so one bad item never stops a
 *  whole run. */
export function normalizeSize(size) {
  if (!size || typeof size !== 'object') return null;
  let { value, unit, count } = size;
  value = Number(value);
  if (unit === 'kg') { unit = 'g'; value *= 1000; }
  else if (unit === 'l') { unit = 'ml'; value *= 1000; }
  if (!(Number.isFinite(value) && value > 0)) return null;
  if (!['g', 'ml', 'unit'].includes(unit)) return null;
  if (!(Number.isInteger(count) && count >= 1)) return null;
  if (value > MAX_SIZE) return null;
  return { value, unit, count };
}

/**
 * Pure merge (test/sizesImport.test.js): one run file's `items` + what's already in
 * config/products/sizes.json's `sizes` map + config/products/brands.json's `brands` map -> the new
 * sizes/brands maps plus a summary. No file I/O, same split as same-product-review-import.mjs's
 * importDecisions. `sizes`/`brands` are never mutated; the returned maps are copies with additions.
 */
export function importSizes(items, sizes, brands, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const outSizes = { ...sizes };
  const outBrands = { ...brands };
  const summary = {
    total: (items ?? []).length,
    sizesAdded: 0, sizesKept: 0, sizesSkipped: 0,
    brandsAdded: 0, brandsReplaced: 0, brandsKept: 0, brandsSkipped: 0,
    skipDetails: [],
  };

  for (const item of items ?? []) {
    if (!item?.found) continue;
    const gtin = String(item.gtin ?? '');
    if (!/^\d{8,14}$/.test(gtin)) continue;
    const source = item.url ?? 'web';

    if (item.brand != null) {
      const result = mergeBrand(outBrands, gtin, item.brand, source, today);
      if (result.status === 'added') summary.brandsAdded++;
      else if (result.status === 'replaced') summary.brandsReplaced++;
      else if (result.status === 'kept') summary.brandsKept++;
      else if (result.status === 'not-a-brand') {
        summary.brandsSkipped++;
        summary.skipDetails.push(`${gtin}: brand "${item.brand}" - not a brand`);
      }
    }

    if (String(item.note ?? '').includes('CONFLICT')) {
      summary.sizesSkipped++;
      summary.skipDetails.push(`${gtin}: size skipped - note has CONFLICT`);
      continue;
    }
    const size = normalizeSize(item.size);
    if (!size) {
      summary.sizesSkipped++;
      summary.skipDetails.push(`${gtin}: size skipped - not well-formed`);
      continue;
    }
    if (outSizes[gtin]) { summary.sizesKept++; continue; }
    outSizes[gtin] = { size, source, since: today };
    summary.sizesAdded++;
  }

  return { sizes: outSizes, brands: outBrands, summary };
}

function run() {
  const runFile = process.argv[2];
  if (!runFile) { console.error('usage: node scripts/sizes-import.mjs <run-file.json>'); process.exit(1); }
  const runPath = path.resolve(runFile);
  if (!existsSync(runPath)) { console.error(`missing ${runPath}`); process.exit(1); }
  const queue = JSON.parse(readFileSync(runPath, 'utf8'));

  const sizesFile = existsSync(SIZES_FILE) ? JSON.parse(readFileSync(SIZES_FILE, 'utf8')) : { _doc: SIZES_DOC, sizes: {} };
  sizesFile.sizes ??= {};
  const brandsFile = existsSync(BRANDS_FILE) ? JSON.parse(readFileSync(BRANDS_FILE, 'utf8')) : { _doc: '', brands: {} };
  brandsFile.brands ??= {};

  const { sizes, brands, summary } = importSizes(queue.items ?? [], sizesFile.sizes, brandsFile.brands);

  if (summary.sizesAdded > 0) {
    sizesFile.sizes = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(SIZES_FILE, JSON.stringify(sizesFile, null, 1) + '\n');
  }
  if (summary.brandsAdded > 0 || summary.brandsReplaced > 0) {
    brandsFile.brands = Object.fromEntries(Object.entries(brands).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BRANDS_FILE, JSON.stringify(brandsFile, null, 1) + '\n');
  }

  console.log(`sizes: +${summary.sizesAdded} added, ${summary.sizesKept} already there, ${summary.sizesSkipped} skipped -> ${Object.keys(sizes).length} total`);
  console.log(`brands (forwarded): +${summary.brandsAdded} added, ${summary.brandsReplaced} replaced, ${summary.brandsKept} already there, ${summary.brandsSkipped} skipped -> ${Object.keys(brands).length} total`);
  if (summary.skipDetails.length) {
    console.log('skipped:');
    for (const s of summary.skipDetails.slice(0, 60)) console.log(`  ${s}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
