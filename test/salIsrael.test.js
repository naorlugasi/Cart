import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSalIsrael } from '../src/basket/salIsrael.js';

const today = '2026-09-22';

const chains = [
  { id: 'a', name: 'רשת א', color: '#111' },
  { id: 'b', name: 'רשת ב', color: '#222' },
  { id: 'c', name: 'רשת ג', color: '#333' },
  { id: 'd', name: 'רשת ד', color: '#444' }, // not among CHAINS on the site - still gets name/color from chains.json
];

function config(products, rules = { minCoverage: 0.85, historyDays: 90 }) {
  return {
    basket: { name: 'הסל של ישראל', source: 'x', sourceName: 'משרד הכלכלה והתעשייה', sourceUrl: 'x', publishedOn: '2026-04' },
    ministry: { reference: 1472, marketAverage: 1700, carrefourCommitment: 1098, stores: 54 },
    rules,
    products,
  };
}

test('regular promotion is applied', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 3, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [{ type: 'multi', minQty: 3, totalPrice: 24 }] }] },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.ranking.find((r) => r.chainId === 'a').total, 24);
});

test('club promotion is never applied, even when cheaper', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [{ type: 'unit', minQty: 1, unitPrice: 2, club: true }] }] },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.ranking.find((r) => r.chainId === 'a').total, 10, 'club price must not win the regular total');
  const cell = out.products[0].cells.a;
  assert.equal(cell.price, 10, 'the club-only rule must not lower the cell either');
  assert.equal(cell.club, false, 'club is always false by construction, never a boolean reflecting which promo would have won');
});

test('cells[chainId].club is explicitly false, including on an imputed cell', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }], { minCoverage: 0, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }] },
    b: { items: [] }, // sells nothing - imputed from a
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.products[0].cells.a.club, false);
  const imputedCell = out.products[0].cells.b;
  assert.equal(imputedCell.imputed, true);
  assert.equal(imputedCell.club, false);
  assert.equal(imputedCell.maxQty, null, 'an imputed cell has no real rule to cap');
});

test('cells[chainId].maxQty is the winning promotion rule\'s cap, or null with no cap / no promo', () => {
  const cfg = config([
    { gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ]);
  const catalogs = {
    a: {
      items: [
        { gtin: '1', price: 15, promotions: [{ type: 'unit', minQty: 1, unitPrice: 12.6, maxQty: 2 }] }, // Carrefour-style RedemptionLimit cap
        { gtin: '2', price: 10, promotions: [] }, // no promo at all
      ],
    },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.products[0].cells.a.maxQty, 2);
  assert.equal(out.products[1].cells.a.maxQty, null, 'no promo applied - no cap to report');
});

test('expired promotion (validTo before today) is ignored', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [{ type: 'unit', minQty: 1, unitPrice: 1, validTo: '2026-09-21' }] }] },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.ranking.find((r) => r.chainId === 'a').total, 10);
});

test('a promotion valid through today (validTo === today) still applies', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [{ type: 'unit', minQty: 1, unitPrice: 4, validTo: '2026-09-22' }] }] },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.ranking.find((r) => r.chainId === 'a').total, 4);
});

