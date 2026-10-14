/**
 * Substitutes (docs/CONCEPTS.md §4): finding another product that answers the same customer
 * intent (`product.conceptId`) at a given chain, either because the original is not sold there
 * or because a cheaper same-concept product exists.
 *
 * "Same concept" only opens the door. The rules of 22.9.2026 (src/pricing/substituteRules.js,
 * config/substitutes/rules.json) decide whether a candidate is really the same thing: same form of sale
 * (a kilo for a kilo), same department, size within tolerance, same physical form, same dietary variant,
 * same flavour / filling, the same percentage, and a price within a band of what the customer pays today.
 * A concept can be declared a shelf (`missingOnly`) or off limits (`none`), and concepts of one family
 * ("אורז": white, basmati, jasmine, brown) stand in for one another when the line would otherwise be lost.
 * Since 12.10 the families are the concept tree's own (config/concepts, src/catalog/concepts.js families()),
 * with rules.json `families` as an override layer (a family switched off, leaves kept out); a family stand-in
 * always carries the caveat 'other-family' ("מאותה משפחה").
 */
import { conceptById, concepts as allConcepts, families as treeFamilies } from '../catalog/concepts.js';
import { priceLine } from './promotions.js';
import { rules as loadRules, compatible, familyOf as familyOfRules, buildFamilyTree, conceptPolicy, sizeWithin as sizeWithinRule, sizeRatio } from './substituteRules.js';

export const SIZE_TOLERANCE = 0.25;
export const sizeWithin = sizeWithinRule;

/** Sentinel for "the concept is unknown" - distinct from a concept whose sizeUnit is really null. */
const UNKNOWN_SIZE_UNIT = Symbol('unknown-size-unit');

// Real concept metadata comes from config/concepts/*.json via conceptById. Tests swap this seam
// so they stay deterministic and independent of that (concurrently edited) config.
let conceptLookup = conceptById;
/** Test-only: override concept lookup. Pass a falsy value to restore the real conceptById. */
export function _setConceptLookup(fn) { conceptLookup = typeof fn === 'function' ? fn : conceptById; }

// The concept tree's families, one row per concept ({ conceptId, family: {id,name}, category }). Tests swap
// this seam for the same reason as conceptLookup; a falsy value restores the live tree.
let familyEntriesOverride = null;
/** Test-only: override the concept tree's family rows. Pass a falsy value to restore config/concepts. */
export function _setFamilyTree(entries) { familyEntriesOverride = entries || null; }
const familyTrees = new WeakMap(); // compiled rules -> { source, tree }
function familyTree(r) {
  const source = familyEntriesOverride ?? allConcepts();
  let hit = familyTrees.get(r);
  if (!hit || hit.source !== source) {
    const entries = familyEntriesOverride
      ?? treeFamilies(source).flatMap((f) => f.conceptIds.map((conceptId) => ({ conceptId, family: { id: f.id, name: f.name }, category: f.category })));
    hit = { source, tree: buildFamilyTree(entries, r) };
    familyTrees.set(r, hit);
  }
  return hit.tree;
}

/** The family a missing line of `conceptId` may borrow from (a hand-made rules.json family, else the concept
 * tree's), or null. The same answer evaluateSubstitutes acts on. */
export function familyOf(conceptId, r = loadRules()) { return conceptId ? familyOfRules(conceptId, r, familyTree(r)) : null; }

function conceptSizeUnit(conceptId) {
  const concept = conceptLookup(conceptId);
  // Guard: an unknown concept id gets no size-check bypass - both sizes are required and must match.
  return concept ? concept.sizeUnit : UNKNOWN_SIZE_UNIT;
}

// conceptId -> products, built once per MappingEngine (7,000+ products × every cart line × 14 chains otherwise).
const conceptIndexes = new WeakMap();
function productsByConcept(mapping) {
  let index = conceptIndexes.get(mapping);
  if (!index) {
    index = new Map();
    for (const p of mapping.productsById.values()) if (p.conceptId) (index.get(p.conceptId) ?? index.set(p.conceptId, []).get(p.conceptId)).push(p);
    conceptIndexes.set(mapping, index);
  }
  return index;
}

