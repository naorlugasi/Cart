/**
 * Concepts ("חלב 3%", "נייר טואלט"): what the customer means, shared by every brand and chain.
 * Definitions live in config/concepts/*.json (docs/CONCEPTS.md §1). Matching is deterministic:
 * a product belongs to the concept whose `match` rules it satisfies; two matching concepts = conflict.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, levenshtein } from './matching.js';
import { NOT_A_BRAND } from './brands.js';

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

/** A pattern that is nothing but Hebrew/Latin letters - no regex metacharacters, no spaces - i.e. a bare
 * keyword a concept author wrote as a stem ("קרמבו", "ליימ"), as opposed to a regex someone deliberately
 * built (`"מ.?ל"`) or a multi-word phrase (`"בטעם לימון"`). Only this shape gets the same word-start
 * boundary that `all`/`any` already require (engine fix 12.10, docs/CONCEPTS.md §12) when it is used in a
 * `none` list - see the `boundaryIfPlainWord` option on `compile` below. */
const PLAIN_WORD_RE = /^[a-zA-Zא-ת]+$/;
export const isPlainWordPattern = (p) => PLAIN_WORD_RE.test(p);

/** `boundary: true` (used for a concept's `all`/`any`) wraps every compiled pattern in wordStartTester.
 * `boundaryIfPlainWord: true` (used for `none`, engine fix 12.10) wraps it ONLY when the pattern is a bare
 * word (`isPlainWordPattern`) - a `none` regex or multi-word phrase keeps matching as a substring of the
 * whole name exactly as before (docs/CONCEPTS.md §1: "`none` stays unanchored - an exclusion legitimately
 * keys off a substring of the whole name"). The boundary is never anchored at the END: a `none` stem must
 * still catch its own plural ("זית" inside "זיתים"), the same reason `all`/`any` don't anchor there either.
 * A `none` word that must match INSIDE a word (a loanword, a glued brand, two stacked prefixes) is written
 * `"[א-ת]*X"` - "any letters, then X" (`"[א-ת]*בורגר"` for "המבורגר", docs/CONCEPTS.md §16). */
function compile(list = [], where = '', { boundary = false, boundaryIfPlainWord = false } = {}) {
  return list.map((p) => {
    // normalizeText maps final letters to their regular form, so a pattern with ך ם ן ף ץ can never match.
    if (FINAL_LETTERS.test(p)) throw new Error(`${where}: pattern "${p}" contains a final-form letter (ך ם ן ף ץ); write the regular form (כ מ נ פ צ), names are normalized`);
    const re = new RegExp(p, 'iu');
    if (boundary) return wordStartTester(re);
    if (boundaryIfPlainWord && isPlainWordPattern(p)) return wordStartTester(re);
    return re;
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
        // boundary: true for all/any (the positive rules a bare keyword drives). none gets the same
        // word-start boundary ONLY when the entry is a bare word (boundaryIfPlainWord, engine fix 12.10) -
        // a regex or multi-word phrase in none still keys off a substring of the whole name, unchanged
        // (docs/CONCEPTS.md §12).
        _all: compile(c.match.all, `${file} ${c.id}`, { boundary: true }), _any: compile(c.match.any, `${file} ${c.id}`, { boundary: true }), _none: compile(c.match.none, `${file} ${c.id}`, { boundaryIfPlainWord: true }),
        // The kind guard asks whether the concept's own `all` literally names a processed word. That answer
        // depends only on the concept, so it is computed once here rather than re-joined on every call - it
        // was allocating a string per (concept, name) pair, which is 74 million allocations in one build.
        _ownAll: (c.match.all ?? []).join('\n'),
        // The RAW `all`/`any` pattern strings as Sets, for the specificity tie-break (engine fix 12.10,
        // refines/resolveSpecificity below) - it compares the literal pattern lists, not what they match.
        _allSet: new Set(c.match.all ?? []), _anySet: new Set(c.match.any ?? []) });
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
  const pet = raw.pet ?? [];
  // One alternation for the whole pet vocabulary, so it is tested once per name rather than once per concept.
  compile(pet, `${TYPE_WORDS_FILE} pet`); // same final-letter check as every other pattern
  const _pet = pet.length ? new RegExp(pet.map((p) => `(?:${p})`).join('|'), 'iu') : null;
  // Vegan (Naor, 28.9): a product of its own, so it matches no animal-product concept (`veganScope`).
  const vegan = raw.vegan ?? [];
  compile(vegan, `${TYPE_WORDS_FILE} vegan`);
  const _vegan = vegan.length ? new RegExp(vegan.map((p) => `(?:${p})`).join('|'), 'iu') : null;
  const scope = raw.veganScope ?? {};
  const scopeCategories = new Set(scope.categories ?? []);
  const scopeConcepts = new Set(scope.concepts ?? []);
  const scopeExempt = new Set(scope.exempt ?? []);
  const _inVeganScope = (c) => !scopeExempt.has(c.id) && (scopeCategories.has(c.category) || scopeConcepts.has(c.id));
  return { processed, fresh, pet, vegan, _processed: compile(processed, `${TYPE_WORDS_FILE} processed`), _fresh: compile(fresh, `${TYPE_WORDS_FILE} fresh`), _pet, _vegan, _inVeganScope };
}

