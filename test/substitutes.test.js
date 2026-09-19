import test from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart, LINE_STATUS } from '../src/pricing/compare.js';
import { findSubstitute, sizeWithin, _setConceptLookup } from '../src/pricing/substitutes.js';
import { HandoffService } from '../src/handoff/handoffService.js';
import { createApp } from '../server/app.js';
import { DATA_DIR } from './helpers.js';

/**
 * Concept metadata is normally read from config/concepts/*.json (docs/CONCEPTS.md §1), which another
 * agent is actively building out in parallel. To keep these tests deterministic we swap in a small,
 * fixed lookup instead of depending on that file's current contents (see the test-only seam in
 * substitutes.js). 'no-such-concept' is deliberately absent, to exercise the "unknown concept" guard.
 */
const CONCEPTS = {
  'milk-3': { id: 'milk-3', sizeUnit: 'ml' },
  tp: { id: 'tp', sizeUnit: null },
};
_setConceptLookup((id) => CONCEPTS[id] ?? null);
test.after(() => _setConceptLookup(null));

function product(overrides) {
  return { unit: "יח'", isWeighted: false, aliases: [], conceptId: null, size: null, privateLabelOf: null, ...overrides };
}

function item({ id, name, price, promotions = [], privateLabel = false, inStock = true }) {
  const p = products.find((x) => x.id === id);
  return { storeItemId: `SI_${id}`, gtin: p.gtin, code: p.gtin, name, price, isWeighted: false, unit: "יח'", inStock, promotions, privateLabel };
}

// ---- shared catalog: one chain ('chainA') stocking every variant, used for size/policy/promo checks ----
const products = [
  product({ id: 'milk-orig', name: 'חלב פרימיום 3 אחוז מקורי', gtin: '1000000000001', conceptId: 'milk-3', size: { value: 1000, unit: 'ml', count: 1 } }),
  product({ id: 'milk-cheap', name: 'חלב רגיל 3 אחוז זול', gtin: '1000000000002', conceptId: 'milk-3', size: { value: 1000, unit: 'ml', count: 1 } }),
  product({ id: 'milk-pl', name: 'חלב מותג החנות', gtin: '1000000000003', conceptId: 'milk-3', size: { value: 900, unit: 'ml', count: 1 }, privateLabelOf: 'chainA' }),
  product({ id: 'milk-far', name: 'חלב מארז ענק מדי', gtin: '1000000000004', conceptId: 'milk-3', size: { value: 1300, unit: 'ml', count: 1 } }),
  product({ id: 'milk-gram', name: 'חלב באריזת גרמים', gtin: '1000000000005', conceptId: 'milk-3', size: { value: 900, unit: 'g', count: 1 } }),
  product({ id: 'milk-nosize', name: 'חלב ללא גודל ידוע', gtin: '1000000000006', conceptId: 'milk-3', size: null }),
  product({ id: 'milk-club', name: 'חלב מבצע מועדון בלבד', gtin: '1000000000007', conceptId: 'milk-3', size: { value: 1000, unit: 'ml', count: 1 } }),
  product({ id: 'tp-orig', name: 'נייר טואלט מקורי שמונה גלילים', gtin: '2000000000001', conceptId: 'tp', size: null }),
  product({ id: 'tp-alt', name: 'נייר טואלט חלופי שמונה גלילים', gtin: '2000000000002', conceptId: 'tp', size: null }),
  product({ id: 'no-concept', name: 'מוצר בלי קונספט כלל', gtin: '3000000000001', conceptId: null, size: null }),
  product({ id: 'uc-orig', name: 'מוצר קונספט לא מוגדר מקורי', gtin: '4000000000001', conceptId: 'no-such-concept', size: { value: 1000, unit: 'ml', count: 1 } }),
  product({ id: 'uc-match', name: 'מוצר קונספט לא מוגדר תואם גודל', gtin: '4000000000002', conceptId: 'no-such-concept', size: { value: 1000, unit: 'ml', count: 1 } }),
  product({ id: 'uc-nosize', name: 'מוצר קונספט לא מוגדר בלי גודל', gtin: '4000000000003', conceptId: 'no-such-concept', size: null }),
];

