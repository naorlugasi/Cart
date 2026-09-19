import test from 'node:test';
import assert from 'node:assert/strict';
import { priceLine, describePromo, upsellHint } from '../src/pricing/promotions.js';

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

test('bundleFree and second-unit promotions', () => {
  const two = [{ type: 'bundleFree', minQty: 3, freeQty: 1 }];
  assert.equal(priceLine({ unitPrice: 10, qty: 3, promotions: two }).total, 20);
  assert.equal(priceLine({ unitPrice: 10, qty: 4, promotions: two }).total, 30);
  assert.equal(priceLine({ unitPrice: 10, qty: 2, promotions: two }).total, 20, 'below the bundle nothing happens');
  const second = [{ type: 'second', minQty: 2, percent: 50 }];
  assert.equal(priceLine({ unitPrice: 10, qty: 2, promotions: second }).total, 15);
  assert.equal(priceLine({ unitPrice: 10, qty: 3, promotions: second }).total, 25);
  assert.equal(priceLine({ unitPrice: 10, qty: 1.5, isWeighted: true, promotions: second }).total, 15, 'weighted: no pairs');
  assert.equal(describePromo({ type: 'bundleFree', minQty: 3, freeQty: 1 }), '2+1');
  assert.equal(describePromo({ type: 'second', minQty: 2, percent: 40 }), 'השני ב-40% הנחה');
});

test('maxQty caps the promoted units, the rest cost the shelf price', () => {
  assert.equal(priceLine({ unitPrice: 39.9, qty: 4, promotions: [{ type: 'unit', minQty: 1, unitPrice: 29.9, maxQty: 3 }] }).total, 129.6);
  assert.equal(priceLine({ unitPrice: 10, qty: 5, promotions: [{ type: 'multi', minQty: 2, totalPrice: 15, maxQty: 4 }] }).total, 40);
  assert.equal(priceLine({ unitPrice: 10, qty: 2, promotions: [{ type: 'multi', minQty: 3, totalPrice: 20, maxQty: 2 }] }).total, 20, 'cap below the bundle size: never applies');
});

test('club promotions never enter the regular total; the club alternative is reported separately', () => {
  const promos = [{ type: 'unit', minQty: 1, unitPrice: 9, club: false }, { type: 'unit', minQty: 1, unitPrice: 7.9, club: true, clubLabel: 'המועדון החדש' }];
  const r = priceLine({ unitPrice: 9.9, qty: 2, promotions: promos });
  assert.equal(r.total, 18);
  assert.equal(r.promo.unitPrice, 9);
  assert.deepEqual({ total: r.club.total, savings: r.club.savings, label: r.club.promo.clubLabel }, { total: 15.8, savings: 2.2, label: 'המועדון החדש' });
  const onlyClub = priceLine({ unitPrice: 9.9, qty: 1, promotions: [promos[1]] });
  assert.equal(onlyClub.total, 9.9);
  assert.equal(onlyClub.promo, null);
  assert.equal(onlyClub.club.total, 7.9);
  assert.equal(priceLine({ unitPrice: 9.9, qty: 1, promotions: [promos[0]] }).club, null, 'no club promo: no club block');
  assert.equal(priceLine({ unitPrice: 9.9, qty: 1, promotions: [{ type: 'unit', minQty: 1, unitPrice: 9.5, club: true }, promos[0]] }).club, null, 'club price that is not better than the regular promo is not reported');
});

test('upsellHint: take one more and pay the same or less', () => {
  const promos = [{ type: 'multi', minQty: 3, totalPrice: 20 }];
  assert.deepEqual(upsellHint({ unitPrice: 10, qty: 2, promotions: promos }), { addQty: 1, total: 20, promoText: '3 ב-20 ₪' });
  assert.equal(upsellHint({ unitPrice: 10, qty: 3, promotions: promos }), null, 'already at the bundle');
  assert.equal(upsellHint({ unitPrice: 10, qty: 1, promotions: [{ type: 'multi', minQty: 3, totalPrice: 25 }] }), null, '3 for 25 costs more than 1 for 10');
  assert.equal(upsellHint({ unitPrice: 10, qty: 1, promotions: [{ type: 'multi', minQty: 3, totalPrice: 20, club: true }] }), null, 'club bundles are not suggested');
  assert.equal(upsellHint({ unitPrice: 10, qty: 1.5, isWeighted: true, promotions: promos }), null);
});
