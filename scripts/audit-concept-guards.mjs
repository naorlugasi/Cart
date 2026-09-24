#!/usr/bin/env node
/**
 * MEASUREMENT TOOL (read-only, no network). Concepts strangled by their own guards.
 *
 *   node scripts/audit-concept-guards.mjs [--min-none 20]
 *
 * A concept accumulates `match.none` entries one round at a time, each one correct on the day it was added.
 * Nothing in the existing audits notices when the guards outgrow the thing they were guarding: every
 * exclusion may still fire, so a dead-rule check finds nothing, while the concept quietly matches less and
 * less. `okra` is the case that named the class - over two hundred exclusions and, today, no product at all
 * (found by the concepts session, 25.9).
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
 * Reported against the LIVE rules over data/products.json, and the header prints both concept counts: the
 * published file was built with whatever rules the runner had at the time, so a concept added since reads as
 * empty here through no fault of its own. That lag caught three sessions in one evening.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { concepts, assignConcept } from '../src/catalog/concepts.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1]; };
const MIN_NONE = Number(opt('min-none') ?? 20);

const list = concepts();
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