const chainA = {
  items: [
    item({ id: 'milk-orig', name: 'חלב פרימיום 3% מקורי 1 ליטר', price: 7.0 }),
    item({ id: 'milk-cheap', name: 'חלב רגיל 3% זול 1 ליטר', price: 6.0 }),
    item({ id: 'milk-pl', name: 'חלב מותג החנות 900 מ"ל', price: 6.5, privateLabel: true }),
    item({ id: 'milk-far', name: 'חלב מארז ענק 1.3 ליטר', price: 5.0 }),
    item({ id: 'milk-gram', name: 'חלב גרמים', price: 5.5 }),
    item({ id: 'milk-nosize', name: 'חלב ללא גודל', price: 5.0 }),
    item({ id: 'milk-club', name: 'חלב מועדון', price: 6.8, promotions: [{ type: 'percent', minQty: 1, percent: 90, club: true }] }),
    item({ id: 'tp-orig', name: 'נייר טואלט מקורי', price: 10.0 }),
    item({ id: 'tp-alt', name: 'נייר טואלט חלופי', price: 8.0 }),
    item({ id: 'uc-orig', name: 'מוצר קונספט לא מוגדר', price: 9.0 }),
    item({ id: 'uc-match', name: 'מוצר קונספט לא מוגדר תואם', price: 7.0 }),
    item({ id: 'uc-nosize', name: 'מוצר קונספט לא מוגדר בלי גודל', price: 4.0 }),
  ],
};

// 'demo' matches the registered demo adapter (src/handoff/adapters/demo.js), so the handoff test can use it.
// It stocks milk-cheap/milk-pl/uc-nosize but NOT milk-orig - the "missing at this chain" scenario.
const demo = {
  items: [
    item({ id: 'milk-cheap', name: 'חלב זול בדמו', price: 6.2 }),
    item({ id: 'milk-pl', name: 'חלב מותג פרטי בדמו', price: 6.8, privateLabel: true }),
    item({ id: 'uc-nosize', name: 'מוצר קונספט לא מוגדר בלי גודל בדמו', price: 4.0 }),
  ],
};

const chains = [
  { id: 'chainA', name: 'Chain A', branches: [{ id: 'chainA-b1', name: 'Branch', city: 'תל אביב' }] },
  { id: 'demo', name: 'Demo Market', branches: [{ id: 'demo-b1', name: 'Branch', city: 'תל אביב' }] },
];

const mapping = new MappingEngine({ products, catalogs: { chainA, demo }, strictGtin: true });

// ---------------------------------------------------------------------------
// sizeWithin: pure ±25% tolerance check
// ---------------------------------------------------------------------------

test('sizeWithin: 25% boundary is inclusive on both sides', () => {
  const a = { value: 1000, unit: 'ml', count: 1 };
  assert.equal(sizeWithin(a, { value: 1250, unit: 'ml', count: 1 }, 0.25), true, 'exactly +25% passes');
  assert.equal(sizeWithin(a, { value: 1251, unit: 'ml', count: 1 }, 0.25), false, 'just over +25% fails');
  assert.equal(sizeWithin(a, { value: 750, unit: 'ml', count: 1 }, 0.25), true, 'exactly -25% passes');
  assert.equal(sizeWithin(a, { value: 749, unit: 'ml', count: 1 }, 0.25), false, 'just over -25% fails');
});

test('sizeWithin: unit mismatch and missing sizes are rejected', () => {
  const ml = { value: 1000, unit: 'ml', count: 1 };
  assert.equal(sizeWithin(ml, { value: 1000, unit: 'g', count: 1 }, 0.25), false, 'g vs ml never matches');
  assert.equal(sizeWithin(ml, null, 0.25), false);
  assert.equal(sizeWithin(null, ml, 0.25), false);
  assert.equal(sizeWithin(null, null, 0.25), false);
});

