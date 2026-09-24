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

// Word-start boundary for a concept's positive rules (docs/CONCEPTS.md §12), the same convention
// src/catalog/categorize.js's wordRule uses for department keywords: a bare Hebrew keyword written as a
// stem ("קולה", "אגוז") is meant to match plurals/construct forms, so the only boundary that's always safe
// is at the START of the match - the character right before it must not be a Hebrew letter. Without it, a
// keyword matches as a *substring* of any longer word that happens to start the same way: "קולה" (cola)
// inside "גוטוקולה" (a hair-mask brand), the same trap docs/CONCEPTS.md already names for "חלבה" inside
// "מחלבה" and "טישו" inside "ארטישוק". Hebrew glues one-letter prefixes onto the word it governs
// (ב/ה/ו/כ/ל/מ/ש - "בקולה", "וקולה"...), so the boundary accepts either the true start of a word or
// exactly one of those seven prefix letters that itself starts a word.
const HEB_RE = /[א-ת]/;
const CONCEPT_PREFIX_LETTERS = new Set(['ב', 'ה', 'ו', 'כ', 'ל', 'מ', 'ש']); // ב ה ו כ ל מ ש

/**
 * A regex-like tester (only `.test(text)` is ever called on `_all`/`_any` - see grep before changing this)
 * whose test() succeeds only when SOME match of `re` starts its Hebrew content at a legitimate word start.
 * The boundary is checked at the first Hebrew letter *inside whatever `re` actually matched*, not at the
 * front of the pattern source - so a pattern that already anchors itself the older, per-pattern way
 * ("(^| )דבש", which consumes the leading space/^ as part of the match) is judged by where "דבש" itself
 * begins, and this reaches the same verdict for it while ALSO accepting a single attached prefix letter
 * that idiom doesn't ("ודבש"). A match with no Hebrew letter at all (a bare number/percent pattern) has
 * nothing to anchor to and is accepted as-is - the boundary is only ever a restriction on Hebrew text.
 */
function wordStartTester(re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return {
    test(text) {
      g.lastIndex = 0;
      let m;
      while ((m = g.exec(text))) {
        const rel = m[0].search(HEB_RE);
        if (rel === -1) return true;
        const at = m.index + rel;
        const before = text[at - 1];
        const beforeBefore = text[at - 2];
        if (!before || !HEB_RE.test(before) || (CONCEPT_PREFIX_LETTERS.has(before) && !HEB_RE.test(beforeBefore ?? ''))) return true;
        if (g.lastIndex === m.index) g.lastIndex++; // don't loop forever on a zero-length match
      }
      return false;
    },
  };
}

/** `boundary: true` (used for a concept's `all`/`any`, never `none` - see matchingConcepts) wraps the
 * compiled pattern in wordStartTester. */
function compile(list = [], where = '', { boundary = false } = {}) {
  return list.map((p) => {
    // normalizeText maps final letters to their regular form, so a pattern with ך ם ן ף ץ can never match.
    if (FINAL_LETTERS.test(p)) throw new Error(`${where}: pattern "${p}" contains a final-form letter (ך ם ן ף ץ); write the regular form (כ מ נ פ צ), names are normalized`);
    const re = new RegExp(p, 'iu');
    return boundary ? wordStartTester(re) : re;
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
/** Hebrew names for derived concept families (docs/CONCEPTS.md §10 mechanism), same reasoning as
 * TYPE_WORDS_FILE: a config file that lives next to the concept lists but is not one itself, so it is
 * excluded from conceptFiles()/index.json the same way - a consumer that read every indexed file as a
 * concept list would parse it and silently find no concepts in it. */
export const FAMILIES_FILE = 'families.json';
export const conceptFiles = (dir = CONCEPTS_DIR) =>
  readdirSync(dir).filter((f) => f.endsWith('.json') && f !== INDEX_FILE && f !== TYPE_WORDS_FILE && f !== FAMILIES_FILE).sort();

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
      if (c.family !== undefined && (typeof c.family.id !== 'string' || !/^[a-z0-9-]+$/.test(c.family.id) || typeof c.family.name !== 'string' || !c.family.name))
        throw new Error(`${file}: concept ${c.id} has invalid family (needs { id: kebab-case ascii, name: non-empty string })`);
      ids.add(c.id);
      concepts.push({ ...c, kind: c.kind ?? deriveKind(c.category), flavourIsIdentity: !!c.flavourIsIdentity, sizeUnit: c.sizeUnit ?? null, defaultSize: c.defaultSize ?? null, synonyms: c.synonyms ?? [], file,
        // boundary: true only for all/any (the positive rules a bare keyword drives); none stays unanchored -
        // an exclusion legitimately keys off a substring of the whole name (docs/CONCEPTS.md §12).
        _all: compile(c.match.all, `${file} ${c.id}`, { boundary: true }), _any: compile(c.match.any, `${file} ${c.id}`, { boundary: true }), _none: compile(c.match.none, `${file} ${c.id}`) });
    }
  }
  // Every concept always resolves to a family (docs/CONCEPTS.md §10 mechanism, see resolveFamily below) -
  // computed once here, against the full merged list, so a caller that only has one concept in hand
  // (conceptById) still sees the same family a caller iterating concepts() would.
  for (const c of concepts) c.family = resolveFamily(c, concepts);
  return concepts;
}

