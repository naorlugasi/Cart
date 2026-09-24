#!/usr/bin/env node
/**
 * Where the next concept round should start. Groups every product that no concept claims into clusters
 * of names that begin with the same word, and ranks the clusters by how many distinct products and how
 * many chain listings sit inside them.
 *
 *   node scripts/concept-clusters.mjs                          every department, 12 clusters each
 *   node scripts/concept-clusters.mjs --department "בשר ועוף"   one department, more detail
 *   node scripts/concept-clusters.mjs --top 30 --samples 8
 *   node scripts/concept-clusters.mjs --expand פילה             the varieties inside one cluster
 *   node scripts/concept-clusters.mjs --json out.json          the same data for a script to read
 *
 * Why clusters and not the frequent-word list of scripts/concepts-report.mjs: a word tells you that
 * "פטריות" appears 143 times without a concept, which is true of a farm name and of a blintz as much as
 * of a mushroom. A cluster is the unit a concept is actually written for - a head word plus the varieties
 * that follow it - so the list below can be worked top-down and each line is one round.
 *
 * A cluster is worth a concept when it holds at least MIN_PRODUCTS distinct products or reaches at least
 * MIN_CHAINS chains (Naor, 24.9): a concept exists so that two listings of the same thing can be compared
 * and offered as substitutes, and a product with no sibling has nobody to be compared to. Singleton
 * clusters are counted and then left alone on purpose - `skip` in the totals is not a backlog.
 *
 * Reads data/products.json (what the site actually shows). Prices and the raw files are untouched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const onlyDepartment = opt('department', null);
const TOP = Number(opt('top', 12));
const SAMPLES = Number(opt('samples', 5));
const MIN_PRODUCTS = Number(opt('min-products', 3));
const MIN_CHAINS = Number(opt('min-chains', 2));
const expand = opt('expand', null);

/** Words that open a name without naming the thing, so the cluster key skips them: a cluster called
 * "קפוא" or "מארז" mixes every department together and tells the reader nothing. Kept deliberately short -
 * over-stripping invents clusters that no concept can be written for. */
const LEADING_NOISE = new Set([
  'מארז', 'מבצע', 'חדש', 'קפוא', 'קפואה', 'קפואים', 'טרי', 'טריה', 'טרייה', 'טריים', 'טריות',
  'ארוז', 'ארוזה', 'ארוזים', 'במשקל', 'שקיל', 'מובחר', 'מובחרת', 'אורגני', 'אורגנית',
]);

const head = (name) => {
  const tokens = normalizeText(name).split(' ').filter(Boolean).filter((t) => !/^[\d.%]+$/.test(t));
  const i = tokens.findIndex((t) => !LEADING_NOISE.has(t));
  return i === -1 ? null : tokens[i];
};

const list = loadConcepts();
const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));

const byDepartment = new Map();
for (const p of products) {
  if (onlyDepartment && p.category !== onlyDepartment) continue;
  const d = byDepartment.get(p.category) ?? { total: 0, covered: 0, clusters: new Map() };
  d.total++;
  if (matchingConcepts(p.name, list).length > 0) { d.covered++; byDepartment.set(p.category, d); continue; }
  const key = head(p.name);
  if (!key) { byDepartment.set(p.category, d); continue; }
  const c = d.clusters.get(key) ?? { key, products: 0, chains: 0, names: [] };
  c.products++;
  c.chains = Math.max(c.chains, Number(p.chains) || 0);
  if (c.names.length < 40) c.names.push(p.name);
  d.clusters.set(key, c);
  byDepartment.set(p.category, d);
}

const worth = (c) => c.products >= MIN_PRODUCTS || c.chains >= MIN_CHAINS;

/** `--expand <head>`: the second word of every name in one cluster. A cluster head is a family, not a
 * concept - "פילה" is 155 products and no single rule can be right for all of them. This is the list of
 * varieties the round has to cover, and a round that writes one of them and leaves the rest is exactly the
 * mushroom failure: a family both too broad and too narrow at once. */
if (expand) {
  const key = normalizeText(expand).split(' ')[0];
  const rows = products.filter((p) => (!onlyDepartment || p.category === onlyDepartment) && head(p.name) === key && matchingConcepts(p.name, list).length === 0);
  if (!rows.length) { console.log(`no unassigned products whose name starts with "${expand}"`); process.exit(0); }
  const second = new Map();
  for (const p of rows) {
    const t = normalizeText(p.name).split(' ').filter(Boolean).filter((w) => !/^[\d.%]+$/.test(w) && !LEADING_NOISE.has(w));
    const w = t[1] ?? '(none)';
    const g = second.get(w) ?? { word: w, names: [] };
    g.names.push(p.name);
    second.set(w, g);
  }
  console.log(`${expand}: ${rows.length} products without a concept, ${second.size} varieties by the next word\n`);
  for (const g of [...second.values()].sort((a, b) => b.names.length - a.names.length)) {
    console.log(`  ${String(g.names.length).padStart(4)}×  ${g.word.padEnd(14)} ${g.names.slice(0, SAMPLES).join(' | ')}`);
  }
  console.log(`\nwrite one concept per variety that is a real thing, and say in the round notes which words were left out and why`);
  process.exit(0);
}
const out = [];
const departments = [...byDepartment.entries()].sort((a, b) => (b[1].total - b[1].covered) - (a[1].total - a[1].covered));

console.log(`concepts loaded: ${list.length}   rule: a cluster is worth a concept at >= ${MIN_PRODUCTS} products or >= ${MIN_CHAINS} chains\n`);
for (const [dept, d] of departments) {
  const clusters = [...d.clusters.values()].sort((a, b) => b.products - a.products || b.chains - a.chains);
  const open = clusters.filter(worth);
  const openProducts = open.reduce((s, c) => s + c.products, 0);
  const skipped = clusters.length - open.length;
  const uncovered = d.total - d.covered;
  console.log(`${dept}  ${d.total} products, ${uncovered} without a concept (${Math.round((100 * uncovered) / d.total)}%)`);
  console.log(`  ${open.length} clusters worth a concept holding ${openProducts} products; ${skipped} singleton clusters left alone`);
  for (const c of open.slice(0, TOP)) {
    console.log(`    ${String(c.products).padStart(4)}×  ${c.key.padEnd(14)} ${c.names.slice(0, SAMPLES).join(' | ')}`);
  }
  if (open.length > TOP) console.log(`    ... ${open.length - TOP} more clusters`);
  console.log('');
  out.push({ department: dept, total: d.total, uncovered, open: open.map((c) => ({ key: c.key, products: c.products, chains: c.chains, names: c.names })) });
}

const T = [...byDepartment.values()].reduce((s, d) => s + d.total, 0);
const U = [...byDepartment.values()].reduce((s, d) => s + (d.total - d.covered), 0);
const O = out.reduce((s, d) => s + d.open.reduce((t, c) => t + c.products, 0), 0);
console.log(`TOTAL ${T} products, ${U} without a concept, ${O} of them in clusters worth a concept (${U - O} deliberately left alone)`);
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(out, null, 1));