test('sizeWithin: counts multiply into the total (a 6-pack compares by total volume)', () => {
  assert.equal(sizeWithin({ value: 330, unit: 'ml', count: 6 }, { value: 1980, unit: 'ml', count: 1 }, 0.25), true);
});

// ---------------------------------------------------------------------------
// findSubstitute: candidate selection
// ---------------------------------------------------------------------------

test('findSubstitute: rejects out-of-tolerance size, unit mismatch and missing size; accepts within ±25%', () => {
  const orig = products.find((p) => p.id === 'milk-orig');
  const found = findSubstitute({ product: orig, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' });
  // milk-far (1.3L, +30%), milk-gram (g not ml) and milk-nosize (no size) must all be excluded even
  // though they are cheaper than every valid candidate; the cheapest *valid* one is milk-cheap.
  assert.equal(found.product.id, 'milk-cheap');
  assert.equal(found.lineTotal, 6.0);
});

test('findSubstitute: a concept with sizeUnit null skips the size check entirely', () => {
  const orig = products.find((p) => p.id === 'tp-orig'); // size: null, concept 'tp' has sizeUnit: null
  const found = findSubstitute({ product: orig, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' });
  assert.equal(found.product.id, 'tp-alt');
  assert.equal(found.lineTotal, 8.0);
});

test('findSubstitute: an unknown concept id gets no size-check bypass - both real sizes are still required', () => {
  const orig = products.find((p) => p.id === 'uc-orig'); // conceptId 'no-such-concept', has a real size
  const matched = findSubstitute({ product: orig, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' });
  // uc-nosize is cheaper (4.0) but has no size, and the concept is unknown so that is not forgiven.
  assert.equal(matched.product.id, 'uc-match');
  assert.equal(matched.lineTotal, 7.0);
});

test('findSubstitute: policy privateLabel only considers the chain\'s own brand; cheapest considers any', () => {
  const orig = products.find((p) => p.id === 'milk-orig');
  const pl = findSubstitute({ product: orig, qty: 1, chainId: 'chainA', mapping, policy: 'privateLabel' });
  assert.equal(pl.product.id, 'milk-pl');
  assert.equal(pl.privateLabel, true);
  assert.equal(pl.lineTotal, 6.5);

  const cheapest = findSubstitute({ product: orig, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' });
  assert.equal(cheapest.product.id, 'milk-cheap');
  assert.equal(cheapest.privateLabel, false);
});

test('findSubstitute: a club-only promotion never counts towards the candidate\'s price', () => {
  const clubProducts = [
    product({ id: 'club-orig', name: 'מקור', gtin: '9000000000001', conceptId: 'milk-3', size: { value: 1000, unit: 'ml', count: 1 } }),
    product({ id: 'club-cand', name: 'מועמד מועדון', gtin: '9000000000002', conceptId: 'milk-3', size: { value: 1000, unit: 'ml', count: 1 } }),
  ];
  // item() looks candidates up in the outer `products` array by id, so build this catalog by hand.
  const localMapping = new MappingEngine({
    products: clubProducts,
    catalogs: {
      chX: { items: [{ storeItemId: 'SI_club-cand', gtin: '9000000000002', name: 'מועמד מועדון', price: 6.0, isWeighted: false, inStock: true, promotions: [{ type: 'percent', minQty: 1, percent: 90, club: true }] }] },
    },
    strictGtin: true,
  });
  const found = findSubstitute({ product: clubProducts[0], qty: 1, chainId: 'chX', mapping: localMapping, policy: 'cheapest' });
  assert.equal(found.product.id, 'club-cand');
  assert.equal(found.lineTotal, 6.0, 'the club price (0.6) must never be used - only the regular total');
});

test('findSubstitute: no concept -> null; no eligible candidate -> null', () => {
  const noConcept = products.find((p) => p.id === 'no-concept');
  assert.equal(findSubstitute({ product: noConcept, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' }), null);

  // milk-orig has no candidates at all at a chain that stocks nothing of that concept.
  const orig = products.find((p) => p.id === 'milk-orig');
  const emptyMapping = new MappingEngine({ products, catalogs: { empty: { items: [] } }, strictGtin: true });
  assert.equal(findSubstitute({ product: orig, qty: 1, chainId: 'empty', mapping: emptyMapping, policy: 'cheapest' }), null);
});

// ---------------------------------------------------------------------------
// compareCart integration
// ---------------------------------------------------------------------------

test('compareCart: a missing line in "ask" mode stays missing and offers the candidate as alternative (reason missing), whatever the policy', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const asked = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'ask' } });
  const askedLine = asked.rows.find((r) => r.chainId === 'demo').lines[0];
  assert.equal(askedLine.status, LINE_STATUS.MISSING);
  assert.equal(askedLine.lineTotal, 0);
  assert.deepEqual({ id: askedLine.alternative.productId, reason: askedLine.alternative.reason, total: askedLine.alternative.lineTotal }, { id: 'milk-cheap', reason: 'missing', total: 6.2 });
  assert.equal(asked.rows.find((r) => r.chainId === 'demo').withAlternatives.count, 1, 'the row counts the missing-line candidate');
});

test('compareCart: a missing line is auto-substituted only with apply "auto", regardless of `substitutes.policy` (even "none")', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'auto' } });
  const row = result.rows.find((r) => r.chainId === 'demo');
  const line = row.lines[0];
  assert.equal(line.status, LINE_STATUS.SUBSTITUTED);
  assert.equal(line.substituteReason, 'missing');
  assert.equal(line.usedProductId, 'milk-cheap', 'cheapest eligible candidate, brand ignored');
  assert.equal(line.substituteFor, 'חלב פרימיום 3 אחוז מקורי');
  assert.equal(line.name, 'חלב פרימיום 3 אחוז מקורי', 'the line keeps the original product\'s display name');
  assert.equal(line.storeItemName, 'חלב זול בדמו');
  assert.equal(line.lineTotal, 6.2);
  assert.equal(row.isComplete, true);
});

test('compareCart: no substitute found for a missing line reports it as missing, as before', () => {
  const cart = { lines: [{ productId: 'no-concept', qty: 1 }] }; // not sold anywhere, no conceptId to fall back on
  const result = compareCart({ cart, chains, mapping });
  const row = result.rows.find((r) => r.chainId === 'demo');
  assert.equal(row.lines[0].status, LINE_STATUS.MISSING);
});

test('compareCart: an explicit substituteProductId always wins, even over a cheaper auto-candidate', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1, substituteProductId: 'milk-pl' }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'cheapest', apply: 'auto' } });
  const row = result.rows.find((r) => r.chainId === 'demo');
  assert.equal(row.lines[0].status, LINE_STATUS.SUBSTITUTED);
  assert.equal(row.lines[0].usedProductId, 'milk-pl', 'milk-cheap (6.2) is cheaper but the explicit choice governs');
});

