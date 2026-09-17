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

test('slimCatalog keeps only unified products; the storefront overlay marks stock but never adds or prices items', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const a = slimCatalog('a', chains.a, gtins);
  assert.deepEqual(a.items.map((i) => i.gtin), ['1111111111111', '2222222222222']);
  const c = slimCatalog('c', chains.c, gtins);
  const milk = c.items.find((i) => i.gtin === '1111111111111');
  assert.equal(milk.inStock, false, 'not returned by the online store -> not sold online');
  assert.equal(milk.price, 8, 'price stays the published one');
  assert.equal(c.items.find((i) => i.gtin === '2222222222222'), undefined, 'known only to the storefront, no published price -> not shown');
  assert.equal(c.priceSource, 'file');
  assert.equal(c.source.online.items, 1);
});

test('slimCatalog: the published online-store file is the price source; the storefront overlay verifies, marks stock and adds images', () => {
  const gtins = new Set(['1', '2', '3']);
  const catalog = { storeId: '039', source: { store: '039' }, items: [
    { gtin: '1', storeItemId: '1', code: '1', name: 'א', price: 7.9, promotions: [] },
    { gtin: '2', storeItemId: '2', code: '2', name: 'ב', price: 9.1, promotions: [] },
    { gtin: '3', storeItemId: '3', code: '3', name: 'ג', price: 4, promotions: [] },
  ] };
  const online = { fetchedAt: 't', items: { 1: { price: 7.9, inStock: true, image: 'img1' }, 2: { price: 9.9, inStock: true } } };
  const slim = slimCatalog('x', { catalog, online }, gtins);
  assert.equal(slim.priceSource, 'file');
  const by = Object.fromEntries(slim.items.map((i) => [i.gtin, i]));
  assert.equal(by['2'].price, 9.1, 'file price wins over the site price');
  assert.equal(by['2'].sitePrice, 9.9, 'the site price is kept for verification');
  assert.equal(by['1'].image, 'img1');
  assert.equal(by['3'].inStock, false, 'not returned by the online store = not sold online');
  assert.deepEqual([slim.source.online.verify.compared, slim.source.online.verify.identical, slim.source.online.verify.mismatchPct], [2, 1, 50]);
});

test('slimCatalog: the storefront overlay is never a price source - products without a published price are not added', () => {
  const catalog = { storeId: '001', source: { store: '001' }, items: [{ gtin: '1', storeItemId: '1', code: '1', name: 'א', price: 7.9, promotions: [] }] };
  const online = { fetchedAt: 't', items: { 1: { price: 8.9, inStock: true }, 2: { price: 3, inStock: true, name: 'רק באתר' } } };
  const slim = slimCatalog('y', { catalog, online }, new Set(['1', '2']));
  assert.equal(slim.priceSource, 'file');
  assert.deepEqual(slim.items.map((i) => [i.gtin, i.price, i.sitePrice]), [['1', 7.9, 8.9]]);
});
