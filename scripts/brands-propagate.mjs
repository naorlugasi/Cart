#!/usr/bin/env node
/**
 * Spreads a brand the web confirmed on several barcodes to the other products whose name carries it, so a web
 * lookup of 300 barcodes brands 1,500 products instead of 300 (docs/ALIASES.md, 4.10).
 *
 *   node scripts/brands-propagate.mjs [--apply]
 *
 * Trusted brand = a brand string config/products/brands.json holds for at least `--min` (2) different barcodes
 * from a web source, at least 3 characters, not a chain's name, and not a word that is a product noun in this
 * catalog (a brand the web echoed from a product name: "תמר" on dates). A product gets it when its unified name
 * carries exactly one trusted brand as a whole word (two trusted brands in one name = left alone) and its own
 * brand field is a filler or a company line. Entries are written with source "name:<brand>" so they can be told
 * from web-confirmed ones and removed together. Without --apply it only reports. Never touches data/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.DATA_ROOT ?? path.join(ROOT, 'data');
const FILE = path.join(ROOT, 'config', 'products', 'brands.json');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const min = Number(args[args.indexOf('--min') + 1]) || 2;

const NOT_A_BRAND = /^(,|-|לא ידוע|כללי|unknown|n\/a|none)$|בע"?מ|בעמ|\bltd\b|\binc\b|\bco\.|s\.a\.|תעשיות|שיווק|יבוא|הפצה|\d{4,}|רח'|רחוב/i;
const CHAIN_NAMES = new Set(['קרפור', 'שופרסל', 'רמי לוי', 'יוחננוף', 'חצי חינם', 'ויקטורי', 'אושר עד', 'טיב טעם', 'קשת טעמים', 'יינות ביתן', 'שוק סיטי', 'carrefour']);
const needsBrand = (b) => !b || NOT_A_BRAND.test(b) || b.length > 30;
const norm = (s) => normalizeText(String(s ?? '')).replace(/\s+/g, ' ').trim();

const file = JSON.parse(readFileSync(FILE, 'utf8'));
const products = JSON.parse(readFileSync(path.join(DATA_ROOT, 'products.json'), 'utf8')).filter((p) => p.gtin && p.kind !== 'concept');

// A word that names a product in this catalog is not a brand even when a site printed it as one: it has to
// appear as a brand on several barcodes AND not be the leading product noun of many unbranded names.
const countByBrand = new Map();
// ...and it stays within the departments it was confirmed in: מולר the yogurt is not מולר the television.
const deptByBrand = new Map();
const deptOf = new Map(products.map((p) => [p.gtin, p.category]));
for (const [gtin, v] of Object.entries(file.brands)) if (!String(v.source).startsWith('name:')) { const b = norm(v.brand); if (b.length >= 3) { countByBrand.set(b, (countByBrand.get(b) ?? 0) + 1); if (deptOf.get(gtin)) (deptByBrand.get(b) ?? deptByBrand.set(b, new Set()).get(b)).add(deptOf.get(gtin)); } }
const headNoun = new Map();
for (const p of products) { const w = norm(p.name).split(' ')[0]; if (w) headNoun.set(w, (headNoun.get(w) ?? 0) + 1); }
const trusted = [...countByBrand].filter(([b, n]) => n >= min && !CHAIN_NAMES.has(b) && (headNoun.get(b) ?? 0) < 20 * n).map(([b]) => b);
const rejected = [...countByBrand].filter(([b, n]) => n >= min && !trusted.includes(b)).map(([b, n]) => `${b} (${n} barcodes, ${headNoun.get(b) ?? 0} names start with it)`);

let added = 0, several = 0; const byBrand = new Map(); const examples = [];
for (const p of products) {
  if (file.brands[p.gtin] || !needsBrand(p.brand)) continue;
  const n = ` ${norm(p.name)} `;
  const hits = trusted.filter((b) => n.includes(` ${b} `) && deptByBrand.get(b)?.has(p.category));
  if (hits.length !== 1) { if (hits.length > 1) several++; continue; }
  const brand = Object.values(file.brands).find((v) => norm(v.brand) === hits[0])?.brand ?? hits[0];
  byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
  if (examples.length < 20 && Math.random() < 0.02) examples.push(`${p.name.slice(0, 40)} -> ${brand}`);
  if (apply) file.brands[p.gtin] = { brand, source: `name:${brand}`, since: new Date().toISOString().slice(0, 10) };
  added++;
}
console.log(`trusted brands: ${trusted.length} (confirmed on >= ${min} barcodes); rejected as product nouns: ${rejected.length}`);
for (const r of rejected) console.log('  not a brand:', r);
console.log(`products that get a brand from their name (within the brand's own departments): ${added} (${several} carry two trusted brands - left alone)`);
console.log([...byBrand].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([b, n]) => `${b}:${n}`).join('  '));
console.log(examples.join('\n'));
if (apply) {
  file.brands = Object.fromEntries(Object.entries(file.brands).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(FILE, JSON.stringify(file, null, 1) + '\n');
  console.log(`written: ${Object.keys(file.brands).length} brands in ${path.relative(ROOT, FILE)}`);
}
