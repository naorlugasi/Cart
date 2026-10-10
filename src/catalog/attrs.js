/**
 * Phase 1 of the product-attribute layer (docs/ATTRS.md). EXTRACTS attributes (brand, state, form,
 * container, scent, flavour, diet, code) from the names a barcode carries across chains - it does not
 * decide which products are "the same" (that is the next step, not this one).
 *
 * Reuse, not a second vocabulary: `state`/`form` read config/substitutes/rules.json's own `form` groups
 * BY REFERENCE (the same compiled RegExp objects src/pricing/substituteRules.js already loads via
 * `rules()`), `flavour` calls the existing `variantSignature()` and `diet` the existing `dietSignature()`.
 * Only container/scent/code and the handful of state/form values rules.json has no group for (thawed,
 * pickled, cubes, strips, fillet) are new vocabulary, read from config/attributes.json.
 *
 * Every key is SPARSE and every value is READ, never guessed: a key is present only when some chain's
 * name actually said something, sets are arrays, a negated word publishes the key's explicit opposite
 * value where one is configured (scent: "unscented") or "!value" otherwise. A key that two chain names
 * read two DIFFERENT ways is a CONFLICT: it is left out of `attrs` (absence, like no evidence at all -
 * never treat a missing key as the negative) and reported in `conflicts` so the build can queue it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeText } from './matching.js';
import { rules as loadSubstituteRules, RULES_FILE, variantSignature, dietSignature } from '../pricing/substituteRules.js';

export const ATTRS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'attributes.json');

const FINAL_LETTERS = /[ךםןףץ]/;
const LOOKBEHIND = '(?<![א-ת])';
/** Same attached-prefix allowance as config/substitutes/rules.json compileGroups: ו/ב/כ/ל/מ/ה/ש glue to
 * the next word in Hebrew, so a word-start lookbehind alone would miss "ובקבוק", "בניחוח", "לדיספנסר". */
const PREFIX = '[ובכלמהש]?';
/** Negation-first (docs/ATTRS.md): "(ללא|בלי|נטול|נטולת|לא) (תוספת )?X" checked BEFORE the bare word X,
 * so "ללא בישום" is read as the negative and never ALSO counted as the positive "בישום". */
const NEG_PREFIX = '(?:ללא|בלי|נטול|נטולת|לא) ?(?:תוספת )?';

function assertNoFinalLetters(list, where) {
  for (const p of list) {
    if (FINAL_LETTERS.test(p)) throw new Error(`${where}: pattern "${p}" has a final-form letter; names are normalized to regular forms`);
  }
}
const withPrefix = (p) => (p.startsWith(LOOKBEHIND) ? p.replace(LOOKBEHIND, `${LOOKBEHIND}${PREFIX}`) : p);
const stripLookbehind = (p) => (p.startsWith(LOOKBEHIND) ? p.slice(LOOKBEHIND.length) : p);

/** Compiles one NEW (not reused) word-group object from config/attributes.json: container, scent, and the
 * state/form values rules.json has no group for. Every pattern gets a negated form, even where the key has
 * no explicit opposite (docs/ATTRS.md): a group with no `negativeMap` entry just negates to "!id". */
function compileNegatableGroups(groups, negativeMap, where) {
  const out = [];
  for (const [id, patterns] of Object.entries(groups ?? {})) {
    if (id.startsWith('_') || id === 'reuseForm' || id === 'negative') continue;
    assertNoFinalLetters(patterns, `${where}.${id}`);
    out.push({
      id,
      pos: patterns.map((p) => new RegExp(withPrefix(p), 'iu')),
      neg: patterns.map((p) => new RegExp(NEG_PREFIX + stripLookbehind(p), 'iu')),
      negativeValue: negativeMap?.[id] ?? null,
    });
  }
  return out;
}

/** Pulls `ids` out of the ALREADY-compiled config/substitutes/rules.json `form` groups (the exact arrays
 * src/pricing/substituteRules.js formSignature() reads) - "by reference": the regex source lives only in
 * rules.json, this just re-groups a subset of its ids under a different attrs key. No negation: rules.json
 * never negates a physical-form marker either. */
