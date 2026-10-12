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
 * Ranks two accepted evaluateSubstitutes entries the way findSubstitute picks a winner (2.10/11.10):
 * fewer caveats first, whatever the price; among 'other-size' stand-ins the nearest size next (|ln ratio|
 * treats half and double alike); then the cheaper line; a tie within rounding goes to the chain's own
 * brand (docs/CONCEPTS.md §4, private label). Negative when `a` should rank before `b`.
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

/**
 * Best candidate to answer `product`'s concept at `chainId`, or null: the cheapest accepted candidate,
 * and among candidates that cost the same, the chain's own brand (docs/CONCEPTS.md §4, private label).
 * A candidate with no caveat beats any with one, whatever the price (2.10): a confirmed same-size product is
 * the answer, a "size unconfirmed" or "other flavour" one only when nothing confirmed exists.
 * Same arguments as evaluateSubstitutes. Within one scope, `findSubstitutes(args)[0]` is this same answer.
 *
 * @returns {{product:object, resolved:object, unitPrice:number, lineTotal:number, savings:number, privateLabel:boolean, tier:'concept'|'family', family:{id:string,name:string}|null, caveats?:string[]}|null}
 */
export function findSubstitute(args) {
  const entries = evaluateSubstitutes(args).filter((e) => e.ok);
  entries.sort((a, b) => compareCandidates(a, b, args.product));
  const best = entries[0];
  if (!best) return null;
  const scope = args.scope === 'family' ? 'family' : 'concept';
  const family = scope === 'family' ? familyOf(args.product.conceptId) : null;
  return toSubstituteResult(best, scope, family);
}

/**
 * The full ranked list findSubstitute's pick comes from (Naor, 12.10: "אתה צריך להציע לו את כל האופציות
 * להחלפה שיבחר לבד" - offer every candidate, let the shopper choose, not only the single best one).
 *
 * Same-leaf (scope 'concept') candidates come first, ordered exactly as findSubstitute ranks among them;
 * then, for a line the chain cannot fill, the concept's family candidates are appended after - never ahead
 * of a same-leaf one, whatever its caveats (findMissingReplacement's own tier order, docs/CONCEPTS.md §4).
 * The family tier is naturally empty for a cheaper offer or an off-limits concept (evaluateSubstitutes
 * itself refuses it then), so calling for it unconditionally is harmless. De-duplicated by product id
 * and by the chain item it resolves to - several weighed products can resolve, through their concept, to
 * the same cheapest chain item (12.10 review: ramilevy listed "תפוח אדמה לבן ארוז" four times), and the
 * shopper must not see one shelf item twice; the better-ranked one stays. Capped at `limit` (default 5)
 * after the de-duplication, and the family tier is skipped once the leaf alone fills the limit.
 * `findSubstitutes(args)[0]` is the single pick a missing line gets: `findSubstitute({...args, scope:'concept'})
 * ?? findSubstitute({...args, scope:'family'})` (for a cheaper offer, just `findSubstitute(args)`).
 *
 * @param {object} args    same as findSubstitute / evaluateSubstitutes (any `args.scope` is ignored - both
 *                          tiers are considered, in order)
 * @param {{limit?: number}} [opts]
 * @returns {Array<{product:object, resolved:object, unitPrice:number, lineTotal:number, savings:number, privateLabel:boolean, tier:'concept'|'family', family:{id:string,name:string}|null, caveats?:string[]}>}
 */
export function findSubstitutes(args, { limit = 5 } = {}) {
  const seenProducts = new Set();
  const seenItems = new Set();
  const out = [];
  for (const tier of ['concept', 'family']) {
    if (out.length >= limit) break;
    const entries = evaluateSubstitutes({ ...args, scope: tier }).filter((e) => e.ok);
    entries.sort((a, b) => compareCandidates(a, b, args.product));
    const family = tier === 'family' ? familyOf(args.product.conceptId) : null;
    for (const e of entries) {
      const item = e.resolved?.storeItem;
      const itemKey = item ? String(item.storeItemId ?? item.code ?? item.gtin ?? '') : '';
      if (seenProducts.has(e.candidate.id) || (itemKey && seenItems.has(itemKey))) continue;
      seenProducts.add(e.candidate.id);
      if (itemKey) seenItems.add(itemKey);
      out.push(toSubstituteResult(e, tier, family));
    }
  }
  return out.slice(0, limit);
}