function isPrivateLabelCandidate(product, storeItem, chainId) {
  return !!(storeItem?.privateLabel || product.privateLabelOf === chainId);
}

/** Same money, within rounding: the tie-break below prefers the chain's own brand among these. */
const TIE_EPSILON = 0.005;

/**
 * Every candidate for `product` at `chainId`, each with the verdict of the rules - the audit reads this,
 * findSubstitute picks the cheapest of the accepted ones.
 *
 * @param {object} args
 * @param {object} args.product the original (unified catalog) product
 * @param {number} args.qty
 * @param {string} args.chainId
 * @param {import('../catalog/mapping.js').MappingEngine} args.mapping
 * @param {'privateLabel'|'cheapest'} args.policy
 * @param {'cheaper'|'missing'} [args.purpose]  why we are looking: a cheaper offer on an available line, or a replacement for a line the chain cannot fill
 * @param {number|null} [args.referencePrice]   what the customer pays per unit/kg today (this chain's price; basePrice for a missing line)
 * @param {'concept'|'family'} [args.scope]     same concept (default) or the concept's family (missing lines only)
 * @param {boolean} [args.rules]                false = the pre-22.9 behaviour (concept + size only); the audit's "before"
 */
export function evaluateSubstitutes({ product, qty, chainId, mapping, policy, purpose = 'cheaper', referencePrice = null, scope = 'concept', rules = true }) {
  const out = [];
  if (!product?.conceptId) return out;
  const r = rules ? loadRules() : null;
  // The family tier is for a line the chain cannot fill, never a cheaper offer, and needs the rules to know the
  // families; a concept that is off limits (`none`) borrows from none either.
  if (scope === 'family' && (!r || purpose !== 'missing' || conceptPolicy(product.conceptId, r) === 'none')) return out;
  const conceptIds = scope === 'family'
    ? (familyOf(product.conceptId, r)?.concepts ?? []).filter((c) => c !== product.conceptId)
    : [product.conceptId];
  const index = productsByConcept(mapping);
  const ownSizeUnit = conceptSizeUnit(product.conceptId);
  for (const conceptId of conceptIds) {
    if (r) {
      const pol = conceptPolicy(conceptId, r);
      if (pol === 'none' || (pol === 'missingOnly' && purpose !== 'missing')) continue;
    }
    const sizeUnit = conceptSizeUnit(conceptId);
    const requireSize = sizeUnit !== null; // sizeUnit === null (a known concept with no size) skips the size check entirely
    // Across a family the two leaves must measure in the same unit (12.10); within one concept they always do.
    const sameSizeUnit = conceptId === product.conceptId || sizeUnit === ownSizeUnit;
    for (const candidate of index.get(conceptId) ?? []) {
      if (candidate.id === product.id) continue;
      const entry = { candidate, conceptId, ok: false, reason: null, resolved: null };
      out.push(entry);
      if (!rules && requireSize && !(product.isWeighted && candidate.isWeighted) && !sizeWithin(product.size, candidate.size, SIZE_TOLERANCE)) { entry.reason = 'size'; continue; }

      const resolved = mapping.resolve(candidate.id, chainId);
      if (!resolved || !resolved.storeItem.inStock) { entry.reason = 'not-sold'; continue; }
      entry.resolved = resolved;
      const item = resolved.storeItem;
      const privateLabel = isPrivateLabelCandidate(candidate, item, chainId);
      if (policy === 'privateLabel' && !privateLabel) { entry.reason = 'policy'; continue; }

      if (r) {
        const verdict = compatible({ product, candidate, requireSize, sameSizeUnit, referencePrice, candidatePrice: item.price, candidateName: item.name, purpose }, r);
        if (!verdict.ok) { entry.reason = verdict.reason; continue; }
        if (verdict.caveats) entry.caveats = verdict.caveats;
      }

      const priced = priceLine({ unitPrice: item.price, qty, promotions: item.promotions, isWeighted: item.isWeighted });
      Object.assign(entry, { ok: true, privateLabel, unitPrice: item.price, lineTotal: priced.total, savings: priced.savings });
    }
  }
  return out;
}

