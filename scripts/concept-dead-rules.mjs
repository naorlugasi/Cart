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
import { loadConcepts, typeWords, passesKindGuard, withoutFlavourPhrases } from '../src/catalog/concepts.js';
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
const perChain = [];
for (const chain of readdirSync(PRICES)) {
  const file = path.join(PRICES, chain, 'catalog.full.json');
  if (!existsSync(file)) continue;
  for (const item of JSON.parse(readFileSync(file, 'utf8')).items) if (item.name) perChain.push({ chain, text: normalizeText(item.name) });
}
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
// A rule can be alive on its own and still block: `all` matches, `any` matches, and no name satisfies
// both. fabric-softener sat empty that way while 44 softeners had no concept - its `any` demanded
// "לכביסה", "מרוכך" or "למייבש" and the chains write plain "מרכך כביסה".
const blocked = [];
for (const concept of loadConcepts()) {
  const passAll = corpus.filter((t) => concept._all.every((re) => re.test(t)));
  if (!passAll.length) continue;
  const passAny = concept._any.length ? passAll.filter((t) => concept._any.some((re) => re.test(t))) : passAll;
  const final = passAny.filter((t) => !concept._none.some((re) => re.test(t)));
  if (!final.length) blocked.push({ id: concept.id, file: concept.file.split('/').pop(), all: passAll.length, any: passAny.length, gate: concept._any.length ? 'any' : 'none' });
}
if (blocked.length) {
  console.log(`${blocked.length} concepts match nothing although their rules are individually alive:\n`);
  for (const b of blocked) console.log(`  ${b.id.padEnd(24)} ${b.file.padEnd(26)} all→${String(b.all).padStart(4)}  after any→${String(b.any).padStart(4)}  final→0   (the ${b.gate} gate empties it)`);
  console.log();
}

// The inverse of a dead rule: one that catches almost everything. A short stem with no context is how
// walnuts came to be "אגוז" and swallowed a wafer, a chocolate bar and three coconut drinks.
const greedy = [];
for (const concept of loadConcepts()) {
  for (const [i, pattern] of (concept.match.all ?? []).entries()) {
    const re = concept._all[i];
    if (!re) continue;
    const hits = corpus.filter((t) => re.test(t)).length;
    // A broad `all` is fine when an `any` narrows it - "גבינה" plus "5%" is a specific cheese. The
    // shape worth reporting is a broad stem with nothing after it, which is what walnuts was.
    if (hits > corpus.length * 0.02 && !concept._any.length) {
      const members = corpus.filter((t) => concept._all.every((r) => r.test(t)) && !concept._none.some((r) => r.test(t))).length;
      greedy.push({ id: concept.id, file: concept.file.split('/').pop(), pattern, hits, members, pct: ((100 * members) / corpus.length).toFixed(1) });
    }
  }
}
if (greedy.length) {
  console.log(`${greedy.length} concepts rest on a broad stem with no \`any\` to narrow it:\n`);
  for (const g of greedy.sort((a, b) => b.members - a.members)) console.log(`  ${g.id.padEnd(24)} ${g.file.padEnd(26)} stem matches ${String(g.hits).padStart(5)}, concept keeps ${String(g.members).padStart(5)} (${g.pct}%)  ${g.pattern}`);
  console.log();
}

// A concept every one of whose products comes from a single chain is usually that chain's product
// line read as a category, not something a customer means.
const oneChain = [];
for (const concept of loadConcepts()) {
  const chains = new Set();
  let members = 0;
  for (const { chain, text } of perChain) {
    if (!concept._all.every((re) => re.test(text))) continue;
    if (concept._any.length && !concept._any.some((re) => re.test(text))) continue;
    if (concept._none.some((re) => re.test(text))) continue;
    members++; chains.add(chain);
  }
  if (members >= 5 && chains.size === 1) oneChain.push({ id: concept.id, file: concept.file.split('/').pop(), members, chain: [...chains][0] });
}
if (oneChain.length) {
  console.log(`${oneChain.length} concepts whose every member comes from one chain:\n`);
  for (const o of oneChain) console.log(`  ${o.id.padEnd(24)} ${o.file.padEnd(26)} ${String(o.members).padStart(4)} names, all from ${o.chain}`);
  console.log();
}

// The central type-word vocabulary (docs/PLAN-PRODUCT-TRUTH.md stage ו, docs/CONCEPTS.md §9) runs before a
// concept's own `none`, so a none entry whose pattern is a vocabulary word is redundant wherever the
// vocabulary already excludes every name that pattern would have excluded - even though the pattern itself
// is very much alive (it matches plenty of real names, just none the vocabulary was not already going to
// reject first). This is a different question from "dead" above: not "does this pattern match anything",
// but "does this pattern's own match ever survive the vocabulary gate". Proven per real name in the corpus,
// the same evidence standard as the rest of this file - a guess at redundancy is exactly the mistake this
// tool exists to catch.
//
// Scoped to `fresh` concepts only, and provably so, not just corpus-lucky: passesKindGuard's fresh
// direction blocks a name whenever it carries a processed vocabulary word (unless the concept's own `all`
// needs that word), which is the EXACT SAME regex test a none entry using that same word performs - so for
// a fresh concept, a none pattern that is verbatim one of the vocabulary's processed words is redundant for
// every possible name, not only the ones the corpus happens to contain. The mirror does not hold for
// `processed` concepts: their guard only blocks on a *fresh* word with no processed evidence, so a none
// entry that is itself a processed word is never covered by it - a "redundant" hit there would really mean
// the entry is simply unexercised by today's catalog (the ordinary "dead" question above, not this one).
const { processed: vocabProcessed, fresh: vocabFresh } = typeWords();
const vocabWords = new Set([...vocabProcessed, ...vocabFresh]);
const redundant = [];
for (const concept of loadConcepts()) {
  if (concept.kind !== 'fresh') continue;
  (concept.match.none ?? []).forEach((pattern, i) => {
    if (!vocabWords.has(pattern)) return; // only exact vocabulary words are candidates - a brand or a
    // narrower pattern is not something the vocabulary can be credited for.
    const re = concept._none[i];
    let survives = false;
    for (const text of corpus) {
      if (!re.test(text)) continue; // this none entry would not have excluded this name anyway
      const core = withoutFlavourPhrases(text);
      const positive = concept.flavourIsIdentity ? text : core;
      if (!concept._all.every((r) => r.test(positive))) continue; // not even a candidate for this concept
      if (concept._any.length && !concept._any.some((r) => r.test(positive))) continue;
      if (!passesKindGuard(concept, positive)) continue; // the vocabulary already rejects this one - not evidence against redundancy
      survives = true; // this real name would need the none entry even after the vocabulary gate runs
      break;
    }
    if (!survives) redundant.push({ id: concept.id, file: concept.file.split('/').pop(), pattern });
  });
}
if (redundant.length) {
  console.log(`${redundant.length} none entries are vocabulary-redundant (provably, against every real name in the corpus):\n`);
  for (const r of redundant) console.log(`  ${r.id.padEnd(24)} ${r.file.padEnd(26)} none  ${r.pattern}`);
  console.log();
}

if (!dead.length) { console.log('every rule matches at least one published name.'); process.exit(blocked.length ? 1 : 0); }
console.log(`${dead.length} rules match nothing:\n`);
for (const d of dead) console.log(`  ${d.id.padEnd(24)} ${d.file.padEnd(26)} ${d.group.padEnd(5)} ${d.pattern}`);
console.log('\nA dead "all" means the concept can never match. A dead "none" is usually a guess at a name the\nchains do not use - check the real names with scripts/concept-why.mjs before rewriting it.');
