/**
 * "הסל של ישראל" computation (docs/SAL-ISRAEL.md, plan §3.1): price the ministry's 100-product basket
 * against every chain's online catalog, the same way the rest of the site prices a cart
 * (src/pricing/promotions.js `priceLine`, regular promotions only - never club), and rank the chains.
 *
 * Pure function, no I/O - scripts/sal-israel.mjs does the file reading/writing.
 */
import { priceLine, round2 } from '../pricing/promotions.js';

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round2((sorted[mid - 1] + sorted[mid]) / 2);
}

/** {gtin -> item} for one chain catalog's items, first item wins on a duplicate gtin (matches build-products conventions). */
function indexByGtin(catalog) {
  const map = new Map();
  for (const item of catalog?.items ?? []) {
    if (item?.gtin && !map.has(item.gtin)) map.set(item.gtin, item);
  }
  return map;
}

/**
 * computeSalIsrael({ config, products, catalogs, chains, today, history })
 *
 *   config:   result of src/basket/salIsraelConfig.js loadSalIsraelConfig()
 *   products: data/products.json (array) - only used to decide vsProducts-adjacent bookkeeping is not
 *             needed here; kept in the signature per the plan for callers that want it, unused today
 *   catalogs: { [chainId]: <data/catalogs/CHAIN.json content> }
 *   chains:   data/chains.json (array) - supplies each chain's display name/color
 *   today:    'YYYY-MM-DD' string, promotions with validTo before this date are ignored
 *   history:  { [chainId]: [{date, total}, ...] } accumulated so far (already includes today's entries
 *             removed by the caller if this is a rerun - see scripts/sal-israel.mjs); this function only
 *             appends today's totals and trims to config.rules.historyDays before returning
 *
 * Returns the full data/sal-israel.json v1 shape (see docs/SAL-ISRAEL.md / PIPELINE-CONTRACT.md §2.5).
 */
export function computeSalIsrael({ config, products = [], catalogs = {}, chains = [], today, history = {} }) {
  const chainMeta = new Map(chains.map((c) => [c.id, c]));
  const chainIds = Object.keys(catalogs);
  const indexes = new Map(chainIds.map((id) => [id, indexByGtin(catalogs[id])]));

  // Per product, per chain: the priced line total (before imputation) or null if the chain doesn't sell it.
  const perProductChainTotal = new Map(); // gtin -> Map(chainId -> total|null)
  for (const p of config.products) {
    const row = new Map();
    for (const chainId of chainIds) {
      const item = indexes.get(chainId).get(p.gtin);
      if (!item) { row.set(chainId, null); continue; }
      const promotions = (item.promotions ?? []).filter((promo) => !promo.validTo || promo.validTo >= today);
      const line = priceLine({ unitPrice: item.price, qty: p.qty, promotions, isWeighted: p.isWeighted });
      row.set(chainId, line.total);
    }
    perProductChainTotal.set(p.gtin, row);
  }

  // cells[gtin][chainId] = { price, promo, imputed } after median imputation for chains missing the product.
  const cells = new Map();
  for (const p of config.products) {
    const row = perProductChainTotal.get(p.gtin);
    const found = [...row.values()].filter((v) => v != null);
    const fillValue = median(found);
    const cellRow = new Map();
    for (const chainId of chainIds) {
      const total = row.get(chainId);
      if (total != null) {
        cellRow.set(chainId, { price: total, promo: false, imputed: false });
      } else if (fillValue != null) {
        cellRow.set(chainId, { price: fillValue, promo: false, imputed: true });
      } else {
        cellRow.set(chainId, null); // no chain sells this product at all - nothing to impute from
      }
    }
    cells.set(p.gtin, cellRow);
  }

  // Per-chain totals, found/imputed counts, coverage.
  const perChain = [];
  for (const chainId of chainIds) {
    let total = 0, found = 0, imputed = 0, priced = 0;
    for (const p of config.products) {
      const cell = cells.get(p.gtin).get(chainId);
      if (!cell) continue;
      total = round2(total + cell.price);
      priced++;
      if (cell.imputed) imputed++; else found++;
    }
    const totalProducts = config.products.length;
    const coverage = totalProducts ? round2(found / totalProducts) : 0;
    const catalog = catalogs[chainId];
    const meta = chainMeta.get(chainId);
    perChain.push({
      chainId,
      name: meta?.name ?? chainId,
      color: meta?.color ?? null,
      total,
      found,
      imputed,
      coverage,
      vsReference: config.ministry?.reference != null ? round2(total - config.ministry.reference) : null,
      vsMarket: config.ministry?.marketAverage != null ? round2(total - config.ministry.marketAverage) : null,
      vsCommitment: config.ministry?.carrefourCommitment != null ? round2(total - config.ministry.carrefourCommitment) : null,
      priceStatus: { fetchStatus: catalog?.fetchStatus ?? 'ok', sourceDate: catalog?.sourceDate ?? catalog?.generatedAt ?? null },
    });
  }

  const minCoverage = config.rules?.minCoverage ?? 0;
  const ranking = perChain.filter((c) => c.coverage >= minCoverage).sort((a, b) => a.total - b.total);
  const excluded = perChain
    .filter((c) => c.coverage < minCoverage)
    .map((c) => ({ chainId: c.chainId, name: c.name, coverage: c.coverage, reason: c.found === 0 ? 'no-catalog' : 'low-coverage' }));

  // Cheapest chain per product (regular found price only, not imputed - an imputed cell can't win "cheapest").
  const productsOut = config.products.map((p) => {
    const row = cells.get(p.gtin);
    const out = {};
    let cheapest = null, cheapestPrice = Infinity;
    for (const chainId of chainIds) {
      const cell = row.get(chainId);
      if (!cell) continue;
      out[chainId] = cell;
      if (!cell.imputed && cell.price < cheapestPrice) { cheapestPrice = cell.price; cheapest = chainId; }
    }
    return {
      gtin: p.gtin,
      name: p.name,
      category: p.category,
      qty: p.qty,
      unit: p.unit,
      referencePrice: p.referencePrice ?? null,
      carrefourPrice: p.carrefourPrice ?? null,
      cells: out,
      cheapest,
    };
  });

  // History: append today's per-chain total (caller is responsible for de-duplicating a rerun of the
  // same day before calling us - scripts/sal-israel.mjs strips today's lines from the jsonl first), then
  // trim to the configured retention window.
  const historyDays = config.rules?.historyDays ?? 90;
  const outHistory = {};
  for (const chainId of chainIds) {
    const prior = (history[chainId] ?? []).filter((h) => h.date !== today);
    const chainTotal = perChain.find((c) => c.chainId === chainId)?.total ?? null;
    const withToday = chainTotal != null ? [...prior, { date: today, total: chainTotal }] : prior;
    withToday.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    outHistory[chainId] = withToday.slice(-historyDays);
  }

  return {
    version: 1,
    date: today,
    generatedAt: new Date().toISOString(),
    basket: config.basket,
    ministry: config.ministry,
    rules: config.rules,
    ranking,
    excluded,
    products: productsOut,
    history: outHistory,
  };
}