test('weighted product prices qty in kg', () => {
  const cfg = config([{ gtin: '1', name: 'עגבניות', category: 'ירקות ופירות', qty: 1.5, unit: 'ק"ג', isWeighted: true, referencePrice: null, carrefourPrice: 9 }]);
  const catalogs = { a: { items: [{ gtin: '1', price: 6, isWeighted: true, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.ranking.find((r) => r.chainId === 'a').total, 9);
});

test('a chain missing a product is imputed from the median of the chains that have it', () => {
  // Two products so chain c (missing only one of them) still clears minCoverage (0.85 needs found>=1 of 2... use
  // low minCoverage here since this test is about the imputed *value*, not the coverage gate - see the
  // separate low-coverage test for that gate).
  const products = [
    { gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.4, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] },
    b: { items: [{ gtin: '1', price: 20, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] },
    c: { items: [{ gtin: '2', price: 10, promotions: [] }] }, // gtin 1 missing - imputed as median(10, 20) = 15
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const cCell = out.products[0].cells.c;
  assert.equal(cCell.imputed, true);
  assert.equal(cCell.price, 15);
  const cRanked = out.ranking.find((r) => r.chainId === 'c');
  assert.ok(cRanked, 'chain c should clear minCoverage 0.4 with 1/2 found');
  assert.equal(cRanked.total, 25);
  assert.equal(cRanked.found, 1);
  assert.equal(cRanked.imputed, 1);
});

test('a chain below minCoverage is excluded from ranking, not just penalized', () => {
  const products = [
    { gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.85, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] }, // coverage 1.0
    b: { items: [{ gtin: '1', price: 10, promotions: [] }] }, // coverage 0.5 - below 0.85
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.ok(out.ranking.some((r) => r.chainId === 'a'));
  assert.ok(!out.ranking.some((r) => r.chainId === 'b'));
  const excluded = out.excluded.find((e) => e.chainId === 'b');
  assert.ok(excluded, 'chain b must be in excluded[]');
  assert.equal(excluded.reason, 'low-coverage');
});

test('ranking is sorted cheapest first', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 30, promotions: [] }] },
    b: { items: [{ gtin: '1', price: 10, promotions: [] }] },
    c: { items: [{ gtin: '1', price: 20, promotions: [] }] },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.deepEqual(out.ranking.map((r) => r.chainId), ['b', 'c', 'a']);
});

test('history: appends today and trims to rules.historyDays, and a rerun of the same day replaces it (not duplicated)', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }], { minCoverage: 0.85, historyDays: 2 });
  const catalogs = { a: { items: [{ gtin: '1', price: 10, promotions: [] }] } };
  const history = { a: [{ date: '2026-09-20', total: 5 }, { date: '2026-09-21', total: 6 }, { date: today, total: 999 }] };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today, history });
  // historyDays: 2 -> only the last 2 entries survive, and today's stale 999 must be replaced with the real total (10)
  assert.deepEqual(out.history.a, [{ date: '2026-09-21', total: 6 }, { date: today, total: 10 }]);
});

test('chain name/color are carried from chains.json, including a chain outside the 6 site chains', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = { d: { items: [{ gtin: '1', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const d = out.ranking.find((r) => r.chainId === 'd');
  assert.equal(d.name, 'רשת ד');
  assert.equal(d.color, '#444');
});

test('priceStatus is {status, sourceDate, failedSince}, status derived from the catalog fetchStatus (like the backend ChainPriceStatus)', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }], fetchStatus: 'failed', sourceDate: '2026-09-18T00:00:00+03:00', failedSince: '2026-09-17T05:55:00+03:00' },
    b: { items: [{ gtin: '1', price: 10, promotions: [] }] }, // no fetchStatus/failedSince at all -> defaults to "ok" / null
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const a = out.ranking.find((r) => r.chainId === 'a');
  assert.deepEqual(a.priceStatus, { status: 'failed', sourceDate: '2026-09-18T00:00:00+03:00', failedSince: '2026-09-17T05:55:00+03:00' });
  const b = out.ranking.find((r) => r.chainId === 'b');
  assert.deepEqual(b.priceStatus, { status: 'ok', sourceDate: null, failedSince: null });
});

