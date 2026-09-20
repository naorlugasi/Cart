#!/usr/bin/env node
/**
 * Build and audit config/categories/labels.json - the per-product department review (docs/CATEGORIES.md).
 *
 *   node scripts/category-labels.mjs --merge <dir>   # merge reviewed <dir>/batch-*.tsv (id, category, flag)
 *   node scripts/category-labels.mjs --apply <file>  # apply corrections: "<id>\t<category>\t<anything>" lines
 *   node scripts/category-labels.mjs --report        # coverage, rule disagreements, name drift
 *   node scripts/category-labels.mjs --report --list <מחלקה>   # every product in that department
 *   node scripts/category-labels.mjs --consistency  # products labelled against the rest of their concept
 *   node scripts/category-labels.mjs --concept-health  # concepts that swallowed products: from another
 *       department, and (the blind spot of that test) from their own, where the concept's word is a flavour
 *
 * The review protocol: data/products.json is split into batches of names, every batch is reviewed against
 * docs/CATEGORIES.md, and the result comes back as `<id>\t<category>\t<ok|?>`. --merge validates that every
 * id exists, every category is one of the ten, and nothing was dropped or reordered, then writes the file.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, categorize } from '../src/catalog/categorize.js';
import { conceptById } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';
import { LABELS_FILE, loadCategoryLabels } from '../src/catalog/categoryLabels.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const byId = new Map(products.map((p) => [p.id, p]));
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1]; };

function merge(dir) {
  const files = readdirSync(dir).filter((f) => /^batch-\d+\.tsv$/.test(f)).sort();
  if (!files.length) throw new Error(`no batch-*.tsv in ${dir}`);
  const labels = new Map();
  const unsure = [];
  const problems = [];
  for (const file of files) {
    const lines = readFileSync(path.join(dir, file), 'utf8').split('\n').filter((l) => l.trim());
    for (const [i, line] of lines.entries()) {
      const [id, category, flag] = line.split('\t').map((s) => s?.trim());
      const where = `${file}:${i + 1}`;
      if (!byId.has(id)) { problems.push(`${where}: unknown product id ${id}`); continue; }
      if (!CATEGORIES.includes(category)) { problems.push(`${where}: invalid category "${category}" for ${id}`); continue; }
      if (labels.has(id) && labels.get(id) !== category) problems.push(`${where}: ${id} labelled twice (${labels.get(id)} / ${category})`);
      labels.set(id, category);
      if (flag === '?') unsure.push({ id, category, name: byId.get(id).name });
    }
  }
  const missing = products.filter((p) => !labels.has(p.id));
  console.log(`${files.length} files, ${labels.size}/${products.length} products labelled, ${unsure.length} flagged "?", ${missing.length} missing`);
  for (const p of problems.slice(0, 40)) console.log(`  ! ${p}`);
  if (problems.length > 40) console.log(`  ! ... ${problems.length - 40} more`);
  if (missing.length) {
    writeFileSync(path.join(dir, 'missing.tsv'), missing.map((p) => [p.id, p.name, p.brand ?? '-'].join('\t')).join('\n') + '\n');
    console.log(`  missing ids written to ${path.join(dir, 'missing.tsv')}`);
  }
  writeFileSync(path.join(dir, 'unsure.tsv'), unsure.map((u) => [u.id, u.category, u.name].join('\t')).join('\n') + '\n');
  // Keep any label already in the file for a product this round did not cover.
  const existing = existsSync(LABELS_FILE) ? loadCategoryLabels() : new Map();
  const out = {};
  for (const p of products) {
    const category = labels.get(p.id) ?? existing.get(p.id)?.category;
    if (category) out[p.id] = [category, p.name];
  }
  writeFileSync(LABELS_FILE, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), labels: out }, null, 1)}\n`);
  console.log(`config/categories/labels.json: ${Object.keys(out).length} labels`);
  if (problems.length) process.exitCode = 1;
}

/** Apply a correction file over the existing labels: every line is "<id>\t<category>\t<note>" and the note
 * is ignored. This is how the follow-up rounds land - the products that were flagged uncertain and checked
 * against the chains' own sites, and the ones re-decided against the rest of their concept. */
