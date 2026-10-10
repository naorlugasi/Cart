import test from 'node:test';
import assert from 'node:assert/strict';
import { importSizes, normalizeSize } from '../scripts/sizes-import.mjs';

const FIXED_DATE = '2026-10-10';
const GTIN = '7290000000111';
const GTIN2 = '7290000000222';

test('normalizeSize: well-formed g/ml/unit sizes pass through unchanged', () => {
  assert.deepEqual(normalizeSize({ value: 500, unit: 'g', count: 1 }), { value: 500, unit: 'g', count: 1 });
  assert.deepEqual(normalizeSize({ value: 330, unit: 'ml', count: 6 }), { value: 330, unit: 'ml', count: 6 });
  assert.deepEqual(normalizeSize({ value: 1, unit: 'unit', count: 12 }), { value: 1, unit: 'unit', count: 12 });
});

test('normalizeSize: kg/l are folded defensively into g/ml x1000', () => {
  assert.deepEqual(normalizeSize({ value: 1.5, unit: 'kg', count: 1 }), { value: 1500, unit: 'g', count: 1 });
  assert.deepEqual(normalizeSize({ value: 2, unit: 'l', count: 3 }), { value: 2000, unit: 'ml', count: 3 });
});

test('normalizeSize: rejects a non-positive value, an unknown unit, a fractional/zero count, or an absurd total', () => {
  assert.equal(normalizeSize({ value: 0, unit: 'g', count: 1 }), null);
  assert.equal(normalizeSize({ value: -5, unit: 'g', count: 1 }), null);
  assert.equal(normalizeSize({ value: 500, unit: 'lb', count: 1 }), null);
  assert.equal(normalizeSize({ value: 500, unit: 'g', count: 1.5 }), null);
  assert.equal(normalizeSize({ value: 500, unit: 'g', count: 0 }), null);
  assert.equal(normalizeSize({ value: 20001, unit: 'g', count: 1 }), null);
  assert.equal(normalizeSize(null), null);
  assert.equal(normalizeSize(undefined), null);
});

test('importSizes: a found item with a well-formed size is added, source defaults to the url', () => {
  const items = [{ gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: null, found: true, url: 'https://chp.co.il/x' }];
  const { sizes, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.deepEqual(sizes[GTIN], { size: { value: 500, unit: 'g', count: 1 }, source: 'https://chp.co.il/x', since: FIXED_DATE });
  assert.equal(summary.sizesAdded, 1);
  assert.equal(summary.sizesKept, 0);
  assert.equal(summary.sizesSkipped, 0);
});

test('importSizes: a gtin already in sizes.json never gets overwritten, even with a different size', () => {
  const existing = { [GTIN]: { size: { value: 999, unit: 'g', count: 1 }, source: 'old', since: '2026-01-01' } };
  const items = [{ gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: null, found: true, url: 'https://chp.co.il/x' }];
  const { sizes, summary } = importSizes(items, existing, {}, { today: FIXED_DATE });
  assert.deepEqual(sizes[GTIN], existing[GTIN]);
  assert.equal(summary.sizesAdded, 0);
  assert.equal(summary.sizesKept, 1);
});

test('importSizes: kg/l sizes are normalized before being stored', () => {
  const items = [{ gtin: GTIN, size: { value: 1.5, unit: 'kg', count: 1 }, brand: null, found: true, url: 'u' }];
  const { sizes } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.deepEqual(sizes[GTIN].size, { value: 1500, unit: 'g', count: 1 });
});

test('importSizes: an absurd size (> 20000 g/ml) is skipped and listed, not stored', () => {
  const items = [{ gtin: GTIN, size: { value: 50000, unit: 'g', count: 1 }, brand: null, found: true, url: 'u' }];
  const { sizes, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.equal(sizes[GTIN], undefined);
  assert.equal(summary.sizesSkipped, 1);
  assert.match(summary.skipDetails[0], /not well-formed/);
});

test('importSizes: a note containing CONFLICT is skipped and listed, regardless of how the size looks', () => {
  const items = [{ gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: null, found: true, url: 'u', note: 'CONFLICT: chp says 500g, cheapersal says 1kg' }];
  const { sizes, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.equal(sizes[GTIN], undefined);
  assert.equal(summary.sizesSkipped, 1);
  assert.match(summary.skipDetails[0], /CONFLICT/);
});

test('importSizes: found:false items are ignored entirely - no size, no brand forwarded', () => {
  const items = [{ gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: 'שוופס', found: false, url: 'u' }];
  const { sizes, brands, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.equal(sizes[GTIN], undefined);
  assert.equal(brands[GTIN], undefined);
  assert.equal(summary.total, 1);
  assert.equal(summary.sizesAdded, 0);
  assert.equal(summary.brandsAdded, 0);
});

test('importSizes: a non-null brand is forwarded into brands.json through the same rule brands-import uses', () => {
  const items = [{ gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: 'שוופס', found: true, url: 'https://chp.co.il/x' }];
  const { brands, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.deepEqual(brands[GTIN], { brand: 'שוופס', source: 'https://chp.co.il/x', since: FIXED_DATE });
  assert.equal(summary.brandsAdded, 1);
});

test('importSizes: a brand already in brands.json is kept, never overwritten (no --replace here)', () => {
  const existingBrands = { [GTIN]: { brand: 'ישן', source: 'old', since: '2026-01-01' } };
  const items = [{ gtin: GTIN, size: null, brand: 'חדש', found: true, url: 'u' }];
  const { brands, summary } = importSizes(items, {}, existingBrands, { today: FIXED_DATE });
  assert.deepEqual(brands[GTIN], existingBrands[GTIN]);
  assert.equal(summary.brandsAdded, 0);
  assert.equal(summary.brandsKept, 1);
});

test('importSizes: a brand that looks like a company name (NOT_A_BRAND) is skipped and listed, same as brands-import', () => {
  const items = [{ gtin: GTIN, size: null, brand: 'חברת דוגמא בע"מ', found: true, url: 'u' }];
  const { brands, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.equal(brands[GTIN], undefined);
  assert.equal(summary.brandsSkipped, 1);
});

test('importSizes: a brand:null item forwards nothing, but its size is still imported', () => {
  const items = [{ gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: null, found: true, url: 'u' }];
  const { sizes, brands, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.deepEqual(sizes[GTIN].size, { value: 500, unit: 'g', count: 1 });
  assert.equal(brands[GTIN], undefined);
  assert.equal(summary.brandsAdded, 0);
});

test('importSizes: a mixed batch handles each item independently in one pass', () => {
  const items = [
    { gtin: GTIN, size: { value: 500, unit: 'g', count: 1 }, brand: 'שוופס', found: true, url: 'u1' },
    { gtin: GTIN2, size: { value: 999999, unit: 'g', count: 1 }, brand: null, found: true, url: 'u2' },
    { gtin: '1234567890123', size: null, brand: null, found: false, url: 'u3' },
  ];
  const { sizes, brands, summary } = importSizes(items, {}, {}, { today: FIXED_DATE });
  assert.equal(summary.total, 3);
  assert.ok(sizes[GTIN]);
  assert.equal(sizes[GTIN2], undefined);
  assert.equal(summary.sizesAdded, 1);
  assert.equal(summary.sizesSkipped, 1);
  assert.equal(brands[GTIN].brand, 'שוופס');
});