/**
 * Ranks two accepted evaluateSubstitutes entries the pre-14.10 way: fewer caveats first, whatever the
 * price; among 'other-size' stand-ins the nearest size next (|ln ratio| treats half and double alike); then
 * the cheaper line; a tie within rounding goes to the chain's own brand (docs/CONCEPTS.md §4, private
 * label). Still used where Naor's 14.10 per-gram order does not apply: a cheaper offer (never a caveat, so
 * this is line price - see rankedSameConcept), a `scope: 'family'` pick, and a missing line's
 * 'other-flavour' last-resort pick. Negative when `a` should rank before `b`.
 */
function compareCandidates(a, b, product) {
  const caveatCount = (e) => e.caveats?.length ?? 0;
  const ca = caveatCount(a), cb = caveatCount(b);
  if (ca !== cb) return ca - cb;
  const sizeDistance = (e) => {
    if (!e.caveats?.includes('other-size')) return 0;
    const ratio = sizeRatio(product.size, e.candidate.size);
    return ratio ? Math.abs(Math.log(ratio)) : Infinity;
  };
  const da = sizeDistance(a), db = sizeDistance(b);
  if (Math.abs(da - db) > 1e-9) return da - db;
  if (Math.abs(a.lineTotal - b.lineTotal) > TIE_EPSILON) return a.lineTotal - b.lineTotal;
  if (a.privateLabel !== b.privateLabel) return a.privateLabel ? -1 : 1;
  return 0;
}

/**
 * What a candidate costs per ONE of the shopper's own packs - Naor, 14.10: "מחיר פר גרם מהזול ליקר".
 * Ranking by this is ranking by price per gram / millilitre / unit, but it is measured against the shopper's
 * size through `sizeRatio`, the same comparison the size rules used to admit the candidate, so it is
 * unit-safe by construction: a gram is never weighed against a millilitre or a piece (sizeRatio is null
 * there), and a count-matched pack ("50 יחידות" against "50 שקיות x 1.5 גר") is compared by count, as the
 * rules compared it. `value * count` is the pack's measure on both sides (a 4x56 pack is 224).
 *
 * The price is the LINE price (what this cart pays for the candidate, promotions for this quantity
 * included), not the chain's shelf price: qty is the same for every candidate, so lineTotal / ratio orders
 * exactly like ₪ per gram for this cart - and a "2 ב-10" the shopper would get counts, which the shelf
 * price hides (measured on the receipts 14.10: per-kilo shelf price picked a ₪94.28 chicken fillet line
 * over a ₪90 one).
 *
 *  - two weighed products: both are priced by the kilo already, ratio 1 (₪/kg for this many kilos);
 *  - the shopper's size unknown ('size-unconfirmed', or a null size in a concept with no size unit), the
 *    candidate's unknown, or the two not comparable (a gram against a piece or a millilitre): null.
 * In a concept with no size unit (sizeUnit null) the size rules admit any pack, so the measure is used
 * only where the two sizes happen to be comparable - 650 g of cherry tomatoes against the shopper's 460 g
 * is cheaper per gram, a head of lettuce against a 250 g box is not comparable at all.
 * A null goes after every candidate with a measure, ranked by line price (compareByUnitPrice).
 */
function packEquivalentPrice(entry, product) {
  if (product.isWeighted && entry.candidate.isWeighted) return entry.lineTotal;
  if (entry.caveats?.includes('size-unconfirmed')) return null;
  const ratio = sizeRatio(product.size, entry.candidate.size);
  return ratio && ratio > 0 ? entry.lineTotal / ratio : null;
}

