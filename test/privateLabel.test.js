import test from 'node:test';
import assert from 'node:assert/strict';
import { privateLabelSignal, isPrivateLabel, loadPrivateLabelConfig } from '../src/catalog/privateLabel.js';

test('private label by GS1 prefix (Shufersal 7296073, Carrefour 3560070/1)', () => {
  assert.equal(privateLabelSignal({ gtin: '7296073752929', name: 'סוכריות גומי דובונים 180' }, 'shufersal'), 'prefix');
  assert.equal(privateLabelSignal({ gtin: '3560070720859', name: 'שוקולד מריר מעולה 72' }, 'carrefour'), 'prefix');
  assert.equal(privateLabelSignal({ gtin: '3560070720859', name: 'שוקולד מריר מעולה 72' }, 'ybitan'), 'prefix', 'Carrefour group shares the brand');
  assert.equal(privateLabelSignal({ gtin: '7296073752929', name: 'x' }, 'ramilevy'), null, 'another chain\'s prefix means nothing here');
});

test('private label by brand word in the name, whole words only, with exclusions', () => {
  assert.equal(privateLabelSignal({ gtin: '7290015835510', name: 'קנלוני רמי לוי 250 גרם' }, 'ramilevy'), 'name');
  assert.equal(privateLabelSignal({ gtin: '7290003060283', name: 'קמח תופח מנופה 1 קג רמי לוי' }, 'ramilevy'), 'name');
  assert.equal(privateLabelSignal({ gtin: '1', name: 'פריכיות מארז חסכון 3' }, 'ramilevy'), null, '"מארז חסכון" is a value pack');
  assert.equal(privateLabelSignal({ gtin: '1', name: 'שוקו 400 גר חסכון' }, 'ramilevy'), 'name');
  assert.equal(privateLabelSignal({ gtin: '7290019308706', name: 'במיה 600 גרם יוחננוף' }, 'yochananof'), 'name');
  assert.equal(privateLabelSignal({ gtin: '1', name: 'קשת חגיגית לשיער' }, 'keshet'), null, 'a hair bow is not Keshet Teamim');
  assert.equal(privateLabelSignal({ gtin: '1', name: 'אטריות קשתות 400 גר' }, 'keshet'), null);
  assert.equal(privateLabelSignal({ gtin: '1', name: 'קמח 1 ק"ג', brand: 'קשת טעמים' }, 'keshet'), 'name', 'manufacturer field counts too');
  assert.equal(privateLabelSignal({ gtin: '7290002685043', name: 'ירכיים עוף טרי שופרסל' }, 'shufersal'), 'name');
  assert.equal(isPrivateLabel({ gtin: '7290004127336', name: 'חלב תנובה 3%' }, 'shufersal'), false);
  assert.equal(isPrivateLabel({ gtin: '1', name: 'x' }, 'no-such-chain'), false);
});

test('config loads for every chain in chains.json family', () => {
  const cfg = loadPrivateLabelConfig();
  for (const c of ['shufersal', 'ramilevy', 'carrefour', 'yochananof', 'victory', 'tivtaam', 'hazihinam', 'keshet', 'osherad', 'mck', 'shukcity', 'ybitan', 'quik', 'yochananof_b']) assert.ok(cfg[c], c);
  assert.ok(!cfg._doc);
});
