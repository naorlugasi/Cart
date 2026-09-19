#!/usr/bin/env node
/**
 * Concept health, in memory: re-runs assignConcept over data/products.json and compares each concept's
 * declared category with the product's reviewed department (config/categories/labels.json, applied at
 * build time). A concept holding products from another department is matching too broadly - which
 * matters beyond the heading, because substitutes offer the cheapest item sharing a conceptId.
 *
 *   node scripts/concept-health.mjs                       all concept files
 *   node scripts/concept-health.mjs pantry.json ...        only these files
 *   TOP=40 node scripts/concept-health.mjs                 how many offenders to print (0 = count only)
 *
 * Unlike `scripts/category-labels.mjs --concept-health` this reads the concept rules live, so it
 * reflects an edit immediately instead of waiting for the next products:build.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = loadConcepts();
const byId = new Map(list.map((c) => [c.id, c]));
const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const only = process.argv[2] ? new Set(process.argv.slice(2)) : null;
const per = new Map();
for (const p of products) {
  const id = assignConcept(p.name, list);
  if (!id) continue;
  const c = byId.get(id);
  if (only && !only.has(c.file.split('/').pop())) continue;
  const r = per.get(id) ?? { id, name: c.name, cat: c.category, file: c.file.split('/').pop(), all: JSON.stringify(c.match.all), tot: 0, bad: 0, samples: [] };
  r.tot++;
  if (p.category !== c.category) { r.bad++; if (r.samples.length < 6) r.samples.push(`${p.category}\t${p.name}`); }
  per.set(id, r);
}
const rows = [...per.values()].filter((r) => r.bad).sort((a, b) => b.bad - a.bad);
console.log(`${rows.length} concepts hold ${rows.reduce((s, r) => s + r.bad, 0)} products from another department`);
for (const r of rows.slice(0, Number(process.env.TOP ?? 15))) {
  console.log(`\n ${r.bad}/${r.tot}  ${r.id} (${r.name}, ${r.cat}) [${r.file}] all=${r.all}`);
  for (const s of r.samples) console.log(`      ${s}`);
}
