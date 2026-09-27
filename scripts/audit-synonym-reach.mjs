#!/usr/bin/env node
/**
 * Synonyms that real products carry and their own concept never claims (27.9). The silent-inert shape:
 * `garlic-paste` listed "שום כתוש" as its synonym and required the word ממרח, so it had never matched a single
 * crushed-garlic product, while the synonyms tool counted it as findable. Nothing else sees this - dead-rules
 * checks that an exclusion fires, and the synonyms tool checks that a concept has more than one phrase, but neither
 * checks that a phrase the concept claims to be can reach the products that are it.
 *
 *   node scripts/audit-synonym-reach.mjs            every concept, largest gap first
 *   node scripts/audit-synonym-reach.mjs --min 5    only gaps carried by 5+ products
 *
 * For each synonym whose own text does not resolve to its concept, it finds the raw product names carrying that
 * phrase and reports the concept when it claims NONE of them. Read it, do not act on it blindly: a phrase is a
 * substring, so some hits are words inside other words ("לקים" inside "חלקים") or products the concept refuses on
 * purpose (a cat pate "פטה כבד", a cider "סיידר אגסים"). The rest are rules that cannot reach their own name, and
 * those are worth a measured fix. This is why it is an audit and not a test.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const MIN = Number(args.includes('--min') ? args[args.indexOf('--min') + 1] : 3);
const PRICES = path.join(ROOT, 'data', 'prices');
if (!existsSync(PRICES)) { console.error('needs data/prices/, which only exists on a machine that downloaded the price files'); process.exit(1); }

const names = new Set();
for (const chain of readdirSync(PRICES)) {
  const f = path.join(PRICES, chain, 'catalog.full.json');
  if (!existsSync(f)) continue;
  for (const i of JSON.parse(readFileSync(f, 'utf8')).items ?? []) if (i.name) names.add(i.name);
}
const raw = [...names].map((n) => [n, normalizeText(n)]);
const list = loadConcepts();

const gaps = [];
for (const c of list) {
  for (const s of c.synonyms ?? []) {
    const phrase = normalizeText(s);
    if (phrase.length < 3) continue;
    if (matchingConcepts(s, list).some((x) => x.id === c.id)) continue;
    const carrying = raw.filter(([, t]) => t.includes(phrase));
    if (carrying.length < MIN) continue;
    if (carrying.some(([n]) => matchingConcepts(n, list).some((x) => x.id === c.id))) continue;
    gaps.push({ id: c.id, file: c.file, synonym: s, n: carrying.length, sample: carrying.slice(0, 3).map(([n]) => n) });
  }
}
gaps.sort((a, b) => b.n - a.n);
console.log(`${gaps.length} synonym(s) carried by ${MIN}+ real products that their own concept claims none of:\n`);
for (const g of gaps) console.log(`  ${String(g.n).padStart(4)}  ${g.id.padEnd(26)} "${g.synonym}"  [${g.file}]\n        e.g. ${g.sample.join(' | ')}`);
