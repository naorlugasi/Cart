#!/usr/bin/env node
/**
 * IMPORT (measure + optionally apply) for config/substitutes/rules.json `variant.groups[conceptId]` -
 * exclusive kind splits (docs/CONCEPTS.md §4, src/pricing/substituteRules.js) proposed by a human/agent
 * review of scripts/concept-kinds-propose.mjs's candidates. Five reviewer agents write
 * data/local/concept-kinds-review-{pantry,fresh,care,snacks,home}.json, shape:
 *   { concepts: [{ id, name, products, verdict: "kinds"|"none"|"unsure",
 *                  groups: {kindId: [pattern,...]} | null, groupOrder: [kindId,...],
 *                  estimatedCovered, rationale, confidence: "high"|"medium"|"low", attributeWords }] }
 *
 *   node scripts/concept-kinds-import.mjs <review-file>... [--min-confidence high|medium] [--apply] [--replace]
 *
 * Only concepts with verdict "kinds" and confidence >= the threshold (default "high") are considered.
 * Each candidate's groups are first validated (compileRules from src/pricing/substituteRules.js is the
 * ultimate judge - it already throws on a final-form Hebrew letter in a pattern): patterns must compile as
 * RegExp('iu'), carry no ךםןףץ, be non-empty strings; group ids must be kebab-case ASCII; a given
 * groupOrder must list exactly the group ids (used to order the object keys, since JSON key order is
 * priority order in rules.json - the first group a name matches wins, src/pricing/substituteRules.js
 * variantSignature).
 *
 * For every surviving concept this MEASURES on data/products.json + every chain's own name for the same
 * gtin (data/prices/<chain>/catalog.full.json, "the product's own name plus every chain name"): how many
 * of the concept's products match some proposed group, how many match none ("no kind"), and whether any
 * product's various names put it in two different groups (a conflict). The signatures are read with a
 * rules object compiled (compileRules) from the CURRENT rules.json raw object plus this concept's proposed
 * groups merged in - so the real compileGroups/variantSignature machinery decides, not a re-implementation
 * of it here. It also samples up to 2,000 (A, B) pairs among the concept's sized products and compares
 * `compatible` (purpose 'missing', requireSize true) before/after the new groups, to estimate how many
 * pairs the chain-missing-line substitute logic would newly reject.
 *
 * A concept is SKIPPED (never written, whatever --apply says) when: no-kind share > 60% (the split would
 * orphan most of the concept); any product matches two different groups across its names in more than 2%
 * of the concept's products (the groups are not actually exclusive for this concept's real catalog); a
 * pattern/id/groupOrder is invalid; or the concept id is not a real id in config/concepts.
 *
 * Prints one row per considered concept (id, name, products, kinds, covered %, no-kind %, pairs rejected /
 * pairs ok, status) and totals. Without --apply this is read-only beyond the always-written report. With
 * --apply, concepts that would apply are merged into config/substitutes/rules.json `variant.groups`
 * (existing entries and `_doc` preserved; a concept that already has groups there is skipped with a note
 * unless --replace), pretty-printed with the file's own indentation (detected, not assumed) and a trailing
 * newline, and what was written is printed.
 *
 * Always writes data/local/concept-kinds-import-report.json with the full per-concept numbers, apply or not
 * - the lead reviews it independently of the console table.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRules, compatible, variantSignature, RULES_FILE } from '../src/pricing/substituteRules.js';
import { loadConcepts, conceptById } from '../src/catalog/concepts.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.join(ROOT, 'data');
const REPORT_FILE = path.join(ROOT, 'data', 'local', 'concept-kinds-import-report.json');

const FINAL_LETTERS = /[ךםןףץ]/;
const KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };
const NO_KIND_SHARE_LIMIT = 0.6;
const CONFLICT_SHARE_LIMIT = 0.02;
const MAX_IMPACT_PAIRS = 2000;

// ---------------------------------------------------------------------------
// Pure validation (test/conceptKindsImport.test.js)
// ---------------------------------------------------------------------------

/** One pattern: non-empty string, no final-form Hebrew letter, compiles as RegExp('iu'). */
const FINAL_TO_REGULAR = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
/** Folds Hebrew final-form letters in every pattern of a groups object (names are matched in regular forms). */
export function foldGroupFinals(groups) {
  if (!groups || typeof groups !== 'object') return groups;
  const out = {};
  for (const [id, patterns] of Object.entries(groups)) {
    out[id] = Array.isArray(patterns) ? patterns.map((p) => (typeof p === 'string' ? p.replace(/[ךםןףץ]/g, (c) => FINAL_TO_REGULAR[c]) : p)) : patterns;
  }
  return out;
}

