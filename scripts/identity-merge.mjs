#!/usr/bin/env node
/**
 * Offline tool (like scripts/alias-candidates.mjs) that computes identity-merge PROPOSALS from the
 * already-published catalog - moved out of the daily build 4.10.2026 (docs/ALIASES.md's own measurement:
 * one real auto-merge found catalog-wide did not justify the ~15s this step added to every build when it
 * ran there, nor 2,961 queue items in a published file). Never applies anything: `src/catalog/identity.js`
 * (identityMergeCandidates) decides AUTO vs REVIEW, and this script only writes both as proposals to
 * data/local/identity-clusters.json for a human to look at via scripts/same-product-review-export.mjs +
 * tools/review/same-product.html (docs/REVIEW-SAME-PRODUCT.md) - exactly the same "a person decides, a
 * commit is the only thing that changes the catalog" shape as scripts/alias-candidates.mjs.
 *
 * Reads (read-only, never writes to data/ beyond data/local/):
 *   - data/products.json: conceptId (final - already past every verified record and concept-assignment),
 *     size, category, attrs (already extracted by the daily build's attachProductAttrs - REUSED, never
 *     recomputed; this is what makes the offline pass cheap: no pickConcept, no extractAttrs, no
 *     loadChains() over the raw price files).
 *   - data/catalogs/<chain>.json: each chain's own raw name + price per gtin (same source
 *     scripts/alias-candidates.mjs and scripts/same-product-review-export.mjs already read).
 *   - config/products/verified.json: only to tell a DECIDED `conceptId: null` (a human/review record that
 *     explicitly says "no concept") from an UNRESOLVED one (src/catalog/identity.js identityKey) - every
 *     other per-id file is irrelevant here, since attrs/conceptId/size are already final in products.json.
 *
 * Writes data/local/identity-clusters.json (gitignored, like every data/local/ file) - a plain ARRAY,
 * sorted by impact descending:
 *   [{ id, gtins, verdict: "auto"|"review", failing: string[], differing: { attrs, words }, impact,
 *      products: [{ gtin, name, chains: [{chain, name, price}], size, attrs }] }]
 * `verdict: "auto"` is a PROPOSAL - the four conditions all held, but nothing here or in the build applies
 * it. `failing` is the distinct set of condition names (attrs/price/screen/chains) that blocked at least one
 * pair in a "review" cluster; empty for "auto". `differing`/`impact` reuse the exact functions
 * scripts/same-product-review-export.mjs already computes for its own alias-candidate/queue-sourced
 * clusters, so a cluster looks the same on the review page regardless of which tool found it.
 *
 *   node scripts/identity-merge.mjs
 *   DATA_ROOT=/path/to/data node scripts/identity-merge.mjs   # point at a different data/ (tests)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityMergeCandidates } from '../src/catalog/identity.js';
import { verifiedRecord } from '../src/catalog/verified.js';
import { clusterId, differingTokens, differingAttrKeys, computeImpact, SERVED_CHAINS } from './same-product-review-export.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_ROOT = '/Users/naorlugassi/Projects/Cart/data';
export const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : DEFAULT_DATA_ROOT;
const OUT_DIR = path.join(ROOT, 'data', 'local');
const OUT_PATH = path.join(OUT_DIR, 'identity-clusters.json');

// ---------------------------------------------------------------------------
// loading (same sources/shapes as scripts/same-product-review-export.mjs)
// ---------------------------------------------------------------------------

export function loadProducts(dataRoot = DATA_ROOT) {
  const file = path.join(dataRoot, 'products.json');
  if (!existsSync(file)) throw new Error(`missing ${file} - run scripts/build-products.mjs first`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** gtin -> Map(chainId -> { price, name }) - each chain's own raw name, the cheapest price if a chain
 *  somehow lists a gtin twice. Same source and shape as same-product-review-export.mjs loadCatalogPrices. */
export function loadCatalogPrices(dataRoot = DATA_ROOT) {
  const dir = path.join(dataRoot, 'catalogs');
  const byGtin = new Map();
  if (!existsSync(dir)) return byGtin;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'demo.json') continue;
    const chainId = file.replace(/\.json$/, '');
    let catalog;
    try { catalog = JSON.parse(readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    for (const item of catalog.items ?? []) {
      if (!item.gtin || !Number.isFinite(item.price) || !item.name) continue;
      const m = byGtin.get(item.gtin) ?? new Map();
      const cur = m.get(chainId);
      if (!cur || item.price < cur.price) m.set(chainId, { price: item.price, name: item.name });
      byGtin.set(item.gtin, m);
    }
  }
  return byGtin;
}

// ---------------------------------------------------------------------------
// product.json + catalogs -> src/catalog/identity.js raw-group shape
// ---------------------------------------------------------------------------

