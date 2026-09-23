/**
 * "הסל של ישראל" computation (docs/SAL-ISRAEL.md, plan §3.1): price the ministry's 100-product basket
 * against every chain's online catalog, the same way the rest of the site prices a cart
 * (src/pricing/promotions.js `priceLine`, regular promotions only - never club), and rank the chains.
 *
 * Pure function, no I/O - scripts/sal-israel.mjs does the file reading/writing.
 */
import { priceLine, round2 } from '../pricing/promotions.js';
import { departmentSlug } from '../catalog/categorize.js';

// `demo` is the local demo store (data/catalogs/demo.json) used for dev/testing - it is never a real
// chain and must never appear in the basket's ranking, excluded list, chains map or product cells.
const SKIP_CHAINS = new Set(['demo']);

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
 * { status: "ok"|"failed", sourceDate, failedSince } - same derivation as the backend's
 * ChainPriceStatus (docs/FRONTEND-BACKEND-UPDATES.md): `status` comes from the catalog's
 * `fetchStatus` field (never a new pipeline field), defaulting to "ok" when there is no status entry
 * for this chain at all (§2.4 of the pipeline contract - "no known failure").
 */
function priceStatusFor(catalog) {
  return {
    status: catalog?.fetchStatus === 'failed' ? 'failed' : 'ok',
    sourceDate: catalog?.sourceDate ?? catalog?.generatedAt ?? null,
    failedSince: catalog?.failedSince ?? null,
  };
}

/**
 * { value, unit: 'g'|'ml'|'unit', count } (data/products.json convention, PIPELINE-CONTRACT.md §2.1) ->
 * a Hebrew display string ("2.5 ליטר", "500 גרם", "20 יח'"), or null when there is nothing worth
 * showing (e.g. a single-count "unit" size, which carries no real magnitude on its own).
 */
function formatSize(size) {
  if (!size || typeof size.value !== 'number') return null;
  const { value, unit, count } = size;
  const trim = (n) => (Number.isInteger(n) ? String(n) : String(round2(n)));
  if (unit === 'unit') return count > 1 ? `${count} יח'` : null;
  let single;
  if (unit === 'g') single = value >= 1000 ? `${trim(value / 1000)} ק"ג` : `${trim(value)} גרם`;
  else if (unit === 'ml') single = value >= 1000 ? `${trim(value / 1000)} ליטר` : `${trim(value)} מ"ל`;
  else return null;
  return count > 1 ? `${count} × ${single}` : single;
}

