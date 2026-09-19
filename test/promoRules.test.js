import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.js';
import { parsePromoFile, deriveRule, attachRule, israelDate } from '../src/catalog/promoRules.js';
import { buildCatalogFromFiles } from '../src/catalog/priceXml.js';

// Fixtures are real promotions copied from the chains' PromoFull files of 17-18.9.2026 (test/fixtures/promo/).
const NOW = new Date('2026-09-18T12:00:00+03:00');
const load = (chain) => parsePromoFile(readFileSync(path.join(ROOT, 'test/fixtures/promo', `${chain}.xml`), 'utf8'), { chainId: chain, now: NOW });
const byDesc = (file, text) => { const p = file.promotions.find((x) => x.description.includes(text)); assert.ok(p, `promotion "${text}" in fixture`); return p; };
const strip = ({ maxQty, perKg, ...r }) => r;

test('israelDate', () => {
  assert.equal(israelDate(new Date('2026-09-18T22:30:00Z')), '2026-09-19', 'past midnight in Israel');
});

test('flat layout (Rami Levy): totals, unit prices, 2+1, second at half price, description quantity not trusted over MinQty', () => {
  const f = load('ramilevy');
  assert.equal(f.layout, 'flat');
  assert.equal(f.chainId, '7290058140886');
  const pastrami = byDesc(f, 'סלסולי פסטרמה');
  assert.deepEqual(pastrami.rule, { type: 'multi', minQty: 2, totalPrice: 20 });
  assert.equal(pastrami.items.length, 3, 'gift items excluded, every barcode carries the rule');
  assert.deepEqual(byDesc(f, 'רויון 1.5%').rule, { type: 'unit', minQty: 1, unitPrice: 12.9 }, '"1.5%" is fat content, not a discount');
  assert.deepEqual(byDesc(f, '2+1 מתנה').rule, { type: 'bundleFree', minQty: 3, freeQty: 1 });
  assert.deepEqual(byDesc(f, 'השני בחצי מחיר').rule, { type: 'second', minQty: 2, percent: 50 });
  assert.deepEqual(byDesc(f, 'תה טיבטי 20 שקיקים').rule, { type: 'unit', minQty: 1, unitPrice: 24.9 }, '"20 שקיקים ב-24.90" is not 20 for 24.90: MinQty is 1');
  for (const p of f.promotions) assert.equal(p.club, false);
});

test('flat layout (Keshet): club id 1, 3+1, rate in hundredths of a percent', () => {
  const f = load('keshet');
  const chips = byDesc(f, 'חטיפי ציפס');
  assert.deepEqual(chips.rule, { type: 'multi', minQty: 2, totalPrice: 14.9 });
  assert.equal(chips.club, true);
  assert.equal(chips.clubLabel, 'מועדון קשת');
  assert.equal(byDesc(f, 'מפיות מודפסות').club, false);
  assert.deepEqual(byDesc(f, '3+1').rule, { type: 'bundleFree', minQty: 4, freeQty: 1 });
  assert.deepEqual(byDesc(f, '70% הנחה').rule, { type: 'percent', minQty: 1, percent: 70 }, 'DiscountRate 7000 = 70%');
});

test('grouped layout (Shufersal): per-item fields, coupons and gifts skipped, credit-card club promo skipped', () => {
  const f = load('shufersal');
  assert.equal(f.layout, 'grouped');
  assert.deepEqual(byDesc(f, '2ב20 ניילון').rule, { type: 'multi', minQty: 2, totalPrice: 20 });
  assert.deepEqual(byDesc(f, '2ב32 פתיתים').rule, { type: 'multi', minQty: 2, totalPrice: 32 });
  assert.deepEqual(byDesc(f, 'קטיף 13.90').rule, { type: 'unit', minQty: 1, unitPrice: 13.9 });
  const makeup = byDesc(f, '30% הנחה איפור');
  assert.equal(makeup.items.length, 3);
  assert.deepEqual(makeup.items.map((i) => i.rule.unitPrice), [126, 213.5, 122.5], 'the exact discounted price per item beats the percentage');
  assert.ok(makeup.items.every((i) => i.rule.type === 'unit' && i.rule.minQty === 1));
  assert.equal(byDesc(f, 'קופון 100').skipped, 'coupon');
  assert.equal(byDesc(f, 'קבלי משאבה מתנה').active, false, 'gift with purchase is not a shelf price');
  assert.equal(byDesc(f, 'SBOX').active, false, 'RewardType 12 / credit-card promo');
  assert.equal(f.stats.skipped.coupon, 1);
});