/**
 * Builds the raw-group objects identityMergeCandidates expects, straight from the PUBLISHED catalog rather
 * than from loadChains()+groupItemsByGtin()+projectProduct() (the build-time path this tool replaces):
 * `conceptId`/`size`/`category`/`attrs` are read directly off each product, already final (every verified
 * record and concept-assignment already applied by the build that produced products.json) and at zero extra
 * compute cost - no pickConcept, no extractAttrs. A product not sold at all in data/catalogs/ (should not
 * happen for a published product, but data can be stale between a partial build and this tool) is skipped.
 */
export function buildRawGroups(products, catalogPrices) {
  const groups = [];
  for (const p of products) {
    if (p.kind === 'concept' || !p.gtin) continue;
    const chainMap = catalogPrices.get(p.gtin);
    if (!chainMap || !chainMap.size) continue;
    const rec = verifiedRecord(p.id);
    const named = [...chainMap.entries()].map(([chain, info]) => ({ chain, name: info.name }));
    groups.push({
      gtin: p.gtin,
      conceptId: p.conceptId ?? null,
      // A verified record that explicitly carries `conceptId` (even to null) is a DECISION; a product no
      // rule/record/assignment ever touched is merely unresolved (src/catalog/identity.js identityKey).
      conceptIdDecided: Boolean(rec && Object.prototype.hasOwnProperty.call(rec, 'conceptId')),
      size: p.size, category: p.category ?? null, kind: p.kind, isWeighted: Boolean(p.isWeighted),
      names: named.map((n) => n.name), named,
      brandField: [], // the chain `brand` field is not needed - attrs is reused from products.json (below), not recomputed
      chainPrices: new Map([...chainMap.entries()].map(([chain, info]) => [chain, info.price])),
      attrs: p.attrs ?? {}, // already extracted by the daily build - see attrsFor() in src/catalog/identity.js
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// identity.js output -> data/local/identity-clusters.json shape
// ---------------------------------------------------------------------------

/** The distinct condition names that blocked at least one pair inside a "review" cluster - empty for an
 *  "auto" cluster (nothing blocked). */
function failingConditions(pairResults) {
  return [...new Set(pairResults.filter((p) => !p.ok).map((p) => p.failedCondition))].sort();
}

function productOut(gtin, productsByGtin, catalogPrices) {
  const p = productsByGtin.get(gtin);
  const chainMap = catalogPrices.get(gtin) ?? new Map();
  const chains = [...chainMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([chain, info]) => ({ chain, name: info.name, price: info.price }));
  return { gtin, name: p?.name ?? gtin, chains, size: p?.size ?? null, attrs: p?.attrs ?? {} };
}

/** Turns one identityMergeCandidates() merge/queue entry into the published cluster shape, reusing
 *  scripts/same-product-review-export.mjs's own differing/impact functions so a cluster looks the same on
 *  the review page whichever tool produced it. */
function toCluster(entry, verdict, productsByGtin, catalogPrices) {
  const gtins = [...entry.gtins].sort();
  const products = gtins.map((g) => productOut(g, productsByGtin, catalogPrices));
  const { impact } = computeImpact(gtins, catalogPrices, SERVED_CHAINS);
  return {
    id: clusterId(gtins),
    gtins,
    verdict,
    failing: verdict === 'auto' ? [] : failingConditions(entry.pairResults ?? []),
    differing: {
      words: differingTokens(products.map((p) => p.name)),
      attrs: differingAttrKeys(products.map((p) => p.attrs)),
    },
    impact,
    products,
  };
}

export function buildIdentityClusters({ products, catalogPrices }) {
  const productsByGtin = new Map(products.map((p) => [p.gtin, p]));
  const rawGroups = buildRawGroups(products, catalogPrices);
  const result = identityMergeCandidates(rawGroups);
  const clusters = [
    ...result.merges.map((m) => toCluster(m, 'auto', productsByGtin, catalogPrices)),
    ...result.queueItems.map((q) => toCluster(q, 'review', productsByGtin, catalogPrices)),
  ];
  clusters.sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
  return { clusters, stats: result.stats };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function run() {
  const products = loadProducts();
  const catalogPrices = loadCatalogPrices();
  const t0 = Date.now();
  const { clusters, stats } = buildIdentityClusters({ products, catalogPrices });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(clusters, null, 1) + '\n');

  const auto = clusters.filter((c) => c.verdict === 'auto').length;
  const review = clusters.length - auto;
  console.log(`identity-merge (offline, ${elapsed}s): lexicon ${stats.lexiconSize} words, ${stats.candidates} candidates, ${clusters.length} cluster(s) (${auto} auto, ${review} review) - ${OUT_PATH.replace(ROOT + '/', '')}`);
  console.log(`  pairs checked ${stats.pairsChecked}, failed: attrs ${stats.failedConditionCounts.attrs}, price ${stats.failedConditionCounts.price}, screen ${stats.failedConditionCounts.screen}, chains ${stats.failedConditionCounts.chains}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
