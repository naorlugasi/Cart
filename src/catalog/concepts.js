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
/** The central type-word vocabulary (docs/CONCEPTS.md §9) lives in the same directory but is not a concept
 * list - excluded from conceptFiles() the same way INDEX_FILE is, so loadConcepts() never tries to read it
 * as one. */
export const TYPE_WORDS_FILE = 'type-words.json';
export const conceptFiles = (dir = CONCEPTS_DIR) =>
  readdirSync(dir).filter((f) => f.endsWith('.json') && f !== INDEX_FILE && f !== TYPE_WORDS_FILE).sort();

/** A concept's `kind` says whether it names a fresh or a processed thing (or `any`, for the few concepts
 * where both are legitimately the same concept). Explicit `kind` in the JSON wins; otherwise it is derived
 * from the concept's own category (docs/PLAN-PRODUCT-TRUTH.md stage ו): produce and meat/poultry default to
 * fresh (almost everything else in those categories is a raw cut or a whole fruit/vegetable), deli defaults
 * to processed, and everything else defaults to processed too. A handful of concepts whose id/name is
 * clearly a processed FORM of a fresh-default category (שניצל/נקניק/קבב/המבורגר...) carry an explicit
 * `"kind": "processed"` in their file instead of relying on the default. */
const KIND_VALUES = new Set(['fresh', 'processed', 'any']);
export function deriveKind(category) {
  if (category === 'ירקות ופירות' || category === 'בשר ועוף') return 'fresh';
  return 'processed';
}

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
      if (c.kind !== undefined && !KIND_VALUES.has(c.kind)) throw new Error(`${file}: concept ${c.id} has invalid kind "${c.kind}" (fresh | processed | any)`);
      ids.add(c.id);
      concepts.push({ ...c, kind: c.kind ?? deriveKind(c.category), flavourIsIdentity: !!c.flavourIsIdentity, sizeUnit: c.sizeUnit ?? null, defaultSize: c.defaultSize ?? null, synonyms: c.synonyms ?? [], file,
        _all: compile(c.match.all, `${file} ${c.id}`), _any: compile(c.match.any, `${file} ${c.id}`), _none: compile(c.match.none, `${file} ${c.id}`) });
    }
  }
  return concepts;
}

let cached = null;
export function concepts() { return (cached ??= loadConcepts()); }
export function resetConcepts() { cached = null; typeWordsCached = null; }

/** Load config/concepts/type-words.json: two lists of regex fragments (docs/CONCEPTS.md §9). Same
 * final-letter guard as concept patterns, since both run against the same normalized text. */
export function loadTypeWords(dir = CONCEPTS_DIR) {
  const raw = JSON.parse(readFileSync(path.join(dir, TYPE_WORDS_FILE), 'utf8'));
  const processed = raw.processed ?? [];
  const fresh = raw.fresh ?? [];
  return { processed, fresh, _processed: compile(processed, `${TYPE_WORDS_FILE} processed`), _fresh: compile(fresh, `${TYPE_WORDS_FILE} fresh`) };
}

let typeWordsCached = null;
export function typeWords() { return (typeWordsCached ??= loadTypeWords()); }

/**
 * A product is not the thing it merely tastes, smells or is filled with. "וופל במילוי קרם אגוזים" is a
 * wafer, not walnuts; "אג'קס בניחוח לימון" is a cleaner, not a lemon. The marker and the words it governs
 * are removed before the positive rules run, so a concept's word only counts when the product IS that thing.
 * Exclusions still see the whole name - a `none` may legitimately key off a flavour word.
 */
const FLAVOUR_PHRASE = /(?:^| )(?:בטעמ|בניחוח|בריח|במילוי|בציפוי|בתוספת|תמצית|מצופה)(?:[ ]+[^ ]+){1,3}/gu;
/**
 * The same thing written without the preposition: "טעמי X קרם אגוזים" is a filling just as much as
 * "במילוי קרם אגוזים". Only mid-name, and never where the cream IS the product - "גבינת קרם שמנת"
 * and a name opening with "קרם" keep everything.
 */
