/**
 * What counts as a substitute (docs/CONCEPTS.md §4, rules decided 22.9.2026).
 *
 * The definition: a substitute is a product the customer would put in the same place in the recipe
 * without noticing anything but the brand and the size. "Same concept" is necessary and not sufficient -
 * a frozen salmon fillet is not fresh salmon, grated gouda is not sliced gouda, a potato boureka is not
 * a cheese boureka, lactose-free milk is not milk, and a 96-product "cookies" concept is a shelf.
 *
 * Everything that can be data is data: config/substitutes/rules.json holds the families, the per-concept
 * policy and the marker vocabularies. This module turns names into signatures and compares two products.
 * Dependency-free apart from the name normalizer and the flavour-phrase stripper the concept matcher
 * already uses, so cartBackend can copy it next to substitutes.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from '../catalog/matching.js';
import { withoutFlavourPhrases } from '../catalog/concepts.js';

export const RULES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'substitutes', 'rules.json');

/** Categories where the physical-form markers mean what they say (a "dry hair" shampoo is not dried). */
const FOOD_CATEGORIES = new Set(['ירקות ופירות', 'חלב וביצים', 'בשר ועוף', 'מעדנייה', 'מאפים ולחם', 'שימורים', 'חטיפים וממתקים', 'משקאות']);

const FINAL_LETTERS = /[ךםןףץ]/;
/** An optional inseparable prefix (and/in/as/to/from/the/that) glued to the word we are looking for. */
const PREFIX = '[ובכלמהש]?';
function compileGroups(groups, where) {
  const out = [];
  for (const [id, patterns] of Object.entries(groups ?? {})) {
    if (id.startsWith('_')) continue;
    out.push({ id, res: patterns.map((p) => {
      if (FINAL_LETTERS.test(p)) throw new Error(`${where}.${id}: pattern "${p}" has a final-form letter; names are normalized to regular forms`);
      // A word-start pattern also matches behind an attached prefix letter: "ולואיזה", "בקפוא", "הטרי".
      // Hebrew glues ו/ב/כ/ל/מ/ה/ש to the next word, and the lookbehind alone would then miss the marker.
      return new RegExp(p.startsWith('(?<![א-ת])') ? p.replace('(?<![א-ת])', `(?<![א-ת])${PREFIX}`) : p, 'iu');
    }) });
  }
  return out;
}

export function compileRules(raw) {
  const familyOfConcept = new Map();
  const families = {};
  for (const [id, f] of Object.entries(raw.families ?? {})) {
    if (id.startsWith('_')) continue;
    families[id] = { id, name: f.name, concepts: [...(f.concepts ?? [])] };
    for (const c of f.concepts ?? []) {
      if (familyOfConcept.has(c)) throw new Error(`substitute rules: concept ${c} is in two families (${familyOfConcept.get(c)}, ${id})`);
      familyOfConcept.set(c, id);
    }
  }
  const policy = {};
  for (const [c, p] of Object.entries(raw.conceptPolicy ?? {})) {
    if (c.startsWith('_')) continue;
    if (!['full', 'missingOnly', 'none'].includes(p)) throw new Error(`substitute rules: conceptPolicy.${c} = "${p}" (full | missingOnly | none)`);
    policy[c] = p;
  }
  // Longest first so "פירות יער" is taken before "פירות"; a matched phrase is blanked so it cannot count twice.
  const wordList = (list) => (list ?? []).map((w) => normalizeText(w)).filter(Boolean).sort((a, b) => b.length - a.length);
  const variantWords = wordList(raw.variant?.words);
  const variantByConcept = new Map();
  for (const [conceptId, words] of Object.entries(raw.variant?.concepts ?? {})) if (!conceptId.startsWith('_')) variantByConcept.set(conceptId, wordList(words));
  return {
    families,
    familyOfConcept,
    policy,
    form: compileGroups(raw.form, 'form'),
    diet: compileGroups(raw.diet, 'diet'),
    required: compileGroups(raw.required, 'required'),
    variantWords,
    variantByConcept,
    priceBand: Number(raw.priceBand) > 1 ? Number(raw.priceBand) : 3,
    sizeTolerance: Number(raw.sizeTolerance) > 0 ? Number(raw.sizeTolerance) : 0.25,
  };
}

export function loadRules(file = RULES_FILE) {
  return compileRules(JSON.parse(readFileSync(file, 'utf8')));
}

let cached = null;
export function rules() { return (cached ??= loadRules()); }
/** Test-only: swap the rule set (pass a raw rules object) or restore the file with a falsy value. */
export function _setRules(raw) { cached = raw ? compileRules(raw) : null; }

export const familyOf = (conceptId, r = rules()) => { const id = r.familyOfConcept.get(conceptId); return id ? r.families[id] : null; };
export const conceptPolicy = (conceptId, r = rules()) => r.policy[conceptId] ?? 'full';

const matchedGroups = (text, groups) => groups.filter((g) => g.res.some((re) => re.test(text))).map((g) => g.id).sort();

/**
 * The words that make this product a particular variant of its concept: the flavour / filling phrases the
 * concept matcher strips ("בטעם וניל", "במילוי קרם אגוזים") plus bare variant words ("בורקס גבינה",
 * "דנונה אפרסק"). Returned as a sorted, de-duplicated list of normalized words.
 */
