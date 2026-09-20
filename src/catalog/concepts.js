/**
 * Concepts ("חלב 3%", "נייר טואלט"): what the customer means, shared by every brand and chain.
 * Definitions live in config/concepts/*.json (docs/CONCEPTS.md §1). Matching is deterministic:
 * a product belongs to the concept whose `match` rules it satisfies; two matching concepts = conflict.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from './matching.js';

export const CONCEPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'concepts');

const FINAL_LETTERS = /[ךםןףץ]/;
function compile(list = [], where = '') {
  return list.map((p) => {
    // normalizeText maps final letters to their regular form, so a pattern with ך ם ן ף ץ can never match.
    if (FINAL_LETTERS.test(p)) throw new Error(`${where}: pattern "${p}" contains a final-form letter (ך ם ן ף ץ); write the regular form (כ מ נ פ צ), names are normalized`);
    return new RegExp(p, 'iu');
  });
}

/** The list of concept files, published next to them so a consumer reading over HTTP can find them:
 * `readdir` is a disk-only luxury, and a new file that the server cannot discover disappears in production
 * without an error (docs/PIPELINE-CONTRACT.md §6). Written by scripts/build-products.mjs, checked by a test. */
export const INDEX_FILE = 'index.json';
export const conceptFiles = (dir = CONCEPTS_DIR) =>
  readdirSync(dir).filter((f) => f.endsWith('.json') && f !== INDEX_FILE).sort();

/** Load and merge every config/concepts/*.json. Throws on a duplicate id or an invalid rule. */
export function loadConcepts(dir = CONCEPTS_DIR) {
  const concepts = [];
  const ids = new Set();
  for (const file of conceptFiles(dir)) {
    const raw = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.concepts ?? [];
    for (const c of list) {
      if (!c.id || !c.name || !c.match?.all?.length) throw new Error(`${file}: concept ${c.id ?? '?'} needs id, name and match.all`);
      if (ids.has(c.id)) throw new Error(`${file}: duplicate concept id ${c.id}`);
      ids.add(c.id);
      concepts.push({ ...c, sizeUnit: c.sizeUnit ?? null, defaultSize: c.defaultSize ?? null, synonyms: c.synonyms ?? [], file,
        _all: compile(c.match.all, `${file} ${c.id}`), _any: compile(c.match.any, `${file} ${c.id}`), _none: compile(c.match.none, `${file} ${c.id}`) });
    }
  }
  return concepts;
}

let cached = null;
export function concepts() { return (cached ??= loadConcepts()); }
export function resetConcepts() { cached = null; }

/**
 * A product is not the thing it merely tastes, smells or is filled with. "וופל במילוי קרם אגוזים" is a
 * wafer, not walnuts; "אג'קס בניחוח לימון" is a cleaner, not a lemon. The marker and the words it governs
 * are removed before the positive rules run, so a concept's word only counts when the product IS that thing.
 * Exclusions still see the whole name - a `none` may legitimately key off a flavour word.
 */
const FLAVOUR_PHRASE = /(?:^| )(?:בטעמ|בניחוח|בריח|במילוי|בציפוי|בתוספת|תמצית|מצופה)(?:[ ]+[^ ]+){1,3}/gu;
export function withoutFlavourPhrases(text) {
  return String(text).replace(FLAVOUR_PHRASE, ' ').replace(/\s+/g, ' ').trim();
}

/** Every concept whose rules the (normalized) name satisfies. */
export function matchingConcepts(name, list = concepts()) {
  const text = normalizeText(name);
  if (!text) return [];
  const core = withoutFlavourPhrases(text);
  return list.filter((c) => c._all.every((re) => re.test(core)) && (!c._any.length || c._any.some((re) => re.test(core))) && !c._none.some((re) => re.test(text)));
}

/** conceptId for a product name, or null (also null on a conflict - the report surfaces those). */
export function assignConcept(name, list = concepts()) {
  const hits = matchingConcepts(name, list);
  return hits.length === 1 ? hits[0].id : null;
}

export function conceptById(id, list = concepts()) {
  return list.find((c) => c.id === id) ?? null;
}

/** Strip the private regex fields for JSON output. */
export function publicConcept({ _all, _any, _none, file, ...c }) { return c; }
