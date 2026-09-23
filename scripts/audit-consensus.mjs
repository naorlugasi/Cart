#!/usr/bin/env node
/**
 * MANUAL AUDIT TOOL - never part of the pipeline (docs/PIPELINE-CONTRACT.md #1). docs/PLAN-PRODUCT-TRUTH.md
 * stage ב, second half: turn what the storefronts said (ops/enrichment/<chain>.json, written by
 * scripts/audit-enrich-products.mjs) into a per-product consensus and compare it with our catalog.
 *
 *   node scripts/audit-consensus.mjs            -> ops/enrichment/consensus.json + a summary on stdout
 *   node scripts/audit-consensus.mjs --write    -> also add `verifiedBy: "chains"` department records to
 *                                                  config/products/verified.json for products where >= 3
 *                                                  chains agree with our department and no high-priority
 *                                                  check is open (Naor, 23.9: automatic at 3 chains)
 *
 * Each chain's category path is translated to one of our departments by config/categories/chain-map.json;
 * paths with no rule are counted and printed so the table can grow. A vote is one chain; sub-chains of one
 * family would double-count, so yochananof_b etc. are folded into their head.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENRICH = path.join(ROOT, 'ops', 'enrichment');
const MAP_FILE = path.join(ROOT, 'config', 'categories', 'chain-map.json');
const VERIFIED_FILE = path.join(ROOT, 'config', 'products', 'verified.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const today = new Date().toISOString().slice(0, 10);

const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).filter((p) => p.kind !== 'concept' && p.gtin);
const map = JSON.parse(readFileSync(MAP_FILE, 'utf8')).chains;
const queue = existsSync(path.join(ROOT, 'data', 'review-queue.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'data', 'review-queue.json'), 'utf8')) : { items: [] };
const highOpen = new Set(queue.items.filter((i) => i.checks.some((c) => c.priority === 'high')).map((i) => i.id));

const enrichment = {};
for (const f of readdirSync(ENRICH).filter((f) => /^[a-z_]+\.json$/.test(f) && f !== 'summary.json' && f !== 'consensus.json')) {
  const j = JSON.parse(readFileSync(path.join(ENRICH, f), 'utf8'));
  if (j.items) enrichment[f.replace('.json', '')] = j.items;
}

const unmapped = {};
function departmentOf(chain, pathArr) {
  const rules = map[chain] ?? [];
  const joined = (pathArr ?? []).join(' > ') || '(none)';
  if (/\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}\.\d{2}/.test(joined)) return { ignore: true }; // a dated promo tree, not a shelf
  for (const r of rules) if (joined.startsWith(r.match)) return r.ignore ? { ignore: true } : { department: r.department, rule: r.match };
  const k = `${chain}: ${(pathArr ?? []).slice(0, 2).join(' > ') || '(none)'}`;
  unmapped[k] = (unmapped[k] ?? 0) + 1;
  return { unknown: true };
}

const rows = [];
const stats = { products: products.length, withAnyChain: 0, votes: {}, agree3: 0, agree2: 0, disagree: 0, noVote: 0, image: 0 };
for (const p of products) {
  const votes = []; const names = []; let image = null; const evidence = [];
  for (const [chain, items] of Object.entries(enrichment)) {
    const it = items[p.gtin]; if (!it) continue;
    names.push({ chain, name: it.name });
    if (!image && it.image) image = it.image;
    const d = departmentOf(chain, it.path);
    evidence.push(`${chain}: ${(it.path ?? []).join(' > ') || '(none)'}`);
    if (d.department) votes.push({ chain, department: d.department });
  }
  if (!names.length) continue;
  stats.withAnyChain++; if (image) stats.image++;
  const tally = {}; for (const v of votes) tally[v.department] = (tally[v.department] ?? 0) + 1;
  const [top] = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const agreeWithUs = tally[p.category] ?? 0;
  const status = !votes.length ? 'no-vote' : agreeWithUs >= 3 ? 'agree3' : agreeWithUs >= 2 && agreeWithUs === votes.length ? 'agree2' : top && top[0] !== p.category && top[1] >= 2 ? 'disagree' : 'mixed';
  stats[status === 'no-vote' ? 'noVote' : status === 'mixed' ? 'disagree' : status] = (stats[status === 'no-vote' ? 'noVote' : status === 'mixed' ? 'disagree' : status] ?? 0) + 1;
  const longest = names.map((n) => n.name).sort((a, b) => b.length - a.length)[0];
  rows.push({ id: p.id, name: p.name, category: p.category, conceptId: p.conceptId, status, votes: tally, chainNames: names, suggestedName: longest && longest.length > p.name.length + 4 ? longest : null, image, evidence, highOpen: highOpen.has(p.id) });
}

const out = { generatedAt: new Date().toISOString(), stats, unmapped: Object.entries(unmapped).sort((a, b) => b[1] - a[1]), rows };
writeFileSync(path.join(ENRICH, 'consensus.json'), JSON.stringify(out, null, 1));
console.log(`products ${stats.products} | seen by a storefront ${stats.withAnyChain} | with image ${stats.image}`);
console.log(`department: agree (>=3 chains) ${stats.agree3} | agree (2, unanimous) ${stats.agree2} | disagree/mixed ${stats.disagree} | no usable vote ${stats.noVote}`);
console.log(`unmapped paths: ${out.unmapped.length} distinct, ${out.unmapped.reduce((n, [, c]) => n + c, 0)} products`);
for (const [k, n] of out.unmapped.slice(0, 40)) console.log(`  ${String(n).padStart(5)}  ${k}`);
const dis = rows.filter((r) => r.status === 'disagree');
console.log(`\ndisagreements (top 30 of ${dis.length}):`);
for (const r of dis.slice(0, 30)) console.log(`  ${r.id} ${r.name.slice(0, 40).padEnd(40)} ours ${r.category.padEnd(16)} chains ${JSON.stringify(r.votes)}`);

if (WRITE) {
  const file = existsSync(VERIFIED_FILE) ? JSON.parse(readFileSync(VERIFIED_FILE, 'utf8')) : { version: 1, records: {} };
  let added = 0;
  for (const r of rows) {
    if (r.status !== 'agree3' || r.highOpen || file.records[r.id]) continue;
    file.records[r.id] = { category: r.category, verifiedBy: 'chains', verifiedAt: today, evidence: r.evidence };
    added++;
  }
  const sorted = {}; for (const k of Object.keys(file.records).sort()) sorted[k] = file.records[k]; file.records = sorted;
  writeFileSync(VERIFIED_FILE, JSON.stringify(file, null, 1) + '\n');
  console.log(`\nverified.json: +${added} department records (chains), total ${Object.keys(file.records).length}`);
}
