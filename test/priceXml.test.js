import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.js';
import { parsePriceFile, parsePromoFile, buildCatalogFromFiles, promoRuleFromFields, isGtin, decodeEntities } from '../src/catalog/priceXml.js';

const priceXml = readFileSync(path.join(ROOT, 'data/samples/PriceFull-sample.xml'), 'utf8');
const promoXml = readFileSync(path.join(ROOT, 'data/samples/PromoFull-sample.xml'), 'utf8');

test('parsePriceFile reads header and items', () => {
  const file = parsePriceFile(priceXml);
  assert.equal(file.chainId, '7290027600007');
  assert.equal(file.storeId, '001');
  assert.equal(file.items.length, 4);
  const milk = file.items[0];
  assert.equal(milk.code, '7290000042220');
  assert.equal(milk.gtin, '7290000042220');
  assert.equal(milk.name, 'חלב 3% תנובה 1 ליטר');
  assert.equal(milk.price, 6.9);
  assert.equal(milk.isWeighted, false);
});

test('parsePriceFile handles CDATA, entities and weighted items', () => {
  const file = parsePriceFile(priceXml);
  const cucumber = file.items.find((i) => i.code === '4021');
  assert.equal(cucumber.name, 'מלפפון שקיל מובחר');
  assert.equal(cucumber.isWeighted, true);
  assert.equal(cucumber.gtin, null, 'short PLU codes are not GTINs');
  const beer = file.items.find((i) => i.code === '7290000053547');
  assert.equal(beer.name, 'בירה גולדסטאר 6 & 330 מ"ל');
  assert.equal(beer.status, '0');
});

test('parsePriceFile also accepts Products/Product shaped files', () => {
  const xml = '<Root><ChainId>1</ChainId><Products><Product><ProductCode>12345678</ProductCode><ProductName>x</ProductName><Price>3</Price></Product></Products></Root>';
  const file = parsePriceFile(xml);
  assert.equal(file.items.length, 1);
  assert.equal(file.items[0].gtin, '12345678');
  assert.equal(file.items[0].price, 3);
});

test('parsePromoFile derives pricing rules', () => {
  const file = parsePromoFile(promoXml);
  assert.equal(file.promotions.length, 3);
  const [bamba, milk, cucumber] = file.promotions;
  assert.deepEqual(bamba.itemCodes, ['7290000066028']);
  assert.deepEqual(bamba.rule, { type: 'multi', minQty: 3, totalPrice: 12 });
  assert.deepEqual(milk.rule, { type: 'percent', minQty: 1, percent: 15 });
  assert.deepEqual(cucumber.rule, { type: 'unit', minQty: 1, unitPrice: 5.9 });
});

test('promoRuleFromFields parses description variants', () => {
  assert.deepEqual(promoRuleFromFields({ description: '2 ב-25 ₪' }), { type: 'multi', minQty: 2, totalPrice: 25 });
  assert.deepEqual(promoRuleFromFields({ description: '3 יח ב 10' }), { type: 'multi', minQty: 3, totalPrice: 10 });
  assert.deepEqual(promoRuleFromFields({ description: '20% הנחה', minQty: 2 }), { type: 'percent', minQty: 2, percent: 20 });
  assert.deepEqual(promoRuleFromFields({ description: 'x', minQty: 2, discountedPrice: 30 }), { type: 'multi', minQty: 2, totalPrice: 30 });
  assert.deepEqual(promoRuleFromFields({ description: 'x', discountRate: 1000 }), { type: 'percent', minQty: 1, percent: 10 });
  assert.equal(promoRuleFromFields({ description: 'x' }), null);
});

test('buildCatalogFromFiles joins prices with promotions and translates store item ids', () => {
  const catalog = buildCatalogFromFiles({ chainId: 'x', price: parsePriceFile(priceXml), promo: parsePromoFile(promoXml), storeItemIdFor: (i) => `P_${i.code}` });
  const bamba = catalog.items.find((i) => i.gtin === '7290000066028');
  assert.equal(bamba.storeItemId, 'P_7290000066028');
  assert.equal(bamba.promotions.length, 1);
  assert.equal(bamba.promotions[0].type, 'multi');
  const beer = catalog.items.find((i) => i.gtin === '7290000053547');
  assert.equal(beer.inStock, false, 'ItemStatus 0 means not available');
});

test('isGtin / decodeEntities', () => {
  assert.equal(isGtin('7290000042220'), true);
  assert.equal(isGtin('4021'), false);
  assert.equal(isGtin('abc'), false);
  assert.equal(decodeEntities('a &amp; b &#x5D0; &#1489;'), 'a & b א ב');
});