let typeWordsCached = null;
export function typeWords() { return (typeWordsCached ??= loadTypeWords()); }

/**
 * A product is not the thing it merely tastes, smells or is filled with. "וופל במילוי קרם אגוזים" is a
 * wafer, not walnuts; "אג'קס בניחוח לימון" is a cleaner, not a lemon. The marker and the words it governs
 * are removed before the positive rules run, so a concept's word only counts when the product IS that thing.
 * Exclusions still see the whole name - a `none` may legitimately key off a flavour word.
 *
 * Engine fix 12.10 (docs/CONCEPTS.md §16, Naor's "the stripper must not delete the product"): the 1-3 words
 * a marker governs stop BEFORE a number - "יוגורט בטעם וניל 25 חלבון" is a protein yogurt, and the old
 * unconditional 3 words ate "25 חלבון" with the vanilla; "בניחוח מאושן 10 מטליות" keeps its count.
 *
 * Opus review 12.10 removed a second stop the first version had (before any word that is some concept's
 * one-word `all`, a "head noun"): the head nouns of 3,000 concepts include every fruit, herb, spice,
 * cheese and meat, which are exactly the words a flavour list is made of, so the span stopped one word
 * into "בטעם מנגו אננס", "תמצית פרחי רימון", "במילוי בשר בקר" and leaked the second flavour into the core -
 * measured over every name: 20 right gains against 17 wrong ones (a body wash as pomegranate, a wafer as
 * flour, a cheddar-flavoured pretzel as cheddar) plus 6 names lost. A null is silent; a wrong concept is
 * a wrong product on the shelf, so the stop went.
 */
const FLAVOUR_MARKERS = ['בטעמ', 'בניחוח', 'בריח', 'במילוי', 'בציפוי', 'בתוספת', 'תמצית', 'מצופה'];
// Each governed word must not be a bare number ("25", "3.5", "9%"): that is a size or a spec, never a flavour.
const FLAVOUR_PHRASE = new RegExp(`(?:^| )(?:${FLAVOUR_MARKERS.join('|')})(?:[ ]+(?![0-9]+(?:[.][0-9]+)?%?(?: |$))[^ ]+){1,3}`, 'gu');

/**
 * The same thing written without the preposition: "טעמי X קרם אגוזים" is a filling just as much as
 * "במילוי קרם אגוזים". Only mid-name, and never where the cream IS the product - "גבינת קרם שמנת"
 * and a name opening with "קרם" keep everything.
 *
 * Engine fix 12.10: nor where "קרם" + the next word (with the ordinary "ל" - for - prefix the chains'
 * names carry, "קרם לידיים") already names a skincare/haircare product in its own right - hand/face/day/
 * night/eye/body/hair/multi-purpose/protection/curl/defining/anti-* cream IS the product, not a filling
 * describing some other one ("קרם ידיים" is hand cream, not a hint that some other product is filled
 * with hand cream).
 */
// Opus review 12.10 added the words the remaining cream flags were covering for (measured: every name each
// cream concept lost when its flavourIsIdentity came off): detangling (מתיר), combing (סירוק), care/
// treatment (טיפוח/טיפול), gel (ג'ל, normalized גל), diaper (החתלה), hair removal (הסרת), q10.
const CREAM_IS_PRODUCT_RE = ' (?:(?:ל)?(?:ידיימ|פנימ|לחות|יומ|לילה|עיניימ|גופ|שיער|רב שימושי|הגנה|תלתלימ|מגדיר|אנטי|מתיר|סירוק|טיפוח|טיפול|גל|החתלה|הסרת)(?![א-ת])|q10)';
const FILLING_PHRASE = new RegExp(`(?<=[^ ] )(?<!גבינת )(?<!גבינה )(?<!שמנת )קרמ(?!${CREAM_IS_PRODUCT_RE})(?:[ ]+[^ ]+){1,2}`, 'gu');