/**
 * Ranks two accepted, same-product evaluateSubstitutes entries for a missing line's `alternatives` list
 * (Naor, 14.10: "אפשר 5, אבל חייב להיות אותו מוצר... מחיר פר גרם מהזול ליקר"): cheapest per unit of
 * measure first (`packEquivalentPrice`) - a confirmed (no caveat) and an 'other-size' candidate are the
 * same product in a different pack, so they rank together; the caveat count and "nearest size" no longer
 * separate them. Candidates with no comparable measure ('size-unconfirmed' - the shopper's OWN size is the
 * unknown one - or, in a concept with no size unit, a pack measured differently) go after every measured
 * one, by line price. A tie within rounding (a shekel amount on both branches, so TIE_EPSILON) goes to
 * the chain's own brand (docs/CONCEPTS.md §4, private label), then to the confirmed size over 'other-size'.
 * `key` caches packEquivalentPrice per entry.
 */
function compareByUnitPrice(a, b, key) {
  const pa = key(a), pb = key(b);
  if ((pa === null) !== (pb === null)) return pa === null ? 1 : -1;
  const [va, vb] = pa === null ? [a.lineTotal, b.lineTotal] : [pa, pb];
  if (Math.abs(va - vb) > TIE_EPSILON) return va - vb;
  if (a.privateLabel !== b.privateLabel) return a.privateLabel ? -1 : 1;
  // Still level (a dozen eggs at exactly the 18-pack's price per egg): the shopper's own size first.
  return (a.caveats?.length ?? 0) - (b.caveats?.length ?? 0);
}

/** Sorts same-product entries by unit price for `product` (see compareByUnitPrice). */
function sortByUnitPrice(entries, product) {
  const cache = new Map();
  const key = (e) => { if (!cache.has(e)) cache.set(e, packEquivalentPrice(e, product)); return cache.get(e); };
  return entries.sort((a, b) => compareByUnitPrice(a, b, key));
}

function toSubstituteResult(entry, tier, family) {
  return {
    product: entry.candidate,
    resolved: entry.resolved,
    unitPrice: entry.unitPrice,
    lineTotal: entry.lineTotal,
    savings: entry.savings,
    privateLabel: entry.privateLabel,
    tier,
    family: family ? { id: family.id, name: family.name } : null,
    ...(entry.caveats ? { caveats: entry.caveats } : {}),
  };
}

/** Same product as the customer's: same leaf, same kinds, same flavour signature - size may differ
 * (Naor, 14.10: "אפשר 5, אבל חייב להיות אותו מוצר"). An 'other-flavour' candidate answers the concept but
 * is a different product, so it is never a list member - only ever the last-resort single pick. */
const isSameProduct = (e) => !e.caveats?.includes('other-flavour');

function dedupeByItem(entries) {
  const seenProducts = new Set();
  const seenItems = new Set();
  const out = [];
  for (const e of entries) {
    const item = e.resolved?.storeItem;
    const itemKey = item ? String(item.storeItemId ?? item.code ?? item.gtin ?? '') : '';
    if (seenProducts.has(e.candidate.id) || (itemKey && seenItems.has(itemKey))) continue;
    seenProducts.add(e.candidate.id);
    if (itemKey) seenItems.add(itemKey);
    out.push(e);
  }
  return out;
}

/**
 * The ranked same-concept entries one search ranks (both findSubstitute and findSubstitutes read this, so
 * `findSubstitutes(args)[0]` is always `findSubstitute(args)` for `scope: 'concept'`):
 *  - a MISSING line (Naor, 14.10): only the same-product entries (no 'other-flavour'; 'other-size' and
 *    'size-unconfirmed' stay), cheapest per unit of measure first (sortByUnitPrice);
 *  - a CHEAPER offer on a line the chain does sell: every accepted entry by line price (compareCandidates
 *    - a cheaper offer never carries a caveat, so that is line price, then private label). Kept by line
 *    price on purpose (review 14.10): the offer's claim is "you save ₪X on this line", the caller drops a
 *    candidate whose line is not cheaper, and the size tolerance (±25%) already keeps the packs alike -
 *    ranking it per gram made the per-gram winner a bigger pack whose line costs more, and the offer was
 *    lost although a cheaper line existed (18 of 205 offers on Naor's five receipts).
 */
function rankedSameConcept(entries, args) {
  if (args.purpose === 'missing') return sortByUnitPrice(entries.filter(isSameProduct), args.product);
  return [...entries].sort((a, b) => compareCandidates(a, b, args.product));
}

