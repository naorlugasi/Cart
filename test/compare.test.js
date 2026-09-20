import test from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../src/catalog/mapping.js';
import { compareCart } from '../src/pricing/compare.js';
import { loadSeed } from './helpers.js';

const seed = loadSeed();
const mapping = new MappingEngine(seed);

test('comparison prices every chain, marks missing items and the best complete basket', () => {
  const cart = { lines: [{ productId: 'milk-3', qty: 2 }, { productId: 'cucumber', qty: 1.5 }, { productId: 'tahini', qty: 1 }, { productId: 'bamba', qty: 3 }] };
  const result = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  assert.equal(result.itemCount, 4);
  const shufersal = result.rows.find((r) => r.chainId === 'shufersal');
  assert.equal(shufersal.deliverable, true);
  assert.deepEqual(shufersal.missing.map((m) => m.productId), ['tahini']);
  assert.equal(shufersal.availabilityText, 'ברשת זו חסרים 1 מוצרים מתוך 4');
  assert.equal(shufersal.isComplete, false);
  const complete = result.rows.filter((r) => r.isComplete);
  assert.ok(complete.length >= 3);
  const best = result.rows.find((r) => r.isBestValue);
  assert.equal(best.chainId, result.bestChainId);
  assert.ok(best.isComplete, 'best value is a complete basket');
  assert.ok(complete.every((r) => r.grandTotal >= best.grandTotal));
  assert.equal(result.rows[0].chainId, best.chainId, 'best complete basket is sorted first');
});

test('quantity promotions are weighed by cart quantity', () => {
  const cart = { lines: [{ productId: 'bamba', qty: 3 }] };
  const result = compareCart({ cart, chains: seed.chains, mapping, address: null });
  const yochananof = result.rows.find((r) => r.chainId === 'yochananof');
  assert.equal(yochananof.lines[0].promo, '3 ב-10 ₪');
  assert.equal(yochananof.subtotal, 10);
  const two = compareCart({ cart: { lines: [{ productId: 'bamba', qty: 2 }] }, chains: seed.chains, mapping });
  assert.equal(two.rows.find((r) => r.chainId === 'yochananof').lines[0].promo, null);
});

test('substitutes are used when the primary product is missing or out of stock', () => {
  const cart = { lines: [{ productId: 'beer', qty: 1, substituteProductId: 'cola' }] };
  const result = compareCart({ cart, chains: seed.chains, mapping });
  const shufersal = result.rows.find((r) => r.chainId === 'shufersal'); // beer out of stock there
  assert.equal(shufersal.lines[0].status, 'substituted');
  assert.equal(shufersal.lines[0].usedProductId, 'cola');
  assert.equal(shufersal.isComplete, true);
  const demo = result.rows.find((r) => r.chainId === 'demo'); // beer missing there
  assert.equal(demo.lines[0].status, 'substituted');
  const withoutSub = compareCart({ cart: { lines: [{ productId: 'beer', qty: 1 }] }, chains: seed.chains, mapping });
  assert.equal(withoutSub.rows.find((r) => r.chainId === 'shufersal').lines[0].status, 'out_of_stock');
  assert.equal(withoutSub.rows.find((r) => r.chainId === 'demo').lines[0].status, 'missing');
});

test('a chain is never withheld because of the address (decision 20.9: online-only, no location asked)', () => {
  const cart = { lines: [{ productId: 'milk-3', qty: 1 }] };
  const result = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'אילת' } });
  for (const row of result.rows) assert.equal(row.deliverable, true, `${row.chainId} stays comparable`);
  assert.ok(result.bestChainId, 'a cheapest chain is still chosen');
});

