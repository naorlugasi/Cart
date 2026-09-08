/**
 * Deterministic per-chain demo catalogs derived from the unified product catalog.
 * Used by scripts/seed-chains.js (writes data/catalogs/*.json) and as a runtime fallback
 * when a catalog file is missing (e.g. slim serverless deployments).
 * In production these catalogs come from the price-transparency XML files (scripts/import-prices.js).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}

/** How each chain names weighted produce/meat, which items it lacks, its promos, etc. */
export const PROFILES = {
  shufersal: {
    seed: 11,
    priceFactor: 1.0,
    jitter: 0.06,
    storeItemId: (p, i) => `P_${p.gtin ?? `W${String(i).padStart(4, '0')}`}`,
    weightedName: (p) => `${stripVariety(p.name)} שקיל`,
    missing: ['tahini'],
    outOfStock: ['beer'],
    promos: {
      bamba: { type: 'multi', minQty: 3, totalPrice: 12, description: '3 ב-12 ₪' },
      cola: { type: 'multi', minQty: 2, totalPrice: 14, description: '2 ב-14 ₪' },
      cottage: { type: 'multi', minQty: 3, totalPrice: 15, description: '3 ב-15 ₪' },
      'toilet-paper': { type: 'percent', minQty: 1, percent: 15, description: '15% הנחה' },
    },
  },
  ramilevy: {
    seed: 23,
    priceFactor: 0.92,
    jitter: 0.05,
    // the live adapter resolves barcodes to the site's internal ids at runtime
    storeItemId: (p, i) => p.gtin ?? `RL${String(100000 + i * 37)}`,
    weightedName: (p) => `${stripVariety(p.name)} שקיל מובחר`,
    missing: ['feta', 'challah', 'olive-oil'],
    outOfStock: ['avocado'],
    promos: {
      cola: { type: 'multi', minQty: 3, totalPrice: 18, description: '3 ב-18 ₪' },
      tuna: { type: 'multi', minQty: 2, totalPrice: 39.9, description: '2 ב-39.90 ₪' },
      water: { type: 'unit', minQty: 1, unitPrice: 11.9, description: 'מחיר מבצע 11.90 ₪' },
    },
  },
  carrefour: {
    seed: 37,
    priceFactor: 0.97,
    jitter: 0.05,
    // the live adapter resolves barcodes to retailerProductIds at runtime
    storeItemId: (p, i) => p.gtin ?? `CRF${String(50000 + i)}`,
    weightedName: (p) => `${stripVariety(p.name)} במשקל`,
    missing: ['bissli', 'pita'],
    outOfStock: ['ground-beef'],
    promos: {
      'yellow-cheese': { type: 'multi', minQty: 2, totalPrice: 25, description: '2 ב-25 ₪' },
      pasta: { type: 'multi', minQty: 3, totalPrice: 20, description: '3 ב-20 ₪' },
      chocolate: { type: 'multi', minQty: 4, totalPrice: 20, description: '4 ב-20 ₪' },
    },
  },
  yochananof: {
    seed: 41,
    priceFactor: 0.95,
    jitter: 0.07,
    storeItemId: (p, i) => p.gtin ?? `Y${String(i).padStart(5, '0')}`,
    weightedName: (p) => `${stripVariety(p.name)} טרי`,
    missing: ['laundry', 'dish-soap'],
    outOfStock: [],
    promos: {
      'chicken-breast': { type: 'unit', minQty: 1, unitPrice: 34.9, description: 'חזה עוף 34.90 ₪ לק"ג' },
      'eggs-12': { type: 'multi', minQty: 2, totalPrice: 25, description: '2 ב-25 ₪' },
      bamba: { type: 'multi', minQty: 3, totalPrice: 10, description: '3 ב-10 ₪' },
    },
  },
  demo: {
    seed: 7,
    priceFactor: 0.99,
    jitter: 0.04,
    storeItemId: (p, i) => `D${String(i + 1).padStart(3, '0')}`,
    weightedName: (p) => `${stripVariety(p.name)} שקיל`,
    missing: ['beer'],
    outOfStock: ['lemon'],
    promos: {
      bamba: { type: 'multi', minQty: 3, totalPrice: 10, description: '3 ב-10 ₪' },
      'milk-3': { type: 'multi', minQty: 2, totalPrice: 12, description: '2 ב-12 ₪' },
    },
  },
};

function stripVariety(name) {
  return name.replace(/\s+(בלאדי|טרי|שקילה|שקיל|פינק ליידי)$/u, '').replace('חזה עוף טרי', 'חזה עוף');
}


export function generateCatalog(chainId, products) {
  const profile = PROFILES[chainId];
  if (!profile) return null;
  const rand = mulberry32(profile.seed);
  const items = [];
  products.forEach((product, index) => {
    if (profile.missing.includes(product.id)) { rand(); return; }
    const jitter = 1 + (rand() * 2 - 1) * profile.jitter;
    const price = round(product.basePrice * profile.priceFactor * jitter);
    const promo = profile.promos[product.id];
    items.push({
      storeItemId: profile.storeItemId(product, index),
      code: product.gtin ?? String(4000 + index),
      gtin: product.gtin,
      name: product.isWeighted ? profile.weightedName(product) : product.name,
      price,
      isWeighted: product.isWeighted,
      unit: product.unit,
      inStock: !profile.outOfStock.includes(product.id),
      promotions: promo ? [promo] : [],
    });
  });
  return { chainId, generatedAt: '2026-09-07T00:00:00.000Z', source: 'src/catalog/seedCatalogs.js', items };
}
