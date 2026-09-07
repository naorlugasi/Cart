/**
 * Promotion rules understood by the pricing engine.
 *
 *  { type: 'multi',    minQty: 3, totalPrice: 10 }   "3 ב-10 ₪"
 *  { type: 'unit',     minQty: 1, unitPrice: 4.5 }   discounted unit price
 *  { type: 'percent',  minQty: 2, percent: 20 }      "20% הנחה" (optionally from a minimum quantity)
 *  { type: 'discount', minQty: 1, amount: 1.5 }      fixed amount off each unit
 */

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function describePromo(promo) {
  if (!promo) return null;
  if (promo.description) return promo.description;
  switch (promo.type) {
    case 'multi': return `${promo.minQty} ב-${promo.totalPrice} ₪`;
    case 'unit': return `${promo.unitPrice} ₪ ליחידה במבצע`;
    case 'percent': return promo.minQty > 1 ? `${promo.percent}% הנחה בקניית ${promo.minQty}` : `${promo.percent}% הנחה`;
    case 'discount': return `${promo.amount} ₪ הנחה ליחידה`;
    default: return null;
  }
}

function promoTotal(promo, unitPrice, qty, isWeighted) {
  const minQty = promo.minQty ?? 1;
  if (qty < minQty) return null;
  switch (promo.type) {
    case 'multi': {
      if (isWeighted || !Number.isInteger(qty)) return null; // bundles only apply to whole units
      const groups = Math.floor(qty / minQty);
      const remainder = qty - groups * minQty;
      return groups * promo.totalPrice + remainder * unitPrice;
    }
    case 'unit':
      return qty * promo.unitPrice;
    case 'percent':
      return qty * unitPrice * (1 - promo.percent / 100);
    case 'discount':
      return qty * Math.max(0, unitPrice - promo.amount);
    default:
      return null;
  }
}

/**
 * Price a cart line, applying the single best promotion for the requested quantity.
 * Weighted items use qty in kg and never get bundle ("N for X") promotions.
 */
export function priceLine({ unitPrice, qty, promotions = [], isWeighted = false }) {
  const base = round2(unitPrice * qty);
  let best = { total: base, promo: null };
  for (const promo of promotions ?? []) {
    const total = promoTotal(promo, unitPrice, qty, isWeighted);
    if (total != null && total < best.total - 1e-9) best = { total: round2(total), promo };
  }
  return {
    total: best.total,
    base,
    promo: best.promo,
    promoText: describePromo(best.promo),
    savings: round2(base - best.total),
  };
}
