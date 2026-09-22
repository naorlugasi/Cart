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
    basket: { name: 'הסל של ישראל', source: 'x', publishedOn: '2026-04' },
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

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