test('delivery fee, free delivery threshold and minimum order', () => {
  const small = compareCart({ cart: { lines: [{ productId: 'milk-3', qty: 1 }] }, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  const rami = small.rows.find((r) => r.chainId === 'ramilevy');
  assert.equal(rami.deliveryFee, 19.9);
  assert.equal(rami.belowMinOrder, true);
  assert.equal(rami.grandTotal, Math.round((rami.subtotal + 19.9) * 100) / 100);
  const big = compareCart({ cart: { lines: [{ productId: 'laundry', qty: 4 }] }, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  const ramiBig = big.rows.find((r) => r.chainId === 'ramilevy');
  assert.equal(ramiBig.freeDelivery, true);
  assert.equal(ramiBig.deliveryFee, 0);
});

test('when no chain has everything, best value is the one with the highest coverage', () => {
  const cart = { lines: [{ productId: 'tahini', qty: 1 }, { productId: 'feta', qty: 1 }, { productId: 'beer', qty: 1 }, { productId: 'bissli', qty: 1 }, { productId: 'laundry', qty: 1 }] };
  const result = compareCart({ cart, chains: seed.chains, mapping, address: { city: 'תל אביב' } });
  assert.ok(result.rows.every((r) => !r.isComplete));
  const best = result.rows.find((r) => r.isBestValue);
  const maxCoverage = Math.max(...result.rows.filter((r) => r.deliverable).map((r) => r.coverage));
  assert.equal(best.coverage, maxCoverage);
});

test('rows carry the chain flags and the price list provenance; products that left the catalog are reported, not priced', () => {
  const chains = seed.chains.map((c) => (c.id === 'ramilevy' ? { ...c, pickupOnly: true, parent: 'shufersal' } : c));
  const cart = { lines: [{ productId: 'milk-3', qty: 1 }, { productId: 'vanished', qty: 2 }] };
  const result = compareCart({ cart, chains, mapping, address: { city: 'תל אביב' } });
  assert.equal(result.itemCount, 1);
  assert.deepEqual(result.unknownProducts, [{ productId: 'vanished', qty: 2 }]);
  const rami = result.rows.find((r) => r.chainId === 'ramilevy');
  assert.deepEqual([rami.pickupOnly, rami.inStoreOnly, rami.parent], [true, false, 'shufersal']);
  assert.equal(result.rows.find((r) => r.chainId === 'shufersal').pickupOnly, false);
  assert.equal(rami.priceList.generatedAt, '2026-09-07T00:00:00.000Z');
  assert.equal(rami.priceList.store, null, 'seeded catalogs have no store');
  assert.ok(rami.lines.every((l) => l.productId !== 'vanished'));
  assert.equal(rami.isComplete, true, 'a product gone from the catalog does not count as missing at every chain');
  assert.equal(rami.total, 1);
});

test('an unverified delivery fee stays out of the total, and an unknown minimum raises no warning', () => {
  const chains = [
    { id: 'known', name: 'Known', branches: [{ id: 'k1', name: 'B', city: 'תל אביב', deliveryFee: 35.9, minOrder: 250, deliveryTerms: { verifiedAt: '2026-09-20', source: 'https://example.test/terms' } }] },
    { id: 'unknown', name: 'Unknown', branches: [{ id: 'u1', name: 'B', city: 'תל אביב', deliveryFee: null, minOrder: null, deliveryTerms: { verified: false } }] },
  ];
  // Both need a price list of their own, or the comparison drops them for having none.
  const engine = new MappingEngine({ ...seed, catalogs: { known: seed.catalogs.shufersal, unknown: seed.catalogs.shufersal } });
  const cart = { lines: [{ productId: 'milk-3', qty: 1 }] };
  const rows = compareCart({ cart, chains, mapping: engine }).rows;
  const unknown = rows.find((r) => r.chainId === 'unknown');
  const known = rows.find((r) => r.chainId === 'known');
  assert.equal(unknown.deliveryKnown, false);
  assert.equal(unknown.deliveryFee, 0, 'nothing invented');
  assert.equal(unknown.grandTotal, unknown.subtotal);
  assert.equal(unknown.belowMinOrder, false, 'an unknown minimum never warns');
  assert.equal(known.deliveryKnown, true);
  assert.equal(known.deliveryTerms.verifiedAt, '2026-09-20');
  assert.equal(known.belowMinOrder, true, 'a verified minimum still warns');
});
