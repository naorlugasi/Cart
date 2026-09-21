#!/usr/bin/env node
/**
 * Why did this barcode get that concept? Prints every name the chains give it and what each one
 * resolves to on its own.
 *
 *   node scripts/concept-why.mjs 7290101869733 [more gtins...]
 *   node scripts/concept-why.mjs --concept lemon-fresh      every barcode currently in that concept
 *
 * The build votes across ALL of a barcode's names (docs/CONCEPTS.md §3), so checking the displayed
 * name alone is misleading: a truncated name that lost "למדיח" still votes, and - the trap that cost
 * us an hour - a name that resolves to null does not vote against anything. It is silent, not a veto.
 * Before changing a rule, check here that the names which actually carry the wrong concept are fixed.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, assignConcept, hasFlavourMarker } from '../src/catalog/concepts.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = loadConcepts();
const args = process.argv.slice(2);

const namesByGtin = new Map();
for (const chain of readdirSync(path.join(ROOT, 'data', 'prices'))) {
  const file = path.join(ROOT, 'data', 'prices', chain, 'catalog.full.json');
  if (!existsSync(file)) continue;
  for (const item of JSON.parse(readFileSync(file, 'utf8')).items) {
    if (!item.gtin || !item.name) continue;
    if (!namesByGtin.has(item.gtin)) namesByGtin.set(item.gtin, []);
    namesByGtin.get(item.gtin).push({ chain, name: item.name });
  }
}

let gtins = args.filter((a) => /^\d{8,14}$/.test(a));
const wanted = args.includes('--concept') ? args[args.indexOf('--concept') + 1] : null;
if (wanted) {
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  gtins = products.filter((p) => p.conceptId === wanted && p.gtin).map((p) => p.gtin);
  console.log(`${gtins.length} barcodes currently in ${wanted}\n`);
}
if (!gtins.length) { console.error('usage: concept-why.mjs <gtin...> | --concept <id>'); process.exit(1); }

for (const gtin of gtins) {
  const names = namesByGtin.get(gtin) ?? [];
  const tally = new Map();
  for (const { name } of names) { const id = assignConcept(name, list); tally.set(id, (tally.get(id) ?? 0) + 1); }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}×${n}`).join('  ');
  console.log(`${gtin}  (${names.length} names)   ${ranked}`);
  for (const { chain, name } of names) {
    const id = assignConcept(name, list);
    console.log(`   ${chain.padEnd(14)} ${(id ?? '-').padEnd(22)} ${hasFlavourMarker(name) ? 'marker ' : '       '} ${name}`);
  }
  console.log();
}