test('compareCart: an explicit substituteProductId that cannot be resolved there stays missing (no auto fallback)', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1, substituteProductId: 'uc-orig' }] }; // uc-orig is not sold at demo
  const result = compareCart({ cart, chains, mapping });
  const row = result.rows.find((r) => r.chainId === 'demo');
  assert.equal(row.lines[0].status, LINE_STATUS.MISSING);
  assert.equal(row.lines[0].substituteTried, 'מוצר קונספט לא מוגדר מקורי');
});

test('compareCart: an explicit substituteProductId wins even when the ORIGINAL is available (bug fix)', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1, substituteProductId: 'milk-cheap' }] };
  const result = compareCart({ cart, chains, mapping }); // default substitutes: policy privateLabel, apply ask - irrelevant here
  const row = result.rows.find((r) => r.chainId === 'chainA'); // milk-orig ('ok', ₪7) is available at chainA
  const line = row.lines[0];
  assert.equal(line.status, LINE_STATUS.SUBSTITUTED);
  assert.equal(line.substituteReason, 'customer');
  assert.equal(line.usedProductId, 'milk-cheap');
  assert.equal(line.substituteFor, 'חלב פרימיום 3 אחוז מקורי', 'substituteFor names the original product');
  assert.equal(line.name, 'חלב פרימיום 3 אחוז מקורי', 'the line still displays the original product\'s name');
  assert.equal(line.lineTotal, 6.0, 'priced on the substitute (milk-cheap), not the original (₪7)');
  assert.equal(line.alternative, null, 'no cheaper-alternative offer on a line the customer already substituted');
  assert.equal(row.subtotal, 6.0, 'the row total reflects the substitute, not the original');
});

