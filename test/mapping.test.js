import test from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../src/catalog/mapping.js';
import { loadSeed } from './helpers.js';

const seed = loadSeed();

test('packaged products resolve by GTIN on every chain', () => {
  const mapping = new MappingEngine(seed);
  for (const chainId of Object.keys(seed.catalogs)) {
    const r = mapping.resolve('milk-3', chainId);
    assert.ok(r, `milk on ${chainId}`);
    assert.equal(r.method, 'gtin');
    assert.equal(r.storeItem.gtin, '7290000042220');
  }
  assert.equal(mapping.resolve('milk-3', 'ramilevy').storeItem.storeItemId, '100000');
});

test('weighted products resolve by fuzzy matching to the chain naming style', () => {
  const mapping = new MappingEngine(seed);
  const rami = mapping.resolve('cucumber', 'ramilevy');
  assert.equal(rami.method, 'fuzzy');
  assert.equal(rami.storeItem.name, 'מלפפון שקיל מובחר');
  const carrefour = mapping.resolve('cucumber', 'carrefour');
  assert.equal(carrefour.storeItem.name, 'מלפפון במשקל');
  const shufersal = mapping.resolve('chicken-breast', 'shufersal');
  assert.equal(shufersal.storeItem.name, 'חזה עוף שקיל');
});

test('missing products resolve to null, manual overrides win', () => {
  const mapping = new MappingEngine({ ...seed, overrides: { 'shufersal:apple': 'P_W0011' } });
  assert.equal(mapping.resolve('tahini', 'shufersal'), null);
  assert.equal(mapping.resolve('feta', 'ramilevy'), null);
  const apple = mapping.resolve('apple', 'shufersal');
  assert.equal(apple.method, 'manual');
  assert.equal(apple.storeItem.storeItemId, 'P_W0011');
  mapping.setOverride('shufersal', 'tahini', 'P_7290000042220');
  assert.equal(mapping.resolve('tahini', 'shufersal').method, 'manual');
});

test('stats report coverage per chain', () => {
  const mapping = new MappingEngine(seed);
  const stats = mapping.stats();
  assert.equal(stats.shufersal.total, seed.products.length);
  assert.deepEqual(stats.shufersal.unmapped, ['tahini']);
  assert.deepEqual(stats.ramilevy.unmapped.sort(), ['challah', 'feta', 'olive-oil']);
  assert.ok(stats.demo.gtin > 30 && stats.demo.fuzzy >= 12);
});

test('a packaged product without GTIN hit is not fuzzy-matched to an unrelated item', () => {
  const mapping = new MappingEngine({
    products: [{ id: 'x', name: 'שוקולד מריר 70% 100 גרם', isWeighted: false, gtin: '1111111111111' }],
    catalogs: { c: { chainId: 'c', items: [{ storeItemId: '1', gtin: '2222222222222', name: 'שוקולד חלב 100 גרם', price: 5, inStock: true, promotions: [] }] } },
  });
  assert.equal(mapping.resolve('x', 'c'), null);
});
