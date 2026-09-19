import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProducts, slimCatalog, categorize, applySiteCodes } from '../scripts/build-products.mjs';
import { loadConcepts } from '../src/catalog/concepts.js';

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
  // Fruit words are flavours too: the product type wins, and produce keywords must start a word.
  assert.equal(categorize('יוגורט תות 3% מולר 150 גרם'), 'חלב וביצים');
  assert.equal(categorize('סנו JAVEL אקונומיקה בריח לימון'), 'ניקיון וטואלטיקה');
  assert.equal(categorize('בייגלה שטוחים שומשום'), 'חטיפים וממתקים');
  assert.equal(categorize('מלפפון בחומץ 13-17 בית השיטה'), 'שימורים');
  assert.equal(categorize('מלפפון'), 'ירקות ופירות');
  assert.equal(categorize('חלבה וניל'), 'חטיפים וממתקים');
  assert.equal(categorize('מנגו מוקפא סנפרוסט 300 גרם'), 'מעדנייה');
  assert.equal(categorize('סירופ בטעם ענבים 750'), 'משקאות');
  // A dry mix is a pantry item, not the dessert it makes (docs/CATEGORIES.md).
  assert.equal(categorize('אבקה להכנת ג\'לי בטעם תות אסם 90 גרם'), 'שימורים');
  assert.equal(categorize('אבוקדו בשל יח'), 'ירקות ופירות');
});

test('buildProducts unions chains by GTIN, keeps products sold by enough chains and takes median prices', () => {
  const products = buildProducts(chains, { minChains: 3, max: 10 });
  assert.deepEqual(products.map((p) => p.gtin).sort(), ['1111111111111', '2222222222222']);
  const milk = products.find((p) => p.gtin === '1111111111111');
  assert.equal(milk.id, 'g1111111111111');
  assert.equal(milk.name, 'חלב 3% 1 ליטר');
  assert.equal(milk.basePrice, 7);
  assert.equal(milk.category, 'חלב וביצים');
  assert.equal(milk.privateLabelOf, null, 'no private-label signal on this gtin');
  assert.equal(buildProducts(chains, { minChains: 1, max: 1 }).length, 1);
});

test('buildProducts: bestName prefers a longer, untruncated name over a similarly-frequent truncated prefix, and size/conceptId are computed from every name across chains (docs/CONCEPTS.md §3)', () => {
  // Half the chains truncate names to ~20 characters: "חלב תנובה 3" (11 chars) is what is left of
  // "חלב תנובה 3% 1 ליטר" once the unit and size are cut off. It appears in two chains, the full name
  // in only one - similar frequency, and the full name starts with the truncated one.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'milk.json'), JSON.stringify({
    concepts: [{ id: 'milk-3', name: 'חלב 3%', category: 'חלב וביצים', sizeUnit: 'ml', defaultSize: 1000, match: { all: ['חלב'], any: ['3%'] } }],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const sizeConceptChains = {
      d: { catalog: { chainId: 'd', storeId: '4', items: [item('5555555555555', 'חלב תנובה 3', 6)] }, online: null },
      e: { catalog: { chainId: 'e', storeId: '5', items: [item('5555555555555', 'חלב תנובה 3', 6.5)] }, online: null },
      f: { catalog: { chainId: 'f', storeId: '6', items: [item('5555555555555', 'חלב תנובה 3% 1 ליטר', 7)] }, online: null },
    };
    const products = buildProducts(sizeConceptChains, { minChains: 3, max: 10, concepts: conceptList });
    const milk = products.find((p) => p.gtin === '5555555555555');
    assert.ok(milk, 'sold by 3 chains -> passes the shared threshold');
    assert.equal(milk.name, 'חלב תנובה 3% 1 ליטר', 'the untruncated name wins even though the truncated one is more common');
    assert.deepEqual(milk.size, { value: 1000, unit: 'ml', count: 1 }, 'size only resolves from the one name that still has it');
    assert.equal(milk.conceptId, 'milk-3', 'concept only resolves from the one name that still matches');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildProducts: private-label products enter the catalog even sold by a single chain, a plain single-chain product does not', () => {
  const plChains = {
    shufersal: { catalog: { chainId: 'shufersal', storeId: '1', items: [
      item('7296073000019', 'שוקו שופרסל 1 ליטר', 5), // Shufersal's own GS1 prefix -> private label
      item('9999999999991', 'מוצר יחיד רגיל', 3), // ordinary item, sold by one chain only
    ] }, online: null },
  };
  const products = buildProducts(plChains, { minChains: 3, max: 10 });
  const pl = products.find((p) => p.gtin === '7296073000019');
  assert.ok(pl, 'private-label product is present despite chains=1 < minChains');
  assert.equal(pl.privateLabelOf, 'shufersal');
  assert.equal(pl.chains, 1);
  assert.equal(products.find((p) => p.gtin === '9999999999991'), undefined, 'plain single-chain product stays below the threshold and is absent');
});

test('buildProducts: sibling chains of the same private-label family report under the family head', () => {
  const familyChains = {
    carrefour: { catalog: { chainId: 'carrefour', storeId: '1', items: [item('3560070111111', 'מוצר קרפור', 4)] }, online: null },
    quik: { catalog: { chainId: 'quik', storeId: '2', items: [item('3560070111111', 'מוצר קרפור', 4.2)] }, online: null },
  };
  const products = buildProducts(familyChains, { minChains: 3, max: 10 });
  const pl = products.find((p) => p.gtin === '3560070111111');
  assert.ok(pl, 'private-label product is present despite chains=2 < minChains');
  assert.equal(pl.privateLabelOf, 'carrefour', 'carrefour/quik are the same family - the family head wins, not a per-chain split');
  assert.equal(pl.chains, 2);
});

