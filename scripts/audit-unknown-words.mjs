#!/usr/bin/env node
/**
 * MEASUREMENT TOOL (read-only, no network). Which words the catalog says often are unknown to both the
 * concept layer (config/concepts/*.json) and the department rules (src/catalog/categorize.js)?
 *
 *   node scripts/audit-unknown-words.mjs                 # ranked list
 *   node scripts/audit-unknown-words.mjs --json out.json # same, as data
 *   node scripts/audit-unknown-words.mjs --since old.json  # only what is new since that run (the delta)
 *
 * Method, and the part worth reusing: only the HEAD word of a product name counts - the first content token
 * after the packaging and marketing stopwords. The head word names the thing; everything after it describes
 * the thing. Scanning every token instead returns בניחוח, בסגנון, בתוספת and brand names at the top, because
 * a modifier appears in every aisle: on the 24.9 catalog that was 555 tokens of noise against 69 real product
 * types from the same data (found with the Frontend session's shopping-list importer, 25.9).
 *
 * Ranking is by how many of a word's products are sold by >= WIDE chain families, not by raw product count,
 * because a word carried by many single-chain listings is a long tail while a word carried by widely-sold
 * products is something people actually buy (requested by the concepts session, 25.9).
 *
 * A word listed here is not automatically a missing concept. Two traps, both real:
 *   - a brand can be a head word (קולגייט, ניוואה, אסם). That is a department signal, never a concept. The
 *     `brand?` column is a hint, not a verdict: it is the share of the word's products whose `brand` field
 *     contains the word, which catches פלמוליב 0.80 and לינדט 0.85 but reads 0.00 for מילקה and פנטן, whose
 *     price files name the manufacturer rather than the label. Two other separations were tried and do not
 *     work - head-share (a brand almost always leads) gives קולגייט 0.59 against טבעות 0.53, and department
 *     spread gives לינדט 3 against מברשות 2, and co-occurrence (how many distinct other head words a term
 *     appears under, on the theory that a brand travels and a type word does not) gives brands 2-44 against
 *     type words 1-25, with פקאן at 25 above קולגייט at 4 - a brand can be narrow because it sells one thing,
 *     and a type word can be wide because it is an ingredient. Four signals, four failure axes. A human still
 *     has to read the list.
 *   - a word that names an object in one product line can be a unit in another: כפית is a spoon, and in a
 *     tabletop-sweetener line it is the sugar equivalence ("כפית לכפית"), so a bare keyword there is wrong.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { concepts } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1]; };
const MIN_PRODUCTS = Number(opt('min') ?? 20);
const WIDE = Number(opt('wide') ?? 6); // "sold widely": this many chain families or more

/** Packaging, size and marketing words: they lead a name often but never name the product. */
const STOP = new Set(['גרם', 'ליטר', 'מארז', 'מארזי', 'יחידות', 'יחידה', 'שקית', 'שקיות', 'בקבוק', 'קופסה', 'קופסא', 'צנצנת',
  'פחית', 'קרטון', 'בטעם', 'טעם', 'ללא', 'עם', 'של', 'מן', 'אריזה', 'מהדרין', 'כשר', 'חדש', 'גדול', 'קטן', 'מיני', 'סופר',
  'אקסטרה', 'פרימיום', 'טרי', 'טרייה', 'ארוז', 'ארוזה', 'אורגני', 'אורגנית', 'לבן', 'שחור', 'אדום', 'ירוק', 'צהוב', 'כחול',
  'ורוד', 'זהב', 'כסף', 'שקוף', 'חום', 'מיקס', 'מבצע', 'זוג', 'שלישיה', 'שלישייה', 'רביעיה', 'רביעייה', 'שישייה', 'במשקל',
  'לקג', 'מאגדת', 'רביעיית', 'שלישיית', 'מארזים', 'בתוספת', 'תוספת', 'בניחוח', 'בסגנון', 'מועשר', 'עדין', 'מעולה', 'במיוחד']);

const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).filter((p) => p.kind !== 'concept');
const known = concepts().flatMap((c) => [c.name, ...(c.synonyms ?? [])]).join(' ');

const tally = new Map();
for (const p of products) {
  const [head] = (String(p.name).match(/[א-ת]{3,}/g) ?? []).filter((t) => !STOP.has(t));
  if (!head) continue;
  const e = tally.get(head) ?? { word: head, products: 0, wide: 0, maxChains: 0, brandHits: 0, examples: [] };
  e.products++;
  if ((p.chains ?? 0) >= WIDE) e.wide++;
  if (p.brand && String(p.brand).includes(head)) e.brandHits++;
  e.maxChains = Math.max(e.maxChains, p.chains ?? 0);
  if (e.examples.length < 3) e.examples.push(p.name.slice(0, 40));
  tally.set(head, e);
}

for (const e of tally.values()) e.brandShare = Math.round((100 * e.brandHits) / e.products) / 100;
const rows = [...tally.values()]
  .filter((e) => e.products >= MIN_PRODUCTS && e.maxChains >= WIDE && !known.includes(e.word) && categorize(e.word) === 'כללי')
  .sort((a, b) => b.wide - a.wide || b.products - a.products);

const since = opt('since');
const before = since && existsSync(since) ? new Set(JSON.parse(readFileSync(since, 'utf8')).map((r) => r.word)) : null;
const out = before ? rows.filter((r) => !before.has(r.word)) : rows;

const jsonPath = opt('json');
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(rows, null, 1) + '\n');
console.log(`${products.length} products, ${concepts().length} concepts. Head words carried by >= ${MIN_PRODUCTS} products with one sold by >= ${WIDE} chains, unknown to concepts and to the department rules: ${rows.length}${before ? ` (${out.length} new since ${path.basename(since)})` : ''}\n`);
console.log('word'.padEnd(14), 'widely-sold'.padStart(11), 'products'.padStart(9), 'brand?'.padStart(7), '  examples');
for (const r of out.slice(0, 60)) console.log(r.word.padEnd(14), String(r.wide).padStart(11), String(r.products).padStart(9), r.brandShare.toFixed(2).padStart(7), '  ' + r.examples.join(' | ').slice(0, 50));
if (jsonPath) console.log(`\nfull list -> ${jsonPath}`);