function apply(file) {
  const labels = loadCategoryLabels();
  let changed = 0;
  let same = 0;
  const problems = [];
  for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    const [id, category] = line.split('\t').map((t) => t?.trim());
    if (!byId.has(id)) { problems.push(`${file}:${i + 1}: unknown product id ${id}`); continue; }
    if (!CATEGORIES.includes(category)) { problems.push(`${file}:${i + 1}: invalid category "${category}"`); continue; }
    if (labels.get(id)?.category === category) { same++; continue; }
    labels.set(id, { category, name: byId.get(id).name });
    changed++;
  }
  for (const p of problems) console.log(`  ! ${p}`);
  const out = {};
  for (const p of products) { const e = labels.get(p.id); if (e) out[p.id] = [e.category, p.name]; }
  writeFileSync(LABELS_FILE, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), labels: out }, null, 1)}\n`);
  console.log(`${path.basename(file)}: ${changed} labels changed, ${same} already matched, ${problems.length} problems`);
  if (problems.length) process.exitCode = 1;
}

function report(listCategory) {
  const labels = loadCategoryLabels();
  const counts = new Map();
  const disagree = [];
  const drift = [];
  for (const p of products) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    const entry = labels.get(p.id);
    if (!entry) continue;
    if (entry.name && entry.name !== p.name) drift.push(`${p.id}: "${entry.name}" -> "${p.name}"`);
    const guess = categorizeWithoutLabel(p);
    if (guess !== entry.category) disagree.push({ id: p.id, name: p.name, label: entry.category, guess });
  }
  console.log(`${products.length} products, ${labels.size} reviewed (${(labels.size / products.length * 100).toFixed(1)}%)`);
  for (const [c, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${c}`);
  console.log(`\nrule disagreements (the keyword fallback would put a reviewed product elsewhere): ${disagree.length}`);
  const pairs = new Map();
  for (const d of disagree) { const k = `${d.guess} -> ${d.label}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(5)}  ${k}`);
  if (drift.length) { console.log(`\nname drift on ${drift.length} labelled products:`); for (const d of drift.slice(0, 20)) console.log(`  ${d}`); }
  if (listCategory) {
    console.log(`\n${listCategory}:`);
    for (const p of products.filter((x) => x.category === listCategory)) console.log(`  ${p.id}\t${p.name}`);
  }
}

/** Two products of the same kind must sit in the same department. Independent reviewers labelling different
 * batches can disagree about a whole kind ("סוללות", "קפסולות קפה", "פריכיות"), and that shows up as one
 * concept carrying two labels. Not every mixture is an error - a concept matches processed forms of its own
 * word too ("ממרח עוגיות לוטוס" really is a pantry spread inside concept `cookies`) - so what this prints is
 * the *minority* of each mixed concept: the short list that is worth looking at one by one.
 */
function consistency() {
  const labels = loadCategoryLabels();
  const byConcept = new Map();
  for (const p of products) {
    const label = labels.get(p.id)?.category;
    if (!label || !p.conceptId) continue;
    const g = byConcept.get(p.conceptId) ?? new Map();
    g.set(label, [...(g.get(label) ?? []), p]);
    byConcept.set(p.conceptId, g);
  }
  let groups = 0;
  let minority = 0;
  const lines = [];
  for (const [conceptId, g] of [...byConcept].sort()) {
    if (g.size < 2) continue;
    groups++;
    const sorted = [...g].sort((a, b) => b[1].length - a[1].length);
    const [majorityCategory] = sorted[0];
    for (const [category, items] of sorted.slice(1)) {
      for (const p of items) {
        minority++;
        lines.push([p.id, category, majorityCategory, conceptId, p.name].join('\t'));
      }
    }
  }
  console.log(`${groups} concepts carry more than one department, ${minority} products are the minority inside their concept`);
  for (const l of lines) console.log(l);
}

/** A concept is what the customer means, and `MappingEngine.resolve` offers the cheapest item sharing a
 * conceptId as a substitute - so a concept that matches too widely does not just mislabel a heading, it
 * offers a chocolate bar as a swap for walnuts. The reviewed departments give a cheap, independent signal
 * for that: a concept whose members sit in a department other than the concept's own has either matched
 * something it should not, or is filed under the wrong department itself. Both are worth a look.
 */
