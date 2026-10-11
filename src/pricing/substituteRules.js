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
  // Exclusive variant groups for one concept, in priority order: the first group a name matches is its variant,
  // and nothing else is read. For wipes the identity is scented vs unscented, however the chain spells it.
  const variantGroupsByConcept = new Map();
  for (const [conceptId, groups] of Object.entries(raw.variant?.groups ?? {})) if (!conceptId.startsWith('_')) variantGroupsByConcept.set(conceptId, compileGroups(groups, `variant.groups.${conceptId}`));
  // Concepts whose kind IS the whole variant (baby wipes: scented vs unscented, however the chain spells it) -
  // for them the generic flavour words are not read at all. Every other concept reads its kind AND its
  // flavours (11.10: before this, a kind group silently switched flavour comparison off for its concept).
  const groupsOnly = new Set((raw.variant?.groupsOnly ?? []).filter((id) => !String(id).startsWith('_')));
  return {
    groupsOnly,
    families,
    familyOfConcept,
    policy,
    form: compileGroups(raw.form, 'form'),
    diet: compileGroups(raw.diet, 'diet'),
    required: compileGroups(raw.required, 'required'),
    variantWords,
    variantByConcept,
    variantGroupsByConcept,
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
  // A concept with exclusive groups reads only them. Baby wipes, 3.10: "בבישום עדין" and "בניחוח עדין" are one
  // variant and "ללא בישום" another, but the generic reading saw "עדין" in the second and nothing in the other
  // two - so Hatzi Hinam's exact match was refused and an unscented pack was offered for a scented one.
  const groups = conceptId && r.variantGroupsByConcept?.get(conceptId);
  const found = new Set();
  if (groups) {
    // The kind (docs/CONCEPTS.md: an exclusive group, first match wins) joins the signature as `kind:<id>`,
    // so a kind can never collide with a flavour word. 11.10: it used to REPLACE the flavour reading for the
    // whole concept - with 64 concepts carrying kinds, orange-mint and sea-salt dark chocolate had become
    // substitutes. Only a `variant.groupsOnly` concept (baby wipes) still reads nothing but its kind.
    const g = groups.find((x) => x.res.some((re) => re.test(text)));
    if (r.groupsOnly?.has(conceptId)) return g ? [`kind:${g.id}`] : [];
    if (g) found.add(`kind:${g.id}`);
  }
  const core = withoutFlavourPhrases(text);
  if (core !== text) {
    // Whatever the stripper removed (minus the marker prepositions) names the flavour - up to the first number.
    // The phrase can run to the end of the name, and what follows the flavour there is the size and the pack
    // ("קרם עוגיות 500 מ"ל", "בטעם וניל 1 ליטר"): read as flavour, a 500 ml tub refused a 473 ml one of the
    // same flavour on `variant` (1.10, the backend session's finding).
    const kept = new Set(core.split(' '));
    for (const w of text.split(' ')) {
      if (/\d/.test(w)) break;
      if (w && !kept.has(w) && !/^(בטעמ|בניחוח|בריח|במילוי|בציפוי|בתוספת|תמצית|מצופה|קרמ)$/.test(w)) found.add(w);
    }
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
 *
 * One exception (Naor, 2.10): a bare count against a measured pack compares the counts. "תה ירוק נענע 50 יחיד"
 * ({unit x50}) and "25 שק*1.5גר" ({1.5 g x25}) are both boxes of tea bags, and the unit test alone said they
 * could never be compared. Only for a real pack (both counts above one): a single "1 יח" says nothing about
 * how much is in it.
 */
export function sizeWithin(a, b, pct) {
  const ratio = sizeRatio(a, b);
  if (ratio === null) return false;
  const eps = 1e-9;
  return ratio >= 1 - pct - eps && ratio <= 1 + pct + eps;
}

/**
 * How much of `a` one `b` is: total(b) / total(a) under the same comparison sizeWithin makes (same unit, or a
 * count against a measured pack of more than one). `null` when the two cannot be compared at all - a missing
 * side, different units, a single unit against a measured pack - which is a different answer from "far off".
 */
export function sizeRatio(a, b) {
  if (!a || !b) return null;
  if (a.unit !== b.unit) {
    if (a.unit !== 'unit' && b.unit !== 'unit') return null;
    const [ca, cb] = [a.count ?? 1, b.count ?? 1];
    if (!(ca > 1 && cb > 1)) return null;
    return cb / ca;
  }
  if (typeof a.value !== 'number' || typeof b.value !== 'number') return null;
  const totalA = a.value * (a.count ?? 1);
  const totalB = b.value * (b.count ?? 1);
  if (!Number.isFinite(totalA) || !Number.isFinite(totalB) || totalA <= 0 || totalB <= 0) return null;
  return totalB / totalA;
}

/**
 * The widest a known size may differ and still be offered for a line the chain cannot fill (Naor, 11.10, on
 * "מגבות נייר קשת 16 יח": the chain sells 8-roll packs, show them as "גודל שונה"). Up to three times, or a third:
 * a 16-pack against 8 or 6 rolls is the same shelf, a 2-litre tub against 100 ml is not.
 */
export const OTHER_SIZE_SPAN = 3;

/** A brand two products can be said to share: a filler ("," "לא ידוע" "כללי") is no brand at all. */
const BRAND_FILLER = /^(לא ידוע|כללי|unknown|ללא|אחר|שונות|ישראל)$/i;
export function sameBrand(a, b) {
  const norm = (s) => String(s ?? '').replace(/["'״׳`.,\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const [x, y] = [norm(a), norm(b)];
  return x.length >= 2 && !BRAND_FILLER.test(x) && x === y;
}

/**
 * Is `candidate` an acceptable stand-in for `product`? Returns { ok: true, caveats? } or { ok: false, reason }.
 * `reason` is one short token so an audit can count them (docs/CONCEPTS.md §4 lists them).
 *
 * For a line the chain cannot fill (`purpose: 'missing'`) two refusals soften into caveats the shopper sees
 * (Naor, 2.10) - an offer they are asked about, never a cheaper-offer claim:
 *   'size-unconfirmed'  the customer's product has no known size (the chain did not publish it, or cut it off
 *                       the name) - a candidate with no size against a known one is still refused;
 *   'other-flavour'     the flavour differs, but the brand is the same ("אין עוגיות, יש וניל מאותו מותג").
 *   'other-size'        both sizes are known and the candidate's is outside the tolerance but within
 *                       OTHER_SIZE_SPAN either way (Naor, 11.10: a 16-roll pack when the chain sells 8).
 * A cheaper offer on a line the chain does sell stays strict on all three.
 *
 * @param {object} args
 * @param {object} args.product         the customer's product (unified catalog)
 * @param {object} args.candidate       another unified product
 * @param {boolean} args.requireSize    the concept has a size unit (sizeUnit !== null)
 * @param {number|null} args.referencePrice  what the customer pays per unit/kg today (this chain, or basePrice)
 * @param {number|null} args.candidatePrice  the candidate's unit/kg price at the chain
 * @param {string} [args.candidateName] the chain's own name for the candidate (a fuller name than the unified one is common)
 * @param {'cheaper'|'missing'} [args.purpose]
 */
export function compatible({ product, candidate, requireSize, referencePrice = null, candidatePrice = null, candidateName = null, purpose = 'cheaper' }, r = rules()) {
  const missing = purpose === 'missing';
  const caveats = [];
  if (!!candidate.isWeighted !== !!product.isWeighted) return { ok: false, reason: 'form-of-sale' };
  if (candidate.category !== product.category) return { ok: false, reason: 'category' };
  // Two weighed products have no package to compare - both are priced by the kilo - so the size check does not
  // apply to them. Before 1.10 it refused them on a null size: 690 weighed products (entrecote, fish by the kilo)
  // in sized concepts could neither get a stand-in nor be one.
  const bothWeighed = !!product.isWeighted && !!candidate.isWeighted;
  if (requireSize && !bothWeighed && !sizeWithin(product.size, candidate.size, r.sizeTolerance)) {
    // Only the shopper's own size may be unknown (Naor, 2.10: "מוצר חסר שהגודל שלו לא ידוע"). An unsized
    // CANDIDATE against a known size matched anything: in production on 3.10 a 2-litre tub of five flavours was
    // offered a 475 ml ricotta ice cream, and a protein ice cream an ice-cream scoop.
    if (missing && !product.size) caveats.push('size-unconfirmed');
    else {
      // Both sizes known and apart (11.10): for a missing line a pack up to OTHER_SIZE_SPAN times bigger or
      // smaller is offered as 'other-size'; a cheaper offer, or anything further off, is still refused.
      const ratio = missing ? sizeRatio(product.size, candidate.size) : null;
      if (ratio === null || ratio > OTHER_SIZE_SPAN + 1e-9 || ratio < 1 / OTHER_SIZE_SPAN - 1e-9) return { ok: false, reason: 'size' };
      caveats.push('other-size');
    }
  }
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
  if (!sameSet(variantOf(product.name), union(variantOf))) {
    if (!(missing && sameBrand(product.brand, candidate.brand))) return { ok: false, reason: 'variant' };
    caveats.push('other-flavour');
  }

  if (Number.isFinite(referencePrice) && referencePrice > 0 && Number.isFinite(candidatePrice) && candidatePrice > 0) {
    if (candidatePrice * r.priceBand < referencePrice || candidatePrice > referencePrice * r.priceBand) return { ok: false, reason: 'price-band' };
  }
  // One softening at a time (11.10, from the 100-basket run): a different flavour AND a different pack is no
  // longer the shopper's product - a 4x90 g cucumber Dove was offered a 6-pack of cucumber-and-green-tea, a
  // 500 g peach Yoplait a 6-pack of strawberry tubes. The flavour is what the shopper would notice first.
  if (caveats.includes('other-size') && caveats.includes('other-flavour')) return { ok: false, reason: 'variant' };
  return caveats.length ? { ok: true, caveats } : { ok: true };
}
