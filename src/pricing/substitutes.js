/**
 * Substitutes (docs/CONCEPTS.md §4): finding another product that answers the same customer
 * intent (`product.conceptId`) at a given chain, either because the original is not sold there
 * or because a cheaper same-concept product exists.
 */
import { conceptById } from '../catalog/concepts.js';
import { priceLine } from './promotions.js';

export const SIZE_TOLERANCE = 0.25;

/** Sentinel for "the concept is unknown" - distinct from a concept whose sizeUnit is really null. */
const UNKNOWN_SIZE_UNIT = Symbol('unknown-size-unit');

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

/**
 * Best candidate to answer `product`'s concept at `chainId`, or null.
 *
 * @param {object} args
 * @param {object} args.product the original (unified catalog) product
 * @param {number} args.qty
 * @param {string} args.chainId
 * @param {import('../catalog/mapping.js').MappingEngine} args.mapping
 * @param {'privateLabel'|'cheapest'} args.policy
 * @returns {{product:object, resolved:object, unitPrice:number, lineTotal:number, savings:number, privateLabel:boolean}|null}
 */
export function findSubstitute({ product, qty, chainId, mapping, policy }) {
  if (!product?.conceptId) return null;
  const sizeUnit = conceptSizeUnit(product.conceptId);
  const requireSize = sizeUnit !== null; // sizeUnit === null (a known concept with no size) skips the size check entirely

  let best = null;
  for (const candidate of productsByConcept(mapping).get(product.conceptId) ?? []) {
    if (candidate.id === product.id) continue;
    if (requireSize && !sizeWithin(product.size, candidate.size, SIZE_TOLERANCE)) continue;

    const resolved = mapping.resolve(candidate.id, chainId);
    if (!resolved || !resolved.storeItem.inStock) continue;

    const item = resolved.storeItem;
    const privateLabel = isPrivateLabelCandidate(candidate, item, chainId);
    if (policy === 'privateLabel' && !privateLabel) continue;

    const priced = priceLine({ unitPrice: item.price, qty, promotions: item.promotions, isWeighted: item.isWeighted });
    if (!best || priced.total < best.lineTotal - 1e-9) {
      best = {
        product: candidate,
        resolved,
        unitPrice: item.price,
        lineTotal: priced.total,
        savings: priced.savings,
        privateLabel,
      };
    }
  }
  return best;
}
