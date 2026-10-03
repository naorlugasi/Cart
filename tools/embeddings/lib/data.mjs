// Shared data loading for the embedding prototype. Reads the production data directory
// READ-ONLY (never writes there). Defaults to the real Cart repo's data/ dir; override with
// DATA_ROOT for testing.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const DATA_ROOT = process.env.DATA_ROOT || '/Users/naorlugassi/Projects/Cart/data';
export const CONFIG_ROOT = process.env.CONFIG_ROOT || '/Users/naorlugassi/Projects/Cart/config';

export function loadProducts() {
  const raw = JSON.parse(readFileSync(path.join(DATA_ROOT, 'products.json'), 'utf8'));
  return raw.filter((p) => p.kind !== 'concept');
}

const CHAINS = [
  'carrefour', 'hazihinam', 'keshet', 'mck', 'osherad', 'quik', 'ramilevy',
  'shufersal', 'shukcity', 'tivtaam', 'victory', 'ybitan', 'yochananof', 'yochananof_b',
];

/** Scans every chain's catalog.full.json and returns a Map gtin -> longest name seen across chains
 * (ties broken by first chain encountered). Many chains truncate names to ~20 chars, so the longest
 * available name is usually the most descriptive one. */
export function loadLongestChainNames({ chains = CHAINS, verbose = true } = {}) {
  const longest = new Map();
  for (const chain of chains) {
    const file = path.join(DATA_ROOT, 'prices', chain, 'catalog.full.json');
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      if (verbose) console.warn(`[data] skip ${chain}: ${err.message}`);
      continue;
    }
    for (const item of data.items || []) {
      if (!item.gtin || !item.name) continue;
      const name = String(item.name).trim();
      if (!name) continue;
      const prev = longest.get(item.gtin);
      if (!prev || name.length > prev.length) longest.set(item.gtin, name);
    }
    if (verbose) console.log(`[data] ${chain}: ${data.items?.length ?? 0} items (running gtins: ${longest.size})`);
  }
  return longest;
}

export function loadConceptsIndex() {
  const idx = JSON.parse(readFileSync(path.join(CONFIG_ROOT, 'concepts', 'index.json'), 'utf8'));
  const concepts = [];
  for (const file of idx.files) {
    const list = JSON.parse(readFileSync(path.join(CONFIG_ROOT, 'concepts', file), 'utf8'));
    const arr = Array.isArray(list) ? list : list.concepts || [];
    for (const c of arr) concepts.push(c);
  }
  return concepts;
}

export function loadLabels() {
  return JSON.parse(readFileSync(path.join(CONFIG_ROOT, 'categories', 'labels.json'), 'utf8'));
}

export function loadVerified() {
  return JSON.parse(readFileSync(path.join(CONFIG_ROOT, 'products', 'verified.json'), 'utf8'));
}

/** Builds the department ground-truth map used by the department holdout / proposal scripts.
 * Priority: per-product label (g-key in labels.json) > per-concept label (c-key in labels.json,
 * applied to every product carrying that conceptId) > verified.json record with a category. */
export function buildDepartmentGroundTruth(products) {
  const labelsDoc = loadLabels();
  const verifiedDoc = loadVerified();
  const labels = labelsDoc.labels || {};
  const byProductId = new Map();
  const byConceptId = new Map();
  for (const [key, value] of Object.entries(labels)) {
    if (!Array.isArray(value) || value.length < 1) continue;
    const dept = value[0];
    if (key.startsWith('c-')) byConceptId.set(key, dept);
    else byProductId.set(key, dept);
  }
  const verifiedRecords = verifiedDoc.records || {};

  const truth = new Map(); // productId -> { dept, source }
  for (const p of products) {
    if (byProductId.has(p.id)) {
      truth.set(p.id, { dept: byProductId.get(p.id), source: 'label-product' });
      continue;
    }
    if (p.conceptId && byConceptId.has(p.conceptId)) {
      truth.set(p.id, { dept: byConceptId.get(p.conceptId), source: 'label-concept' });
      continue;
    }
    const rec = verifiedRecords[p.id];
    if (rec && rec.category) {
      truth.set(p.id, { dept: rec.category, source: 'verified' });
    }
  }
  return truth;
}

/** The text embedded for one product: unified catalog name + the longest chain name seen for its
 * gtin (if different from the unified name), space-joined. Keeping both halves gives the model the
 * canonical name plus whatever extra descriptive tokens a chain's own (longer) name carries. */
export function buildEmbeddingText(product, longestChainNames) {
  const unified = (product.name || '').trim();
  const chainName = product.gtin ? (longestChainNames.get(product.gtin) || '').trim() : '';
  if (!chainName || chainName === unified) return unified;
  // Avoid near-duplicate concatenation when one is a prefix of the other.
  if (unified && chainName.startsWith(unified)) return chainName;
  if (chainName && unified.startsWith(chainName)) return unified;
  return chainName ? `${unified} ${chainName}` : unified;
}
