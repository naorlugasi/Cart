/**
 * Promotion rules understood by the pricing engine (produced by src/catalog/promoRules.js).
 *
 *  { type: 'multi',      minQty: 3, totalPrice: 10 }   "3 ב-10 ₪"
 *  { type: 'unit',       minQty: 1, unitPrice: 4.5 }   discounted unit price (from minQty units)
 *  { type: 'percent',    minQty: 2, percent: 20 }      "20% הנחה" (optionally from a minimum quantity)
 *  { type: 'discount',   minQty: 1, amount: 1.5 }      fixed amount off each unit
 *  { type: 'bundleFree', minQty: 3, freeQty: 1 }       "2+1": every 3 units, 1 is free
 *  { type: 'second',     minQty: 2, percent: 50 }      second unit at 50% off
 *
 * Optional on every rule: maxQty (units the promotion applies to; the rest cost the shelf price),
 * club (true = members only; never counted in the regular total, reported separately as `club`).
 */

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function describePromo(promo) {
  if (!promo) return null;
  if (promo.description) return promo.description;
  switch (promo.type) {
    case 'multi': return `${promo.minQty} ב-${promo.totalPrice} ₪`;
    case 'unit': return promo.minQty > 1 ? `${promo.unitPrice} ₪ ליחידה בקניית ${promo.minQty}` : `${promo.unitPrice} ₪ ליחידה במבצע`;
    case 'percent': return promo.minQty > 1 ? `${promo.percent}% הנחה בקניית ${promo.minQty}` : `${promo.percent}% הנחה`;
    case 'discount': return `${promo.amount} ₪ הנחה ליחידה`;
    case 'bundleFree': return `${promo.minQty - promo.freeQty}+${promo.freeQty}`;
    case 'second': return `השני ב-${promo.percent}% הנחה`;
    default: return null;
  }
}

/** Total for `qty` units when the whole quantity is eligible for the promotion. */
function eligibleTotal(promo, unitPrice, qty, isWeighted) {
  const minQty = promo.minQty ?? 1;
  switch (promo.type) {
    case 'multi': {
      if (isWeighted || !Number.isInteger(qty)) return null; // bundles only apply to whole units
      const groups = Math.floor(qty / minQty);
      return groups * promo.totalPrice + (qty - groups * minQty) * unitPrice;
    }
    case 'bundleFree': {
      if (isWeighted || !Number.isInteger(qty)) return null;
      const groups = Math.floor(qty / minQty);
      return groups * (minQty - promo.freeQty) * unitPrice + (qty - groups * minQty) * unitPrice;
    }
    case 'second': {
      if (isWeighted || !Number.isInteger(qty)) return null;
      const pairs = Math.floor(qty / 2);
      return pairs * (unitPrice + unitPrice * (1 - promo.percent / 100)) + (qty - pairs * 2) * unitPrice;
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

function promoTotal(promo, unitPrice, qty, isWeighted) {
  const minQty = promo.minQty ?? 1;
  if (qty < minQty) return null;
  const cap = promo.maxQty && promo.maxQty > 0 ? promo.maxQty : null;
  if (cap && qty > cap) {
    if (cap < minQty) return null;
    const capped = eligibleTotal(promo, unitPrice, cap, isWeighted);
    return capped == null ? null : capped + (qty - cap) * unitPrice;
  }
  return eligibleTotal(promo, unitPrice, qty, isWeighted);
}

function best(promotions, unitPrice, qty, isWeighted, base) {
  let out = { total: base, promo: null };
  for (const promo of promotions) {
    const total = promoTotal(promo, unitPrice, qty, isWeighted);
    if (total != null && total < out.total - 1e-9) out = { total: round2(total), promo };
  }
  return out;
}

/**
 * Price a cart line, applying the single best promotion for the requested quantity.
 * Weighted items use qty in kg and never get bundle ("N for X") promotions.
 * Club-only promotions are excluded from `total`; when one beats it, `club` holds that alternative.
 */
export function priceLine({ unitPrice, qty, promotions = [], isWeighted = false }) {
  const base = round2(unitPrice * qty);
  const all = promotions ?? [];
  const regular = best(all.filter((p) => !p.club), unitPrice, qty, isWeighted, base);
  const withClub = all.some((p) => p.club) ? best(all, unitPrice, qty, isWeighted, base) : regular;
  const club = withClub.promo?.club && withClub.total < regular.total - 1e-9
    ? { total: withClub.total, promo: withClub.promo, promoText: describePromo(withClub.promo), savings: round2(regular.total - withClub.total) }
    : null;
  return {
    total: regular.total,
    base,
    promo: regular.promo,
    promoText: describePromo(regular.promo),
    savings: round2(base - regular.total),
    club,
  };
}

/**
 * "Take N more and save": the smallest extra quantity (1..3) at which a regular promotion makes the whole
 * line cost no more than it costs now. Returns { addQty, total, promoText } or null.
 */
export function upsellHint({ unitPrice, qty, promotions = [], isWeighted = false }) {
  if (isWeighted || !Number.isInteger(qty)) return null;
  const now = priceLine({ unitPrice, qty, promotions, isWeighted }).total;
  for (let add = 1; add <= 3; add++) {
    const next = priceLine({ unitPrice, qty: qty + add, promotions, isWeighted });
    if (next.promo && next.total <= now + 1e-9) return { addQty: add, total: next.total, promoText: next.promoText };
  }
  return null;
}