test('grouped layout (Victory): garbage DiscountRate ignored, club + MaxQty, bundles from the description', () => {
  const f = load('victory');
  assert.deepEqual(strip(byDesc(f, '8.90אלפרו').rule), { type: 'unit', minQty: 1, unitPrice: 8.9 });
  const tuna = byDesc(f, 'טונה קפוא');
  assert.deepEqual(tuna.rule, { type: 'unit', minQty: 1, unitPrice: 29.9, perKg: true, maxQty: 3 }, 'bIsWeighted=1: per kg, from 1 kg, up to 3');
  assert.equal(tuna.club, true, 'ClubID 2');
  assert.deepEqual(byDesc(f, '3ב30').rule, { type: 'multi', minQty: 3, totalPrice: 30 });
  assert.deepEqual(byDesc(f, '2ב20 משחת').rule, { type: 'multi', minQty: 2, totalPrice: 20 });
  assert.deepEqual(byDesc(f, '1+1וופל').rule, { type: 'bundleFree', minQty: 2, freeQty: 1 });
  assert.deepEqual(byDesc(f, 'השני ב50%').rule, { type: 'second', minQty: 2, percent: 50 });
});

test('grouped layout (Tiv Taam): club label from the profile, second unit discount, free delivery skipped', () => {
  const f = load('tivtaam');
  const flour = byDesc(f, 'קמח ב 7.90');
  assert.deepEqual(flour.rule, { type: 'unit', minQty: 1, unitPrice: 7.9 });
  assert.equal(flour.club, true);
  assert.equal(flour.clubLabel, 'המועדון החדש');
  assert.deepEqual(byDesc(f, 'דאודורנט 2 ב 29.90').rule, { type: 'multi', minQty: 2, totalPrice: 29.9 });
  assert.deepEqual(byDesc(f, 'השני ב 40%').rule, { type: 'second', minQty: 2, percent: 40 });
  assert.equal(byDesc(f, 'משלוח').active, false);
});