const FILLING_PHRASE = /(?<=[^ ] )(?<!גבינת )(?<!גבינה )(?<!שמנת )קרמ(?:[ ]+[^ ]+){1,2}/gu;
export function withoutFlavourPhrases(text) {
  return String(text).replace(FLAVOUR_PHRASE, ' ').replace(FILLING_PHRASE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Does this name say what the product tastes/smells of, or is filled with? Such a name knows more about
 * the product than one that merely contains the word, so the build prefers it when several chains name
 * the same barcode differently (scripts/build-products.mjs, pickConcept). Exported so the marker list
 * lives in one place.
 */
export function hasFlavourMarker(name) {
  const text = normalizeText(name);
  return !!text && withoutFlavourPhrases(text) !== text;
}

/**
 * The central kind guard (docs/PLAN-PRODUCT-TRUTH.md stage ו, docs/CONCEPTS.md §9): before a concept's own
 * `none` runs, a `fresh` concept is blocked by any processed type-word the name carries, and a `processed`
 * concept is blocked when the name's only evidence is a fresh type-word. This replaced dozens of per-concept
 * `none` entries ("תבלינ", "קפוא", "מוחמצ"...) that every fresh-produce concept repeated with one vocabulary,
 * so a new fresh concept does not need to re-invent the list. `any` concepts (herbs sold both fresh and
 * dried, flavour-identity drinks) skip this - it would otherwise block the form the concept exists to allow.
 */
/**
 * Frozen and pre-sliced are a FORM of a raw meat/fish cut, not a different product - "פילה סלמון פרוס טרי"
 * and "חזה בקר פרוס עם עצם טרי" are still the fresh fish/cut, just cut for convenience, and "עוף טחון קפוא"
 * is still ground chicken, just frozen for shelf life. Whether a frozen or sliced product may stand in for
 * a room-temperature one is a substitute-layer question (src/pricing/substituteRules.js `form`), not a
 * concept-assignment one, so these words do not gate a בשר ועוף concept the way they gate ירקות ופירות -
 * frozen peas really are a different aisle and a different concept (frozen-vegetables) from fresh ones, but
 * frozen salmon is still salmon (measured against the real catalog, docs/PLAN-PRODUCT-TRUTH.md stage ו).
 */
const MEAT_FORM_EXEMPT = new Set(['קפוא', 'מוקפא', 'סנפרוסט', 'פרוס', 'קוביות']);

export function passesKindGuard(concept, text) {
  if (concept.kind === 'any') return true;
  const { processed, _processed, fresh, _fresh } = typeWords();
  if (concept.kind === 'fresh') {
    // A concept whose own `all` literally names the processed word is not blocked by it - a concept
    // about pickled cucumbers still needs to match "כבוש".
    const ownAll = concept.match.all.join('\n');
    const meat = concept.category === 'בשר ועוף';
    return !processed.some((word, i) => _processed[i].test(text) && !ownAll.includes(word) && !(meat && MEAT_FORM_EXEMPT.has(word)));
  }
  // processed: only block when the sole evidence is a fresh word and no processed word appears at all.
  // Deliberately conservative (docs/PLAN-PRODUCT-TRUTH.md stage ו) - this is not the mirror of the fresh
  // check above, and it does not look at the concept's own patterns.
  const hasFresh = fresh.some((_, i) => _fresh[i].test(text));
  const hasProcessed = processed.some((_, i) => _processed[i].test(text));
  return !(hasFresh && !hasProcessed);
}

/** Every concept whose rules the (normalized) name satisfies. */
export function matchingConcepts(name, list = concepts()) {
  const text = normalizeText(name);
  if (!text) return [];
  const core = withoutFlavourPhrases(text);
  // For a few concepts the flavour IS the identity - a peach-flavoured water is flavoured water, a
  // strawberry yogurt is fruit yogurt. Those declare `flavourIsIdentity` and read the whole name.
  return list.filter((c) => {
    const positive = c.flavourIsIdentity ? text : core;
    return passesKindGuard(c, positive) && c._all.every((re) => re.test(positive)) && (!c._any.length || c._any.some((re) => re.test(positive))) && !c._none.some((re) => re.test(text));
  });
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