// Takes no concept list on purpose: cartBackend vendors this file and calls withoutFlavourPhrases(text) for
// search, where no config/concepts directory exists next to the vendored copy - a default of concepts()
// here would throw ENOENT on the backend's first search after the next sync (Opus review 12.10).
export function withoutFlavourPhrases(text) {
  return String(text).replace(FLAVOUR_PHRASE, ' ').replace(FILLING_PHRASE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Does this name say what the product tastes/smells of, or is filled with? Such a name knows more about
 * the product than one that merely contains the word, so the build prefers it when several chains name
 * the same barcode differently (scripts/build-products.mjs, pickConcept). Exported so the marker list
 * lives in one place. ("לוריאל קרם יום" no longer counts - not because fillings stopped counting, but
 * because FILLING_PHRASE above no longer treats a day cream as a filling.)
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
    const ownAll = concept._ownAll ?? concept.match.all.join('\n');
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

/**
 * Engine fix 12.10 (docs/CONCEPTS.md §16): the specific concept beats the general one - but only when
 * "specific" is provable from the rules themselves. Concept A refines concept B when every name A's
 * positive rules accept is one B's positive rules accept too, read off the raw pattern strings:
 *   - A's `all` is a strict superset of B's `all` (every pattern B requires, A requires verbatim, plus
 *     at least one more), and
 *   - B's `any`, if it has one, is already guaranteed by A: one of B's `any` patterns sits in A's `all`,
 *     or A has an `any` of its own that is a subset of B's.
 * The second condition is the Opus review 12.10 correction: the first version compared `all` alone, and
 * 542 concept pairs have that shape while B's real identity lives in its `any` - pizza-base
 * ["בסיס","פיצ"] would have beaten pizza-sauce ["פיצ"]+any["רוטב"] on "רוטב לבסיס פיצה", white cheese
 * would have beaten smoked cheese on "גבינה לבנה מעושנת". With the `any` condition 127 pairs qualify.
 * `none` plays no part: if B matched, its none already let the name through.
 *
 * Purely syntactic, so most brand-vs-generic pairs (cereal-cornflakes vs cereal-sweetened-other) are
 * not refinements and still need their `none` word. A winner is picked only when one hit refines EVERY
 * other hit; anything else stays a conflict (null), exactly as before.
 */
function isStrictSupersetOf(a, b) {
  if (a.size <= b.size) return false;
  for (const p of b) if (!a.has(p)) return false;
  return true;
}
function refines(a, b) {
  if (!isStrictSupersetOf(a._allSet, b._allSet)) return false;
  if (!b._anySet.size) return true;
  for (const p of b._anySet) if (a._allSet.has(p)) return true;
  if (!a._anySet.size) return false;
  for (const p of a._anySet) if (!b._anySet.has(p)) return false;
  return true;
}
function resolveSpecificity(hits) {
  if (hits.length < 2) return hits;
  for (const candidate of hits) {
    if (hits.every((other) => other === candidate || refines(candidate, other))) return [candidate];
  }
  return hits;
}

/** Every concept whose rules the (normalized) name satisfies - after the specificity tie-break above,
 * so two hits that collapse to one specific winner are never reported as a conflict. */
export function matchingConcepts(name, list = concepts()) {
  const text = normalizeText(name);
  if (!text) return [];
  const core = withoutFlavourPhrases(text);
  // A product for an animal belongs to no concept outside בעלי חיים (config/concepts/type-words.json `pet`).
  // Tested once here; per concept it is then a boolean, which is why this replaced 3,685 per-concept copies.
  const { _pet, _vegan, _inVeganScope } = typeWords();
  const forAnimal = !!_pet && _pet.test(text);
  // A vegan product is a product of its own (Naor, 28.9), even when it is sold as the substitute for one.
  const isVegan = !!_vegan && _vegan.test(text);
  // For a few concepts the flavour IS the identity - a peach-flavoured water is flavoured water, a
  // strawberry yogurt is fruit yogurt. Those declare `flavourIsIdentity` and read the whole name.
  const hits = list.filter((c) => {
    const positive = c.flavourIsIdentity ? text : core;
    // Order matters for cost, not for meaning: all four are ANDed, but `_all` rejects over 99% of
    // concepts on the first pattern, while passesKindGuard walks the whole processed vocabulary with a
    // regex each. Running the guard first made the build spend 68 seconds per pass over the catalog's
    // names, which is what pushed products:build from 15 seconds in September to nine minutes as the
    // concept count went from 369 to 724 (found 27.9 after the runner lost a day to a 14-hour build).
    return c._all.every((re) => re.test(positive)) && (!c._any.length || c._any.some((re) => re.test(positive))) && passesKindGuard(c, positive) && !(forAnimal && c.category !== 'בעלי חיים') && !(isVegan && _inVeganScope(c)) && !c._none.some((re) => re.test(text));
  });
  return resolveSpecificity(hits);
}

/** conceptId for a product name, or null (also null on a conflict - the report surfaces those). */
export function assignConcept(name, list = concepts()) {
  const hits = matchingConcepts(name, list);
  return hits.length === 1 ? hits[0].id : null;
}

export function conceptById(id, list = concepts()) {
  return list.find((c) => c.id === id) ?? null;
}

/** Literal filler values (the `^...$` branch of brands-import's NOT_A_BRAND) - a manufacturer field that
 * says nothing at all ("לא ידוע", a bare "," or "-"...), never worth removing from anything. */
const MANUFACTURER_FILLER_RE = /^(,|-|לא ידוע|כללי|unknown|n\/a|none)$/i;

/** A manufacturer name commonly carries its legal form as a tail - "טחנת קמח דגן בע\"מ", "Acme Ltd" - and
 * a product's own chain-published name almost never repeats that tail even when it does repeat the real
 * manufacturer name, so it is tried both with and without this suffix (docs/CONCEPTS.md §1). Scoped to the
 * forms Naor named (בע"מ/בעמ/בע מ/ltd and their common abbreviations), not the wider legal/industry
 * vocabulary NOT_A_BRAND also screens for - that one decides "is this usable as a brand", this one only
 * recovers the common "name + Ltd" shape. */
const COMPANY_SUFFIX_RE = /[\s,.-]*(?:בע(?:["'׳`”]?מ|\s*מ)|ltd|inc)\.?\s*$/i;

/** Is this raw manufacturer/brand field usable at all (not empty, not a filler like "לא ידוע", not a
 * legal-entity string) - i.e. could stripManufacturer ever do anything with it on its own? Exported so
 * build-products.mjs can decide, per chain ROW, whether to fall back to a reviewed brand.json brand at
 * all: that fallback exists ONLY for a row whose OWN field is useless (docs/CONCEPTS.md §1 - Victory's
 * ManufacturerName for the flour mill is empty, Yochananof's is "לא ידוע"), not as a second opinion on a
 * row that already names something - offering it everywhere turned other rows' merely-silent (null) votes
 * into wrong ones once their brand's OWN leftover word happened to double as some unrelated concept's
 * trigger (a Kinder "הפי היפו" wafer's truncated names, stripped of the brand, read as loose hazelnuts). */
export function isUsableManufacturer(raw) {
  const s = String(raw ?? '').trim();
  if (!s || NOT_A_BRAND.test(s)) return false;
  const core = normalizeText(s);
  return !!core && !MANUFACTURER_FILLER_RE.test(core) && letterCount(core) >= 3;
}

const letterCount = (s) => (s.match(/[\p{L}]/gu) ?? []).length;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does `core` (a manufacturer candidate, already `normalizeText`'d) itself carry one of the type-word
 * signals (config/concepts/type-words.json: pet, vegan, processed, fresh) that matchingConcepts/
 * passesKindGuard test the STRIPPED text against? Checked whatever `core`'s word count is - unlike the
 * single-token "equals a concept's own trigger word" guard above it, a signal phrase here is exactly as
 * dangerous to remove at two words ("גורמה גולד") as at one. */
function carriesTypeSignal(core) {
  const { _pet, _vegan, processed, _processed, fresh, _fresh } = typeWords();
  if (_pet && _pet.test(core)) return true;
  if (_vegan && _vegan.test(core)) return true;
  if (processed.some((_, i) => _processed[i].test(core))) return true;
  if (fresh.some((_, i) => _fresh[i].test(core))) return true;
  return false;
}

/** Two tokens count as the same word for identity purposes if they are identical, or differ by at most
 * one character on a word of 3+ letters - the chains spell the same brand several ways ("רושה" / "רושר"
 * for "Rocher"), and a one-letter tolerance absorbs that without absorbing an unrelated word. */
function tokenSimilar(a, b) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  return levenshtein(a, b) <= 1;
}

/**
 * Is `core` (resolved to concept `conceptId`) that concept's OWN brand/name, rather than a company name
 * that merely CONTAINS one of its trigger words? Every token of `core` must fuzzy-match (tokenSimilar)
 * some token drawn from the concept's own `match.all`/`match.any` literal trigger words, `name` or
 * `synonyms` - "פררו רושר" (Ferrero's own two-word brand, one chain's "Rocher" spelling) clears this for
 * `ferrero-rocher` (all=["פררו"], name="פררו רושה"): "פררו" matches exactly, "רושר" is one letter from
 * "רושה". "הפי היפו" (Happy Hippo) clears it for `kinder-happy-hippo` (all=["קינדר"], any=["היפו"], name=
 * "קינדר הפי היפו") through `any`+`name`, even though "קינדר" - the OTHER half of `all` - is not inside
 * "הפי היפו" itself: the concept is still protected, because `any`'s "היפו" lives only inside the phrase
 * being removed, and losing it breaks the concept even where "קינדר" sits elsewhere in the full name.
 * "טחנת קמח דגן" (the flour mill) does not clear it for `flour-white` (all=["קמח"], name="קמח לבן"):
 * "טחנת" and "דגן" are nowhere near "קמח" or "לבן", so only the accidental shared word "קמח" lines up -
 * this is the exact accidental collision stripManufacturer exists to undo, not a brand to protect.
 *
 * A third source feeds the same identity set: `wafers`' own `all` is a regex alternation,
 * `"(וופל|אפיפי|קרמוגית|לואקר|טורטינה)"`, because Loacker is as synonymous with "wafer" in this catalog
 * as the word itself - the author put the BRAND directly in the concept's trigger. Each `|`-separated
 * alternative is normalizeText'd and split into its own words the same way `name`/`synonyms` are, so
 * "לואקר" lands in the set exactly like a plain single-word `all` ("קמח") already did - a wrapping
 * anchor or group ("(^| )סולת") just normalizes to nothing on its empty half and "סולת" on the other.
 */
function conceptIdentityTokens(concept) {
  const identityTokens = new Set();
  for (const pattern of [...(concept.match.all ?? []), ...(concept.match.any ?? [])]) {
    for (const alt of String(pattern).split('|')) for (const t of normalizeText(alt).split(' ')) if (t && /^[\p{L}]+$/u.test(t)) identityTokens.add(t);
  }
  for (const label of [concept.name, ...(concept.synonyms ?? [])]) for (const t of normalizeText(label).split(' ')) if (t) identityTokens.add(t);
  return identityTokens;
}
function isConceptsOwnIdentity(core, conceptId, list) {
  const concept = conceptById(conceptId, list);
  if (!concept) return false;
  const identityTokens = conceptIdentityTokens(concept);
  const coreTokens = core.split(' ').filter(Boolean);
  return coreTokens.length > 0 && coreTokens.every((t) => [...identityTokens].some((w) => tokenSimilar(t, w)));
}

/** Remove every whole-word occurrence of `phrase` (already `normalizeText`'d) from `text` (also
 * `normalizeText`'d), collapsing the double space left behind. Whole-word only, via the same single-space
 * convention `normalizeText` guarantees - a manufacturer "דגן" must not eat the "דגן" inside a longer word
 * it happens to prefix. */
function removeWholePhrase(text, phrase) {
  if (!phrase) return text;
  const re = new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$)`, 'gu');
  const out = text.replace(re, '$1').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Before a chain's name for a barcode is fed to the concept matcher, remove the item's own manufacturer
 * name from it (docs/CONCEPTS.md §1/§8, Naor 11.10). The defect this fixes: "סולת בשקית טחנת קמח דגן"
 * (a bag of semolina) at Victory carried the MILL's name, "טחנת קמח דגן", and the bare word קמח (flour)
 * inside that mill name sent the barcode to `flour-white` instead of `semolina` - the concept matcher
 * never saw the manufacturer, only the name it had already bled into.
 *
 * `manufacturer` is normally the chain's own raw `ManufacturerName`/`brand` field, but for THIS barcode
 * that field is empty at Victory and "לא ידוע" (filler) at Yochananof - the mill's name is known to us
 * only because scripts/brands-import.mjs's web/name lookup already recorded it as the reviewed brand in
 * config/products/brands.json. So the caller may pass an array of candidate strings (tried in order,
 * first one that actually strips something wins) and put a reviewed brand in it too - but ONLY when that
 * reviewed brand is multi-word ("טחנת קמח דגן", "מחלבות גד"): a brand-LINE concept (Pringles, Oreo, Milka,
 * Cheerios, Fitness...) is one word in `brands.json` and must keep it, so build-products.mjs gates a
 * reviewed brand on word count before ever offering it here - this function has no name list of its own
 * to tell "מחלבות גד" (a dairy) from "פיטנס" (a cereal line) apart.
 *
 * Returns the normalized, stripped text - `normalizeText` is idempotent, so handing the result straight to
 * `matchingConcepts`/`assignConcept` re-normalizes it as a no-op. `list` is only consulted for the narrow
 * "the manufacturer IS a concept's own trigger word" guard below; pass the same list the caller is about
 * to match against (defaults to the loaded concept set).
 */
export function stripManufacturer(name, manufacturer, list = concepts()) {
  const text = normalizeText(name);
  if (!text || !manufacturer) return text;
  const manufacturers = Array.isArray(manufacturer) ? manufacturer : [manufacturer];
  // The concept the FULL, unstripped name already resolves to (constant across every candidate below) -
  // see the identity guard inside the loop.
  const fullTextMatch = assignConcept(text, list);

  for (const one of manufacturers) {
    const raw = String(one ?? '').trim();
    if (!raw) continue;

    // Try the manufacturer as published, then with a trailing company suffix removed - whichever
    // candidate is both usable and actually present in the name wins; see the comments on each guard.
    const withoutSuffix = raw.replace(COMPANY_SUFFIX_RE, '').trim();
    const rawCandidates = [...new Set([raw, withoutSuffix])].filter(Boolean);

    for (const candidateRaw of rawCandidates) {
      if (NOT_A_BRAND.test(candidateRaw)) continue; // still a filler or legal-entity string even after the suffix trim
      const core = normalizeText(candidateRaw);
      if (!core || MANUFACTURER_FILLER_RE.test(core)) continue;
      if (letterCount(core) < 3) continue; // "at least 3 letters" (Naor's instruction)
      if (core === text) continue; // never remove when the manufacturer equals the whole name
      // The manufacturer phrase IS a concept's own brand identity, not an incidental word collision -
      // see isConceptsOwnIdentity above. Checked against the whole phrase regardless of word count: a
      // single word like "קמח" is simply a one-word case of the same rule, since "קמח" is itself one of
      // flour-white's own `synonyms`. Checked against TWO candidate concepts, either one enough to
      // protect: the concept `core` resolves to entirely on its own (catches "פררו רושה"), and the
      // concept the FULL, unstripped name already resolves to (catches "הפי היפו", which alone does not
      // satisfy `kinder-happy-hippo`'s `all:["קינדר"]` - that word sits elsewhere in the full name - but
      // is still entirely that concept's own `any`/name/synonym vocabulary, and removing it breaks the
      // concept's `any` requirement wherever "קינדר" happens to survive).
      const toCheck = new Set([assignConcept(core, list), fullTextMatch].filter(Boolean));
      if ([...toCheck].some((id) => isConceptsOwnIdentity(core, id, list))) continue;
      // The manufacturer phrase is itself a hand-curated TYPE-WORD signal (config/concepts/type-words.json
      // pet/vegan/processed/fresh), whatever its word count - found the hard way: "גורמה גולד" (Nestlé's
      // Gourmet Gold cat-food line) is both this barcode's reviewed brand AND the literal pet-marker phrase
      // the animal guard keys off of for exactly the chains that truncate "...מזון לחתול" away. Stripping it
      // as "noise" would silently turn the cat food into feta cheese once "פטה" stood alone with nothing -
      // matchingConcepts/passesKindGuard read the SAME stripped text this function hands back, so a
      // manufacturer that doubles as one of their signal words must never be removed from it.
      if (carriesTypeSignal(core)) continue;
      const stripped = removeWholePhrase(text, core);
      if (stripped === text) continue; // this candidate did not literally occur in the name - try the next
      if (letterCount(stripped) < 2) continue; // never leave fewer than 2 letters
      return stripped;
    }
  }
  return text;
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
  const byKey = new Map(); // `${category}${family.id}` -> { id, name, category, conceptIds }
  for (const c of list) {
    const fam = resolveFamily(c, list);
    const mapKey = `${c.category}${fam.id}`;
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
export function publicConcept({ _all, _any, _none, _ownAll, _allSet, _anySet, file, ...c }) { return c; }