export function validatePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) return { ok: false, reason: `empty pattern "${pattern}"` };
  if (FINAL_LETTERS.test(pattern)) return { ok: false, reason: `pattern "${pattern}" has a final-form Hebrew letter` };
  try { new RegExp(pattern, 'iu'); } catch (e) { return { ok: false, reason: `pattern "${pattern}" does not compile: ${e.message}` }; }
  return { ok: true };
}

export function isKebabAsciiId(id) {
  return typeof id === 'string' && KEBAB_ID.test(id);
}

/**
 * Validates a `groups` object ({kindId: [pattern,...]}) and an optional `groupOrder`. Returns
 * { ok: true } or { ok: false, errors: [string,...] } - every problem found, not just the first.
 */
export function validateGroups(groups, groupOrder = null) {
  const errors = [];
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    return { ok: false, errors: ['groups must be an object of {kindId: [pattern,...]}'] };
  }
  const ids = Object.keys(groups);
  if (ids.length === 0) errors.push('groups has no kind ids');
  for (const id of ids) {
    if (!isKebabAsciiId(id)) errors.push(`group id "${id}" is not kebab-case ASCII`);
    const patterns = groups[id];
    if (!Array.isArray(patterns) || patterns.length === 0) {
      errors.push(`group "${id}" has no patterns`);
      continue;
    }
    for (const p of patterns) {
      const v = validatePattern(p);
      if (!v.ok) errors.push(`group "${id}": ${v.reason}`);
    }
  }
  if (groupOrder != null) {
    if (!Array.isArray(groupOrder)) {
      errors.push('groupOrder must be an array');
    } else {
      const orderSet = new Set(groupOrder);
      const idSet = new Set(ids);
      if (orderSet.size !== groupOrder.length) errors.push('groupOrder has duplicate ids');
      for (const id of groupOrder) if (!idSet.has(id)) errors.push(`groupOrder lists unknown group id "${id}"`);
      for (const id of ids) if (!orderSet.has(id)) errors.push(`groupOrder is missing group id "${id}"`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Orders a validated `groups` object's keys per `groupOrder` (JSON key order = priority order in
 *  rules.json). With no groupOrder, keeps the order already in `groups`. */
export function orderGroups(groups, groupOrder = null) {
  if (!Array.isArray(groupOrder) || !groupOrder.length) return { ...groups };
  const out = {};
  for (const id of groupOrder) if (Object.prototype.hasOwnProperty.call(groups, id)) out[id] = groups[id];
  return out;
}

// ---------------------------------------------------------------------------
// Pure merge into a raw rules object (test/conceptKindsImport.test.js)
// ---------------------------------------------------------------------------

/**
 * Merges `orderedGroups` into `rawRules.variant.groups[conceptId]`, preserving every other entry (and any
 * `_doc`). Never mutates `rawRules`. When the concept already has groups there and `replace` is false, the
 * merge is skipped (`{ rules: rawRules, applied: false, reason: 'already-has-groups' }`) - the caller's
 * raw object comes back unchanged (by value, not by reference: still a fresh clone).
 */
export function mergeGroupsIntoRules(rawRules, conceptId, orderedGroups, { replace = false } = {}) {
  const out = { ...rawRules, variant: { ...(rawRules.variant ?? {}) } };
  const existingGroups = { ...(out.variant.groups ?? {}) };
  if (Object.prototype.hasOwnProperty.call(existingGroups, conceptId) && !replace) {
    out.variant.groups = existingGroups;
    return { rules: out, applied: false, reason: 'already-has-groups' };
  }
  out.variant.groups = { ...existingGroups, [conceptId]: orderedGroups };
  return { rules: out, applied: true };
}

// ---------------------------------------------------------------------------
// Pure skip-gate numbers (test/conceptKindsImport.test.js)
// ---------------------------------------------------------------------------

/**
 * For one concept's products (each `{ gtin, name, ... }`) and their known names (own name + every chain
 * name for the gtin, via `namesByGtin`), computes, against a compiled rules object `r2` that already has
 * the proposed groups for `conceptId`: how many products match >=1 group ("covered"), how many match none
 * ("no kind"), and which products match two different groups across their names (a conflict). A product's
 * matched-group set is the union, across every name it is known by, of `variantSignature(name, r2,
 * conceptId)` (each call returns at most one group id, since the groups are exclusive).
 */
export function measureConcept({ products, namesByGtin, conceptId, r2 }) {
  let covered = 0;
  let noKind = 0;
  const conflicts = [];
  for (const product of products) {
    const names = [product.name, ...(namesByGtin.get(product.gtin) ?? [])].filter(Boolean);
    const matched = new Set();
    for (const name of names) for (const g of variantSignature(name, r2, conceptId)) matched.add(g);
    if (matched.size === 0) noKind++;
    else covered++;
    if (matched.size > 1) conflicts.push({ gtin: product.gtin, name: product.name, groups: [...matched].sort() });
  }
  const total = products.length;
  return {
    total,
    covered,
    noKind,
    noKindShare: total ? noKind / total : 0,
    coveredShare: total ? covered / total : 0,
    conflicts,
    conflictShare: total ? conflicts.length / total : 0,
  };
}

// ---------------------------------------------------------------------------
// Pure impact sampling (test/conceptKindsImport.test.js)
// ---------------------------------------------------------------------------

/**
 * Deterministic sample of up to `maxPairs` unordered index pairs [i, j] (i < j) over `n` items, evenly
 * strided across the full C(n,2) pair space so a capped sample still spans the whole list rather than only
 * its front. Returns an array of [i, j] pairs. Pure, no I/O - the actual products never pass through here.
 */
export function samplePairs(n, maxPairs = MAX_IMPACT_PAIRS) {
  const total = (n * (n - 1)) / 2;
  if (total <= 0) return [];
  const all = () => {
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    return pairs;
  };
  if (total <= maxPairs) return all();
  const full = all();
  const stride = full.length / maxPairs;
  const out = [];
  for (let k = 0; k < maxPairs; k++) out.push(full[Math.min(full.length - 1, Math.floor(k * stride))]);
  return out;
}

/**
 * Among `sizedProducts` (already filtered to products with a known size), samples up to `maxPairs` pairs
 * and compares `compatible` (purpose 'missing', requireSize) under `beforeRules` vs `afterRules`. Returns
 * { pairsOk, pairsRejected }: `pairsOk` is how many pairs `compatible` accepts today (beforeRules);
 * `pairsRejected` is how many of exactly those the new groups (afterRules) would reject.
 */
export function impactForConcept({ sizedProducts, requireSize, beforeRules, afterRules, maxPairs = MAX_IMPACT_PAIRS }) {
  const pairs = samplePairs(sizedProducts.length, maxPairs);
  let pairsOk = 0;
  let pairsRejected = 0;
  for (const [i, j] of pairs) {
    const a = sizedProducts[i];
    const b = sizedProducts[j];
    const before = compatible({ product: a, candidate: b, requireSize, purpose: 'missing' }, beforeRules);
    if (!before.ok) continue;
    pairsOk++;
    const after = compatible({ product: a, candidate: b, requireSize, purpose: 'missing' }, afterRules);
    if (!after.ok) pairsRejected++;
  }
  return { pairsOk, pairsRejected };
}

// ---------------------------------------------------------------------------
// Per-concept evaluation (combines the pure pieces above with the real data; still takes everything as
// arguments so it stays testable without real files)
// ---------------------------------------------------------------------------

export function evaluateConcept({ entry, concept, products, namesByGtin, rawRules, maxPairs = MAX_IMPACT_PAIRS }) {
  const base = { id: entry.id, name: entry.name ?? concept?.name ?? entry.id };

  if (!concept) return { ...base, status: 'skip', reason: 'unknown-concept' };

  // Names are normalized to regular letter forms before matching, so a reviewer's לעוף / לילך / חלבון is the
  // same word as לעופ / לילכ / חלבונ - fold it rather than throw the whole concept out (11.10: three of 13).
  const groups = foldGroupFinals(entry.groups);
  const validation = validateGroups(groups, entry.groupOrder ?? null);
  if (!validation.ok) return { ...base, status: 'skip', reason: 'invalid-pattern', errors: validation.errors };

  const orderedGroups = orderGroups(groups, entry.groupOrder ?? null);

  let r2;
  try {
    const modifiedRaw = mergeGroupsIntoRules(rawRules, entry.id, orderedGroups, { replace: true }).rules;
    r2 = compileRules(modifiedRaw);
  } catch (e) {
    return { ...base, status: 'skip', reason: 'invalid-pattern', errors: [e.message] };
  }

  const conceptProducts = products.filter((p) => p.conceptId === entry.id);
  const measured = measureConcept({ products: conceptProducts, namesByGtin, conceptId: entry.id, r2 });

  // A single marked kind (latex pacifiers, swim diapers, aluminium "cast-iron" pans) splits the concept into
  // "marked" and "the default": the default IS the no-kind side, and the engine already pairs no-kind
  // products only with each other - so the no-kind share is the point, not a problem. The limit guards the
  // other shape: two or more named kinds that most names do not carry at all.
  // `defaultKind: true` on a review entry says the same about a multi-kind split: the unmarked products ARE
  // the regular article (plain lentils, plain white flour, regular diapers next to swim / adult / pants).
  if (Object.keys(orderedGroups).length >= 2 && entry.defaultKind !== true && measured.noKindShare > NO_KIND_SHARE_LIMIT) {
    return { ...base, status: 'skip', reason: 'no-kind', measured, groups: orderedGroups };
  }
  if (measured.conflictShare > CONFLICT_SHARE_LIMIT) {
    return { ...base, status: 'skip', reason: 'conflict', measured, groups: orderedGroups };
  }

  const requireSize = (concept.sizeUnit ?? null) !== null;
  const sizedProducts = conceptProducts.filter((p) => p.size);
  const r1 = compileRules(rawRules);
  const impact = impactForConcept({ sizedProducts, requireSize, beforeRules: r1, afterRules: r2, maxPairs });

  return { ...base, status: 'apply', measured, impact, groups: orderedGroups };
}

// ---------------------------------------------------------------------------
// I/O helpers (real files only; never used by tests)
// ---------------------------------------------------------------------------

function loadProducts(dataRoot = DATA_ROOT) {
  return JSON.parse(readFileSync(path.join(dataRoot, 'products.json'), 'utf8'));
}

/** gtin -> every name a chain publishes for it (data/prices/<chain>/catalog.full.json). Mirrors
 *  scripts/concept-kinds-propose.mjs loadNamesByGtin. */
function loadNamesByGtin(dataRoot = DATA_ROOT) {
  const dir = path.join(dataRoot, 'prices');
  const byGtin = new Map();
  if (!existsSync(dir)) return byGtin;
  for (const chain of readdirSync(dir)) {
    const file = path.join(dir, chain, 'catalog.full.json');
    if (!existsSync(file)) continue;
    let catalog;
    try { catalog = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    for (const item of catalog.items ?? []) {
      if (!item.gtin || !item.name) continue;
      if (!byGtin.has(item.gtin)) byGtin.set(item.gtin, []);
      byGtin.get(item.gtin).push(item.name);
    }
  }
  return byGtin;
}

/** The raw rules.json text's own indentation (spaces before the first nested key) - never assumed, so a
 *  future reformat of the file is respected rather than silently fought on the next --apply. */
function detectIndent(text) {
  const m = text.match(/\n( +)"/);
  return m ? m[1].length : 1;
}

function loadReviewFiles(files) {
  const concepts = [];
  for (const file of files) {
    const abs = path.resolve(file);
    if (!existsSync(abs)) { console.error(`missing review file: ${file}`); process.exit(1); }
    const parsed = JSON.parse(readFileSync(abs, 'utf8'));
    for (const c of parsed.concepts ?? []) concepts.push({ ...c, _sourceFile: file });
  }
  return concepts;
}

function parseArgs(argv) {
  const files = [];
  let minConfidence = 'high';
  let apply = false;
  let replace = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--min-confidence') { minConfidence = argv[++i]; }
    else if (a === '--apply') apply = true;
    else if (a === '--replace') replace = true;
    else if (a.startsWith('--')) { console.error(`unknown flag ${a}`); process.exit(1); }
    else files.push(a);
  }
  if (!files.length) {
    console.error('usage: node scripts/concept-kinds-import.mjs <review-file>... [--min-confidence high|medium] [--apply] [--replace]');
    process.exit(1);
  }
  if (!CONFIDENCE_RANK[minConfidence]) { console.error(`--min-confidence must be high|medium|low, got "${minConfidence}"`); process.exit(1); }
  return { files, minConfidence, apply, replace };
}

function pct(x) { return `${Math.round(x * 1000) / 10}%`; }

function printTable(rows) {
  const header = ['id', 'name', 'products', 'kinds', 'covered%', 'no-kind%', 'rejected/ok', 'status'];
  const lines = [header];
  for (const r of rows) {
    const products = r.measured?.total ?? 0;
    const kinds = r.groups ? Object.keys(r.groups).length : 0;
    const covered = r.measured ? pct(r.measured.coveredShare) : '-';
    const noKind = r.measured ? pct(r.measured.noKindShare) : '-';
    const rejOk = r.impact ? `${r.impact.pairsRejected}/${r.impact.pairsOk}` : '-';
    const status = r.status === 'apply' ? 'would apply' : `skipped: ${r.reason}`;
    lines.push([r.id, r.name, String(products), String(kinds), covered, noKind, rejOk, status]);
  }
  const widths = header.map((_, i) => Math.max(...lines.map((l) => String(l[i]).length)));
  for (const line of lines) console.log(line.map((cell, i) => String(cell).padEnd(widths[i])).join('  '));
}

function run() {
  const { files, minConfidence, apply, replace } = parseArgs(process.argv.slice(2));
  const threshold = CONFIDENCE_RANK[minConfidence];

  const products = loadProducts();
  const namesByGtin = loadNamesByGtin();
  const concepts = loadConcepts();

  const reviewConcepts = loadReviewFiles(files);
  const seen = new Set();
  const considered = [];
  for (const entry of reviewConcepts) {
    if (entry.verdict !== 'kinds') continue;
    const rank = CONFIDENCE_RANK[entry.confidence] ?? 0;
    if (rank < threshold) continue;
    if (seen.has(entry.id)) { console.error(`duplicate concept "${entry.id}" across review files - keeping the first, ignoring ${entry._sourceFile}`); continue; }
    seen.add(entry.id);
    considered.push(entry);
  }

  const rulesText = readFileSync(RULES_FILE, 'utf8');
  const rawRules = JSON.parse(rulesText);
  const indent = detectIndent(rulesText);

  const rows = considered.map((entry) => evaluateConcept({
    entry,
    concept: conceptById(entry.id, concepts),
    products,
    namesByGtin,
    rawRules,
  }));

  printTable(rows);

  const wouldApply = rows.filter((r) => r.status === 'apply');
  const skipped = rows.filter((r) => r.status !== 'apply');
  const totalCoveredProducts = wouldApply.reduce((s, r) => s + (r.measured?.covered ?? 0), 0);
  console.log(`\n${rows.length} concept(s) considered (verdict "kinds", confidence >= ${minConfidence}): ${wouldApply.length} would apply, ${skipped.length} skipped. ${totalCoveredProducts} products covered across the concepts that would apply.`);

  mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), minConfidence, files, concepts: rows }, null, 1) + '\n');
  console.log(`full per-concept numbers written to ${path.relative(ROOT, REPORT_FILE)}`);

  if (apply) {
    let current = rawRules;
    const written = [];
    const alreadyHasGroups = [];
    for (const r of wouldApply) {
      const merge = mergeGroupsIntoRules(current, r.id, r.groups, { replace });
      if (!merge.applied) { alreadyHasGroups.push(r.id); continue; }
      current = merge.rules;
      written.push(r.id);
    }
    if (written.length) {
      writeFileSync(RULES_FILE, JSON.stringify(current, null, indent) + '\n');
    }
    console.log(`\n--apply: wrote variant.groups for ${written.length} concept(s) to ${path.relative(ROOT, RULES_FILE)}: ${written.join(', ') || '(none)'}`);
    if (alreadyHasGroups.length) console.log(`already had groups, skipped (use --replace to overwrite): ${alreadyHasGroups.join(', ')}`);
  } else {
    console.log('\n(dry run - pass --apply to write variant.groups into config/substitutes/rules.json)');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