test('buildProducts: a weighted, no-GTIN concept product is emitted when >= 3 chains sell it, priced at the median of their cheapest match; service items and a 2-chain concept are skipped', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'concepts-test-'));
  writeFileSync(path.join(tmpDir, 'produce.json'), JSON.stringify({
    concepts: [
      { id: 'cucumber', name: 'מלפפון', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['מלפפון'], match: { all: ['מלפפונ'] } },
      { id: 'okra', name: 'במיה', category: 'ירקות ופירות', sizeUnit: null, synonyms: ['במיה'], match: { all: ['במיה'] } },
    ],
  }));
  try {
    const conceptList = loadConcepts(tmpDir);
    const weighted = (code, name, price, extra = {}) => ({ storeItemId: code, code, gtin: null, name, brand: null, price, isWeighted: true, unit: 'ק"ג', inStock: true, promotions: [], ...extra });
    const weightChains = {
      a: { catalog: { chainId: 'a', storeId: '1', items: [weighted('W1', 'מלפפון שקיל', 4.9), weighted('W2', 'זיכוי מלפפון', 1)] }, online: null },
      b: { catalog: { chainId: 'b', storeId: '2', items: [weighted('W1', 'מלפפון במשקל', 5.9)] }, online: null },
      c: { catalog: { chainId: 'c', storeId: '3', items: [weighted('W1', 'מלפפון טרי', 6.9), weighted('W2', 'במיה טרייה', 8)] }, online: null },
      // only 2 chains sell okra - stays below the >= 3 chains threshold
      d: { catalog: { chainId: 'd', storeId: '4', items: [weighted('W3', 'במיה', 7.5)] }, online: null },
    };
    const products = buildProducts(weightChains, { minChains: 3, max: 10, concepts: conceptList });
    const cucumber = products.find((p) => p.conceptId === 'cucumber');
    assert.ok(cucumber, 'sold (under internal codes, no GTIN) by 3 chains -> emitted as a concept product');
    assert.equal(cucumber.id, 'c-cucumber');
    assert.equal(cucumber.kind, 'concept');
    assert.equal(cucumber.gtin, null);
    assert.equal(cucumber.isWeighted, true);
    assert.equal(cucumber.unit, 'ק"ג');
    assert.equal(cucumber.category, 'ירקות ופירות');
    assert.equal(cucumber.chains, 3);
    assert.equal(cucumber.basePrice, 5.9, 'median of the 3 chains cheapest matching price (4.9, 5.9, 6.9)');
    assert.equal(cucumber.privateLabelOf, null);
    assert.equal(cucumber.size, null);

    assert.equal(products.find((p) => p.conceptId === 'okra'), undefined, 'sold by only 2 chains -> not emitted');

    const conceptIds = new Set(products.filter((p) => p.kind === 'concept').map((p) => p.conceptId));
    const gtins = new Set(products.map((p) => p.gtin));
    const slimA = slimCatalog('a', weightChains.a, gtins, { conceptIds, conceptList });
    const cucA = slimA.items.find((i) => i.name === 'מלפפון שקיל');
    assert.ok(cucA, 'the weighted item rides along in the slim catalog');
    assert.equal(cucA.conceptId, 'cucumber');
    assert.equal(cucA.isWeighted, true);
    assert.equal(cucA.unit, 'ק"ג');
    assert.equal(slimA.items.find((i) => i.name === 'זיכוי מלפפון'), undefined, 'service items (credit/delivery/pickup/deposit) are never concept candidates');

    const slimC = slimCatalog('c', weightChains.c, gtins, { conceptIds, conceptList });
    assert.equal(slimC.items.find((i) => i.name === 'במיה טרייה'), undefined, 'a concept that never reached 3 chains does not get tagged even where it was sold');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('slimCatalog: without conceptIds, weighted/no-GTIN items are not scanned for concepts (barcoded items stay free of the field)', () => {
  const gtins = new Set(['1111111111111', '2222222222222']);
  const a = slimCatalog('a', chains.a, gtins);
  assert.ok(a.items.every((i) => !('conceptId' in i)));
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

test('slimCatalog: private-label items sold by one chain only are included (their gtin is in the shared gtin set) and keep the privateLabel flag', () => {
  const catalog = { storeId: '1', source: { store: '1' }, items: [item('7296073000019', 'שוקו שופרסל 1 ליטר', 5)] };
  const slim = slimCatalog('shufersal', { catalog, online: null }, new Set(['7296073000019']));
  const pl = slim.items.find((i) => i.gtin === '7296073000019');
  assert.ok(pl);
  assert.equal(pl.privateLabel, true);
});

test('applySiteCodes: the site code replaces the formula, unknown barcodes are not sold online, unchecked ones keep the formula', () => {
  const codes = { fetchedAt: 't', items: { '1': { code: 'P_999', checkedAt: 't' }, '2': { code: null, checkedAt: 't' }, '4': { error: 'HTTP 500', checkedAt: 't' } } };
  const it = (gtin) => ({ gtin, storeItemId: `P_${gtin}`, price: 1, inStock: true });
  assert.equal(applySiteCodes(it('1'), codes).storeItemId, 'P_999');
  assert.equal(applySiteCodes(it('2'), codes).inStock, false);
  assert.equal(applySiteCodes(it('3'), codes).storeItemId, 'P_3', 'never checked -> formula');
  assert.equal(applySiteCodes(it('4'), codes).storeItemId, 'P_4', 'lookup error -> formula');
  assert.equal(applySiteCodes(it('1'), null).storeItemId, 'P_1');
});