let cached = null;
export function concepts() { return (cached ??= loadConcepts()); }
export function resetConcepts() { cached = null; typeWordsCached = null; familyNamesCached = null; }

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

/**
 * Family (docs/CONCEPTS.md §10): groups concepts that split one shopper-facing sub-category into varieties
 * ("פטריות" → שמפיניון/פורטובלו, "תפוחים" → זהוב/גרנד סמית/חרמון/פינק ליידי) so the storefront can offer a
 * filter chip bar inside a department without re-deriving anything (familiesForCategory below).
 *
 * An explicit `family: { id, name }` on the concept's JSON wins as-is. Otherwise the family is derived: two
 * concepts in the SAME category whose id shares the part before the first hyphen share a family - a bare id
 * with no hyphen counts as its own key, so `zucchini` and `zucchini-dark` share the key `zucchini` just like
 * `mushroom-button` and `mushroom-portobello` share `mushroom`. The family's name comes from an explicit
 * entry in config/concepts/families.json keyed by that prefix; when the prefix has no entry there, the name
 * falls back to the shortest of the sibling concepts' own names. A concept with no sibling is its own family
 * (its own id and name) - every concept always resolves to a family, so a caller never handles "no family".
 */
export function familyKey(id) { const i = id.indexOf('-'); return i === -1 ? id : id.slice(0, i); }

export function resolveFamily(concept, list) {
  if (concept.family) return concept.family;
  const key = familyKey(concept.id);
  const siblings = list.filter((c) => c.category === concept.category && familyKey(c.id) === key);
  if (siblings.length < 2) return { id: concept.id, name: concept.name };
  const known = familyNames()[key];
  if (known) return { id: key, name: known };
  const shortest = siblings.reduce((best, c) => (c.name.length < best.name.length ? c : best));
  return { id: key, name: shortest.name };
}

/** Hebrew names for derived family prefixes (config/concepts/families.json, `{ "_doc": "...", "families":
 * { "mushroom": "פטריות", ... } }`). Same final-letter guard as concept patterns (keys are ascii kebab-case,
 * so this only ever catches a mistake, never a legitimate entry) - kept for the same reason every other
 * loader in this file validates eagerly: a bad key here should fail loudly, not silently mis-name a chip. */
function assertFamilyKey(key) {
  if (FINAL_LETTERS.test(key)) throw new Error(`${FAMILIES_FILE}: prefix "${key}" contains a final-form letter; family prefixes are ascii kebab-case`);
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`${FAMILIES_FILE}: prefix "${key}" must be kebab-case ascii`);
}
export function loadFamilyNames(dir = CONCEPTS_DIR) {
  const raw = JSON.parse(readFileSync(path.join(dir, FAMILIES_FILE), 'utf8'));
  const map = raw.families ?? {};
  for (const key of Object.keys(map)) assertFamilyKey(key);
  return map;
}

let familyNamesCached = null;
export function familyNames() { return (familyNamesCached ??= loadFamilyNames()); }

/** Every family across every category, each with the concept ids that share it. No product counts here -
 * concepts.js never reads products.json - a consumer joins conceptIds against products' conceptFamily
 * downstream (docs/PIPELINE-CONTRACT.md §2.1). */
export function families(list = concepts()) {
  const byKey = new Map(); // `${category} ${family.id}` -> { id, name, category, conceptIds }
  for (const c of list) {
    const fam = resolveFamily(c, list);
    const mapKey = `${c.category} ${fam.id}`;
    if (!byKey.has(mapKey)) byKey.set(mapKey, { id: fam.id, name: fam.name, category: c.category, conceptIds: [] });
    byKey.get(mapKey).conceptIds.push(c.id);
  }
  return [...byKey.values()];
}

/** Families for one department, sorted by name - what a "filter inside ירקות ופירות" chip bar reads
 * (docs/CONCEPTS.md §10, Naor 23.9): `[{ id, name, conceptIds }]`, so the backend never re-derives the
 * grouping. */
export function familiesForCategory(category, list = concepts()) {
  return families(list)
    .filter((f) => f.category === category)
    .map(({ category: _cat, ...f }) => f)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** Strip the private regex fields for JSON output. */
export function publicConcept({ _all, _any, _none, file, ...c }) { return c; }