test('vsReference/vsMarket/vsCommitment are computed against ministry figures', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = { a: { items: [{ gtin: '1', price: 1200, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const a = out.ranking.find((r) => r.chainId === 'a');
  assert.equal(a.total, 1200);
  assert.equal(a.vsReference, round(1200 - 1472));
  assert.equal(a.vsMarket, round(1200 - 1700));
  assert.equal(a.vsCommitment, round(1200 - 1098));
});

test('a top-level chains map carries name/color for every chain that took part, additive to ranking/excluded', () => {
  const products = [
    { gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.85, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] }, // ranked
    b: { items: [{ gtin: '1', price: 10, promotions: [] }] }, // excluded (coverage 0.5 < 0.85)
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.deepEqual(out.chains.a, { name: 'רשת א', color: '#111' });
  assert.deepEqual(out.chains.b, { name: 'רשת ב', color: '#222' });
  // ranking/excluded rows keep their own name/color too - the map is additive, not a replacement.
  assert.equal(out.ranking.find((r) => r.chainId === 'a').name, 'רשת א');
  assert.equal(out.excluded.find((e) => e.chainId === 'b').name, 'רשת ב');
  assert.equal(out.excluded.find((e) => e.chainId === 'b').color, '#222');
});

test('cells[chainId].promo is the promotion display text, or null - never a boolean', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 3, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [{ type: 'multi', minQty: 3, totalPrice: 24 }] }] }, // has a promo
    b: { items: [{ gtin: '1', price: 10, promotions: [] }] }, // no promo
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const cellA = out.products[0].cells.a;
  assert.equal(typeof cellA.promo, 'string');
  assert.equal(cellA.promo, '3 ב-24 ₪');
  const cellB = out.products[0].cells.b;
  assert.equal(cellB.promo, null);
});

test('the demo chain is skipped entirely - not in ranking, excluded, chains map, or any product cells', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }] },
    demo: { items: [{ gtin: '1', price: 1, promotions: [] }] },
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.ok(!out.ranking.some((r) => r.chainId === 'demo'));
  assert.ok(!out.excluded.some((e) => e.chainId === 'demo'));
  assert.ok(!('demo' in out.chains));
  assert.ok(!('demo' in out.products[0].cells));
  assert.ok(!('demo' in out.history));
  // and demo's absurdly low price must not leak into another chain's imputed median
  assert.equal(out.ranking.find((r) => r.chainId === 'a').total, 10);
});

test('a line with several gtins prices the cheapest variant the chain actually sells, and records which one', () => {
  const cfg = config([{ gtin: 'a1', gtins: ['a1', 'a2', 'a3'], name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: 'a1', price: 30, promotions: [] }, { gtin: 'a2', price: 20, promotions: [] }] }, // a3 not sold - a2 (20) is cheaper than a1 (30)
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const cell = out.products[0].cells.a;
  assert.equal(cell.price, 20);
  assert.equal(cell.gtin, 'a2');
  assert.equal(cell.imputed, false);
});