/**
 * computeSalIsrael({ config, products, catalogs, chains, today, history })
 *
 *   config:   result of src/basket/salIsraelConfig.js loadSalIsraelConfig()
 *   products: data/products.json (array) - looked up by primary gtin to attach brand/size/productName
 *             to each row (§2.5 of the pipeline contract); a gtin absent from the file (e.g. a line the
 *             coverage floor kept out of every chain's thin catalog) simply gets null for all three.
 *   catalogs: { [chainId]: <data/catalogs/CHAIN.json content> } - a "demo" entry, if present, is skipped
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
  const chainIds = Object.keys(catalogs).filter((id) => !SKIP_CHAINS.has(id));
  const indexes = new Map(chainIds.map((id) => [id, indexByGtin(catalogs[id])]));

  const nameOf = (chainId) => chainMeta.get(chainId)?.name ?? chainId;
  const colorOf = (chainId) => chainMeta.get(chainId)?.color ?? null;

  const productsByGtin = new Map();
  for (const pr of products) {
    if (pr?.gtin) productsByGtin.set(pr.gtin, pr);
  }
  const suspectSpreadThreshold = config.rules?.suspectSpread ?? 2.5;

  // Per line (keyed by the primary gtin), per chain: { total, promoText, gtin, shelfPrice, itemName } for
  // the CHEAPEST of the line's gtins that the chain actually sells (before imputation), or null if the
  // chain sells none of them. `gtin` records which variant won, so a consumer can show/link the exact
  // item that was priced. `shelfPrice` is that variant's price before promotions (priceLine().base for
  // qty); `itemName` is the chain's own catalog name for that item, so a reader can see what was matched.
  const perProductChainTotal = new Map(); // gtin -> Map(chainId -> {total, promoText, gtin, shelfPrice, itemName}|null)
  for (const p of config.products) {
    const variantGtins = p.gtins ?? [p.gtin];
    const row = new Map();
    for (const chainId of chainIds) {
      const index = indexes.get(chainId);
      let best = null;
      for (const variant of variantGtins) {
        const item = index.get(variant);
        if (!item) continue;
        const promotions = (item.promotions ?? []).filter((promo) => !promo.validTo || promo.validTo >= today);
        const line = priceLine({ unitPrice: item.price, qty: p.qty, promotions, isWeighted: p.isWeighted });
        if (!best || line.total < best.total) {
          best = { total: line.total, promoText: line.promoText ?? null, gtin: variant, shelfPrice: line.base, itemName: item.name ?? null, maxQty: line.promo?.maxQty ?? null };
        }
      }
      row.set(chainId, best);
    }
    perProductChainTotal.set(p.gtin, row);
  }

  // cells[gtin][chainId] = { price, promo, imputed, gtin, shelfPrice, itemName, maxQty, club } after median
  // imputation for chains missing every variant of the line. `promo` is the promotion's display text
  // (string), or null when none applied / the cell is imputed. `gtin` is the winning variant's barcode, or
  // null when imputed (no real item was actually priced). `shelfPrice` is the effective price before
  // promotions (equal to `price` when there is no promo); an imputed cell has no real promo so
  // shelfPrice === price. `itemName` is the chain's own catalog item name, null when imputed (no real item
  // was matched). `maxQty` (additive) is the winning promotion rule's unit cap (`priceLine().promo.maxQty`),
  // or null when there is no promo, the promo carries no cap, or the cell is imputed. `club` (additive) is
  // always `false`: `priceLine` (src/pricing/promotions.js) only ever picks a promo from the non-club
  // filter for `total`/`promo`, so a club-only promotion - even a cheaper one - can never win a cell; the
  // field is explicit rather than implied, so a consumer doesn't have to trust that invariant blindly.
  const cells = new Map();
  for (const p of config.products) {
    const row = perProductChainTotal.get(p.gtin);
    const found = [...row.values()].filter((v) => v != null).map((v) => v.total);
    const fillValue = median(found);
    const cellRow = new Map();
    for (const chainId of chainIds) {
      const entry = row.get(chainId);
      if (entry != null) {
        cellRow.set(chainId, { price: entry.total, promo: entry.promoText, imputed: false, gtin: entry.gtin, shelfPrice: entry.shelfPrice, itemName: entry.itemName, maxQty: entry.maxQty, club: false });
      } else if (fillValue != null) {
        cellRow.set(chainId, { price: fillValue, promo: null, imputed: true, gtin: null, shelfPrice: fillValue, itemName: null, maxQty: null, club: false });
      } else {
        cellRow.set(chainId, null); // no chain sells any variant of this line - nothing to impute from
      }
    }
    cells.set(p.gtin, cellRow);
  }

  // Per-line spread/shelfSpread/suspect (additive, PIPELINE-CONTRACT.md §2.5): computed once here so both
  // the product row and every chain's `suspectLines` count agree. `spread`/`shelfSpread` are the
  // max/min ratio over NON-imputed cells only (an imputed cell is a median fill, not a real price, and
  // would just mirror the existing spread back at itself); null when fewer than 2 chains actually sell
  // the line. `suspect` flags a shelf-price spread wide enough to be a mismatch/bad-file, not a promo -
  // promos legitimately widen `spread` (the effective price) without widening `shelfSpread`.
  const productStats = new Map(); // gtin -> { spread, shelfSpread, suspect }
  for (const p of config.products) {
    const row = cells.get(p.gtin);
    const foundPrices = [];
    const foundShelfPrices = [];
    for (const chainId of chainIds) {
      const cell = row.get(chainId);
      if (!cell || cell.imputed) continue;
      foundPrices.push(cell.price);
      foundShelfPrices.push(cell.shelfPrice);
    }
    const spread = foundPrices.length >= 2 ? round2(Math.max(...foundPrices) / Math.min(...foundPrices)) : null;
    const shelfSpread = foundShelfPrices.length >= 2 ? round2(Math.max(...foundShelfPrices) / Math.min(...foundShelfPrices)) : null;
    productStats.set(p.gtin, { spread, shelfSpread, suspect: shelfSpread != null && shelfSpread > suspectSpreadThreshold });
  }

  // Per-chain totals, found/imputed counts, coverage. `total` (the ranking key) sums `cell.price` -
  // effective price, regular promotions only, imputed cells filled from the median. Additive (23.9):
  // `shelfTotal` is the same basket at shelf price (`cell.shelfPrice`, so an imputed line uses the
  // imputed shelf value, same as `total` uses the imputed effective value) - the promo-free baseline
  // beside `total`. `foundTotal`/`foundShelfTotal` sum only the lines the chain actually prices itself
  // (`!cell.imputed`), so they're comparable across chains without a coverage gap distorting them;
  // `foundLines` is the line count behind those two sums (== `found`, named to pair with them).
  const perChain = [];
  for (const chainId of chainIds) {
    let total = 0, shelfTotal = 0, foundTotal = 0, foundShelfTotal = 0, found = 0, imputed = 0, suspectLines = 0;
    for (const p of config.products) {
      const cell = cells.get(p.gtin).get(chainId);
      if (!cell) continue;
      total = round2(total + cell.price);
      shelfTotal = round2(shelfTotal + cell.shelfPrice);
      if (cell.imputed) imputed++;
      else {
        found++;
        foundTotal = round2(foundTotal + cell.price);
        foundShelfTotal = round2(foundShelfTotal + cell.shelfPrice);
        if (productStats.get(p.gtin).suspect) suspectLines++;
      }
    }
    const totalProducts = config.products.length;
    const coverage = totalProducts ? round2(found / totalProducts) : 0;
    perChain.push({
      chainId,
      name: nameOf(chainId),
      color: colorOf(chainId),
      total,
      shelfTotal,
      foundTotal,
      foundShelfTotal,
      foundLines: found,
      found,
      imputed,
      suspectLines,
      coverage,
      vsReference: config.ministry?.reference != null ? round2(total - config.ministry.reference) : null,
      vsMarket: config.ministry?.marketAverage != null ? round2(total - config.ministry.marketAverage) : null,
      vsCommitment: config.ministry?.carrefourCommitment != null ? round2(total - config.ministry.carrefourCommitment) : null,
      priceStatus: priceStatusFor(catalogs[chainId]),
    });
  }

  const minCoverage = config.rules?.minCoverage ?? 0;
  const ranking = perChain.filter((c) => c.coverage >= minCoverage).sort((a, b) => a.total - b.total);
  const excluded = perChain
    .filter((c) => c.coverage < minCoverage)
    .map((c) => ({ chainId: c.chainId, name: c.name, color: c.color, coverage: c.coverage, reason: c.found === 0 ? 'no-catalog' : 'low-coverage' }));

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
    // brand/size/productName: data/products.json for the primary gtin is the source of truth (the config
    // `name` is only the brochure's own short label); fall back to a value already on the config entry
    // when the product isn't in products.json (or is missing that field), else null - never a guess.
    const product = productsByGtin.get(p.gtin);
    const brand = (product?.brand && product.brand.trim()) ? product.brand : (p.brand ?? null);
    const size = formatSize(product?.size) ?? (p.size ?? null);
    const productName = product?.name ?? null;
    const { spread, shelfSpread, suspect } = productStats.get(p.gtin);
    return {
      gtin: p.gtin,
      gtins: p.gtins ?? [p.gtin],
      name: p.name,
      productName,
      brand,
      size,
      category: p.category,
      // The department id the rest of the API uses (cartBackend CATEGORY_ORDER / DEPARTMENT_SLUGS).
      // `category` stays the Hebrew label because it is displayed as a heading; a consumer that groups or
      // orders departments must key off `categoryId`, not off the label (23.9).
      categoryId: departmentSlug(p.category),
      qty: p.qty,
      unit: p.unit,
      referencePrice: p.referencePrice ?? null,
      carrefourPrice: p.carrefourPrice ?? null,
      cells: out,
      cheapest,
      spread,
      shelfSpread,
      suspect,
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

  // Top-level chains map (additive): every chain that took part in the computation (never "demo"),
  // so a consumer that only reads `chains` still gets every id referenced in ranking/excluded/cells.
  const chainsOut = {};
  for (const chainId of chainIds) chainsOut[chainId] = { name: nameOf(chainId), color: colorOf(chainId) };

  return {
    version: 1,
    date: today,
    generatedAt: new Date().toISOString(),
    basket: config.basket,
    ministry: config.ministry,
    rules: config.rules,
    chains: chainsOut,
    ranking,
    excluded,
    products: productsOut,
    history: outHistory,
  };
}
