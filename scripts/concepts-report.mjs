#!/usr/bin/env node
/**
 * Concept coverage report (docs/CONCEPTS.md §1).
 *
 *   node scripts/concepts-report.mjs [--category "חלב וביצים"] [--unassigned 40] [--private-label] [--json out.json]
 *
 * Runs assignConcept over data/products.json (and, with --private-label, over the private-label items of every
 * chain in data/prices/<chain>/catalog.full.json). Prints coverage per category, conflicts (a name matching
 * several concepts), and the most frequent words among unassigned names so rule authors know what to add next.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';
import { normalizeText, tokenize } from '../src/catalog/matching.js';
import { isPrivateLabel } from '../src/catalog/privateLabel.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const onlyCategory = opt('category', null);
const N_UNASSIGNED = Number(opt('unassigned', 40));

const list = loadConcepts();
const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).map((p) => ({ ...p, source: 'products' }));
let items = products;
if (args.includes('--private-label')) {
  const PRICES = path.join(ROOT, 'data', 'prices');
  for (const chain of readdirSync(PRICES)) {
    const f = path.join(PRICES, chain, 'catalog.full.json');
    if (!existsSync(f)) continue;
    for (const i of JSON.parse(readFileSync(f, 'utf8')).items) if (isPrivateLabel(i, chain)) items.push({ id: `${chain}:${i.code}`, name: i.name, category: 'מותג פרטי ' + chain, source: 'pl:' + chain });
  }
}
if (onlyCategory) items = items.filter((p) => p.category === onlyCategory);

const rows = items.map((p) => ({ p, hits: matchingConcepts(p.name, list) }));
const byCat = new Map();
for (const { p, hits } of rows) { const c = byCat.get(p.category) ?? { total: 0, assigned: 0, conflicts: 0 }; c.total++; if (hits.length === 1) c.assigned++; if (hits.length > 1) c.conflicts++; byCat.set(p.category, c); }
console.log(`concepts: ${list.length} in ${new Set(list.map((c) => c.file)).size} files\n`);
console.log('category                     total assigned    %  conflicts');
for (const [cat, c] of [...byCat.entries()].sort((a, b) => b[1].total - a[1].total)) console.log(`${cat.padEnd(28)} ${String(c.total).padStart(5)} ${String(c.assigned).padStart(8)} ${String(Math.round((100 * c.assigned) / c.total)).padStart(4)}% ${String(c.conflicts).padStart(10)}`);
const all = [...byCat.values()].reduce((s, c) => ({ total: s.total + c.total, assigned: s.assigned + c.assigned, conflicts: s.conflicts + c.conflicts }), { total: 0, assigned: 0, conflicts: 0 });
console.log(`${'TOTAL'.padEnd(28)} ${String(all.total).padStart(5)} ${String(all.assigned).padStart(8)} ${String(Math.round((100 * all.assigned) / all.total)).padStart(4)}% ${String(all.conflicts).padStart(10)}`);

const conflicts = rows.filter((r) => r.hits.length > 1);
if (conflicts.length) { console.log(`\nCONFLICTS (${conflicts.length}) - fix with match.none or a tighter pattern:`); for (const { p, hits } of conflicts.slice(0, 40)) console.log(`  ${p.name}  →  ${hits.map((h) => h.id).join(' + ')}`); }

const unassigned = rows.filter((r) => r.hits.length === 0);
const words = new Map();
for (const { p } of unassigned) for (const t of new Set(tokenize(p.name))) if (!/^\d/.test(t) && t.length > 1) words.set(t, (words.get(t) ?? 0) + 1);
console.log(`\nUNASSIGNED (${unassigned.length}) - most frequent words:`);
console.log('  ' + [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([w, n]) => `${w}(${n})`).join(' '));
console.log(`\nUNASSIGNED samples:`);
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let k = 0; k < Math.min(N_UNASSIGNED, unassigned.length); k++) { const { p } = unassigned[Math.floor(rnd() * unassigned.length)]; console.log(`  [${p.category}] ${p.name}`); }

// per-concept counts, to spot concepts that swallow too much
const perConcept = new Map();
for (const { hits } of rows) if (hits.length === 1) perConcept.set(hits[0].id, (perConcept.get(hits[0].id) ?? 0) + 1);
console.log(`\nLARGEST concepts: ${[...perConcept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => `${id} ${n}`).join(', ')}`);
console.log(`EMPTY concepts: ${list.filter((c) => !perConcept.has(c.id)).map((c) => c.id).join(', ') || 'none'}`);
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(rows.map(({ p, hits }) => ({ id: p.id, name: p.name, category: p.category, concepts: hits.map((h) => h.id) })), null, 1));