test('a line with only one gtin (no "gtins" in config) behaves exactly as before', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = { a: { items: [{ gtin: '1', price: 12, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const cell = out.products[0].cells.a;
  assert.equal(cell.price, 12);
  assert.equal(cell.gtin, '1');
});

test('a chain that sells none of a multi-gtin line\'s variants gets it imputed, with gtin: null', () => {
  const products = [
    { gtin: 'a1', gtins: ['a1', 'a2'], name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: 'b1', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.4, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: 'a1', price: 10, promotions: [] }, { gtin: 'b1', price: 10, promotions: [] }] },
    b: { items: [{ gtin: 'a2', price: 20, promotions: [] }, { gtin: 'b1', price: 10, promotions: [] }] },
    c: { items: [{ gtin: 'b1', price: 10, promotions: [] }] }, // sells neither a1 nor a2 - imputed from median(10, 20) = 15
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const cCell = out.products[0].cells.c;
  assert.equal(cCell.imputed, true);
  assert.equal(cCell.price, 15);
  assert.equal(cCell.gtin, null);
});

test('coverage counts lines, not barcodes: a chain covers a multi-gtin line by stocking just one variant', () => {
  const products = [
    { gtin: 'a1', gtins: ['a1', 'a2', 'a3'], name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: 'b1', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.85, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: 'a3', price: 5, promotions: [] }, { gtin: 'b1', price: 10, promotions: [] }] }, // only sells the 3rd variant, still full coverage
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const a = out.ranking.find((r) => r.chainId === 'a');
  assert.equal(a.found, 2);
  assert.equal(a.coverage, 1);
});

test('the output product row carries both gtin (primary) and gtins (all variants)', () => {
  const cfg = config([{ gtin: 'a1', gtins: ['a1', 'a2'], name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = { a: { items: [{ gtin: 'a1', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.products[0].gtin, 'a1');
  assert.deepEqual(out.products[0].gtins, ['a1', 'a2']);
});

test('brand/size/productName come from data/products.json for the primary gtin, and each cell carries shelfPrice/itemName', () => {
  const cfg = config([{ gtin: '1', name: 'p1 (brochure label)', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const products = [{ gtin: '1', name: 'מוצר מלא', brand: 'מותג', size: { value: 500, unit: 'g', count: 1 } }];
  const catalogs = { a: { items: [{ gtin: '1', name: 'שם הפריט אצל רשת א', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, products, catalogs, chains, today });
  const row = out.products[0];
  assert.equal(row.name, 'p1 (brochure label)', 'the brochure label (config name) is unchanged');
  assert.equal(row.productName, 'מוצר מלא');
  assert.equal(row.brand, 'מותג');
  assert.equal(row.size, '500 גרם');
  const cellA = row.cells.a;
  assert.equal(cellA.itemName, 'שם הפריט אצל רשת א');
  assert.equal(cellA.shelfPrice, 10);
});

test('a 2.5-liter size (value in ml >= 1000) formats as ליטר, not מ"ל', () => {
  const cfg = config([{ gtin: '1', name: 'פרסיל', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const products = [{ gtin: '1', name: "פרסיל ג'ל 2.5 ליטר", brand: 'הנקל סוד', size: { value: 2500, unit: 'ml', count: 1 } }];
  const catalogs = { a: { items: [{ gtin: '1', price: 33, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, products, catalogs, chains, today });
  assert.equal(out.products[0].size, '2.5 ליטר');
});

test('brand/size fall back to the config entry when the product is absent from products.json, else null', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10, brand: 'מותג קונפיג', size: '1 ליטר' }]);
  const catalogs = { a: { items: [{ gtin: '1', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today }); // no products passed at all
  assert.equal(out.products[0].brand, 'מותג קונפיג');
  assert.equal(out.products[0].size, '1 ליטר');
  assert.equal(out.products[0].productName, null);
});

test('a Carrefour-style basket promo widens the effective spread but not the shelf spread - suspect stays false', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 15, promotions: [] }] }, // shelf 15, no promo
    b: { items: [{ gtin: '1', price: 17, promotions: [{ type: 'unit', minQty: 1, unitPrice: 5 }] }] }, // shelf 17, effective 5
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const row = out.products[0];
  assert.equal(row.cells.a.shelfPrice, 15);
  assert.equal(row.cells.b.shelfPrice, 17);
  assert.equal(row.cells.b.price, 5);
  assert.equal(row.spread, 3, 'effective spread is wide (15 / 5)');
  assert.equal(row.shelfSpread, round(17 / 15), 'shelf spread stays narrow');
  assert.equal(row.suspect, false, 'a promo alone must never trip the suspect flag');
});

test('a shelf-price spread above rules.suspectSpread (2.5) is flagged suspect - a mismatch or bad file, not a promo', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }] },
    b: { items: [{ gtin: '1', price: 30, promotions: [] }] }, // 30/10 = 3 > 2.5, no promo involved at all
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const row = out.products[0];
  assert.equal(row.shelfSpread, 3);
  assert.equal(row.spread, 3);
  assert.equal(row.suspect, true);
});

test('spread/shelfSpread are null with fewer than 2 non-imputed chains, and suspect is false in that case', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }], { minCoverage: 0, historyDays: 90 });
  const catalogs = { a: { items: [{ gtin: '1', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const row = out.products[0];
  assert.equal(row.spread, null);
  assert.equal(row.shelfSpread, null);
  assert.equal(row.suspect, false);
});

test('rules.suspectSpread overrides the 2.5 default', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }], { minCoverage: 0.85, historyDays: 90, suspectSpread: 5 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }] },
    b: { items: [{ gtin: '1', price: 30, promotions: [] }] }, // spread 3, below the raised threshold of 5
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.products[0].suspect, false);
});

test('each ranking row carries suspectLines: how many suspect lines that chain actually priced itself (not imputed)', () => {
  const products = [
    { gtin: '1', name: 'suspect-line', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'normal-line', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.4, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] },
    b: { items: [{ gtin: '1', price: 30, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] }, // gtin 1: 30/10=3 -> suspect
    c: { items: [{ gtin: '2', price: 10, promotions: [] }] }, // never sells gtin 1 - its cell is imputed, doesn't count
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.products[0].suspect, true);
  assert.equal(out.ranking.find((r) => r.chainId === 'a').suspectLines, 1);
  assert.equal(out.ranking.find((r) => r.chainId === 'b').suspectLines, 1);
  const c = out.ranking.find((r) => r.chainId === 'c');
  assert.ok(c, 'chain c should still clear the lowered minCoverage');
  assert.equal(c.suspectLines, 0, 'an imputed cell never counts toward suspectLines');
});

test('ranking row: shelfTotal is the basket at shelf price (imputed lines use the imputed shelf value), total stays the ranking key', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = {
    a: { items: [{ gtin: '1', price: 17, promotions: [{ type: 'unit', minQty: 1, unitPrice: 5 }] }] }, // shelf 17, effective 5
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const a = out.ranking.find((r) => r.chainId === 'a');
  assert.equal(a.total, 5, 'total is still the effective, promo-applied ranking key');
  assert.equal(a.shelfTotal, 17, 'shelfTotal is the same basket priced at shelf, no promo');
});

test('ranking row: foundTotal/foundShelfTotal sum only non-imputed lines, foundLines is their count', () => {
  const products = [
    { gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'p2', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ];
  const cfg = config(products, { minCoverage: 0.4, historyDays: 90 });
  const catalogs = {
    a: { items: [{ gtin: '1', price: 10, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] },
    b: { items: [{ gtin: '1', price: 20, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] },
    c: { items: [{ gtin: '2', price: 10, promotions: [] }] }, // gtin 1 missing - imputed as median(10, 20) = 15
  };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const c = out.ranking.find((r) => r.chainId === 'c');
  assert.equal(c.total, 25, '15 (imputed) + 10 (found) - unchanged');
  assert.equal(c.shelfTotal, 25, 'no promos anywhere, shelf == effective');
  assert.equal(c.foundTotal, 10, 'only gtin 2, the one chain c actually sells');
  assert.equal(c.foundShelfTotal, 10);
  assert.equal(c.foundLines, 1);
  assert.equal(c.foundLines, c.found, 'foundLines pairs with foundTotal/foundShelfTotal, same count as found');
});

test('basket.sourceName/sourceUrl pass through additively, basket.source is unchanged', () => {
  const cfg = config([{ gtin: '1', name: 'p1', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 }]);
  const catalogs = { a: { items: [{ gtin: '1', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  assert.equal(out.basket.sourceName, 'משרד הכלכלה והתעשייה');
  assert.equal(out.basket.sourceUrl, 'x');
  assert.equal(out.basket.source, 'x');
});

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

test('a basket row carries the department id beside the Hebrew label (23.9)', () => {
  // The frontend ordered the basket's departments by slug while the file published Hebrew labels, so its
  // ordering silently did nothing. `category` stays the label because it is shown as a heading; anything
  // that groups or orders must key off `categoryId`.
  const cfg = config([
    { gtin: '1', name: 'p1', category: 'שימורים', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
    { gtin: '2', name: 'p2', category: 'ניקיון וטואלטיקה', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 10 },
  ]);
  const catalogs = { a: { items: [{ gtin: '1', price: 10, promotions: [] }, { gtin: '2', price: 10, promotions: [] }] } };
  const out = computeSalIsrael({ config: cfg, catalogs, chains, today });
  const byGtin = Object.fromEntries(out.products.map((p) => [p.gtin, p]));
  assert.equal(byGtin['1'].categoryId, 'pantry');
  assert.equal(byGtin['1'].category, 'שימורים');
  assert.equal(byGtin['2'].categoryId, 'household', 'the id the rest of the API uses, not a transliteration');
  assert.ok(out.products.every((p) => typeof p.categoryId === 'string' && p.categoryId));
});