test('grouped layout (Hazi Hinam, Carrefour, Yochananof, others)', () => {
  const h = load('hazihinam');
  assert.deepEqual(byDesc(h, 'דלתא').items[0].rule, { type: 'unit', minQty: 2, unitPrice: 35.92 }, '"20% הנחה בקניית 2": DiscountedPrice is the per-unit price (44.9 → 35.92)');
  assert.deepEqual(byDesc(h, 'מתוק וקל').rule, { type: 'multi', minQty: 2, totalPrice: 10 }, 'entities decoded in "2 ב 10 ש&quot;ח"');
  assert.deepEqual(byDesc(h, '1+1 מתנה').rule, { type: 'bundleFree', minQty: 2, freeQty: 1 });

  const c = load('carrefour');
  assert.equal(byDesc(c, 'קופון פיצוי').skipped, 'coupon');
  assert.deepEqual(byDesc(c, 'הלמנס').items[0].rule, { type: 'qtyPrice', minQty: 2, price: 23 }, 'no description hint: resolved later against the shelf price');
  assert.equal(byDesc(c, 'קנה 3 מוצרי יעקובי').active, false, 'buy 3 get a gift');
  assert.equal(byDesc(c, 'סויה').rule.type, 'unit');

  const y = load('yochananof');
  assert.deepEqual(byDesc(y, '1+1 מתנה').rule, { type: 'bundleFree', minQty: 2, freeQty: 1 }, 'DiscountRate 100 + "1+1" is a bundle, not a gift');
  assert.equal(byDesc(y, 'ב30% הנחה').items[0].rule.type, 'unit');
  assert.deepEqual(byDesc(y, 'כיפלי').items[0].rule, { type: 'qtyPrice', minQty: 2, price: 8 });
  assert.deepEqual(byDesc(y, '2קג ב65').rule, { type: 'unit', minQty: 2, unitPrice: 32.5, perKg: true }, '2 kg for 65 = 32.5 per kg');

  const m = load('mck');
  assert.equal(byDesc(m, 'עובדים').active, false, 'employees-only club is excluded by the profile');
  assert.deepEqual(byDesc(m, 'דודלס').rule, { type: 'unit', minQty: 1, unitPrice: 10.9 });
  assert.deepEqual(byDesc(m, '6ב19.90').rule, { type: 'multi', minQty: 6, totalPrice: 19.9 });
  assert.equal(byDesc(m, 'תעדה זהות').active, false);

  const o = load('osherad');
  assert.deepEqual(byDesc(o, '2 ב 16').rule, { type: 'multi', minQty: 2, totalPrice: 16 });
  assert.deepEqual(byDesc(o, 'מוג 2').rule, { type: 'unit', minQty: 1, unitPrice: 69.9, maxQty: 2 }, '"מוג 2" = limited to 2');

  const s = load('shukcity');
  assert.deepEqual(byDesc(s, '2ב13').rule, { type: 'multi', minQty: 2, totalPrice: 13 });
  assert.equal(byDesc(s, 'טוליפס').rule.type, 'unit');
  assert.deepEqual(byDesc(s, '1+1 חינם').rule, { type: 'bundleFree', minQty: 2, freeQty: 1 });

  const b = load('ybitan');
  assert.equal(byDesc(b, 'פריניב').rule.type, 'unit');
});

test('validity: expired and future promotions are inactive, includeExpired keeps them', () => {
  const f = load('keshet');
  assert.ok(f.promotions.every((p) => p.active), 'all Keshet fixture promotions run on 18.9.2026');
  const later = parsePromoFile(readFileSync(path.join(ROOT, 'test/fixtures/promo/keshet.xml'), 'utf8'), { chainId: 'keshet', now: new Date('2027-01-01T12:00:00+03:00') });
  assert.ok(later.promotions.every((p) => p.skipped === 'expired'));
  const kept = parsePromoFile(readFileSync(path.join(ROOT, 'test/fixtures/promo/keshet.xml'), 'utf8'), { chainId: 'keshet', now: new Date('2027-01-01T12:00:00+03:00'), includeExpired: true });
  assert.ok(kept.promotions.every((p) => p.active));
});

test('deriveRule edge cases', () => {
  assert.deepEqual(deriveRule({ description: '2 ב-25 ₪', layout: 'flat' }), { type: 'multi', minQty: 2, totalPrice: 25 });
  assert.deepEqual(deriveRule({ description: 'חלב 3% 1 ליטר', minQty: 1, discountedPrice: 5.9 }), { type: 'unit', minQty: 1, unitPrice: 5.9 }, 'fat percentage is not a discount');
  assert.equal(deriveRule({ description: 'קופון 30 ש"ח', minQty: 1, discountedPrice: 30 }), null);
  assert.equal(deriveRule({ description: 'משלוח חינם', minQty: 1, discountedPrice: 0.01 }), null);
  assert.equal(deriveRule({ rewardType: 12, description: 'x', minQty: 1, discountedPrice: 5 }), null);
  assert.equal(deriveRule({ description: 'מתנה', minQty: 1, discountRate: 100 }), null, 'free item without a bundle');
  assert.deepEqual(deriveRule({ description: 'שני בINGLOT- 50%', minQty: 1, discountedPrice: 55 }), { type: 'second', minQty: 2, percent: 50 });
  assert.deepEqual(deriveRule({ description: 'x', minQty: 2, discountedPrice: 16, layout: 'flat' }), { type: 'multi', minQty: 2, totalPrice: 16 });
  assert.deepEqual(deriveRule({ description: 'x', minQty: 2, discountedPrice: 16 }), { type: 'qtyPrice', minQty: 2, price: 16 });
  assert.deepEqual(deriveRule({ description: 'x', minQty: 0.01, discountedPrice: 129, isWeighted: true }), { type: 'unit', minQty: 0, unitPrice: 129, perKg: true });
});

