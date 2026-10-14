import test from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart, LINE_STATUS } from '../src/pricing/compare.js';
import { findSubstitute, findSubstitutes, sizeWithin, _setConceptLookup } from '../src/pricing/substitutes.js';
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
// findSubstitutes: the ranked list findSubstitute's pick comes from (Naor, 12.10)
// ---------------------------------------------------------------------------

// A cheaper offer ranks by LINE price (review 14.10: its claim is "you save ₪X on this line"); a missing
// line ranks the same candidates per ml (Naor, 14.10: "מחיר פר גרם מהזול ליקר") - milk-pl (900 ml @ 6.5 =
// 7.22 per litre) goes BEHIND milk-club (1000 ml @ 6.8) there, though its line is cheaper.
test('findSubstitutes: a cheaper offer by line price, a missing line per ml; [0] matches findSubstitute, capped at limit', () => {
  const orig = products.find((p) => p.id === 'milk-orig');
  const args = { product: orig, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' };
  const list = findSubstitutes(args);
  assert.deepEqual(list.map((e) => e.product.id), ['milk-cheap', 'milk-pl', 'milk-club'], 'a cheaper offer: cheapest line first');
  assert.deepEqual(list[0], findSubstitute(args), 'findSubstitutes(args)[0] is always findSubstitute(args)');
  assert.ok(list.every((e) => e.tier === 'concept'), 'a cheaper offer never reaches the family tier');

  const missing = { ...args, purpose: 'missing' };
  const perMl = findSubstitutes(missing);
  // milk-far (1.3 L @ 5.0, outside ±25% so 'other-size') is the cheapest per ml and leads, caveat and all.
  assert.deepEqual(perMl.map((e) => e.product.id), ['milk-far', 'milk-cheap', 'milk-club', 'milk-pl'], 'a missing line: cheapest per ml first (Naor, 14.10)');
  assert.deepEqual(perMl[0].caveats, ['other-size']);
  assert.deepEqual(perMl[0], findSubstitute(missing));

  const capped = findSubstitutes(args, { limit: 2 });
  assert.deepEqual(capped.map((e) => e.product.id), ['milk-cheap', 'milk-pl']);

  const noConcept = products.find((p) => p.id === 'no-concept');
  assert.deepEqual(findSubstitutes({ product: noConcept, qty: 1, chainId: 'chainA', mapping, policy: 'cheapest' }), []);

  const emptyMapping = new MappingEngine({ products, catalogs: { empty: { items: [] } }, strictGtin: true });
  assert.deepEqual(findSubstitutes({ product: orig, qty: 1, chainId: 'empty', mapping: emptyMapping, policy: 'cheapest' }), [], 'no eligible candidate -> empty list, not null');
});

// Naor, 14.10: "nearest size first" among other-size stand-ins is gone - ordered by price per roll instead
// (t10 @ 20/10=2.0, t8 @ 9/8=1.125, t6 @ 5/6=0.833), cheapest first, whatever its distance from 16 rolls.
// Was ['t10', 't8', 't6'] (nearest size) before 14.10.
test('findSubstitutes: among other-size stand-ins the list is ordered by price per roll, same as findSubstitute\'s pick', () => {
  const towel = (id, gtin, count) => product({ id, gtin, name: `מגבות נייר ${count} גלילים`, conceptId: 'paper-towel', category: 'ניקיון', size: { value: 1, unit: 'unit', count } });
  const TP = [towel('t16', '5100000000001', 16), towel('t10', '5100000000002', 10), towel('t8', '5100000000003', 8), towel('t6', '5100000000004', 6)];
  const titem = (id, price) => { const p = TP.find((x) => x.id === id); return { storeItemId: `U_${id}`, gtin: p.gtin, code: p.gtin, name: p.name, price, isWeighted: false, unit: "יח'", inStock: true, promotions: [] }; };
  const tmapping = new MappingEngine({ products: TP, catalogs: { chainX: { items: [titem('t10', 20), titem('t8', 9), titem('t6', 5)] } }, strictGtin: true });
  _setRules(RULES); _setConceptLookup((id) => (id === 'paper-towel' ? { id, sizeUnit: 'unit' } : null));
  try {
    const args = { product: TP[0], qty: 1, chainId: 'chainX', mapping: tmapping, policy: 'cheapest', purpose: 'missing' };
    const list = findSubstitutes(args);
    assert.deepEqual(list.map((e) => e.product.id), ['t6', 't8', 't10'], 'cheapest per roll first (Naor, 14.10), whatever its distance from 16');
    assert.deepEqual(list.map((e) => e.caveats), [['other-size'], ['other-size'], ['other-size']]);
    assert.deepEqual(list[0], findSubstitute(args));
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
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
  // demo sells both milk-cheap and milk-pl of the same concept (Naor, 12.10): the shopper sees both options,
  // cheapest first, `alternative` being alternatives[0].
  assert.deepEqual(askedLine.alternatives.map((a) => a.productId), ['milk-cheap', 'milk-pl']);
  assert.deepEqual(askedLine.alternatives[0], askedLine.alternative);
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
  assert.deepEqual(line.alternatives, [], 'once applied the line is substituted, not missing - no options to still choose from');
});

test('compareCart: no substitute found for a missing line reports it as missing, as before', () => {
  const cart = { lines: [{ productId: 'no-concept', qty: 1 }] }; // not sold anywhere, no conceptId to fall back on
  const result = compareCart({ cart, chains, mapping });
  const row = result.rows.find((r) => r.chainId === 'demo');
  assert.equal(row.lines[0].status, LINE_STATUS.MISSING);
  assert.equal(row.lines[0].alternative, null);
  assert.deepEqual(row.lines[0].alternatives, [], 'always an array - a client branches on length, as with caveats');
});

test('findSubstitutes: two products resolving to the same chain item are one option, the better-ranked kept (12.10 review)', () => {
  // On real data several weighed products resolve through their concept to the chain's one cheapest item
  // (ramilevy: "תפוח אדמה לבן ארוז" listed four times). Here milk-pl is mapped by hand onto milk-cheap's item.
  const shared = { storeItemId: 'D_shared', gtin: '1000000000002', code: '1000000000002', name: 'חלב זול בדמו', price: 6.2, isWeighted: false, unit: "יח'", inStock: true, promotions: [] };
  const dmapping = new MappingEngine({ products, catalogs: { chainD: { items: [shared] } }, overrides: { 'chainD:milk-pl': 'D_shared' }, strictGtin: true });
  const orig = products.find((p) => p.id === 'milk-orig');
  assert.equal(dmapping.resolve('milk-pl', 'chainD')?.storeItem.storeItemId, 'D_shared', 'fixture: both resolve to the one item');
  const list = findSubstitutes({ product: orig, qty: 1, chainId: 'chainD', mapping: dmapping, policy: 'cheapest', purpose: 'missing', referencePrice: 7 });
  assert.equal(list.length, 1, 'one shelf item, one option');
  assert.deepEqual(list[0], findSubstitute({ product: orig, qty: 1, chainId: 'chainD', mapping: dmapping, policy: 'cheapest', purpose: 'missing', referencePrice: 7 }));
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
    tier: 'concept',
    family: null,
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
    tier: 'concept',
    family: null,
  });
  assert.deepEqual(line.alternatives, [], 'a cheaper offer on an available line stays single (§4)');
});