test('compareCart: an explicit substituteProductId not sold at the chain falls back to the (available) original, with substituteTried; cheaper offers still apply', () => {
  // milk-cheap is sold at demo (₪6.2); tp-orig is not - an unrelated product picked only to be "not sold at demo".
  const cart = { lines: [{ productId: 'milk-cheap', qty: 1, substituteProductId: 'tp-orig' }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'privateLabel', apply: 'ask' } });
  const row = result.rows.find((r) => r.chainId === 'demo');
  const line = row.lines[0];
  assert.equal(line.status, LINE_STATUS.OK);
  assert.equal(line.usedProductId, 'milk-cheap');
  assert.equal(line.lineTotal, 6.2);
  assert.equal(line.substituteTried, 'נייר טואלט מקורי שמונה גלילים', 'so the UI can say the chosen substitute is not sold here');
  // demo's only other milk-3 item is milk-pl at ₪6.8 - not cheaper than milk-cheap's ₪6.2, so no offer here.
  assert.equal(line.alternative, null);
});

test('compareCart: substituteProductId: null behaves exactly like an absent field', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1, substituteProductId: null }] };
  const result = compareCart({ cart, chains, mapping }); // default substitutes: policy privateLabel, apply ask
  const line = result.rows.find((r) => r.chainId === 'chainA').lines[0];
  assert.equal(line.status, LINE_STATUS.OK);
  assert.equal(line.lineTotal, 7.0);
  assert.deepEqual(line.alternative, {
    productId: 'milk-pl',
    name: 'חלב מותג החנות',
    storeItemName: 'חלב מותג החנות 900 מ"ל',
    unitPrice: 6.5,
    lineTotal: 6.5,
    savings: 0.5,
    privateLabel: true,
    reason: 'cheaper',
  });
});

test('compareCart: apply "ask" (policy privateLabel, the default) attaches `alternative` without touching the line', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping }); // default substitutes: { policy: 'privateLabel', apply: 'ask' }
  const row = result.rows.find((r) => r.chainId === 'chainA');
  const line = row.lines[0];
  assert.equal(line.status, LINE_STATUS.OK);
  assert.equal(line.lineTotal, 7.0);
  assert.deepEqual(line.alternative, {
    productId: 'milk-pl',
    name: 'חלב מותג החנות',
    storeItemName: 'חלב מותג החנות 900 מ"ל',
    unitPrice: 6.5,
    lineTotal: 6.5,
    savings: 0.5,
    privateLabel: true,
    reason: 'cheaper',
  });
});

test('compareCart: policy "cheapest" offers any cheaper product, not just private label', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'cheapest', apply: 'ask' } });
  const line = result.rows.find((r) => r.chainId === 'chainA').lines[0];
  assert.equal(line.alternative.productId, 'milk-cheap');
  assert.equal(line.alternative.savings, 1.0);
  assert.equal(line.alternative.privateLabel, false);
});

