#!/usr/bin/env node
/**
 * How findable each concept is by the words a person types. cartBackend's GET /catalog/concepts resolves a phrase
 * against a concept's name and every synonym and has nothing else to go on, so a concept whose synonyms repeat its
 * display name is findable by exactly one phrasing - the "מלפפון חמוץ" failure: the rule matched the product and
 * the word the shopper typed never reached it.
 *
 *   node scripts/concept-synonyms.mjs                      every concept file, thin concepts by products carried
 *   node scripts/concept-synonyms.mjs --file pantry.json   one file
 *   node scripts/concept-synonyms.mjs --check              exit 1 if a phrase names two concepts (the CI form)
 *
 * Two things are reported:
 *   thin       a concept whose synonyms add nothing beyond its own name. Ranked by products carried, because a
 *              thin concept with 600 products costs more searches than one with 3.
 *   shared     a phrase (a name or a synonym) that names two concepts. A resolver cannot pick between them, so it
 *              picks arbitrarily; either the two concepts are one product split by accident (disposable cups were
 *              split by singular and plural until 27.9) or the phrase is too loose to be anyone's synonym - usually
 *              a brand, which is never a synonym (TRAPS.md #2).
 *
 * A synonym is a form people SAY: singular, plural, the construct form (גלידת, not only גלידה), a common spelling
 * variant, the colloquial name. The chains' own raw names are the evidence for which forms exist. Not a brand, not
 * a flavour, not a size.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const onlyFile = opt('file', null);
const check = args.includes('--check');

const list = loadConcepts();
const phrasesOf = (c) => [...new Set([c.name, ...(c.synonyms ?? [])].map(normalizeText).filter(Boolean))];

const owners = new Map();
for (const c of list) for (const p of phrasesOf(c)) owners.set(p, [...(owners.get(p) ?? []), c.id]);
const shared = [...owners].filter(([, ids]) => new Set(ids).size > 1);

if (check) {
  if (shared.length) {
    console.error(`${shared.length} phrase(s) name two or more concepts - a resolver cannot choose between them:`);
    for (const [p, ids] of shared) console.error(`  ${p}  ->  ${[...new Set(ids)].join(', ')}`);
    process.exit(1);
  }
  console.log('no phrase names two concepts');
  process.exit(0);
}

const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const carried = new Map();
for (const p of products) { const h = matchingConcepts(p.name, list); if (h.length === 1) carried.set(h[0].id, (carried.get(h[0].id) ?? 0) + 1); }

const thin = list
  .filter((c) => !onlyFile || c.file === onlyFile)
  .filter((c) => { const ph = phrasesOf(c); return ph.length <= 1; })
  .map((c) => ({ c, n: carried.get(c.id) ?? 0 }))
  .sort((a, b) => b.n - a.n);

console.log(`${thin.length} thin concept(s)${onlyFile ? ` in ${onlyFile}` : ''} - findable by one phrasing only, ranked by products carried:\n`);
for (const { c, n } of thin) console.log(`  ${String(n).padStart(4)}  ${c.id.padEnd(28)} ${c.name.padEnd(24)} [${(c.synonyms ?? []).join(', ')}]  ${onlyFile ? '' : c.file}`);
const mine = shared.filter(([, ids]) => !onlyFile || ids.some((id) => list.find((c) => c.id === id)?.file === onlyFile));
if (mine.length) {
  console.log(`\n${mine.length} phrase(s) naming two concepts${onlyFile ? ' (involving this file)' : ''}:`);
  for (const [p, ids] of mine) console.log(`  ${p.padEnd(22)} ${[...new Set(ids)].map((id) => `${id} [${list.find((c) => c.id === id)?.file}]`).join('  vs  ')}`);
}