export function variantSignature(name, r = rules(), conceptId = null) {
  const text = normalizeText(name);
  if (!text) return [];
  const found = new Set();
  const core = withoutFlavourPhrases(text);
  if (core !== text) {
    // Whatever the stripper removed (minus the marker prepositions) names the flavour.
    const kept = new Set(core.split(' '));
    for (const w of text.split(' ')) if (w && !kept.has(w) && !/^(בטעמ|בניחוח|בריח|במילוי|בציפוי|בתוספת|תמצית|מצופה|קרמ)$/.test(w)) found.add(w);
  }
  let scan = ` ${text} `;
  // The concept's own kind-words (the filling of a boureka, oil vs brine in a tuna can) come before the
  // global flavours, so a longer concept phrase is taken whole.
  const words = conceptId && r.variantByConcept.has(conceptId) ? [...r.variantByConcept.get(conceptId), ...r.variantWords] : r.variantWords;
  for (const w of words) {
    // Whole word, optionally behind an attached prefix letter ("ושזיפ" carries שזיפ, "בשמנ" carries שמנ).
    const re = new RegExp(`(?<![א-תa-z])${PREFIX}${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![א-תa-z])`, 'u');
    if (re.test(scan)) { found.add(w); scan = scan.replace(re, ' '); }
  }
  return [...found].sort();
}

/** A multipack (count > 1) is a different purchase from a single pack of the same total weight: 10×25g lunchbox
 * bags are not a 200g family bag. Both sizes known and only one a multipack -> not a substitute. */
const isMultipack = (size) => (size?.count ?? 1) > 1;

export const formSignature = (name, r = rules()) => matchedGroups(normalizeText(name), r.form);
export const dietSignature = (name, r = rules()) => matchedGroups(normalizeText(name), r.diet);
export const requiredSignature = (name, r = rules()) => matchedGroups(normalizeText(name), r.required);

/** The first percentage a name states ("3%", "5 %", "0.5%"), or null. Fat and alcohol are identity. */
export function percentOf(name) {
  const m = normalizeText(name).match(/(\d+(?:[.,]\d+)?) ?%/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const superset = (a, b) => b.every((x) => a.includes(x));

/**
 * Same unit, total (value * count) within ±pct of one another. Either side missing -> false.
 */
export function sizeWithin(a, b, pct) {
  if (!a || !b) return false;
  if (a.unit !== b.unit) return false;
  if (typeof a.value !== 'number' || typeof b.value !== 'number') return false;
  const totalA = a.value * (a.count ?? 1);
  const totalB = b.value * (b.count ?? 1);
  if (!Number.isFinite(totalA) || !Number.isFinite(totalB) || totalA <= 0 || totalB <= 0) return false;
  const ratio = totalB / totalA;
  const eps = 1e-9;
  return ratio >= 1 - pct - eps && ratio <= 1 + pct + eps;
}

/**
 * Is `candidate` an acceptable stand-in for `product`? Returns { ok: true } or { ok: false, reason }.
 * `reason` is one short token so an audit can count them (docs/CONCEPTS.md §4 lists them).
 *
 * @param {object} args
 * @param {object} args.product         the customer's product (unified catalog)
 * @param {object} args.candidate       another unified product
 * @param {boolean} args.requireSize    the concept has a size unit (sizeUnit !== null)
 * @param {number|null} args.referencePrice  what the customer pays per unit/kg today (this chain, or basePrice)
 * @param {number|null} args.candidatePrice  the candidate's unit/kg price at the chain
 * @param {string} [args.candidateName] the chain's own name for the candidate (a fuller name than the unified one is common)
 */
export function compatible({ product, candidate, requireSize, referencePrice = null, candidatePrice = null, candidateName = null }, r = rules()) {
  if (!!candidate.isWeighted !== !!product.isWeighted) return { ok: false, reason: 'form-of-sale' };
  if (candidate.category !== product.category) return { ok: false, reason: 'category' };
  if (requireSize && !sizeWithin(product.size, candidate.size, r.sizeTolerance)) return { ok: false, reason: 'size' };
  if (product.size && candidate.size && isMultipack(product.size) !== isMultipack(candidate.size)) return { ok: false, reason: 'pack' };

  // Two names may describe the candidate; the fuller one knows more. Markers are read from both.
  const cNames = [candidate.name, candidateName].filter(Boolean);
  const union = (fn) => [...new Set(cNames.flatMap((n) => fn(n, r)))].sort();

  if (FOOD_CATEGORIES.has(product.category) && !sameSet(formSignature(product.name, r), union(formSignature))) return { ok: false, reason: 'form' };
  if (!sameSet(dietSignature(product.name, r), union(dietSignature))) return { ok: false, reason: 'diet' };
  if (!superset(union(requiredSignature), requiredSignature(product.name, r))) return { ok: false, reason: 'required' };

  const pctP = percentOf(product.name);
  const pctC = cNames.map(percentOf).find((v) => v !== null) ?? null;
  if (pctP !== null && pctC !== null && Math.abs(pctP - pctC) > 1e-9) return { ok: false, reason: 'percent' };

  const conceptId = product.conceptId ?? null;
  const variantOf = (n) => variantSignature(n, r, conceptId);
  if (!sameSet(variantOf(product.name), union(variantOf))) return { ok: false, reason: 'variant' };

  if (Number.isFinite(referencePrice) && referencePrice > 0 && Number.isFinite(candidatePrice) && candidatePrice > 0) {
    if (candidatePrice * r.priceBand < referencePrice || candidatePrice > referencePrice * r.priceBand) return { ok: false, reason: 'price-band' };
  }
  return { ok: true };
}
