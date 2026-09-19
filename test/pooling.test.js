import test from 'node:test';
import assert from 'node:assert/strict';
import { poolBundles } from '../src/pricing/pooling.js';

const multi = { type: 'multi', minQty: 3, totalPrice: 10, promotionId: 'P1', description: '3 ב-10 מגוון' };
const line = (name, qty, unitPrice, promos) => ({ name, qty, unitPrice, lineTotal: qty * unitPrice, savings: 0, promo: null, _promos: promos, _weighted: false });

test('two lines of the same "3 ב-10" promotion pool their units', () => {
  const a = line('A', 2, 4.9, [multi]); const b = line('B', 1, 5.9, [multi]);
  const extra = poolBundles([a, b]);
  assert.equal(extra, 5.7, '4.9+4.9+5.9 = 15.7 → 10');
  assert.equal(a.lineTotal + b.lineTotal, 10);
  assert.equal(a.promo, '3 ב-10 מגוון');
  assert.deepEqual(a.pooled, { promotionId: 'P1', with: ['B'] });
  assert.equal(a.savings + b.savings, 5.7);
});

test('leftover units stay at shelf price - the most expensive ones (conservative)', () => {
  const a = line('A', 2, 4, [multi]); const b = line('B', 2, 6, [multi]);
  poolBundles([a, b]);
  assert.equal(a.lineTotal + b.lineTotal, 16, '4 units: one bundle of 3 for 10 + the 6 ₪ unit left over');
});

test('2+1 across items: the cheapest unit is free', () => {
  const free = { type: 'bundleFree', minQty: 3, freeQty: 1, promotionId: 'P2' };
  const a = line('A', 2, 10, [free]); const b = line('B', 1, 7, [free]);
  poolBundles([a, b]);
  assert.equal(a.lineTotal + b.lineTotal, 20);
});

test('no pooling when a line alone already gets the deal, for club/maxQty rules, weighted or fractional lines, or a single line', () => {
  const a = line('A', 3, 4.9, [multi]); a.lineTotal = 10; a.savings = 4.7; const b = line('B', 1, 5.9, [multi]);
  assert.equal(poolBundles([a, b]), 0.0 + poolBundles([]), 'A already priced at 10 and B alone is 5.9: pooling 4 units gives 10 + 5.9, no gain');
  const club = { ...multi, club: true }; const c1 = line('C', 2, 4.9, [club]); const c2 = line('D', 1, 4.9, [club]);
  assert.equal(poolBundles([c1, c2]), 0);
  const capped = { ...multi, maxQty: 3 }; const d1 = line('E', 2, 4.9, [capped]); const d2 = line('F', 1, 4.9, [capped]);
  assert.equal(poolBundles([d1, d2]), 0);
  const w = line('W', 2, 4.9, [multi]); w._weighted = true; const w2 = line('W2', 1, 4.9, [multi]);
  assert.equal(poolBundles([w, w2]), 0);
  assert.equal(poolBundles([line('S', 2, 4.9, [multi])]), 0);
});

test('a line joins only one pool: the best one', () => {
  const p2 = { type: 'multi', minQty: 2, totalPrice: 8, promotionId: 'P9' };
  const a = line('A', 1, 5, [multi, p2]); const b = line('B', 2, 5, [multi]); const c = line('C', 1, 5, [p2]);
  poolBundles([a, b, c]);
  // pool P1 (A+B, 3 units → 10, gain 5) beats P9 (A+C, 2 units → 8, gain 2); C stays alone
  assert.equal(a.lineTotal + b.lineTotal, 10);
  assert.equal(c.lineTotal, 5);
  assert.equal(c.pooled, undefined);
});
