import { priceLine, upsellHint, round2 } from './promotions.js';
import { poolBundles } from './pooling.js';
import { selectBranch, pickupBranches } from '../geo/branches.js';
import { priceListMeta } from '../catalog/priceList.js';
import { findSubstitute } from './substitutes.js';

export const LINE_STATUS = {
  OK: 'ok',
  SUBSTITUTED: 'substituted',
  MISSING: 'missing',
  OUT_OF_STOCK: 'out_of_stock',
};

export const DEFAULT_SUBSTITUTES = { policy: 'privateLabel', apply: 'ask' };
const CHEAPER_EPSILON = 0.005; // avoid flagging an "alternative" that is cheaper only by rounding noise

function buildPricedLine({ product, usedProduct, resolved, qty, status, substituteReason }) {
  const item = resolved.storeItem;
  const priced = priceLine({ unitPrice: item.price, qty, promotions: item.promotions, isWeighted: item.isWeighted });
  const hint = upsellHint({ unitPrice: item.price, qty, promotions: item.promotions, isWeighted: item.isWeighted });
  return {
    productId: product.id,
    name: product.name,
    qty,
    unit: product.unit,
    status,
    storeItemId: item.storeItemId,
    storeItemName: item.name,
    substituteFor: status === LINE_STATUS.SUBSTITUTED ? product.name : null,
    substituteReason: status === LINE_STATUS.SUBSTITUTED ? substituteReason : null,
    usedProductId: usedProduct.id,
    unitPrice: item.price,
    lineTotal: priced.total,
    promo: priced.promoText,
    savings: priced.savings,
    // Members-only price, when it beats the regular one (decision 19.9: shown on a separate line, never in the total).
    club: priced.club ? { lineTotal: priced.club.total, promo: priced.club.promoText, savings: priced.club.savings, label: priced.club.promo.clubLabel ?? null } : null,
    // "Take N more and save": reaching a bundle costs no more than the current quantity.
    hint: hint ? { addQty: hint.addQty, lineTotal: hint.total, promo: hint.promoText } : null,
    matchMethod: resolved.method,
    matchScore: resolved.score,
    // "יש זול יותר" (docs/CONCEPTS.md §4): a same-concept candidate cheaper than this line, offered rather
    // than applied (substitutes.apply === 'ask'). Null when apply === 'auto' or no cheaper candidate exists.
    alternative: null,
    _promos: item.promotions ?? [],
    _weighted: !!item.isWeighted,
  };
}

/**
 * Offers (or, in `apply: 'auto'`, applies) a cheaper same-concept candidate on top of an already-priced
 * OK line, per `substitutes.policy` (§4). Called whenever the primary product is what's being priced -
 * whether because there was no explicit `substituteProductId`, or because one was given but did not
 * resolve at this chain (in which case it falls back here "as usual", §4).
 */
function offerCheaperAlternative(built, { product, qty, chainId, mapping, substitutes }) {
  if (substitutes.policy === 'none') return built;
  const candidate = findSubstitute({ product, qty, chainId, mapping, policy: substitutes.policy });
  if (!candidate || candidate.lineTotal >= built.lineTotal - CHEAPER_EPSILON) return built;

  if (substitutes.apply === 'auto') {
    const replaced = buildPricedLine({
      product,
      usedProduct: candidate.product,
      resolved: candidate.resolved,
      qty,
      status: LINE_STATUS.SUBSTITUTED,
      substituteReason: 'cheaper',
    });
    if (built.substituteTried) replaced.substituteTried = built.substituteTried;
    return replaced;
  }

  built.alternative = {
    productId: candidate.product.id,
    name: candidate.product.name,
    storeItemName: candidate.resolved.storeItem.name,
    unitPrice: candidate.unitPrice,
    lineTotal: candidate.lineTotal,
    savings: round2(built.lineTotal - candidate.lineTotal),
    privateLabel: candidate.privateLabel,
    reason: 'cheaper',
  };
  return built;
}

