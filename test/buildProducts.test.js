import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProducts, slimCatalog, categorize } from '../scripts/build-products.mjs';

const item = (gtin, name, price, extra = {}) => ({ storeItemId: gtin, code: gtin, gtin, name, brand: 'X', price, isWeighted: false, unit: "יח'", inStock: true, promotions: [], ...extra });
const chains = {
  a: { catalog: { chainId: 'a', storeId: '1', items: [item('1111111111111', 'חלב 3% 1 ליטר', 6), item('2222222222222', 'במבה 80 גרם', 4), item('3333333333333', 'מוצר נדיר', 9)] }, online: null },
  b: { catalog: { chainId: 'b', storeId: '2', items: [item('1111111111111', 'חלב 3% ליטר', 7), item('2222222222222', 'במבה 80 גרם', 5)] }, online: null },
  c: { catalog: { chainId: 'c', storeId: '3', items: [item('1111111111111', 'חלב 3% 1 ליטר', 8)] }, online: { fetchedAt: 'now', items: { '2222222222222': { price: 4.5, name: 'במבה', inStock: true, isWeighted: false, id: 77 } } } },
};

test('categorize maps Hebrew product names to the UI categories', () => {
  assert.equal(categorize('חלב תנובה 3% 1 ליטר'), 'חלב וביצים');
  assert.equal(categorize('במבה אסם 80 גרם'), 'חטיפים וממתקים');
  assert.equal(categorize('עגבניות שרי'), 'ירקות ופירות');
  assert.equal(categorize('דבר לא מוכר'), 'כללי');
});

test('buildProducts unions chains by GTIN, keeps products sold by enough chains and takes median prices', () => {
  const products = buildProducts(chains, { minChains: 3, max: 10 });
  assert.deepEqual(products.map((p) => p.gtin).sort(), ['1111111111111', '2222222222222']);
  const milk = products.find((p) => p.gtin === '1111111111111');
  assert.equal(milk.id, 'g1111111111111');
  assert.equal(milk.name, 'חלב 3% 1 ליטר');
  assert.equal(milk.basePrice, 7);
  assert.equal(milk.category, 'חלב וביצים');
  assert.equal(buildProducts(chains, { minChains: 1, max: 1 }).length, 1);
});

test('slimCatalog keeps only unified products and lets the online storefront override the price file', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const a = slimCatalog('a', chains.a, gtins);
  assert.deepEqual(a.items.map((i) => i.gtin), ['1111111111111', '2222222222222']);
  const c = slimCatalog('c', chains.c, gtins);
  const milk = c.items.find((i) => i.gtin === '1111111111111');
  assert.equal(milk.inStock, false, 'not returned by the online store -> not sold online');
  const bamba = c.items.find((i) => i.gtin === '2222222222222');
  assert.equal(bamba.price, 4.5);
  assert.equal(bamba.onlinePrice, true);
  assert.equal(c.source.online.items, 1);
});
