/**
 * "מגוון" promotions: one promotion covering several barcodes ("3 ב-10 מגוון חטיפי אסם"). The register pools the
 * units of all participating items, so 2 × A + 1 × B earn the "3 ב-10" price. priceLine() works per line and would
 * miss it; poolBundles() runs after it, per chain, and re-prices lines that share a promotionId.
 *
 * Rules pooled: multi (N for X) and bundleFree (2+1). Assumptions where the files are silent:
 *   multi       leftover units (not filling a bundle) are the MOST expensive ones at shelf price - the conservative reading.
 *   bundleFree  the free units are the CHEAPEST ones ("הזול מביניהם", as the chains write).
 * Club-only promotions and rules with maxQty are not pooled (kept per line). Weighted lines never pool.
 */
import { round2, describePromo } from './promotions.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

/**
 * @param {Array} lines priced lines with { qty, unitPrice, lineTotal, savings, promo, _promos, _weighted }
 * Mutates lineTotal / savings / promo of pooled lines and adds `pooled: { promotionId, with: [names] }`.
 * Returns the extra savings found by pooling.
 */
export function poolBundles(lines) {
  const byPromo = new Map();
  for (const l of lines) {
    if (!l._promos || l._weighted || !Number.isInteger(l.qty) || l.qty <= 0 || l.unitPrice == null) continue;
    for (const p of l._promos) {
      if (p.club || p.maxQty || !p.promotionId || !['multi', 'bundleFree'].includes(p.type)) continue;
      if (!byPromo.has(p.promotionId)) byPromo.set(p.promotionId, []);
      byPromo.get(p.promotionId).push({ l, p });
    }
  }
  const candidates = [];
  for (const [promotionId, members] of byPromo) {
    if (members.length < 2) continue;
    const p = members[0].p;
    const units = members.flatMap(({ l }) => Array(l.qty).fill(l.unitPrice)).sort((a, b) => b - a);
    const groups = Math.floor(units.length / p.minQty);
    if (!groups) continue;
    let pooledTotal;
    if (p.type === 'multi') pooledTotal = groups * p.totalPrice + sum(units.slice(0, units.length - groups * p.minQty));
    else pooledTotal = sum(units) - sum([...units].sort((a, b) => a - b).slice(0, groups * p.freeQty));
    const current = sum(members.map((m) => m.l.lineTotal));
    if (pooledTotal < current - 0.005) candidates.push({ promotionId, members, p, pooledTotal, gain: current - pooledTotal });
  }
  candidates.sort((a, b) => b.gain - a.gain);
  const taken = new Set();
  let extra = 0;
  for (const c of candidates) {
    if (c.members.some((m) => taken.has(m.l))) continue;
    const base = sum(c.members.map((m) => m.l.unitPrice * m.l.qty));
    let allocated = 0;
    c.members.forEach((m, i) => {
      const share = i === c.members.length - 1 ? round2(c.pooledTotal - allocated) : round2((c.pooledTotal * m.l.unitPrice * m.l.qty) / base);
      allocated = round2(allocated + share);
      m.l.lineTotal = share;
      m.l.savings = round2(m.l.unitPrice * m.l.qty - share);
      m.l.promo = describePromo(c.p);
      m.l._rule = c.p; // keep promoDetail (src/pricing/compare.js) in sync with the pooled rule
      m.l.pooled = { promotionId: c.promotionId, with: c.members.filter((o) => o !== m).map((o) => o.l.name) };
      taken.add(m.l);
    });
    extra += c.gain;
  }
  return round2(extra);
}