/**
 * The chain does not sell (or has no stock of) the product this line needs. Look for another product
 * answering the same concept - any brand, cheapest for the quantity; the customer's `policy` never applies
 * to a line that would otherwise be lost (§4). `apply: 'auto'` replaces it; `ask` (the default, decision
 * 20.9) keeps the line missing and offers the candidate. `substituteTried` names an explicit choice this
 * chain does not sell either - the line still gets offered a third product of the same concept (20.9).
 */
function unavailableLine({ product, qty, chainId, mapping, substitutes, primaryResolved, substituteTried = null }) {
  const status = !primaryResolved ? LINE_STATUS.MISSING : LINE_STATUS.OUT_OF_STOCK;
  const found = findSubstitute({ product, qty, chainId, mapping, policy: 'cheapest' });
  if (found && substitutes.apply === 'auto') {
    const built = buildPricedLine({ product, usedProduct: found.product, resolved: found.resolved, qty, status: LINE_STATUS.SUBSTITUTED, substituteReason: 'missing' });
    built.substituteTried = substituteTried;
    return built;
  }
  return {
    productId: product.id,
    name: product.name,
    qty,
    unit: product.unit,
    status,
    lineTotal: 0,
    substituteTried,
    alternative: found ? {
      productId: found.product.id, name: found.product.name, storeItemName: found.resolved.storeItem.name,
      unitPrice: found.unitPrice, lineTotal: found.lineTotal, savings: 0, privateLabel: found.privateLabel, reason: 'missing',
    } : null,
  };
}

function priceCartLine(line, chainId, { mapping, productsById, substitutes }) {
  const product = productsById.get(line.productId);
  if (!product) return { productId: line.productId, name: line.productId, qty: line.qty, status: LINE_STATUS.MISSING, lineTotal: 0 };

  const primaryResolved = mapping.resolve(product.id, chainId);
  const primaryAvailable = !!(primaryResolved && primaryResolved.storeItem.inStock);

  // An explicit customer substitute (docs/CONCEPTS.md §4) is checked first and, when it resolves and is
  // in stock at this chain, ALWAYS wins - regardless of whether the original itself is available.
  if (line.substituteProductId) {
    const substitute = productsById.get(line.substituteProductId);
    const subResolved = substitute ? mapping.resolve(substitute.id, chainId) : null;
    if (subResolved && subResolved.storeItem.inStock) {
      return buildPricedLine({
        product,
        usedProduct: substitute,
        resolved: subResolved,
        qty: line.qty,
        status: LINE_STATUS.SUBSTITUTED,
        substituteReason: 'customer',
      });
    }

    // The chosen substitute isn't sold (or in stock) here. Fall back to the original when it is available;
    // otherwise the line is not simply lost: a third product of the same concept is offered (20.9).
    if (!primaryAvailable) {
      return unavailableLine({ product, qty: line.qty, chainId, mapping, substitutes, primaryResolved, substituteTried: substitute ? substitute.name : null });
    }

    let built = buildPricedLine({ product, usedProduct: product, resolved: primaryResolved, qty: line.qty, status: LINE_STATUS.OK });
    built.substituteTried = substitute ? substitute.name : null;
    // Cheaper-alternative offers still apply as usual (§4) - the failed explicit choice doesn't suppress them.
    built = offerCheaperAlternative(built, { product, qty: line.qty, chainId, mapping, substitutes });
    return built;
  }

  if (!primaryAvailable) {
    return unavailableLine({ product, qty: line.qty, chainId, mapping, substitutes, primaryResolved });
  }

  const built = buildPricedLine({ product, usedProduct: product, resolved: primaryResolved, qty: line.qty, status: LINE_STATUS.OK });
  // Available line with a cheaper same-concept candidate, per `substitutes.policy` (§4).
  return offerCheaperAlternative(built, { product, qty: line.qty, chainId, mapping, substitutes });
}