test('compareCart: policy "cheapest" offers any cheaper product, not just private label', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'cheapest', apply: 'ask' } });
  const line = result.rows.find((r) => r.chainId === 'chainA').lines[0];
  assert.equal(line.alternative.productId, 'milk-cheap');
  assert.equal(line.alternative.savings, 1.0);
  assert.equal(line.alternative.privateLabel, false);
  assert.deepEqual(line.alternatives, [], 'a cheaper offer on an available line stays single (§4)');
});

test('compareCart: policy "none" never offers a cheaper alternative for an available line', () => {
  const cart = { lines: [{ productId: 'milk-orig', qty: 1 }] };
  const result = compareCart({ cart, chains, mapping, substitutes: { policy: 'none', apply: 'ask' } });
  const line = result.rows.find((r) => r.chainId === 'chainA').lines[0];
  assert.equal(line.status, LINE_STATUS.OK);
  assert.equal(line.alternative, null);
  assert.deepEqual(line.alternatives, []);
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
  assert.deepEqual(milkLine.alternatives, []);
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

test('a chain with no price list is not offered as a comparison row', () => {
  const emptyChain = { id: 'nolist', name: 'No Price List', branches: [{ id: 'nolist-b1', name: 'Branch', city: 'תל אביב' }] };
  const engine = new MappingEngine({ products, catalogs: { chainA, demo, nolist: { chainId: 'nolist', items: [] } }, strictGtin: true });
  const row = compareCart({ cart: { lines: [{ productId: 'milk-cheap', qty: 1 }] }, chains: [...chains, emptyChain], mapping: engine })
    .rows.find((r) => r.chainId === 'nolist');
  assert.equal(row.deliverable, false);
  assert.equal(row.reason, 'אין מחירון לרשת זו');
  assert.equal(row.grandTotal, 0, 'never priced at the delivery fee of an empty basket');
});

// ---------------------------------------------------------------------------
// The rules of 22.9 (docs/CONCEPTS.md §4): what counts as a substitute
// ---------------------------------------------------------------------------
import { compatible, variantSignature, formSignature, dietSignature, percentOf, familyOf, conceptPolicy, _setRules } from '../src/pricing/substituteRules.js';

const RULES = {
  families: { rice: { name: 'אורז', concepts: ['rice-white', 'rice-basmati'] } },
  conceptPolicy: { cookies: 'missingOnly', 'coffee-capsules': 'none' },
  form: { frozen: ['(?<![א-ת])קפוא'], grated: ['(?<![א-ת])מגורד'], sliced: ['(?<![א-ת])פרוס'] },
  diet: { 'lactose-free': ['ללא לקטוז', 'נטול לקטוז'] },
  required: { mehadrin: ['(?<![א-ת])מהדרינ'] },
  variant: { words: ['וניל', 'שוקולד', 'גבינה', 'תפוא', 'תות', 'אפרסק', 'פירות יער', 'פירות'] },
  priceBand: 3,
  sizeTolerance: 0.25,
};

test('signatures: variant words, flavour phrases, forms, diets and percentages are read from the name', () => {
  _setRules(RULES);
  try {
    assert.deepEqual(variantSignature('בורקס גבינה מעדנות 800 גרם'), ['גבינה']);
    assert.deepEqual(variantSignature('בורקס תפוא רמי לוי 800 גרם'), ['תפוא']);
    assert.deepEqual(variantSignature('עוגיות סנדוויץ בטעם וניל במילוי קרם בטעם וניל'), ['וניל']);
    assert.deepEqual(variantSignature('יוגורט פירות יער 150'), ['פירות יער'], 'the longer phrase wins and "פירות" is not counted again');
    assert.deepEqual(formSignature('נתחי פילה סלמון קפוא'), ['frozen']);
    assert.deepEqual(formSignature('גאודה מגורדת 200 גרם'), ['grated']);
    assert.deepEqual(dietSignature('חלב תנובה 3% נטול לקטוז 1 ליטר'), ['lactose-free']);
    assert.equal(percentOf('דנונה אפרסק 3% 150מל'), 3);
    assert.equal(percentOf('קוטג 5 % 250 גרם'), 5);
    assert.equal(percentOf('חלב מותג החנות'), null);
  } finally { _setRules(null); }
});

test('compatible: each rule refuses with its own reason, and a plain same-concept product passes', () => {
  _setRules(RULES);
  try {
    const base = { category: 'חלב וביצים', isWeighted: false, size: { value: 200, unit: 'g', count: 1 } };
    const orig = { ...base, name: 'גבינת גאודה פרוסה 200 גרם' };
    const ok = (candidate, extra = {}) => compatible({ product: orig, candidate: { ...base, ...candidate }, requireSize: true, ...extra });
    assert.deepEqual(ok({ name: 'גאודה פרוסה מותג פרטי 200 גרם' }), { ok: true });
    assert.equal(ok({ name: 'גאודה מגורדת 200 גרם' }).reason, 'form');
    assert.equal(ok({ name: 'גאודה פרוסה 200 גרם', isWeighted: true }).reason, 'form-of-sale');
    assert.equal(ok({ name: 'גאודה פרוסה 200 גרם', category: 'מעדנייה' }).reason, 'category');
    assert.equal(ok({ name: 'גאודה פרוסה 400 גרם', size: { value: 400, unit: 'g', count: 1 } }).reason, 'size');
    assert.equal(ok({ name: 'גאודה פרוסה ללא לקטוז 200 גרם' }).reason, 'diet');
    assert.deepEqual(ok({ name: 'גאודה פרוסה 28% 200 גרם' }), { ok: true }, 'a percentage on one side only is unknown, not different');
    const pct = compatible({ product: { ...base, name: 'קוטג 5% 250 גרם' }, candidate: { ...base, name: 'קוטג 9% 250 גרם' }, requireSize: false });
    assert.equal(pct.reason, 'percent');
    const meh = compatible({ product: { ...base, name: 'גבינה מהדרין 200 גרם' }, candidate: { ...base, name: 'גבינה 200 גרם' }, requireSize: false });
    assert.equal(meh.reason, 'required');
    const rev = compatible({ product: { ...base, name: 'גבינה 200 גרם' }, candidate: { ...base, name: 'גבינה מהדרין 200 גרם' }, requireSize: false });
    assert.deepEqual(rev, { ok: true }, 'a stricter kashrut on the candidate is fine');
    assert.equal(ok({ name: 'גאודה פרוסה 200 גרם' }, { referencePrice: 45, candidatePrice: 9.8 }).reason, 'price-band');
    assert.deepEqual(ok({ name: 'גאודה פרוסה 200 גרם' }, { referencePrice: 45, candidatePrice: 16 }), { ok: true });
    // the chain's own, fuller name is read too: the unified name may be truncated
    assert.equal(ok({ name: 'גאודה 200 גרם' }, { candidateName: 'גאודה מגורדת 200 גרם' }).reason, 'form');
  } finally { _setRules(null); }
});

test('compatible: a weighed concept product is only ever stood in for by another weighed item of the same department', () => {
  _setRules(RULES);
  try {
    const salmon = { name: 'סלמון', category: 'בשר ועוף', isWeighted: true, size: null, kind: 'concept' };
    assert.equal(compatible({ product: salmon, candidate: { name: 'נתחי פילה סלמון קפוא', category: 'בשר ועוף', isWeighted: false, size: null }, requireSize: false }).reason, 'form-of-sale');
    assert.deepEqual(compatible({ product: salmon, candidate: { name: 'סלמון טרי לקג', category: 'בשר ועוף', isWeighted: true, size: null }, requireSize: false }), { ok: true });
  } finally { _setRules(null); }
});

test('families and concept policies come from the rules file', () => {
  _setRules(RULES);
  try {
    assert.deepEqual(familyOf('rice-basmati').concepts, ['rice-white', 'rice-basmati']);
    assert.equal(familyOf('milk-3'), null);
    assert.equal(conceptPolicy('cookies'), 'missingOnly');
    assert.equal(conceptPolicy('coffee-capsules'), 'none');
    assert.equal(conceptPolicy('milk-3'), 'full');
  } finally { _setRules(null); }
});

// A second fixture for the rule-level behaviour of findSubstitute / compareCart.
const RPRODUCTS = [
  product({ id: 'bas', name: 'אורז בסמטי סוגת 1 קג', gtin: '5000000000001', conceptId: 'rice-basmati', category: 'שימורים', size: { value: 1000, unit: 'g', count: 1 } }),
  product({ id: 'bas-pl', name: 'אורז בסמטי מותג החנות 1 קג', gtin: '5000000000002', conceptId: 'rice-basmati', category: 'שימורים', size: { value: 1000, unit: 'g', count: 1 }, privateLabelOf: 'chainR' }),
  product({ id: 'bas-b', name: 'אורז בסמטי מותג אחר 1 קג', gtin: '5000000000003', conceptId: 'rice-basmati', category: 'שימורים', size: { value: 1000, unit: 'g', count: 1 } }),
  product({ id: 'white', name: 'אורז לבן פרסי 1 קג', gtin: '5000000000004', conceptId: 'rice-white', category: 'שימורים', size: { value: 1000, unit: 'g', count: 1 } }),
  product({ id: 'cookie-a', name: 'עוגיות שוקולד צ׳יפס 200 גרם', gtin: '5000000000005', conceptId: 'cookies', category: 'חטיפים וממתקים', size: { value: 200, unit: 'g', count: 1 } }),
  product({ id: 'cookie-b', name: 'עוגיות שוקולד צ׳יפס זולות 200 גרם', gtin: '5000000000006', conceptId: 'cookies', category: 'חטיפים וממתקים', size: { value: 200, unit: 'g', count: 1 } }),
  product({ id: 'cap-a', name: 'קפסולות קפה נספרסו 10', gtin: '5000000000007', conceptId: 'coffee-capsules', category: 'משקאות', size: { value: 10, unit: 'unit', count: 1 } }),
  product({ id: 'cap-b', name: 'קפסולות קפה דולצ׳ה 10', gtin: '5000000000008', conceptId: 'coffee-capsules', category: 'משקאות', size: { value: 10, unit: 'unit', count: 1 } }),
];
const RCONCEPTS = { 'rice-basmati': { id: 'rice-basmati', sizeUnit: 'g' }, 'rice-white': { id: 'rice-white', sizeUnit: 'g' }, cookies: { id: 'cookies', sizeUnit: 'g' }, 'coffee-capsules': { id: 'coffee-capsules', sizeUnit: 'unit' } };
const ritem = (id, name, price, extra = {}) => { const p = RPRODUCTS.find((x) => x.id === id); return { storeItemId: `R_${id}`, gtin: p.gtin, code: p.gtin, name, price, isWeighted: false, unit: "יח'", inStock: true, promotions: [], ...extra }; };
// chainR sells every basmati (two at the same price, one of them its own brand), both cookies and both capsules.
const chainR = { items: [ritem('bas', 'אורז בסמטי סוגת', 12), ritem('bas-pl', 'אורז בסמטי מותג החנות', 9, { privateLabel: true }), ritem('bas-b', 'אורז בסמטי מותג אחר', 9), ritem('cookie-a', 'עוגיות א', 10), ritem('cookie-b', 'עוגיות ב', 6), ritem('cap-a', 'קפסולות א', 30), ritem('cap-b', 'קפסולות ב', 20)] };
// chainW has no basmati at all - only white rice - and only the cheaper cookies.
const chainW = { items: [ritem('white', 'אורז לבן', 8), ritem('cookie-b', 'עוגיות ב', 6)] };
const rchains = [{ id: 'chainR', name: 'R', branches: [{ id: 'r1', name: 'B', city: 'תל אביב' }] }, { id: 'chainW', name: 'W', branches: [{ id: 'w1', name: 'B', city: 'תל אביב' }] }];
const rmapping = new MappingEngine({ products: RPRODUCTS, catalogs: { chainR, chainW }, strictGtin: true });

test('findSubstitute: among candidates that cost the same, the chain\'s own brand wins', () => {
  _setRules(RULES); _setConceptLookup((id) => RCONCEPTS[id] ?? null);
  try {
    const s = findSubstitute({ product: RPRODUCTS[0], qty: 1, chainId: 'chainR', mapping: rmapping, policy: 'cheapest', purpose: 'cheaper', referencePrice: 12 });
    assert.equal(s.product.id, 'bas-pl');
    assert.equal(s.privateLabel, true);
    assert.equal(s.tier, 'concept');
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});

test('concept policy: a shelf concept (missingOnly) offers nothing cheaper on an available line but still fills a missing one; "none" never offers', () => {
  _setRules(RULES); _setConceptLookup((id) => RCONCEPTS[id] ?? null);
  try {
    const cookieA = RPRODUCTS.find((p) => p.id === 'cookie-a');
    assert.equal(findSubstitute({ product: cookieA, qty: 1, chainId: 'chainR', mapping: rmapping, policy: 'cheapest', purpose: 'cheaper', referencePrice: 10 }), null, 'cookies are a shelf: no "cheaper" offer');
    assert.equal(findSubstitute({ product: cookieA, qty: 1, chainId: 'chainW', mapping: rmapping, policy: 'cheapest', purpose: 'missing' })?.product.id, 'cookie-b', 'but a missing line still gets one');
    const capA = RPRODUCTS.find((p) => p.id === 'cap-a');
    assert.equal(findSubstitute({ product: capA, qty: 1, chainId: 'chainR', mapping: rmapping, policy: 'cheapest', purpose: 'missing' }), null, 'capsule systems are incompatible: never');
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});

test('compareCart: a missing line falls back to the concept family, labelled as such; a cheaper offer never crosses concepts', () => {
  _setRules(RULES); _setConceptLookup((id) => RCONCEPTS[id] ?? null);
  try {
    const cart = { lines: [{ productId: 'bas', qty: 2 }] };
    const res = compareCart({ cart, chains: rchains, mapping: rmapping, address: { city: 'תל אביב' }, substitutes: { policy: 'cheapest', apply: 'ask' } });
    const w = res.rows.find((r) => r.chainId === 'chainW').lines[0];
    assert.equal(w.status, LINE_STATUS.MISSING);
    assert.equal(w.alternative.productId, 'white');
    assert.equal(w.alternative.tier, 'family');
    assert.deepEqual(w.alternative.family, { id: 'rice', name: 'אורז' });
    const r = res.rows.find((r) => r.chainId === 'chainR').lines[0];
    assert.equal(r.status, LINE_STATUS.OK);
    assert.equal(r.alternative.productId, 'bas-pl', 'same concept, cheapest, private label on the tie');
    assert.equal(r.alternative.tier, 'concept');
    assert.equal(r.alternative.family, null);
    assert.deepEqual(r.alternatives, [], 'a cheaper offer on an available line stays single (§4)');
    // A family stand-in carries 'other-family' (12.10), so auto mode offers it and never applies it on its own.
    assert.deepEqual(w.alternative.caveats, ['other-family']);
    // Naor, 14.10: a family candidate is never a list member - `alternative` still falls back to it (the
    // old 12.10 last-resort behaviour), but `alternatives` is `[]`: one fallback offer, no list to choose
    // from. Before 14.10 this was `[w.alternative]` (chainW sells only white rice of the family).
    assert.deepEqual(w.alternatives, []);
    const auto = compareCart({ cart, chains: rchains, mapping: rmapping, address: { city: 'תל אביב' }, substitutes: { policy: 'cheapest', apply: 'auto' } });
    const wa = auto.rows.find((r) => r.chainId === 'chainW').lines[0];
    assert.equal(wa.status, LINE_STATUS.MISSING);
    assert.equal(wa.alternative.tier, 'family');
    assert.equal(wa.alternative.family.name, 'אורז');
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});

// Naor, 14.10 ("אפשר 5, אבל חייב להיות אותו מוצר"): family is NEVER a list member, whether or not the same
// leaf has anything to offer - 'white' no longer appears in the list just because 'bas-small' outranked it.
// Before 14.10 the list was ['bas-small', 'white'] (same leaf, caveat and all, then the family, appended).
test('findSubstitutes: the list holds only same-product (same-leaf) candidates - a family candidate is never a list member, de-duplicated by product; policy "none" is always empty', () => {
  _setRules(RULES); _setConceptLookup((id) => RCONCEPTS[id] ?? null);
  try {
    // bas-small (500 g) is the same leaf as 'bas' (1 kg basmati) but outside the ±25% tolerance - a
    // missing line still offers it, flagged 'other-size'. chainMix also sells white rice (the family),
    // which stays out of the list entirely now that the same leaf has a (caveated) same-product candidate.
    const basSmall = product({ id: 'bas-small', name: 'אורז בסמטי קטן 500 גרם', gtin: '5000000000009', conceptId: 'rice-basmati', category: 'שימורים', size: { value: 500, unit: 'g', count: 1 } });
    const mixProducts = [...RPRODUCTS, basSmall];
    const chainMix = { items: [
      { storeItemId: 'M_bas-small', gtin: basSmall.gtin, code: basSmall.gtin, name: 'אורז בסמטי קטן', price: 7, isWeighted: false, unit: "יח'", inStock: true, promotions: [] },
      ritem('white', 'אורז לבן', 8),
    ] };
    const mixMapping = new MappingEngine({ products: mixProducts, catalogs: { chainMix }, strictGtin: true });
    const bas = RPRODUCTS.find((p) => p.id === 'bas');
    const args = { product: bas, qty: 1, chainId: 'chainMix', mapping: mixMapping, policy: 'cheapest', purpose: 'missing', referencePrice: bas.basePrice ?? null };
    const list = findSubstitutes(args);
    assert.deepEqual(list.map((e) => e.product.id), ['bas-small'], 'the family never joins the list, even behind a same-leaf candidate');
    assert.deepEqual(list.map((e) => e.tier), ['concept']);
    assert.deepEqual(list[0].caveats, ['other-size']);
    assert.deepEqual(list[0], findSubstitute(args), 'findSubstitutes(args)[0] is always findSubstitute(args)');
    assert.equal(new Set(list.map((e) => e.product.id)).size, list.length, 'no product appears twice');

    // A "none" concept policy (coffee-capsules) never offers anything, missing or not.
    const capA = RPRODUCTS.find((p) => p.id === 'cap-a');
    assert.deepEqual(findSubstitutes({ product: capA, qty: 1, chainId: 'chainR', mapping: rmapping, policy: 'cheapest', purpose: 'missing' }), []);
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});

// Naor, 14.10: when the same leaf has NO same-product candidate at all (every leaf candidate is a different
// flavour), findSubstitutes (the list) is empty - a family candidate never fills it, and neither does an
// other-flavour one. compare.js's fallback (findSubstitute with scope 'concept', then 'family') still finds
// the other-flavour same-brand leaf candidate and prefers it over the family, exactly as before 14.10 - but
// that single pick is now kept OUT of `alternatives`, which compareCart reports as `[]` (tested above).
test('findSubstitutes: with no same-product candidate the list is empty, even though a same-leaf other-flavour fallback (and a family one) both exist', () => {
  _setRules(RULES); _setConceptLookup((id) => RCONCEPTS[id] ?? null);
  try {
    const basOtherFlavour = product({ id: 'bas-berry', name: 'אורז בסמטי תות 1 קג', gtin: '5000000000010', conceptId: 'rice-basmati', category: 'שימורים', brand: 'סוגת', size: { value: 1000, unit: 'g', count: 1 } });
    const bas = { ...RPRODUCTS.find((p) => p.id === 'bas'), brand: 'סוגת' };
    const mixProducts = [bas, basOtherFlavour, ...RPRODUCTS.filter((p) => p.id !== 'bas')];
    const chainMix = { items: [
      { storeItemId: 'M_bas-berry', gtin: basOtherFlavour.gtin, code: basOtherFlavour.gtin, name: 'אורז בסמטי תות', price: 11, isWeighted: false, unit: "יח'", inStock: true, promotions: [] },
      ritem('white', 'אורז לבן', 8),
    ] };
    const mixMapping = new MappingEngine({ products: mixProducts, catalogs: { chainMix }, strictGtin: true });
    const args = { product: bas, qty: 1, chainId: 'chainMix', mapping: mixMapping, policy: 'cheapest', purpose: 'missing', referencePrice: bas.basePrice ?? null };
    assert.deepEqual(findSubstitutes(args), [], 'the list itself holds nothing - other-flavour and family are never list members');

    // The fallback compare.js actually uses: same-leaf other-flavour first, outranking the family.
    const fallback = findSubstitute({ ...args, scope: 'concept' }) ?? findSubstitute({ ...args, scope: 'family' });
    assert.equal(fallback.product.id, 'bas-berry');
    assert.deepEqual(fallback.caveats, ['other-flavour']);
    assert.equal(fallback.tier, 'concept', 'a same-leaf fallback still outranks the family');
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});

test('rules 22.9 follow-ups from the audit: attached prefixes, concept-scoped kind words, multipacks', () => {
  _setRules({ ...RULES, variant: { words: ['שזיפ', 'תות'], concepts: { 'bourekas-frozen': ['גבינה', 'תפוא'], 'tuna-canned': ['שמנ', 'מימ'] } } });
  try {
    assert.deepEqual(variantSignature('יוגורט עם שיבולת שועל ושזיף 2.5%'), ['שזיפ'], 'a flavour glued to a conjunction still counts');
    assert.deepEqual(formSignature('דג פילה וקפוא'), ['frozen']);
    assert.deepEqual(variantSignature('גבינת גאודה פרוסות'), [], 'a generic head noun is not a global variant word any more');
    assert.deepEqual(variantSignature('בורקס גבינה 800 גרם', undefined, 'bourekas-frozen'), ['גבינה'], 'but inside the boureka concept the filling is the identity');
    assert.deepEqual(variantSignature('טונה בשמן קנולה', undefined, 'tuna-canned'), ['שמנ'], 'oil vs brine, with the ב prefix');
    const base = { category: 'חטיפים וממתקים', isWeighted: false, conceptId: 'bamba' };
    const multi = compatible({ product: { ...base, name: 'במבה מארז 10*25 גרם', size: { value: 25, unit: 'g', count: 10 } }, candidate: { ...base, name: 'במבה קלאסי 200 גרם', size: { value: 200, unit: 'g', count: 1 } }, requireSize: true });
    assert.equal(multi.reason, 'pack', 'a lunchbox multipack is not a family bag of the same grams');
    const tuna = compatible({ product: { category: 'שימורים', isWeighted: false, conceptId: 'tuna-canned', name: 'טונה בשמן 160 גרם', size: { value: 160, unit: 'g', count: 1 } }, candidate: { category: 'שימורים', isWeighted: false, conceptId: 'tuna-canned', name: 'טונה במים 160 גרם', size: { value: 160, unit: 'g', count: 1 } }, requireSize: true });
    assert.equal(tuna.reason, 'variant');
  } finally { _setRules(null); }
});

// 1.10, the backend session's finding: when the flavour phrase runs to the end of the name, the size and pack
// after it were read as flavour, so two tubs of one flavour in different sizes never matched on `variant`.
test('variantSignature stops at the size: "קרם עוגיות 500 מ"ל" is the flavour עוגיות, not 500', () => {
  assert.deepEqual(variantSignature('בן אנד גריס גלידת קרם עוגיות 500 מ"ל'), ['עוגיות']);
  assert.deepEqual(variantSignature('גלידה בטעם וניל 1 ליטר'), variantSignature('גלידה בטעם וניל 750 מ"ל'));
  assert.notDeepEqual(variantSignature('גלידה בטעם וניל 1 ליטר'), variantSignature('גלידה בטעם תות 1 ליטר'));
});

// 1.10: two weighed products are both priced by the kilo, so a null size is not a refusal between them -
// but a weighed product against a packaged one still is (form-of-sale), and two packages still need a size.
test('compatible: two weighed products skip the size check; packaged ones do not', () => {
  const meat = { category: 'בשר ועוף', isWeighted: true, size: null };
  assert.equal(compatible({ product: { ...meat, name: 'אנטריקוט טרי' }, candidate: { ...meat, name: 'אנטריקוט בקר טרי' }, requireSize: true }).ok, true);
  assert.equal(compatible({ product: { ...meat, name: 'אנטריקוט טרי' }, candidate: { ...meat, isWeighted: false, name: 'אנטריקוט טרי' }, requireSize: true }).reason, 'form-of-sale');
  const pack = { category: 'שימורים', isWeighted: false };
  assert.equal(compatible({ product: { ...pack, name: 'טימין', size: null }, candidate: { ...pack, name: 'טימין 30 גרם', size: { value: 30, unit: 'g', count: 1 } }, requireSize: true }).reason, 'size');
});

// Naor, 2.10: for a line the chain cannot fill, an unknown size and a different flavour of the same brand become
// caveats the shopper is asked about; a cheaper offer on an available line stays strict on both. And a box of
// N bags compares with a box of N bags whether the chain wrote "N יחיד" or "N שק*1.5גר".
test('compatible: a missing line accepts an unknown size or another flavour of the same brand, labelled; a cheaper offer does not', () => {
  const tub = { category: 'חטיפים וממתקים', isWeighted: false, conceptId: 'icecream-tub', brand: 'בן אנד גריס', size: { value: 500, unit: 'ml', count: 1 } };
  const cookies = { ...tub, name: 'בן אנד גריס גלידת קרם עוגיות 500 מ"ל' };
  const vanilla = { ...tub, name: 'בן אנד גריס גלידה בטעם וניל צרפתי 500 מ"ל' };
  assert.equal(compatible({ product: cookies, candidate: vanilla, requireSize: true }).reason, 'variant');
  assert.deepEqual(compatible({ product: cookies, candidate: vanilla, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['other-flavour'] });
  assert.equal(compatible({ product: cookies, candidate: { ...vanilla, brand: 'שטראוס' }, requireSize: true, purpose: 'missing' }).reason, 'variant');
  assert.equal(compatible({ product: cookies, candidate: { ...vanilla, brand: ',' }, requireSize: true, purpose: 'missing' }).reason, 'variant');

  const spice = { category: 'שימורים', isWeighted: false, conceptId: 'thyme', brand: 'מימון' };
  const unsized = { ...spice, name: 'טימין', size: null };
  const sized = { ...spice, name: 'טימין 30 גרם', size: { value: 30, unit: 'g', count: 1 } };
  assert.equal(compatible({ product: unsized, candidate: sized, requireSize: true }).reason, 'size');
  assert.deepEqual(compatible({ product: unsized, candidate: sized, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['size-unconfirmed'] });
  // a KNOWN size that is far off is still a refusal, missing or not
  assert.equal(compatible({ product: { ...sized, size: { value: 500, unit: 'g', count: 1 } }, candidate: sized, requireSize: true, purpose: 'missing' }).reason, 'size');
});

test('sizeWithin: a bag count against a measured pack of bags compares the counts; a single unit says nothing', () => {
  assert.equal(sizeWithin({ value: 1, unit: 'unit', count: 50 }, { value: 1.5, unit: 'g', count: 50 }, 0.25), true);
  assert.equal(sizeWithin({ value: 1, unit: 'unit', count: 50 }, { value: 1.5, unit: 'g', count: 25 }, 0.25), false);
  assert.equal(sizeWithin({ value: 1, unit: 'unit', count: 1 }, { value: 500, unit: 'ml', count: 1 }, 0.25), false);
  assert.equal(sizeWithin({ value: 500, unit: 'g', count: 1 }, { value: 500, unit: 'ml', count: 1 }, 0.25), false);
});

// 3.10, seen in production: an unsized CANDIDATE against a known size is still a refusal. Only the shopper's own
// size may be unknown - otherwise every unsized product of the concept matched every line, and the cheapest won.
test('compatible: a missing line with a known size refuses a candidate whose size is unknown', () => {
  const tub = { category: 'חטיפים וממתקים', isWeighted: false, conceptId: 'icecream-tub', brand: 'שטראוס' };
  const known = { ...tub, name: 'גלידה 5 טעמים שטראוס 2 ליטר', size: { value: 2000, unit: 'ml', count: 1 } };
  const unsized = { ...tub, name: 'גל.ריקוטה+קראמבל475 תמרה', brand: 'תמרה', size: null };
  assert.equal(compatible({ product: known, candidate: unsized, requireSize: true, purpose: 'missing' }).reason, 'size');
  assert.deepEqual(compatible({ product: { ...known, size: null }, candidate: { ...known, name: 'גלידה 5 טעמים 2 ליטר' }, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['size-unconfirmed'] });
});

// 3.10 (backend session, on a live offer): goat milk for cow milk is not "another flavour of the same brand" - someone
// avoiding goat milk is not warned by "טעם אחר". The milk is a diet group, so it refuses in both directions.
test('compatible: goat milk for cow milk refuses on diet, even for a missing line of the same brand', () => {
  const lab = { category: 'חלב וביצים', isWeighted: false, conceptId: 'labaneh', brand: 'גד', size: { value: 250, unit: 'g', count: 1 } };
  const cow = { ...lab, name: 'לאבנה סחוג 5% שומן גד 250 גרם' };
  const goat = { ...lab, name: 'גבינת לאבנה 5% מחלב עזים גד 250 גרם' };
  assert.equal(compatible({ product: cow, candidate: goat, requireSize: true, purpose: 'missing' }).reason, 'diet');
  assert.equal(compatible({ product: goat, candidate: cow, requireSize: true, purpose: 'missing' }).reason, 'diet');
  // Victory writes it with a yod: "מחלב עיזים" (the backend session, 3.10) - the spelling the pattern missed.
  assert.equal(compatible({ product: cow, candidate: { ...goat, name: 'לאבנה מחלב עיזים גד 250 גרם' }, requireSize: true, purpose: 'missing' }).reason, 'diet');
});

// 11.10 (Naor, on his Osher Ad receipt: "מגבות נייר קשת 16 יח תציג גודל שונה"): a missing line whose size is KNOWN
// may be answered by a pack up to three times bigger or smaller, flagged 'other-size'; further off, or on a
// cheaper offer, the size rule still refuses, and an unsized candidate is still refused (3.10).
test('compatible: a known size outside the tolerance softens to other-size on a missing line, within a 3x span', () => {
  const towel = { category: 'ניקיון', isWeighted: false, conceptId: 'paper-towel', brand: 'קשת' };
  const p16 = { ...towel, name: 'מגבות נייר קשת 16 יח', size: { value: 1, unit: 'unit', count: 16 } };
  const p8 = { ...towel, name: 'מגבות נייר 8 גלילים', size: { value: 1, unit: 'unit', count: 8 }, brand: 'שניב' };
  const p4 = { ...towel, name: 'מגבות נייר 4 גלילים', size: { value: 1, unit: 'unit', count: 4 }, brand: 'שניב' };
  assert.equal(compatible({ product: p16, candidate: p8, requireSize: true }).reason, 'size', 'a cheaper offer stays strict');
  assert.deepEqual(compatible({ product: p16, candidate: p8, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['other-size'] });
  assert.deepEqual(compatible({ product: p8, candidate: p16, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['other-size'] }, 'and the other way round');
  assert.equal(compatible({ product: p16, candidate: p4, requireSize: true, purpose: 'missing' }).reason, 'size', 'a quarter is too far');
  assert.equal(compatible({ product: p16, candidate: { ...p8, size: null }, requireSize: true, purpose: 'missing' }).reason, 'size', 'an unsized candidate is still refused');
  const gram = { ...towel, name: 'מגבות נייר 500 גרם', size: { value: 500, unit: 'g', count: 1 } };
  assert.equal(compatible({ product: p16, candidate: gram, requireSize: true, purpose: 'missing' }).reason, 'size', 'a unit count against a single measured pack cannot be compared');
});

// Naor, 14.10: the nearest-size and "confirmed beats other-size regardless of price" rules are both gone -
// a confirmed (no caveat) and an other-size candidate are the same product in a different pack, so chainZ's
// t15 (confirmed, but 30/15=2.0/roll) no longer automatically beats t8 (other-size, 9/8=1.125/roll); cheapest
// per roll wins throughout. Before 14.10: chainX -> t10 (nearest size), chainY -> t8, chainZ -> t15 (confirmed).
test('findSubstitute: among other-size stand-ins the cheapest per roll wins; a confirmed size no longer beats a cheaper other-size pack', () => {
  const towel = (id, gtin, count) => product({ id, gtin, name: `מגבות נייר ${count} גלילים`, conceptId: 'paper-towel', category: 'ניקיון', size: { value: 1, unit: 'unit', count } });
  const TP = [towel('t16', '5000000000001', 16), towel('t10', '5000000000002', 10), towel('t8', '5000000000003', 8), towel('t6', '5000000000004', 6), towel('t15', '5000000000005', 15)];
  const titem = (id, price) => { const p = TP.find((x) => x.id === id); return { storeItemId: `T_${id}`, gtin: p.gtin, code: p.gtin, name: p.name, price, isWeighted: false, unit: "יח'", inStock: true, promotions: [] }; };
  // chainX: 10, 8 and 6 rolls (12 would be inside the 25% tolerance of 16), the small ones cheaper per roll.
  // chainY: only 8 and 6. chainZ: a 15-pack (within tolerance, so "confirmed") at 2.0/roll, next to an
  // other-size 8-pack at 1.125/roll - the cheaper one now wins despite its caveat.
  const chains = { chainX: { items: [titem('t10', 20), titem('t8', 9), titem('t6', 5)] }, chainY: { items: [titem('t8', 9), titem('t6', 5)] }, chainZ: { items: [titem('t15', 30), titem('t10', 20), titem('t8', 9)] } };
  const tmapping = new MappingEngine({ products: TP, catalogs: chains, strictGtin: true });
  _setRules(RULES); _setConceptLookup((id) => (id === 'paper-towel' ? { id, sizeUnit: 'unit' } : null));
  try {
    const want = (chainId) => findSubstitute({ product: TP[0], qty: 1, chainId, mapping: tmapping, policy: 'cheapest', purpose: 'missing' });
    assert.equal(want('chainX')?.product.id, 't6', 't6 is cheapest per roll (0.83), whatever its distance from 16');
    assert.deepEqual(want('chainX')?.caveats, ['other-size']);
    assert.equal(want('chainY')?.product.id, 't6', 'still the cheapest per roll (0.83) against t8 (1.125)');
    assert.equal(want('chainZ')?.product.id, 't8', 'cheapest per roll (1.125) beats the confirmed t15 (2.0) and the tied-price t10 (2.0)');
    assert.deepEqual(want('chainZ')?.caveats, ['other-size']);
    assert.equal(findSubstitute({ product: TP[0], qty: 1, chainId: 'chainX', mapping: tmapping, policy: 'cheapest', purpose: 'cheaper', referencePrice: 19.9 }), null, 'a cheaper offer never crosses the tolerance');
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});

// 11.10, from the 100-basket run: a different flavour AND a different pack at once is no longer the shopper's
// product (a 4x90 g cucumber soap was offered a 6-pack of cucumber-and-green-tea). One softening at a time.
test('compatible: other-size and other-flavour never combine - the pair refuses on variant', () => {
  _setRules(RULES);
  try {
    const soap = { category: 'ניקיון', isWeighted: false, conceptId: 'soap-bar', brand: 'דאב' };
    const p = { ...soap, name: 'סבון דאב וניל 4 יחידות', size: { value: 90, unit: 'g', count: 4 } };
    const sameFlavourOtherSize = { ...soap, name: 'סבון דאב וניל 6 יחידות', size: { value: 90, unit: 'g', count: 6 } };
    const otherFlavourSameSize = { ...soap, name: 'סבון דאב שוקולד 4 יחידות', size: { value: 90, unit: 'g', count: 4 } };
    const otherBoth = { ...soap, name: 'סבון דאב שוקולד 6 יחידות', size: { value: 90, unit: 'g', count: 6 } };
    assert.deepEqual(compatible({ product: p, candidate: sameFlavourOtherSize, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['other-size'] });
    assert.deepEqual(compatible({ product: p, candidate: otherFlavourSameSize, requireSize: true, purpose: 'missing' }), { ok: true, caveats: ['other-flavour'] });
    assert.equal(compatible({ product: p, candidate: otherBoth, requireSize: true, purpose: 'missing' }).reason, 'variant');
  } finally { _setRules(null); }
});

// 11.10, from the refusal audit: kebab-frozen's members refused one another on 'form' whenever a chain's own
// name omitted the word קפוא - but the concept is frozen by definition, so the silence says nothing.
test('compatible: in a concept that is frozen by definition, the frozen word is not a form difference', () => {
  _setRules(RULES);
  try {
    const kebab = { category: 'בשר ועוף', isWeighted: false, conceptId: 'kebab-frozen', brand: 'טיבון ויל', size: { value: 500, unit: 'g', count: 1 } };
    const silent = { ...kebab, name: 'הקבב של בבר 500 גרם' };
    const explicit = { ...kebab, name: 'קבב מזרחי קפוא 500 גרם', brand: 'בלדי' };
    assert.deepEqual(compatible({ product: silent, candidate: explicit, requireSize: true, purpose: 'missing' }), { ok: true });
    assert.deepEqual(compatible({ product: explicit, candidate: silent, requireSize: true, purpose: 'missing' }), { ok: true });
    // Outside such a concept the frozen word still separates two forms.
    const fish = { ...kebab, conceptId: 'salmon-portions' };
    assert.equal(compatible({ product: { ...fish, name: 'מנות סלמון 500 גרם' }, candidate: { ...fish, name: 'מנות סלמון קפוא 500 גרם' }, requireSize: true, purpose: 'missing' }).reason, 'form');
  } finally { _setRules(null); }
});

// 11.10, from the receipts: purity and pack words that a flavour phrase drags along are not flavours.
test('variantSignature: טהור/טהורה and מארז inside a stripped phrase do not become flavours', () => {
  _setRules(RULES);
  try {
    assert.deepEqual(variantSignature('תמצית וניל טהורה 29 מל'), variantSignature('תמצית וניל טהור 50 מל'));
    assert.deepEqual(variantSignature('תמצית וניל טהורה 29 מל'), ['וניל']);
    assert.ok(!variantSignature('במבה במילוי קרם נוגט מארז 5*30 גרם').includes('מארז'));
  } finally { _setRules(null); }
});

// 12.10, from the family-tier sample: "דל לקטוז" was offered for "נטול לקטוז" - low-lactose is not lactose-free.
test('diet: low-lactose and lactose-free are two diets, so one never stands in for the other', () => {
  assert.deepEqual(dietSignature('יוגורט נטול לקטוז 150 גרם'), ['lactose-free']);
  assert.deepEqual(dietSignature('דנונה דל לקטוז 150 גרם'), ['low-lactose']);
  const yog = { category: 'חלב וביצים', isWeighted: false, conceptId: 'yogurt-plain', brand: 'דנונה', size: { value: 150, unit: 'g', count: 1 } };
  assert.equal(compatible({ product: { ...yog, name: 'יוגורט נטול לקטוז 150 גרם' }, candidate: { ...yog, name: 'דנונה דל לקטוז 150 גרם' }, requireSize: true, purpose: 'missing' }).reason, 'diet');
});

// Review 14.10 of the per-gram order (Naor: "מחיר פר גרם מהזול ליקר"): measured against the shopper's own
// size through sizeRatio - never a gram against a piece - and from the LINE price this cart pays.
test('missing-line unit price: no size unit means line price, count packs by total, weighed by the kilo with promotions', () => {
  const mk = (rows, chainItems, concepts) => {
    _setRules(RULES); _setConceptLookup((id) => concepts[id] ?? null);
    const m = new MappingEngine({ products: rows, catalogs: { chainU: { items: chainItems } }, strictGtin: true });
    return (p, qty = 1) => findSubstitutes({ product: p, qty, chainId: 'chainU', mapping: m, policy: 'cheapest', purpose: 'missing' }).map((e) => e.product.id);
  };
  const it = (p, price, extra = {}) => ({ storeItemId: `U_${p.id}`, gtin: p.gtin, code: p.gtin, name: p.name, price, isWeighted: !!p.isWeighted, unit: "יח'", inStock: true, promotions: [], ...extra });
  try {
    // A concept with no size unit: the size rules admit any pack, so only comparable sizes rank per measure.
    // The shopper's head of lettuce (1 piece): another head at 5 is measured (5 a piece); a 250 g box at
    // 10.90 cannot be compared to a piece at all and goes after, by line price - never 0.04 a gram vs 5 a piece.
    const lettuce = (id, gtin, size) => product({ id, gtin, name: `חסה ${id}`, conceptId: 'lettuce-t', category: 'ירקות ופירות', size });
    const L = [lettuce('lhead0', '5200000000001', { value: 1, unit: 'unit', count: 1 }), lettuce('lhead', '5200000000002', { value: 1, unit: 'unit', count: 1 }), lettuce('l250', '5200000000003', { value: 250, unit: 'g', count: 1 }), lettuce('l400', '5200000000004', { value: 400, unit: 'g', count: 1 })];
    const lettuceAt = mk(L, [it(L[1], 5), it(L[2], 10.9), it(L[3], 12)], { 'lettuce-t': { id: 'lettuce-t', sizeUnit: null } });
    assert.deepEqual(lettuceAt(L[0]), ['lhead', 'l250', 'l400'], 'a gram is never ranked against a piece');
    // A 250 g box shopper on a shelf of 400 g at 12 (7.50 per 250 g) and two heads at 5 and 9: the box first
    // (comparable, per gram), the heads after it by line price.
    assert.deepEqual(mk(L, [it(L[1], 5), it(L[3], 12), it(L[0], 9)], { 'lettuce-t': { id: 'lettuce-t', sizeUnit: null } })(L[2]), ['l400', 'lhead', 'lhead0'], 'per gram where comparable, then by line price');

    // Count packs: 4x56 wipes (224) missing; 3x80 (240) at 30 = 0.125 each against 4x64 (256) at 33 = 0.129.
    const wipes = (id, gtin, value, count) => product({ id, gtin, name: `מגבונים ${id}`, conceptId: 'wipes-t', category: 'ניקיון', size: { value, unit: 'unit', count } });
    const W = [wipes('w4x56', '5200000000011', 56, 4), wipes('w4x64', '5200000000012', 64, 4), wipes('w3x80', '5200000000013', 80, 3)];
    assert.deepEqual(mk(W, [it(W[1], 33), it(W[2], 30)], { 'wipes-t': { id: 'wipes-t', sizeUnit: 'unit' } })(W[0]), ['w3x80', 'w4x64'], 'value x count is the pack');

    // Weighed: 40/kg flat against 45/kg with 20% off (36/kg for this line) - the line the shopper pays wins.
    const fillet = (id, gtin) => product({ id, gtin, name: `פילה עוף ${id}`, conceptId: 'fillet-t', category: 'בשר ועוף', isWeighted: true, unit: 'ק"ג' });
    const F = [fillet('f0', '5200000000021'), fillet('f40', '5200000000022'), fillet('f45', '5200000000023')];
    const promo = [{ type: 'percent', minQty: 0, percent: 20 }];
    assert.deepEqual(mk(F, [it(F[1], 40), it(F[2], 45, { promotions: promo })], { 'fillet-t': { id: 'fillet-t', sizeUnit: 'g' } })(F[0], 1.5), ['f45', 'f40'], 'per kilo, after promotions');
  } finally { _setRules(null); _setConceptLookup((id) => CONCEPTS[id] ?? null); }
});
