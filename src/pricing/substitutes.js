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
 */
import { conceptById } from '../catalog/concepts.js';
import { priceLine } from './promotions.js';
import { rules as loadRules, compatible, familyOf, conceptPolicy, sizeWithin as sizeWithinRule } from './substituteRules.js';

export const SIZE_TOLERANCE = 0.25;
export const sizeWithin = sizeWithinRule;

/** Sentinel for "the concept is unknown" - distinct from a concept whose sizeUnit is really null. */
const UNKNOWN_SIZE_UNIT = Symbol('unknown-size-unit');

// Real concept metadata comes from config/concepts/*.json via conceptById. Tests swap this seam
// so they stay deterministic and independent of that (concurrently edited) config.
let conceptLookup = conceptById;
/** Test-only: override concept lookup. Pass a falsy value to restore the real conceptById. */
export function _setConceptLookup(fn) { conceptLookup = typeof fn === 'function' ? fn : conceptById; }

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
  const conceptIds = scope === 'family' && r
    ? (familyOf(product.conceptId, r)?.concepts ?? []).filter((c) => c !== product.conceptId)
    : [product.conceptId];
  const index = productsByConcept(mapping);
  for (const conceptId of conceptIds) {
    if (r) {
      const pol = conceptPolicy(conceptId, r);
      if (pol === 'none' || (pol === 'missingOnly' && purpose !== 'missing')) continue;
    }
    const sizeUnit = conceptSizeUnit(conceptId);
    const requireSize = sizeUnit !== null; // sizeUnit === null (a known concept with no size) skips the size check entirely
    for (const candidate of index.get(conceptId) ?? []) {
      if (candidate.id === product.id) continue;
      const entry = { candidate, conceptId, ok: false, reason: null, resolved: null };
      out.push(entry);
      if (!rules && requireSize && !sizeWithin(product.size, candidate.size, SIZE_TOLERANCE)) { entry.reason = 'size'; continue; }

      const resolved = mapping.resolve(candidate.id, chainId);
      if (!resolved || !resolved.storeItem.inStock) { entry.reason = 'not-sold'; continue; }
      entry.resolved = resolved;
      const item = resolved.storeItem;
      const privateLabel = isPrivateLabelCandidate(candidate, item, chainId);
      if (policy === 'privateLabel' && !privateLabel) { entry.reason = 'policy'; continue; }

      if (r) {
        const verdict = compatible({ product, candidate, requireSize, referencePrice, candidatePrice: item.price, candidateName: item.name }, r);
        if (!verdict.ok) { entry.reason = verdict.reason; continue; }
      }

      const priced = priceLine({ unitPrice: item.price, qty, promotions: item.promotions, isWeighted: item.isWeighted });
      Object.assign(entry, { ok: true, privateLabel, unitPrice: item.price, lineTotal: priced.total, savings: priced.savings });
    }
  }
  return out;
}

/**
 * Best candidate to answer `product`'s concept at `chainId`, or null: the cheapest accepted candidate,
 * and among candidates that cost the same, the chain's own brand (docs/CONCEPTS.md §4, private label).
 * Same arguments as evaluateSubstitutes.
 *
 * @returns {{product:object, resolved:object, unitPrice:number, lineTotal:number, savings:number, privateLabel:boolean, tier:'concept'|'family', family:{id:string,name:string}|null}|null}
 */
export function findSubstitute(args) {
  let best = null;
  for (const e of evaluateSubstitutes(args)) {
    if (!e.ok) continue;
    const cheaper = !best || e.lineTotal < best.lineTotal - TIE_EPSILON;
    const tie = best && Math.abs(e.lineTotal - best.lineTotal) <= TIE_EPSILON && e.privateLabel && !best.privateLabel;
    if (cheaper || tie) best = e;
  }
  if (!best) return null;
  const scope = args.scope === 'family' ? 'family' : 'concept';
  const family = scope === 'family' ? familyOf(args.product.conceptId) : null;
  return {
    product: best.candidate,
    resolved: best.resolved,
    unitPrice: best.unitPrice,
    lineTotal: best.lineTotal,
    savings: best.savings,
    privateLabel: best.privateLabel,
    tier: scope,
    family: family ? { id: family.id, name: family.name } : null,
  };
}
