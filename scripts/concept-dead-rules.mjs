#!/usr/bin/env node
/**
 * Rules that never fire. An exclusion matching nothing looks exactly like one that works, and it
 * tells the next reader the case was handled when it was not: "sanytol" guarded a product every chain
 * calls דזיטול, so it matched nothing and the wrong concept stood (docs/CONCEPTS.md §8).
 *
 *   node scripts/concept-dead-rules.mjs [--all]
 *
 * Measured against every name the chains publish (data/prices/<chain>/catalog.full.json), not against
 * data/products.json: a name can exist in the raw files without reaching the unified catalog, and a
 * pattern guarding a seasonal product would otherwise look dead every winter. This is a tool, not a
 * test - the raw files are local to the machine that downloaded them.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES = path.join(ROOT, 'data', 'prices');
if (!existsSync(PRICES)) { console.error('no data/prices - run npm run prices:fetch first'); process.exit(1); }

const names = new Set();
for (const chain of readdirSync(PRICES)) {
  const file = path.join(PRICES, chain, 'catalog.full.json');
  if (!existsSync(file)) continue;
  for (const item of JSON.parse(readFileSync(file, 'utf8')).items) if (item.name) names.add(item.name);
}
const corpus = [...names].map(normalizeText);
console.log(`${corpus.length} distinct names\n`);

const dead = [];
for (const concept of loadConcepts()) {
  for (const group of ['all', 'any', 'none']) {
    const patterns = concept.match[group] ?? [];
    const compiled = concept[`_${group}`] ?? [];
    patterns.forEach((pattern, i) => {
      const re = compiled[i];
      if (!re) return;
      if (!corpus.some((text) => re.test(text))) dead.push({ id: concept.id, file: concept.file.split('/').pop(), group, pattern });
    });
  }
}
if (!dead.length) { console.log('every rule matches at least one published name.'); process.exit(0); }
console.log(`${dead.length} rules match nothing:\n`);
for (const d of dead) console.log(`  ${d.id.padEnd(24)} ${d.file.padEnd(26)} ${d.group.padEnd(5)} ${d.pattern}`);
console.log('\nA dead "all" means the concept can never match. A dead "none" is usually a guess at a name the\nchains do not use - check the real names with scripts/concept-why.mjs before rewriting it.');
