import { priceLine, round2 } from './promotions.js';
import { selectBranch } from '../geo/branches.js';

export const LINE_STATUS = {
  OK: 'ok',
  SUBSTITUTED: 'substituted',
  MISSING: 'missing',
  OUT_OF_STOCK: 'out_of_stock',
};

function priceCartLine(line, chainId, { mapping, productsById }) {
  const product = productsById.get(line.productId);
  if (!product) return { productId: line.productId, name: line.productId, qty: line.qty, status: LINE_STATUS.MISSING, lineTotal: 0 };

  let resolved = mapping.resolve(product.id, chainId);
  let status = LINE_STATUS.OK;
  let usedProduct = product;

  if (!resolved || !resolved.storeItem.inStock) {
    const primaryStatus = !resolved ? LINE_STATUS.MISSING : LINE_STATUS.OUT_OF_STOCK;
    const substitute = line.substituteProductId ? productsById.get(line.substituteProductId) : null;
    const subResolved = substitute ? mapping.resolve(substitute.id, chainId) : null;
    if (subResolved && subResolved.storeItem.inStock) {
      resolved = subResolved;
      usedProduct = substitute;
      status = LINE_STATUS.SUBSTITUTED;
    } else {
      return {
        productId: product.id,
        name: product.name,
        qty: line.qty,
        unit: product.unit,
        status: primaryStatus,
        lineTotal: 0,
        substituteTried: substitute ? substitute.name : null,
      };
    }
  }

  const item = resolved.storeItem;
  const priced = priceLine({ unitPrice: item.price, qty: line.qty, promotions: item.promotions, isWeighted: item.isWeighted });
  return {
    productId: product.id,
    name: product.name,
    qty: line.qty,
    unit: product.unit,
    status,
    storeItemId: item.storeItemId,
    storeItemName: item.name,
    substituteFor: status === LINE_STATUS.SUBSTITUTED ? product.name : null,
    usedProductId: usedProduct.id,
    unitPrice: item.price,
    lineTotal: priced.total,
    promo: priced.promoText,
    savings: priced.savings,
    matchMethod: resolved.method,
    matchScore: resolved.score,
  };
}

function availabilityText(available, total, missingCount) {
  if (total === 0) return 'הסל ריק';
  if (missingCount === 0) return `כל ${total} המוצרים זמינים`;
  return `ברשת זו חסרים ${missingCount} מוצרים מתוך ${total}`;
}

/**
 * Build the comparison table for a cart across all chains.
 *
 * @param {object} args
 * @param {{lines:Array<{productId:string, qty:number, substituteProductId?:string}>}} args.cart
 * @param {Array} args.chains chain descriptors (with branches)
 * @param {import('../catalog/mapping.js').MappingEngine} args.mapping
 * @param {{city?:string}|null} [args.address]
 * @param {Date} [args.now]
 */
export function compareCart({ cart, chains, mapping, address = null, now = new Date() }) {
  const productsById = mapping.productsById;
  const lines = cart.lines ?? [];
  const totalItems = lines.length;

  const rows = chains.map((chain) => {
    const branch = selectBranch(chain, address);
    const base = { chainId: chain.id, chainName: chain.name, color: chain.color ?? null, verified: chain.verified ?? false };
    if (!branch) {
      return {
        ...base,
        deliverable: false,
        reason: address?.city ? `אין משלוחים ל${address.city}` : 'לא נמצא סניף מספק',
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

    const pricedLines = lines.map((line) => priceCartLine(line, chain.id, { mapping, productsById }));
    const missing = pricedLines.filter((l) => l.status === LINE_STATUS.MISSING || l.status === LINE_STATUS.OUT_OF_STOCK);
    const available = totalItems - missing.length;
    const subtotal = round2(pricedLines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0));
    const savings = round2(pricedLines.reduce((sum, l) => sum + (l.savings ?? 0), 0));
    const freeDelivery = branch.freeDeliveryAbove != null && subtotal >= branch.freeDeliveryAbove;
    const deliveryFee = freeDelivery ? 0 : (branch.deliveryFee ?? 0);
    const belowMinOrder = branch.minOrder != null && subtotal > 0 && subtotal < branch.minOrder;

    return {
      ...base,
      deliverable: true,
      branch: { id: branch.id, name: branch.name, city: branch.city },
      lines: pricedLines,
      available,
      total: totalItems,
      missing: missing.map((l) => ({ productId: l.productId, name: l.name, status: l.status })),
      substituted: pricedLines.filter((l) => l.status === LINE_STATUS.SUBSTITUTED).map((l) => ({ productId: l.productId, name: l.name, with: l.storeItemName })),
      coverage: totalItems ? round2(available / totalItems) : 0,
      availabilityText: availabilityText(available, totalItems, missing.length),
      subtotal,
      savings,
      deliveryFee,
      freeDelivery,
      deliveryEta: branch.eta ?? null,
      minOrder: branch.minOrder ?? null,
      belowMinOrder,
      grandTotal: round2(subtotal + deliveryFee),
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
    bestChainId: best ? best.chainId : null,
    rows,
  };
}
