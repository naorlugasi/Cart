#!/usr/bin/env node
/**
 * Match "הסל של ישראל" brochure transcriptions to barcodes, using Carrefour's own price file
 * (the basket is priced/committed by Carrefour, so its catalog is the ground truth for gtins).
 *
 *   node scripts/sal-israel-match.mjs --input <transcribed.json> [--catalog <catalog.full.json>]
 *                                     [--products data/products.json] [--json out.json]
 *
 * `--input` is a JSON array of { name, brand?, size?, carrefourPrice? } transcribed by hand from the
 * ministry's brochure (docs/SAL-ISRAEL.md). For every row this prints the best-scoring name matches
 * from the Carrefour catalog (src/catalog/matching.js: normalizeText/tokenize/rankMatches - the same
 * Hebrew-aware fuzzy matching the product search uses), for manual review - same brand + same size only
 * counts as a confident match (a high score alone is not enough, e.g. "3% milk" vs "1% milk").
 *
 * If a row already carries a `gtin` (the 22.9.2026 brochure prints one on every product - unusual, but
 * true for this campaign), the top candidate's gtin is compared to it and the row is marked "confirmed"
 * or "MISMATCH" instead of only "proposed" - this is a stronger check than name matching alone.
 *
 * `--catalog` defaults to the absolute path of the main checkout's raw Carrefour price file
 * (data/prices/<chain>/catalog.full.json is not committed - see docs/PIPELINE-CONTRACT.md §0.1 -
 * so it only exists on disk where prices:fetch last ran, not necessarily in this worktree).
 * `--products` (default data/products.json, committed) is used only to note whether a matched gtin is
 * already in the unified catalog; a "no" does not disqualify it (§3.0 of the plan).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankMatches } from '../src/catalog/matching.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG = '/Users/naorlugassi/Projects/Cart/data/prices/carrefour/catalog.full.json';
const DEFAULT_PRODUCTS = path.join(HERE, '..', 'data', 'products.json');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };

/**
 * Pure matcher: for every transcribed row, rank Carrefour catalog items by name similarity.
 * Returns [{ row, candidates: [{gtin, name, price, score}], status }], status is
 * 'confirmed' (row.gtin equals the top candidate's gtin), 'mismatch' (row.gtin set but the top
 * candidate disagrees), or 'proposed' (row has no gtin of its own - candidates are only a suggestion).
 */
export function matchRows(rows, catalogItems, { threshold = 0.4, limit = 5 } = {}) {
  const named = catalogItems.filter((i) => i.name);
  return rows.map((row) => {
    const ranked = rankMatches(row.name, named, { key: 'name', threshold, limit });
    const candidates = ranked.map((r) => ({ gtin: r.candidate.gtin, name: r.candidate.name, price: r.candidate.price, score: r.score }));
    let status = 'proposed';
    if (row.gtin) {
      const top = candidates[0];
      status = top && top.gtin === row.gtin ? 'confirmed' : (catalogItems.some((i) => i.gtin === row.gtin) ? 'confirmed-by-gtin' : 'mismatch');
    }
    return { row, candidates, status };
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const inputFile = opt('input');
  if (!inputFile) {
    console.error('usage: node scripts/sal-israel-match.mjs --input <transcribed.json> [--catalog <catalog.full.json>] [--products data/products.json] [--json out.json]');
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(inputFile, 'utf8'));
  const catalogFile = opt('catalog') || DEFAULT_CATALOG;
  const productsFile = opt('products') || DEFAULT_PRODUCTS;
  let catalog, products;
  try {
    catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  } catch (err) {
    console.error(`could not read Carrefour catalog at ${catalogFile} (${err.code ?? err.message}); pass --catalog <path>. This file is not committed (docs/PIPELINE-CONTRACT.md §0.1) - it only exists where prices:fetch last ran.`);
    process.exit(1);
  }
  try {
    products = JSON.parse(readFileSync(productsFile, 'utf8'));
  } catch {
    products = [];
  }
  const pGtins = new Set(products.map((p) => p.gtin));

  const results = matchRows(rows, catalog.items ?? [], {});
  let confirmed = 0, mismatch = 0, proposedOnly = 0, notInProducts = 0;
  for (const { row, candidates, status } of results) {
    if (status === 'confirmed' || status === 'confirmed-by-gtin') confirmed++;
    else if (status === 'mismatch') mismatch++;
    else proposedOnly++;
    const inProducts = row.gtin ? pGtins.has(row.gtin) : false;
    if (row.gtin && !inProducts) notInProducts++;
    const top = candidates.slice(0, 3).map((c) => `${c.gtin} "${c.name}" ₪${c.price} (${c.score})`).join('  |  ');
    console.log(`[${status}]${inProducts ? '' : ' [not in products.json]'} ${row.name} (${row.brand ?? ''} ${row.size ?? ''}) gtin=${row.gtin ?? '-'}\n    candidates: ${top || '(none >= threshold)'}`);
  }
  console.log(`\n${results.length} rows: ${confirmed} confirmed, ${mismatch} mismatch, ${proposedOnly} proposed-only (no printed gtin), ${notInProducts} confirmed gtins absent from products.json`);
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(results, null, 2));
  if (mismatch > 0) process.exitCode = 1;
}