test('attachRule resolves qtyPrice against the shelf price and drops non-discounts', () => {
  const promo = { id: 'p1', club: false, clubLabel: null, endDate: '2026-10-01', description: 'd' };
  assert.deepEqual(attachRule({ type: 'qtyPrice', minQty: 2, price: 16 }, promo, 10), { type: 'multi', minQty: 2, totalPrice: 16, club: false, validTo: '2026-10-01', promotionId: 'p1', description: 'd' }, '16 for 2 when a unit costs 10');
  assert.deepEqual(attachRule({ type: 'qtyPrice', minQty: 2, price: 71.92 }, promo, 89.9).type, 'unit', 'below the shelf price it is the per-unit price');
  assert.equal(attachRule({ type: 'qtyPrice', minQty: 2, price: 16 }, promo, null), null, 'unknown shelf price');
  assert.equal(attachRule({ type: 'unit', minQty: 1, unitPrice: 9.9 }, promo, 9.9), null, 'not cheaper');
  assert.equal(attachRule({ type: 'multi', minQty: 3, totalPrice: 90 }, promo, 25.7), null, '3 for 90 when 3 cost 77.1');
  assert.equal(attachRule({ type: 'unit', minQty: 2, unitPrice: 32.5, perKg: true }, promo, 39.9, { isWeighted: false }), null, 'per-kg rule on a unit item');
  assert.deepEqual(strip(attachRule({ type: 'unit', minQty: 2, unitPrice: 32.5, perKg: true }, promo, 39.9, { isWeighted: true })), { type: 'unit', minQty: 2, unitPrice: 32.5, club: false, validTo: '2026-10-01', promotionId: 'p1', description: 'd' });
  const clubPromo = { ...promo, club: true, clubLabel: 'המועדון החדש' };
  assert.equal(attachRule({ type: 'unit', minQty: 1, unitPrice: 7.9 }, clubPromo, 9.9).clubLabel, 'המועדון החדש');
});

test('buildCatalogFromFiles joins grouped promotions per barcode, dedupes, resolves qtyPrice', () => {
  const promo = load('carrefour');
  const helmans = byDesc(promo, 'הלמנס');
  const code = helmans.items[0].code;
  const price = { storeId: '1', items: [
    { code, gtin: code, name: 'רוטב', manufacturer: null, price: 13.9, isWeighted: false, status: null },
    { code: '11111111', gtin: '11111111', name: 'x', manufacturer: null, price: 5, isWeighted: false, status: null },
  ] };
  const cat = buildCatalogFromFiles({ chainId: 'carrefour', price, promo });
  const item = cat.items.find((i) => i.code === code);
  assert.equal(item.promotions.length, 1);
  assert.equal(item.promotions[0].type, 'multi', '23 for 2 when a unit costs 13.9');
  assert.equal(item.promotions[0].totalPrice, 23);
  assert.equal(item.promotions[0].club, false);
  assert.equal(item.promotions[0].promotionId, '0011433780');
  assert.equal(item.promotions[0].validTo, helmans.endDate);
  assert.equal(cat.items.find((i) => i.code === '11111111').promotions.length, 0);
});