function reuseFormGroups(ids, substRules) {
  const out = [];
  for (const id of ids ?? []) {
    const g = substRules.form.find((x) => x.id === id);
    if (g) out.push({ id, pos: g.res, neg: [], negativeValue: null });
  }
  return out;
}

export function loadAttributesConfig(file = ATTRS_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function compileAttributes(raw) {
  return {
    state: { reuseForm: raw.state?.reuseForm ?? [], local: compileNegatableGroups(raw.state, null, 'state') },
    form: { reuseForm: raw.form?.reuseForm ?? [], local: compileNegatableGroups(raw.form, null, 'form') },
    container: compileNegatableGroups(raw.container, null, 'container'),
    scent: compileNegatableGroups(raw.scent, raw.scent?.negative, 'scent'),
    code: Object.fromEntries(Object.entries(raw.code ?? {}).filter(([k]) => !k.startsWith('_'))),
  };
}

let cachedConfig = null;
export function attributesConfig() { return (cachedConfig ??= compileAttributes(loadAttributesConfig())); }
/** Test-only: swap the compiled config (pass a raw attributes.json-shaped object), or restore the file with a falsy value. */
export function _setAttributesConfig(raw) { cachedConfig = raw ? compileAttributes(raw) : null; }

/** A hash of everything that can change what attrs.js reads: config/attributes.json plus the form/diet/
 * variant sections of config/substitutes/rules.json (the vocabularies it reuses). Published in
 * data/products-index.json as `attrsVersion` (docs/PIPELINE-CONTRACT.md) so a consumer can tell when the
 * extraction rules moved even though the product list did not. */
export function computeAttrsVersion(rawAttrs = loadAttributesConfig(), rawRules = JSON.parse(readFileSync(RULES_FILE, 'utf8'))) {
  const picked = { form: rawRules.form, diet: rawRules.diet, variant: rawRules.variant };
  const payload = JSON.stringify({ attributes: rawAttrs, rules: picked });
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

/** Every group (in declared order) whose word matches `text`; negation is checked before the positive
 * pattern WITHIN each group, so "ללא בישום" never also counts as "בישום". A name that carries two words of
 * one key ("שימורי כבד דג מעושן": canned AND smoked; "עגבניות מרוסקות מרוכזות": puree AND concentrate)
 * returns both, in group order - scalarFromNames needs the whole set to see that another chain's
 * shorter name agrees with one of them. */
function valuesFromGroups(text, groups) {
  const out = [];
  for (const g of groups) {
    if (g.neg.some((re) => re.test(text))) out.push(g.negativeValue ?? `!${g.id}`);
    else if (g.pos.some((re) => re.test(text))) out.push(g.id);
  }
  return out;
}

/** A SCALAR key (state/form/container/scent). Each full name reads a set of values; the key's value is,
 * in order (4.10, after the first build queued 153 conflicts that were mostly chains describing one
 * product with different words - docs/ATTRS.md §5):
 *   1. the one value every name read (the common case);
 *   2. a value EVERY name read, when some names read more than one - "שימורי כבד דג מעושן" against
 *      "כבד דג מעושן" is smoked, not a canned/smoked conflict; the first in group order when several;
 *   3. the value a clear majority of names read (at least two names, at least twice the runner-up) -
 *      "לבבות דקל פרוסות" ×4 against one chain's "לבבות דקל חתוך" is sliced;
 *   4. otherwise a conflict: the key is left absent and reported, never guessed (1:1 stays a conflict).
 * `sources` lists every reading, so a reviewer sees what was outvoted. */
function scalarFromNames(fullNames, groups) {
  const bySrc = [];
  for (const name of fullNames) {
    for (const value of valuesFromGroups(normalizeText(name), groups)) bySrc.push({ name, value });
  }
  if (!bySrc.length) return { value: null, sources: [], conflict: null };
  const distinct = [...new Set(bySrc.map((s) => s.value))];
  if (distinct.length === 1) return { value: distinct[0], sources: bySrc, conflict: null };

  const readers = new Set(bySrc.map((s) => s.name));
  const namesFor = (v) => new Set(bySrc.filter((s) => s.value === v).map((s) => s.name));
  const shared = distinct.find((v) => namesFor(v).size === readers.size);
  if (shared) return { value: shared, sources: bySrc, conflict: null };

  const counts = distinct.map((v) => [v, namesFor(v).size]).sort((a, b) => b[1] - a[1]);
  const [[top, n], [, runnerUp]] = counts;
  if (n >= 2 && n >= 2 * runnerUp) return { value: top, sources: bySrc, conflict: null };

  return { value: null, sources: bySrc, conflict: distinct.map((v) => bySrc.find((s) => s.value === v)) };
}

/** A SET key (flavour/diet): every word any full name carries is read - this is a union, like
 * substituteRules.js already unions markers across a candidate's two name sources, not a conflict check.
 * Two chains spelling the same variant differently (aloe in one, almond in another, for one scented wipe)
 * is exactly why a union is right here and a single-value conflict rule is not. */
function setFromNames(fullNames, reader) {
  const bySrc = [];
  const union = new Set();
  for (const name of fullNames) {
    for (const w of reader(name)) { union.add(w); bySrc.push({ name, value: w }); }
  }
  return { value: union.size ? [...union].sort() : null, sources: bySrc };
}

/** `code`: {kind, value} pairs, one regex per kind (config/attributes.json `code`). Each kind is its own
 * conflict unit - a stage disagreement never blanks an unrelated shade reading on the same product.
 * `model` is skipped on a name where `dose` already matched (object key order in the config puts dose
 * before model), so a vitamin's own code is not ALSO published as a generic model. */
function codesFromNames(fullNames, codeConfig) {
  const byKind = new Map(); // kind -> Map(value -> Set(name))
  for (const name of fullNames) {
    const text = normalizeText(name);
    let doseMatched = false;
    for (const [kind, patternSrc] of Object.entries(codeConfig)) {
      if (kind === 'model' && doseMatched) continue;
      const m = new RegExp(patternSrc, 'iu').exec(text);
      if (!m) continue;
      if (kind === 'dose') doseMatched = true;
      let value;
      if (kind === 'dose') value = m[2] ? `${m[1].toUpperCase()}-${m[2]}` : m[1].toUpperCase();
      else if (kind === 'model') value = `${m[1].toUpperCase()}${m[2]}`;
      else value = String(m[1]).toUpperCase();
      if (!byKind.has(kind)) byKind.set(kind, new Map());
      const forValue = byKind.get(kind);
      if (!forValue.has(value)) forValue.set(value, new Set());
      forValue.get(value).add(name);
    }
  }
  const values = [];
  const sources = [];
  const conflicts = [];
  for (const [kind, forValue] of byKind) {
    const distinct = [...forValue.keys()];
    if (distinct.length === 1) {
      values.push({ kind, value: distinct[0] });
      for (const name of forValue.get(distinct[0])) sources.push({ name, value: `${kind}:${distinct[0]}` });
    } else {
      conflicts.push({ key: `code.${kind}`, values: distinct.map((v) => ({ value: v, name: [...forValue.get(v)][0] })) });
    }
  }
  return { values, sources, conflicts };
}

// --- brand -----------------------------------------------------------------

/** Legal-entity / generic suffixes that are not part of a brand's identity (docs/ATTRS.md). */
const BRAND_SUFFIX_RE = /(בע"מ|בעמ|תעשיות|שיווק|ישראל|גרופ|מרכז שיתופי|מחלבת|בי\.וי|ltd)/giu;
/** A brand field that says nothing: a bare comma, "לא ידוע", "כללי", or empty after stripping. */
const BRAND_FILLER_RE = /^(,|לא ידוע|כללי)?$/i;

/** Normalizes a raw `brand` field: strips quotes/punctuation and the legal-entity suffixes above, then
 * returns null for a filler value instead of an empty/meaningless string. */
export function normalizeBrandField(raw) {
  // Suffixes are stripped BEFORE punctuation - בע"מ needs its own quote to match, and removing the quote
  // first would leave a bare "בע מ" the suffix pattern no longer recognizes.
  let s = String(raw ?? '').replace(BRAND_SUFFIX_RE, ' ');
  s = s.replace(/["'״׳`.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || BRAND_FILLER_RE.test(s)) return null;
  return s;
}

function majorityBrand(brandField) {
  const counts = new Map();
  for (const raw of brandField ?? []) {
    const norm = normalizeBrandField(raw);
    if (!norm) continue;
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** Lexicon used to read a brand TOKEN straight out of a product's own name (docs/ATTRS.md): every
 * normalized brand-field word that is itself a brand on >= `minProducts` products. Built once per build
 * from every product's (already decided) `brand` field - see setBrandLexicon/brandLexicon below.
 *
 * `productNames` (10.10): a brand-field WORD that is really a product noun must not enter. "שמן ספרד",
 * "קפה עלית", "שוקולד X" as brand fields put שמן, קפה, שוקולד, פסטה, עוגיות in the lexicon, and the name
 * fallback then stamped brand "שמנ" on 132 olive oils, "שוקולד" on 177 bars, ~900 products in all. The
 * same screen scripts/brands-propagate.mjs uses: a word that STARTS at least 20x as many product names
 * as it has brand-field occurrences is a noun, not a brand (שמן starts hundreds of names; תנובה none). */
export function buildBrandLexicon(brandValues, minProducts = 5, productNames = []) {
  const docCount = new Map();
  for (const raw of brandValues ?? []) {
    const norm = normalizeBrandField(raw);
    if (!norm) continue;
    for (const w of new Set(normalizeText(norm).split(' ').filter((t) => t.length >= 2))) {
      docCount.set(w, (docCount.get(w) ?? 0) + 1);
    }
  }
  const headNoun = new Map();
  for (const name of productNames ?? []) {
    const w = normalizeText(String(name ?? '')).split(' ')[0];
    if (w) headNoun.set(w, (headNoun.get(w) ?? 0) + 1);
  }
  const lex = new Set();
  for (const [w, n] of docCount) if (n >= minProducts && (headNoun.get(w) ?? 0) < 20 * n) lex.add(w);
  return lex;
}

let lexiconCache = new Set();
/** Set once per build (scripts/build-products.mjs), before any extractAttrs call, from buildBrandLexicon()
 * over every product's brand field - extractAttrs itself never reads the whole catalog. */
export function setBrandLexicon(lex) { lexiconCache = lex instanceof Set ? lex : new Set(lex ?? []); }
export function brandLexicon() { return lexiconCache; }

/** A single lexicon word found in the union of full names - null when none match or more than one
 * DIFFERENT lexicon word is found (an ambiguous name signal is simply not used, not escalated to a
 * conflict: the brand FIELD is the primary signal and this one only confirms or fills a gap in it). */
function brandTokenFromNames(fullNames, lexicon) {
  if (!lexicon.size) return null;
  const found = new Map(); // word -> name
  for (const name of fullNames) {
    for (const w of normalizeText(name).split(' ')) if (lexicon.has(w) && !found.has(w)) found.set(w, name);
  }
  if (found.size !== 1) return null;
  return [...found.entries()][0];
}

/**
 * The brand FIELD is the primary signal and wins whenever it says anything (confirmed by the name token
 * when the two happen to agree). The name-lexicon token only FILLS A GAP where every chain's brand field
 * was empty/filler - it never outvotes a present field value. Measured on the real catalog (3.10): a
 * lexicon built at the required >= 5-product threshold necessarily contains plenty of generic, non-brand
 * words too ("נייר", "גליל", "בלו", "על"...) because some chains genuinely put a bare descriptive word in
 * their own brand field on 5+ products - treating every such word's appearance elsewhere in a name as a
 * competing "vote" against the field turned brand into 6,700+ false conflicts, almost all of them a real
 * brand field against a common Hebrew word that happens to occur in the product's own name. The field
 * already IS the chains' own structured answer to "what brand is this"; the name is only consulted when
 * that answer is missing.
 */
function readBrand(fullNames, brandField, lexicon) {
  const field = majorityBrand(brandField);
  if (field) return { value: field, sources: [{ name: '(brand field, majority)', value: field }], conflict: null };
  const nameHit = brandTokenFromNames(fullNames, lexicon); // [word, name] | null
  if (nameHit) return { value: nameHit[0], sources: [{ name: nameHit[1], value: nameHit[0] }], conflict: null };
  return { value: null, sources: [], conflict: null };
}

// --- extractAttrs ------------------------------------------------------------

/**
 * `extractAttrs(names, { brandField, conceptId, substRules }) -> { attrs, conflicts, sources }`
 *
 * `names`: every chain's name for this barcode (the unified display name should be included by the
 * caller too). A name that is a PREFIX of a longer name in the same list does not vote (half the chains
 * truncate to ~20 characters, same rule as scripts/build-products.mjs pickConcept) - unless that would
 * leave no names at all, in which case every name is kept.
 * `brandField`: every chain's raw `brand` field for this barcode (parallel in spirit to `names`, not
 * required to be the same length).
 * `conceptId`: the product's final conceptId, only used to pick a concept-specific flavour vocabulary
 * (variantSignature's `variant.concepts[<conceptId>]`, e.g. the baby-wipes scent groups).
 *
 * `attrs` is SPARSE (absent key = never read, never a value). `conflicts` is a flat list of
 * `{ key, values: [{ value, name }, ...] }` for keys two full names disagreed on - the caller (the build)
 * turns these into review-queue entries. `sources` maps each key attrs carries to the name(s)/field that
 * produced it, for anyone auditing a reading.
 */
export function extractAttrs(names, { brandField = [], conceptId = null, substRules } = {}) {
  const r = substRules ?? loadSubstituteRules();
  const cfg = attributesConfig();
  const clean = [...new Set((names ?? []).filter((n) => n && n.length > 2))];
  const full = clean.filter((n) => !clean.some((other) => other.length > n.length && other.startsWith(n)));
  const fullNames = full.length ? full : clean;

  const attrs = {};
  const conflicts = [];
  const sources = {};

  const scalarKeys = {
    state: [...reuseFormGroups(cfg.state.reuseForm, r), ...cfg.state.local],
    form: [...reuseFormGroups(cfg.form.reuseForm, r), ...cfg.form.local],
    container: cfg.container,
    scent: cfg.scent,
  };
  for (const [key, groups] of Object.entries(scalarKeys)) {
    const res = scalarFromNames(fullNames, groups);
    if (res.value != null) { attrs[key] = res.value; sources[key] = res.sources; }
    else if (res.conflict) { conflicts.push({ key, values: res.conflict }); sources[key] = res.sources; }
  }

  // A concept with an EXCLUSIVE variant group (today only baby-wipes: scented vs unscented,
  // config/substitutes/rules.json variant.groups) makes variantSignature() short-circuit to that single
  // group and never read the generic flavour words at all - correct for the substitute engine (scent IS
  // the whole identity there), wrong for `flavour` here: it would collapse "אלוורה"/"קמומיל"/"שקד" into
  // one bare "scented" token, losing the variety entirely (the Huggies aloe-almond case). `scent` above
  // already reads that identity on its own vocabulary, so flavour reads the generic words instead by
  // passing no conceptId for exactly those concepts; every other concept still gets its own kind words
  // (bourekas filling, kebab species) through variantByConcept as usual.
  const flavourConceptId = r.variantGroupsByConcept?.has(conceptId) ? null : conceptId;
  // variantSignature's "whatever the flavour-phrase stripper removed" fallback (src/pricing/substituteRules.js)
  // can leave a single stray letter behind ("ללתס" next to "שוקולד" split into "ל"/"ס" around it) - harmless
  // for the substitute check it was built for (a one-letter token never decides sameSet there), but not worth
  // publishing as a flavour here. A length-2 floor is attrs.js's own, on top of the shared function's output.
  const flavour = setFromNames(fullNames, (n) => variantSignature(n, r, flavourConceptId).filter((w) => w.length >= 2));
  if (flavour.value) { attrs.flavour = flavour.value; sources.flavour = flavour.sources; }
  const diet = setFromNames(fullNames, (n) => dietSignature(n, r));
  if (diet.value) { attrs.diet = diet.value; sources.diet = diet.sources; }

  const codes = codesFromNames(fullNames, cfg.code);
  if (codes.values.length) { attrs.code = codes.values; sources.code = codes.sources; }
  conflicts.push(...codes.conflicts);

  const brand = readBrand(fullNames, brandField, lexiconCache);
  if (brand.value) { attrs.brand = brand.value; sources.brand = brand.sources; }
  if (brand.conflict) conflicts.push({ key: 'brand', values: brand.conflict });

  return { attrs, conflicts, sources };
}