function conceptHealth() {
  const byConcept = new Map();
  for (const p of products) {
    if (!p.conceptId) continue;
    byConcept.set(p.conceptId, [...(byConcept.get(p.conceptId) ?? []), p]);
  }
  const rows = [];
  for (const [id, items] of byConcept) {
    const concept = conceptById(id);
    if (!concept) continue;
    const off = items.filter((p) => p.category !== concept.category);
    if (off.length) rows.push({ id, concept, items, off });
  }
  rows.sort((a, b) => b.off.length - a.off.length);
  const total = rows.reduce((n, r) => n + r.off.length, 0);
  // Two different faults look the same from here, and the fix is not the same:
  // when the *majority* of a concept's products sit elsewhere, the concept itself is filed under the wrong
  // department (change its `category`); when a minority does, the concept matched too widely (tighten `match`).
  const misfiled = rows.filter((r) => r.off.length > r.items.length / 2);
  const wide = rows.filter((r) => r.off.length <= r.items.length / 2);
  const withConcept = products.filter((p) => p.conceptId).length;
  console.log(`${rows.length} concepts hold ${total} products from another department (of ${withConcept} products with a concept)`);
  console.log(`  ${misfiled.length} of them are the concept's own department being wrong (most of its products disagree)`);
  console.log(`  ${wide.length} of them matched too widely (a minority disagrees)`);
  for (const { id, concept, items, off } of rows) {
    const fault = off.length > items.length / 2 ? 'concept department?' : 'matches too widely?';
    console.log(`\n${String(off.length).padStart(3)}/${String(items.length).padEnd(3)} ${id} (${concept.name}, ${concept.category}) - ${fault}  all=[${concept.match.all.join(', ')}]`);
    for (const p of off.slice(0, 8)) console.log(`      ${p.category}\t${p.name}`);
  }
}

/** The department check above is blind to the worst kind of over-matching, because it only sees a product
 * that landed in another department: the walnut concept swallowing Happy Hippo and a chocolate wafer stays
 * invisible there, since all three are sweets. What gives those away is WHERE the concept's own word sits in
 * the name - "במילוי קרם אגוזים" is a filling, "בטעם קטשופ" is a flavour, "בניחוח לימון" is a scent. The
 * word naming the concept, preceded by one of those, means the product is not that thing at all.
 */
const FLAVOUR_MARKER = /בטעמ|במילוי|בציפוי|מצופה|בניחוח|תמצית|נוזל|קרמ|ממולא/;
function flavourMatches() {
  const byConcept = new Map();
  for (const p of products) {
    if (!p.conceptId) continue;
    byConcept.set(p.conceptId, [...(byConcept.get(p.conceptId) ?? []), p]);
  }
  const rows = [];
  for (const [id, items] of byConcept) {
    const concept = conceptById(id);
    if (!concept || FLAVOUR_MARKER.test(normalizeText(concept.name))) continue; // the concept IS a flavoured thing
    const stems = concept.match.all.map((pattern) => new RegExp(pattern, 'iu'));
    const hit = items.filter((p) => {
      const words = normalizeText(p.name).split(' ');
      return words.some((word, i) => stems.some((r) => r.test(word))
        && FLAVOUR_MARKER.test(words.slice(Math.max(0, i - 3), i).join(' ')));
    });
    if (hit.length) rows.push({ id, concept, items, hit });
  }
  rows.sort((a, b) => b.hit.length - a.hit.length);
  const total = rows.reduce((n, r) => n + r.hit.length, 0);
  console.log(`\n${total} products in ${rows.length} concepts carry the concept's own word as a flavour, filling or scent`);
  for (const { id, concept, items, hit } of rows) {
    console.log(`\n${String(hit.length).padStart(3)}/${String(items.length).padEnd(3)} ${id} (${concept.name})  all=[${concept.match.all.join(', ')}]`);
    for (const p of hit.slice(0, 6)) console.log(`      ${p.name}`);
  }
}

/** What the keyword rules alone would say - the label is deliberately ignored here. */
function categorizeWithoutLabel(p) { return categorize(p.name, p.conceptId ?? null, null); }

if (argv.includes('--merge')) merge(opt('merge'));
else if (argv.includes('--apply')) apply(opt('apply'));
else if (argv.includes('--consistency')) consistency();
else if (argv.includes('--concept-health')) { conceptHealth(); flavourMatches(); }
else if (argv.includes('--report')) report(opt('list'));
else { console.error('usage: category-labels.mjs --merge <dir> | --apply <file> | --report [--list <category>] | --consistency | --concept-health'); process.exit(2); }