/**
 * Best candidate to answer `product`'s concept (or, `scope: 'family'`, its family) at `chainId`, or null.
 *
 * `scope: 'concept'`: the first of rankedSameConcept (for a missing line, the cheapest same product per
 * unit of measure - Naor, 14.10; for a cheaper offer, the cheapest line). When a missing line has NOT ONE
 * same-product candidate, an 'other-flavour' same-brand one answers instead, by the old rule
 * (`compareCandidates`: fewest caveats, nearest size, cheaper line, private label) - Naor's 14.10
 * last-resort single pick, never a list member. `scope: 'family'` is always the old rule too.
 * Same arguments as evaluateSubstitutes.
 *
 * @returns {{product:object, resolved:object, unitPrice:number, lineTotal:number, savings:number, privateLabel:boolean, tier:'concept'|'family', family:{id:string,name:string}|null, caveats?:string[]}|null}
 */
export function findSubstitute(args) {
  const scope = args.scope === 'family' ? 'family' : 'concept';
  const entries = evaluateSubstitutes({ ...args, scope }).filter((e) => e.ok);
  let best = null;
  if (scope === 'concept') {
    best = rankedSameConcept(entries, args)[0] ?? null;
    if (!best && args.purpose === 'missing') {
      best = entries.filter((e) => !isSameProduct(e)).sort((a, b) => compareCandidates(a, b, args.product))[0] ?? null;
    }
  } else {
    best = entries.sort((a, b) => compareCandidates(a, b, args.product))[0] ?? null;
  }
  if (!best) return null;
  const family = scope === 'family' ? familyOf(args.product.conceptId) : null;
  return toSubstituteResult(best, scope, family);
}

/**
 * The full ranked list a missing line's shopper chooses from (Naor, 12.10: "אתה צריך להציע לו את כל
 * האופציות להחלפה שיבחר לבד"; refined 14.10: "אפשר 5, אבל חייב להיות אותו מוצר").
 *
 * For a missing line every member is the same product as `args.product`: same leaf (`tier: 'concept'`
 * always - a family candidate is never a list member), same kinds, same flavour; size may differ
 * ('other-size', 'size-unconfirmed'). Ordered cheapest per gram / ml / unit first, measured against the
 * shopper's own size (packEquivalentPrice - Naor, 14.10: "מחיר פר גרם מהזול ליקר"); confirmed and
 * 'other-size' together, candidates with no comparable measure after, by line price; a tie goes to the
 * chain's own brand. For a cheaper offer (`purpose` not 'missing') the same list is by line price.
 *
 * De-duplicated by product id and by the chain item it resolves to - several weighed products can resolve,
 * through their concept, to the same cheapest chain item (12.10 review: ramilevy listed "תפוח אדמה לבן
 * ארוז" four times); the better-ranked one stays. Capped at `limit` (default 5) after the de-duplication.
 *
 * **Empty is a real answer**: `[]` can still go with a single `alternative` - unavailableLine (compare.js)
 * then falls back to `findSubstitute({...args, scope: 'concept'}) ?? findSubstitute({...args, scope:
 * 'family'})` (other-flavour same brand, else the family) and reports `alternatives: []` beside it.
 * When non-empty, `findSubstitutes(args)[0]` is exactly `findSubstitute({...args, scope: 'concept'})`.
 *
 * @param {object} args    same as findSubstitute / evaluateSubstitutes (`args.scope` is ignored - always
 *                          a `scope: 'concept'` search)
 * @param {{limit?: number}} [opts]
 * @returns {Array<{product:object, resolved:object, unitPrice:number, lineTotal:number, savings:number, privateLabel:boolean, tier:'concept', family:null, caveats?:string[]}>}
 */
export function findSubstitutes(args, { limit = 5 } = {}) {
  const entries = evaluateSubstitutes({ ...args, scope: 'concept' }).filter((e) => e.ok);
  return dedupeByItem(rankedSameConcept(entries, args)).slice(0, limit).map((e) => toSubstituteResult(e, 'concept', null));
}
