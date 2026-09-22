import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSalIsraelConfig, CATEGORIES } from '../src/basket/salIsraelConfig.js';

function write(obj) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sal-israel-config-'));
  const file = path.join(dir, 'sal-israel.json');
  writeFileSync(file, JSON.stringify(obj));
  return file;
}

const base = {
  _doc: 'ignored',
  version: 1,
  basket: { name: 'הסל של ישראל', source: 'x', publishedOn: '2026-04' },
  ministry: { reference: 1472, marketAverage: 1700, carrefourCommitment: 1098, stores: 54 },
  rules: { minCoverage: 0.85, historyDays: 90 },
  products: [],
};

test('loads the real config/sal-israel.json shipped in the repo', () => {
  const cfg = loadSalIsraelConfig();
  assert.equal(cfg.version, 1);
  assert.ok(Array.isArray(cfg.products));
  for (const p of cfg.products) assert.ok(CATEGORIES.includes(p.category), `${p.gtin} category ${p.category}`);
});

test('an empty products list is valid (loaded before the basket is filled in)', () => {
  const file = write(base);
  const cfg = loadSalIsraelConfig(file);
  assert.deepEqual(cfg.products, []);
});

test('rejects a duplicate gtin', () => {
  const p = { gtin: '1', name: 'x', category: 'כללי', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 1 };
  const file = write({ ...base, products: [p, { ...p }] });
  assert.throws(() => loadSalIsraelConfig(file), /duplicate gtin/);
});

test('rejects qty <= 0', () => {
  const p = { gtin: '1', name: 'x', category: 'כללי', qty: 0, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 1 };
  const file = write({ ...base, products: [p] });
  assert.throws(() => loadSalIsraelConfig(file), /qty must be > 0/);
});

test('rejects a category outside the 10 departments', () => {
  const p = { gtin: '1', name: 'x', category: 'לא קטגוריה', qty: 1, unit: "יח'", isWeighted: false, referencePrice: null, carrefourPrice: 1 };
  const file = write({ ...base, products: [p] });
  assert.throws(() => loadSalIsraelConfig(file), /not one of the 10 departments/);
});

test('rejects unit/isWeighted mismatch in both directions', () => {
  const weightedWithUnitPiece = { gtin: '1', name: 'x', category: 'כללי', qty: 1, unit: "יח'", isWeighted: true, referencePrice: null, carrefourPrice: 1 };
  assert.throws(() => loadSalIsraelConfig(write({ ...base, products: [weightedWithUnitPiece] })), /unit/);

  const pieceWithUnitKg = { gtin: '1', name: 'x', category: 'כללי', qty: 1, unit: 'ק"ג', isWeighted: false, referencePrice: null, carrefourPrice: 1 };
  assert.throws(() => loadSalIsraelConfig(write({ ...base, products: [pieceWithUnitKg] })), /unit/);
});

test('accepts a valid weighted product (ק"ג unit)', () => {
  const p = { gtin: '1', name: 'x', category: 'ירקות ופירות', qty: 1.5, unit: 'ק"ג', isWeighted: true, referencePrice: null, carrefourPrice: 12 };
  const file = write({ ...base, products: [p] });
  const cfg = loadSalIsraelConfig(file);
  assert.equal(cfg.products.length, 1);
});

test('ignores unmatched and _-prefixed keys', () => {
  const file = write({ ...base, unmatched: [{ name: 'whatever' }] });
  const cfg = loadSalIsraelConfig(file);
  assert.ok(!('_doc' in cfg) || cfg._doc === 'ignored'); // _doc stays on the object but is never validated
  assert.deepEqual(cfg.products, []);
});
