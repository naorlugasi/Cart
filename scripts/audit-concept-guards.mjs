#!/usr/bin/env node
/**
 * MEASUREMENT TOOL (read-only, no network). Concepts strangled by their own guards.
 *
 *   node scripts/audit-concept-guards.mjs [--min-none 20]
 *   node scripts/audit-concept-guards.mjs --explain okra      which exclusions actually cost it names
 *
 * A concept accumulates `match.none` entries one round at a time, each one correct on the day it was added.
 * Nothing in the existing audits notices when the guards outgrow the thing they were guarding: every
 * exclusion may still fire, so a dead-rule check finds nothing, while the concept quietly matches less and
 * less. `okra` is the case that named the class - over two hundred exclusions and, today, no product at all
 * (found by the concepts session, 25.9).
 *
 * The accumulation is the camouflage, not the mechanism, which is why --explain exists and why the ranking
 * alone must not be acted on. Run it on okra and 2 of the 185 exclusions cost it anything: the inherited
 * gram-weight guards `גר( |$)` and `גרמ`, refusing "במיה 600 גר" and "במיה ערוגות 800 גרם". The other 183
 * refuse nothing okra would ever have claimed. One guard that matters is invisible inside 183 that do not,
 * and an exclusion that costs nothing looks free to keep, so nobody removes it. That gram guard is also not
 * a bug to delete globally: measured across the catalog it refuses 762 names over 51 concepts and most of
 * those are right - it keeps "חומוס גרגרים" out of prepared hummus and canned tomatoes out of fresh. Loose
 * produce sold packaged by weight, mushrooms and okra, is the exception, so the fix is always per concept.
 *
 * The ratio here is deliberately crude - exclusions per positive pattern - because the real signal is the
 * pairing of a large ratio with few matches. A concept with 200 guards and 200 products is doing its job.
 *
 * Read the output, do not act on it. Two false positives it produces by design: a produce concept carries a
 * long shared `none` list so the fruit words do not cross-match, so 180-250 exclusions is normal there and
 * says nothing on its own; and a seasonal product looks strangled out of season - "תות שדה" reports 238
 * exclusions against 4 matches in September, and the 201 unassigned names carrying תות are flavoured yoghurt,
 * jam, sweets and (via פיתות) pita bread, not strawberries the rule is missing.
 *
 * `--explain <id>` answers the question the ranking raises and cannot: OF this concept's exclusions, which
 * ones actually take away a name its positive rules had claimed, and which refuse nothing it would have
 * matched anyway. The second group is why these lists grow - an exclusion that costs nothing also looks
 * like it costs nothing to keep, so nobody removes it, and the list becomes unreadable to the next round.
 * Cutting the idle ones does not un-strangle a concept; it makes the biting ones visible. Measured over
 * every raw name the chains publish rather than over data/products.json, because a guard is about names and
 * a name can exist in the raw files without reaching the catalog (same reasoning as concept-dead-rules).
 *
 * Reported against the LIVE rules over data/products.json, and the header prints both concept counts: the
 * published file was built with whatever rules the runner had at the time, so a concept added since reads as
 * empty here through no fault of its own. That lag caught three sessions in one evening.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import { concepts, assignConcept, typeWords, passesKindGuard, withoutFlavourPhrases } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1]; };
const MIN_NONE = Number(opt('min-none') ?? 20);

const list = concepts();

if (opt('explain')) { explain(opt('explain')); process.exit(0); }

const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).filter((p) => p.kind !== 'concept');

// Two counts per concept: what the PUBLISHED file says (the conceptId field, which lags), and what the rules
// in this working tree actually match over the same names (the truth for anyone editing rules today).
const published = new Map();
for (const p of products) if (p.conceptId) published.set(p.conceptId, (published.get(p.conceptId) ?? 0) + 1);
const live = new Map();
for (const p of products) { const id = assignConcept(p.name, list); if (id) live.set(id, (live.get(id) ?? 0) + 1); }

const rows = list.map((c) => {
  const none = (c.match?.none ?? []).length;
  const positives = (c.match?.all ?? []).length + (c.match?.any ?? []).length;
  return { id: c.id, name: c.name, file: c.file.replace('.json', ''), none, positives, ratio: positives ? Math.round((10 * none) / positives) / 10 : none, live: live.get(c.id) ?? 0, published: published.get(c.id) ?? 0 };
}).filter((r) => r.none >= MIN_NONE).sort((a, b) => (a.live - b.live) || (b.ratio - a.ratio));

const publishedIds = new Set(published.keys());
console.log(`${list.length} concepts in this working tree; the published data/products.json carries ${publishedIds.size} distinct conceptIds.`);
if (publishedIds.size < list.length * 0.9) console.log(`  note: the published file lags this tree by ${list.length - publishedIds.size} concepts, so its counts are not evidence about new rules.`);
console.log(`\nconcepts with >= ${MIN_NONE} exclusions, fewest live matches first:\n`);
console.log('concept'.padEnd(24), 'none'.padStart(5), 'pos'.padStart(4), 'none/pos'.padStart(9), 'live'.padStart(6), 'published'.padStart(10), '  file');
for (const r of rows.slice(0, 40)) {
  console.log(r.name.slice(0, 23).padEnd(24), String(r.none).padStart(5), String(r.positives).padStart(4), String(r.ratio).padStart(9), String(r.live).padStart(6), String(r.published).padStart(10), '  ' + r.file);
}
const strangled = rows.filter((r) => r.live === 0);
console.log(`\n${strangled.length} of them match nothing at all with the live rules${strangled.length ? ': ' + strangled.map((r) => r.name).join(', ') : ''}`);

/** Which of one concept's exclusions bite, measured over every raw name the chains publish. */
function explain(id) {
  const c = list.find((x) => x.id === id);
  if (!c) { console.error(`no concept "${id}"`); process.exit(1); }
  const PRICES = path.join(ROOT, 'data', 'prices');
  if (!existsSync(PRICES)) { console.error('--explain needs data/prices/, which only exists on a machine that downloaded the price files'); process.exit(1); }
  const names = new Set();
  for (const chain of readdirSync(PRICES)) {
    const f = path.join(PRICES, chain, 'catalog.full.json');
    if (!existsSync(f)) continue;
    for (const i of JSON.parse(readFileSync(f, 'utf8')).items ?? []) if (i.name) names.add(i.name);
  }
  const words = typeWords();
  const claimedByPositives = (text) => {
    if (c._all.length && !c._all.every((re) => re.test(text))) return false;
    if (c._any.length && !c._any.some((re) => re.test(text))) return false;
    return passesKindGuard(c, text, words);
  };
  let kept = 0, refused = 0;
  const cost = new Map();
  for (const raw of names) {
    const text = withoutFlavourPhrases(normalizeText(raw));
    if (!claimedByPositives(text)) continue;
    const i = c._none.findIndex((re) => re.test(text));
    if (i === -1) { kept++; continue; }
    refused++;
    const pattern = (c.match?.none ?? [])[i] ?? `#${i}`;
    const entry = cost.get(pattern) ?? { n: 0, sample: [] };
    entry.n++;
    if (entry.sample.length < 3) entry.sample.push(raw);
    cost.set(pattern, entry);
  }
  console.log(`${c.id} (${c.name}) [${c.file}]`);
  console.log(`  all=${JSON.stringify(c.match?.all ?? [])}`);
  console.log(`  any=${JSON.stringify(c.match?.any ?? [])}`);
  console.log(`  ${c._none.length} exclusions; over ${names.size} raw names it keeps ${kept} and refuses ${refused}.\n`);
  const biting = [...cost.entries()].sort((a, b) => b[1].n - a[1].n);
  console.log(`  exclusions that take a name away (${biting.length}):`);
  for (const [pattern, e] of biting) console.log(`    ${String(e.n).padStart(4)}  ${pattern}   e.g. ${e.sample.join(' | ')}`);
  const idle = (c.match?.none ?? []).filter((x) => !cost.has(x));
  console.log(`\n  ${idle.length} exclusions refuse nothing this concept would have claimed anyway:`);
  console.log(`    ${idle.join(', ')}`);
  console.log(`\n  Removing the idle ones changes no product. It makes the ${biting.length} that do bite readable,`);
  console.log(`  which is the only way the next round can see whether one of them is the reason for a gap.`);
}