test('compareCart: policy "none" never offers a cheaper alternative for an available line', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'ask' } });
  const line = result.rows.find((r) => r.chainId === 'chainA').lines[0];
  assert.equal(line.status, LINE_STATUS.OK);
  assert.equal(line.alternative, null);
});

test('compareCart: apply "auto" substitutes the cheaper candidate straight into the line', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }, { productId: 'tp-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'cheapest', apply: 'auto' } });
  const row = result.rows.find((r) => r.chainId === 'chainA');
  const [milkLine, tpLine] = row.lines;
  assert.equal(milkLine.status, LINE_STATUS.SUBSTITUTED);
  assert.equal(milkLine.substituteReason, 'cheaper');
  assert.equal(milkLine.usedProductId, 'milk-cheap');
  assert.equal(milkLine.lineTotal, 6.0);
  assert.equal(milkLine.alternative, null, 'apply auto never leaves an `alternative` suggestion on the line');
  assert.equal(tpLine.status, LINE_STATUS.SUBSTITUTED);
  assert.equal(tpLine.usedProductId, 'tp-alt');
  assert.equal(row.substitutedCount, 2);
  assert.equal(row.withAlternatives, null, 'apply auto never populates withAlternatives (no line carries `alternative`)');
});

test('compareCart: withAlternatives aggregates subtotal/grandTotal/savings/count across every "ask" line; null when none', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }, { productId: 'tp-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'cheapest', apply: 'ask' } });
  const row = result.rows.find((r) => r.chainId === 'chainA');
  assert.equal(row.subtotal, 17.0);
  assert.deepEqual(row.withAlternatives, { subtotal: 14.0, grandTotal: 14.0, savings: 3.0, count: 2 });
  assert.equal(row.substitutedCount, 0, 'nothing was actually substituted, only suggested');

  const none = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'ask' } });
  assert.equal(none.rows.find((r) => r.chainId === 'chainA').withAlternatives, null);
});

// ---------------------------------------------------------------------------
// handoff: a substituted line's usedProductId must carry through to the handoff
// ---------------------------------------------------------------------------

test('handoffService.create sends the substitute\'s storeItemId and marks it substituted', async () => {
  const service = new HandoffService({ mapping, alerts: null, chains });
  const cart = { lines: [{ productId: 'milk-orig', qty: 2 }] };
  const comparison = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'auto' } }); // policy doesn't matter: this line is "missing", not "cheaper"; auto applies it
  const row = comparison.rows.find((r) => r.chainId === 'demo');
  assert.equal(row.lines[0].status, LINE_STATUS.SUBSTITUTED, 'sanity: the row actually auto-substituted milk-orig');
  assert.equal(row.lines[0].usedProductId, 'milk-cheap');

  const handoff = await service.create({ cart, chainId: 'demo', comparisonRow: row, origin: 'http://127.0.0.1:4321' });
  assert.equal(handoff.items.length, 1);
  assert.equal(handoff.items[0].storeItemId, 'SI_milk-cheap');
  assert.equal(handoff.items[0].qty, 2);
  assert.equal(handoff.items[0].substituted, true);
  assert.equal(handoff.items[0].productId, 'milk-orig', 'the cart-facing id stays the original product');
});

test('handoffService.create sends the explicit substitute\'s storeItemId even when the original was available (bug fix)', async () => {
  const service = new HandoffService({ mapping, alerts: null, chains });
  // milk-cheap ('ok' at demo, ₪6.2) with an explicit, in-stock substitute (milk-pl, ₪6.8) - the substitute must win.
  const cart = { lines: [{ productId: 'milk-cheap', qty: 2, substituteProductId: 'milk-pl' }] };
  const comparison = compareCart({ cart, chains, mapping });
  const row = comparison.rows.find((r) => r.chainId === 'demo');
  assert.equal(row.lines[0].status, LINE_STATUS.SUBSTITUTED, 'sanity: the explicit substitute was applied');
  assert.equal(row.lines[0].substituteReason, 'customer');
  assert.equal(row.lines[0].usedProductId, 'milk-pl');

  const handoff = await service.create({ cart, chainId: 'demo', comparisonRow: row, origin: 'http://127.0.0.1:4321' });
  assert.equal(handoff.items.length, 1);
  assert.equal(handoff.items[0].storeItemId, 'SI_milk-pl', 'the explicit substitute\'s storeItemId, not the original\'s');
  assert.equal(handoff.items[0].qty, 2);
  assert.equal(handoff.items[0].substituted, true);
  assert.equal(handoff.items[0].productId, 'milk-cheap', 'the cart-facing id stays the original product');
});