function availabilityText(available, total, missingCount) {
  if (total === 0) return 'הסל ריק';
  if (missingCount === 0) return `כל ${total} המוצרים זמינים`;
  return `ברשת זו חסרים ${missingCount} מוצרים מתוך ${total}`;
}

/**
 * Build the comparison table for a cart across all chains.
 *
 * Lines whose product is no longer in the unified catalog (the pipeline drops products sold by
 * fewer than 3 chains, docs/PIPELINE-CONTRACT.md §2.1) are reported in `unknownProducts` and
 * excluded from every row - they are not "missing at this chain", they are gone everywhere.
 *
 * @param {object} args
 * @param {{lines:Array<{productId:string, qty:number, substituteProductId?:string}>}} args.cart
 * @param {Array} args.chains chain descriptors (with branches and the pickupOnly / inStoreOnly / parent flags)
 * @param {import('../catalog/mapping.js').MappingEngine} args.mapping
 * @param {{city?:string}|null} [args.address]
 * @param {Date} [args.now]
 * @param {{policy:'none'|'privateLabel'|'cheapest', apply:'ask'|'auto'}} [args.substitutes] docs/CONCEPTS.md §4
 */
export function compareCart({ cart, chains, mapping, address = null, now = new Date(), substitutes = DEFAULT_SUBSTITUTES }) {
  const productsById = mapping.productsById;
  const allLines = cart.lines ?? [];
  const unknownProducts = allLines.filter((l) => !productsById.has(l.productId)).map((l) => ({ productId: l.productId, qty: l.qty }));
  const lines = allLines.filter((l) => productsById.has(l.productId));
  const totalItems = lines.length;

  const rows = chains.map((chain) => {
    // A chain we hold no price list for cannot be compared. It may still exist for the handoff
    // (Express Mehadrin publishes no price files at all, docs/TODO.md §2), but presenting it as a
    // deliverable row means an empty basket priced at the delivery fee alone.
    const catalogItems = mapping.catalogs?.[chain.id]?.items?.length ?? 0;
    const branch = catalogItems ? selectBranch(chain, address) : null;
    const base = {
      chainId: chain.id,
      chainName: chain.name,
      color: chain.color ?? null,
      verified: chain.verified ?? false,
      pickupOnly: !!chain.pickupOnly,
      inStoreOnly: !!chain.inStoreOnly,
      parent: chain.parent ?? null,
      priceList: priceListMeta(mapping.catalogs?.[chain.id]),
      // A pickup chain has no delivery: the customer chooses where to collect, and the terms follow
      // that choice, so every collection point is offered (decision 20.9).
      pickupPoints: pickupBranches(chain),
    };
    if (!branch) {
      return {
        ...base,
        deliverable: false,
        reason: catalogItems ? (address?.city ? `אין משלוחים ל${address.city}` : 'לא נמצא סניף מספק') : 'אין מחירון לרשת זו',
        branch: null,
        lines: [],
        available: 0,
        total: totalItems,
        missing: [],
        coverage: 0,
        subtotal: 0,
        deliveryFee: 0,
        grandTotal: 0,
        isComplete: false,
        isBestValue: false,
      };
    }

    const pricedLines = lines.map((line) => priceCartLine(line, chain.id, { mapping, productsById, substitutes }));
    poolBundles(pricedLines); // "מגוון": bundles shared across several barcodes of the same promotion
    for (const l of pricedLines) { delete l._promos; delete l._weighted; }
    const missing = pricedLines.filter((l) => l.status === LINE_STATUS.MISSING || l.status === LINE_STATUS.OUT_OF_STOCK);
    const available = totalItems - missing.length;
    const subtotal = round2(pricedLines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0));
    const savings = round2(pricedLines.reduce((sum, l) => sum + (l.savings ?? 0), 0));
    const clubSubtotal = round2(pricedLines.reduce((sum, l) => sum + (l.club ? l.club.lineTotal : (l.lineTotal ?? 0)), 0));
    const clubLabel = pricedLines.find((l) => l.club?.label)?.club.label ?? null;
    // Delivery terms are not in the price files; they are read from each chain's own published terms
    // and carry the date they were checked (docs/CHAINS.md). An unchecked fee is left out of the total
    // rather than guessed - the ranking would otherwise turn on a number nobody verified - and an
    // unchecked minimum never raises a warning.
    const freeDelivery = branch.freeDeliveryAbove != null && subtotal >= branch.freeDeliveryAbove;
    const deliveryFee = freeDelivery ? 0 : (branch.deliveryFee ?? 0);
    const deliveryTerms = branch.deliveryTerms ?? { verified: false };
    const deliveryKnown = branch.deliveryFee != null;
    const belowMinOrder = branch.minOrder != null && subtotal > 0 && subtotal < branch.minOrder;

    // "עם תחליפים" (§4/§5): what the basket would cost if every offered `alternative` were applied.
    const withAlt = pricedLines.filter((l) => l.alternative);
    const altSubtotal = round2(pricedLines.reduce((sum, l) => sum + (l.alternative ? l.alternative.lineTotal : (l.lineTotal ?? 0)), 0));
    const withAlternatives = withAlt.length
      ? { subtotal: altSubtotal, grandTotal: round2(altSubtotal + deliveryFee), savings: round2(subtotal - altSubtotal), count: withAlt.length }
      : null;
    const substitutedCount = pricedLines.filter((l) => l.status === LINE_STATUS.SUBSTITUTED).length;

    return {
      ...base,
      deliverable: true,
      branch: { id: branch.id, name: branch.name, city: branch.city },
      lines: pricedLines,
      available,
      total: totalItems,
      missing: missing.map((l) => ({ productId: l.productId, name: l.name, status: l.status })),
      substituted: pricedLines.filter((l) => l.status === LINE_STATUS.SUBSTITUTED).map((l) => ({ productId: l.productId, name: l.name, with: l.storeItemName })),
      substitutedCount,
      withAlternatives,
      coverage: totalItems ? round2(available / totalItems) : 0,
      availabilityText: availabilityText(available, totalItems, missing.length),
      subtotal,
      savings,
      deliveryFee,
      freeDelivery,
      deliveryEta: branch.eta ?? null,
      deliveryKnown,
      deliveryTerms,
      minOrder: branch.minOrder ?? null,
      belowMinOrder,
      grandTotal: round2(subtotal + deliveryFee),
      club: clubSubtotal < subtotal ? { subtotal: clubSubtotal, grandTotal: round2(clubSubtotal + deliveryFee), savings: round2(subtotal - clubSubtotal), label: clubLabel } : null,
      isComplete: totalItems > 0 && missing.length === 0,
      isBestValue: false,
    };
  });

  // Best value: cheapest complete basket; if none is complete, the one with the best coverage (then price).
  const deliverable = rows.filter((r) => r.deliverable && r.total > 0);
  const complete = deliverable.filter((r) => r.isComplete && !r.belowMinOrder);
  let best = null;
  if (complete.length) best = complete.reduce((a, b) => (b.grandTotal < a.grandTotal ? b : a));
  else if (deliverable.length) {
    best = deliverable.reduce((a, b) => (b.coverage > a.coverage || (b.coverage === a.coverage && b.grandTotal < a.grandTotal) ? b : a));
  }
  if (best) best.isBestValue = true;

  rows.sort((a, b) => {
    if (a.deliverable !== b.deliverable) return a.deliverable ? -1 : 1;
    if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
    if (a.coverage !== b.coverage) return b.coverage - a.coverage;
    return a.grandTotal - b.grandTotal;
  });

  return {
    generatedAt: now.toISOString(),
    address: address ?? null,
    itemCount: totalItems,
    unknownProducts,
    bestChainId: best ? best.chainId : null,
    rows,
  };
}
