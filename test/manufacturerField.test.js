import test from 'node:test';
import assert from 'node:assert/strict';
import { manufacturerFields, projectProduct } from '../scripts/build-products.mjs';

const g = (brands) => ({
  chains: new Set(brands.map((_, i) => `c${i}`)), names: brands.map(() => 'מוצר בדיקה'),
  named: brands.map((brand, i) => ({ chain: `c${i}`, name: 'מוצר בדיקה', brand })),
  brands, prices: brands.map(() => 10), weighted: 0, plFamilies: new Map(), chainFields: [],
});

test('usable value from one chain', () => {
  assert.deepEqual(manufacturerFields([null, 'אסם']), { manufacturer: 'אסם', manufacturerKnown: true });
});
test('chains disagree: mode wins, tie -> first seen', () => {
  assert.equal(manufacturerFields(['אסם', 'שטראוס', 'שטראוס']).manufacturer, 'שטראוס');
  assert.equal(manufacturerFields(['אסם', 'שטראוס']).manufacturer, 'אסם');
});
test('only filler/empty values -> null/false', () => {
  assert.deepEqual(manufacturerFields(['לא ידוע', 'כללי', '-', '', null, 'unknown']), { manufacturer: null, manufacturerKnown: false });
});
test('legal-form tail stripped', () => {
  assert.equal(manufacturerFields(['טחנת קמח דגן בע"מ']).manufacturer, 'טחנת קמח דגן');
  assert.equal(manufacturerFields(['Acme Ltd']).manufacturer, 'Acme');
});
test('projectProduct carries the fields and leaves brand alone', () => {
  const p = projectProduct('7290000000001', g(['אסם בע"מ', 'אסם בע"מ', null]), []);
  assert.equal(p.manufacturer, 'אסם');
  assert.equal(p.manufacturerKnown, true);
  assert.equal(projectProduct('7290000000002', g(['לא ידוע']), []).manufacturerKnown, false);
});
