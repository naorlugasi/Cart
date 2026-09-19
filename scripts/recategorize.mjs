#!/usr/bin/env node
/**
 * Re-apply the categories to data/products.json in place, without rebuilding from the price files.
 *
 *   node scripts/recategorize.mjs [--dry]
 *
 * Categories come from categorize() (reviewed label > concept category > keyword rules, docs/CATEGORIES.md),
 * so this is how a labels.json change reaches the shipped catalog. Prices, names and every other field are
 * untouched - rebuilding from data/prices/ would also move prices, and those must only move forward on a
 * real refresh (see the "data rebuild" note in docs/RUNNER-MAC.md).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorize, ICONS } from '../src/catalog/categorize.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'products.json');
const dry = process.argv.includes('--dry');

const products = JSON.parse(readFileSync(FILE, 'utf8'));
if (!Array.isArray(products)) throw new Error('data/products.json is not an array of products');

const moved = [];
for (const p of products) {
  const category = categorize(p.name, p.conceptId ?? null, p.id);
  if (category === p.category) continue;
  moved.push({ name: p.name, from: p.category, to: category });
  p.category = category;
  p.icon = ICONS[category] ?? ICONS['כללי'];
}
products.sort((a, b) => a.category.localeCompare(b.category, 'he') || a.name.localeCompare(b.name, 'he'));

const counts = new Map();
for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
console.log(`${products.length} products, ${moved.length} moved`);
for (const [c, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${c}`);
if (moved.length) {
  const byMove = new Map();
  for (const m of moved) byMove.set(`${m.from} -> ${m.to}`, (byMove.get(`${m.from} -> ${m.to}`) ?? 0) + 1);
  console.log('\nmoves:');
  for (const [k, n] of [...byMove].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
}
if (dry) { console.log('\n--dry: data/products.json not written'); process.exit(0); }
writeFileSync(FILE, `${JSON.stringify(products, null, 1)}\n`);
console.log('\ndata/products.json updated');
