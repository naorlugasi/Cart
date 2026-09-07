import test from 'node:test';
import assert from 'node:assert/strict';
import { priceLine, describePromo } from '../src/pricing/promotions.js';

test('multi-buy promotion applies per full bundle and remainder at unit price', () => {
  const promos = [{ type: 'multi', minQty: 3, totalPrice: 10 }];
  assert.equal(priceLine({ unitPrice: 4.9, qty: 3, promotions: promos }).total, 10);
  assert.equal(priceLine({ unitPrice: 4.9, qty: 4, promotions: promos }).total, 14.9);
  assert.equal(priceLine({ unitPrice: 4.9, qty: 7, promotions: promos }).total, 24.9);
  const r = priceLine({ unitPrice: 4.9, qty: 2, promotions: promos });
  assert.equal(r.total, 9.8);
  assert.equal(r.promo, null, 'below the minimum quantity the promo is not applied');
});

test('unit, percent and discount promotions', () => {
  assert.equal(priceLine({ unitPrice: 10, qty: 2, promotions: [{ type: 'unit', minQty: 1, unitPrice: 8 }] }).total, 16);
  assert.equal(priceLine({ unitPrice: 10, qty: 2, promotions: [{ type: 'percent', minQty: 2, percent: 25 }] }).total, 15);
  assert.equal(priceLine({ unitPrice: 10, qty: 1, promotions: [{ type: 'percent', minQty: 2, percent: 25 }] }).total, 10);
  assert.equal(priceLine({ unitPrice: 10, qty: 3, promotions: [{ type: 'discount', minQty: 1, amount: 1.5 }] }).total, 25.5);
});

test('best of several promotions is chosen, never worse than base', () => {
  const r = priceLine({ unitPrice: 10, qty: 4, promotions: [{ type: 'percent', percent: 10 }, { type: 'multi', minQty: 2, totalPrice: 15 }, { type: 'multi', minQty: 4, totalPrice: 45 }] });
  assert.equal(r.total, 30);
  assert.equal(r.promo.minQty, 2);
  assert.equal(r.savings, 10);
});

test('weighted items ignore bundle promos but keep unit discounts', () => {
  assert.equal(priceLine({ unitPrice: 39.9, qty: 1.5, isWeighted: true, promotions: [{ type: 'multi', minQty: 1, totalPrice: 1 }] }).total, 59.85);
  assert.equal(priceLine({ unitPrice: 39.9, qty: 1.5, isWeighted: true, promotions: [{ type: 'unit', minQty: 1, unitPrice: 34.9 }] }).total, 52.35);
});

test('describePromo', () => {
  assert.equal(describePromo({ type: 'multi', minQty: 3, totalPrice: 10 }), '3 ב-10 ₪');
  assert.equal(describePromo({ type: 'percent', percent: 15, minQty: 1 }), '15% הנחה');
  assert.equal(describePromo({ description: 'מבצע' }), 'מבצע');
});