// ---------------------------------------------------------------------------
// server/app.js: /api/compare accepts and validates a `substitutes` body field
// ---------------------------------------------------------------------------

test('POST /api/compare accepts a valid `substitutes` option and rejects a garbage one with 400', async (t) => {
  const app = createApp({ dataDir: DATA_DIR, persist: false, logger: { error: () => {}, warn: () => {} } });
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());

  const ok = await fetch(`${base}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: [{ productId: 'milk-3', qty: 1 }], substitutes: { policy: 'cheapest', apply: 'auto' } }),
  });
  assert.equal(ok.status, 200);

  const badPolicy = await fetch(`${base}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: [{ productId: 'milk-3', qty: 1 }], substitutes: { policy: 'nonsense' } }),
  });
  assert.equal(badPolicy.status, 400);

  const badApply = await fetch(`${base}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: [{ productId: 'milk-3', qty: 1 }], substitutes: { apply: 'nonsense' } }),
  });
  assert.equal(badApply.status, 400);
});

test('handoff without a comparison row still honours the cart line\'s explicit substitute', async () => {
  const service = new HandoffService({ mapping, alerts: null, chains });
  const cart = { lines: [{ productId: 'milk-orig', qty: 1, substituteProductId: 'milk-cheap' }] };
  const handoff = await service.create({ cart, chainId: 'demo', origin: 'http://127.0.0.1:4321' });
  assert.equal(handoff.items[0].storeItemId, 'SI_milk-cheap');
  assert.equal(handoff.items[0].substituted, true);
  assert.equal(handoff.items[0].productId, 'milk-orig');

  const notSold = { lines: [{ productId: 'milk-cheap', qty: 1, substituteProductId: 'milk-orig' }] };
  const fallback = await service.create({ cart: notSold, chainId: 'demo', origin: 'http://127.0.0.1:4321' });
  assert.equal(fallback.items[0].storeItemId, 'SI_milk-cheap', 'a substitute the chain does not sell leaves the original in place');
  assert.equal(fallback.items[0].substituted, false);
});

test('when neither the chosen substitute nor the original is sold, a third product of the concept is offered', () => {
  // Neither milk-orig nor milk-far is sold at the demo chain; milk-cheap / milk-pl are.
  const cart = { lines: [{ productId: 'milk-orig', qty: 1, substituteProductId: 'milk-far' }] };
  const line = compareCart({ cart, chains, mapping }).rows.find((r) => r.chainId === 'demo').lines[0];
  assert.equal(line.status, LINE_STATUS.MISSING);
  assert.equal(line.lineTotal, 0);
  assert.equal(line.substituteTried, 'חלב מארז ענק מדי', 'the UI can still say the chosen one is not sold here either');
  assert.deepEqual({ id: line.alternative.productId, reason: line.alternative.reason }, { id: 'milk-cheap', reason: 'missing' }, 'a third product of the same concept, cheapest');

  const auto = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'auto' } }).rows.find((r) => r.chainId === 'demo').lines[0];
  assert.equal(auto.status, LINE_STATUS.SUBSTITUTED);
  assert.equal(auto.substituteReason, 'missing', 'not "customer": the customer\'s own pick was unavailable');
  assert.equal(auto.usedProductId, 'milk-cheap');
  assert.equal(auto.substituteTried, 'חלב מארז ענק מדי');
});
